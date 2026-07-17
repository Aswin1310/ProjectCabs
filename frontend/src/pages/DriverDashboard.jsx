import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';

const SOCKET_URL = 'http://localhost:5000';

const DriverDashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [isOnline, setIsOnline]         = useState(false);
    const [incomingRide, setIncomingRide] = useState(null);
    const [socket, setSocket]             = useState(null);
    const [earnings, setEarnings]         = useState(0);
    const [totalTrips, setTotalTrips]     = useState(0);
    const [myLocation, setMyLocation]     = useState(null);
    const [myLocationName, setMyLocationName] = useState('');
    const [locations, setLocations]       = useState([]);
    const [radarActive, setRadarActive]   = useState(false); // only true after manual toggle click
    const [rides, setRides]               = useState([]);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

    // Stats states
    const [stats, setStats] = useState({
        today: { trips: 0, earnings: 0 },
        month: { trips: 0, earnings: 0 },
        allTime: { trips: 0, earnings: 0 },
        selected: { trips: 0, earnings: 0 }
    });

    /* countdown timer for incoming ride */
    const [countdown, setCountdown]       = useState(30);
    const countdownRef                    = useRef(null);
    const geoWatchRef                     = useRef(null);

    /* ── Fetch driver profile, Rides & Locations ─────────────── */
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [profileRes, ridesRes, locRes] = await Promise.all([
                    api.get('/driver/me').catch(() => null),
                    api.get('/rides').catch(() => ({ data: [] })),
                    api.get('/locations').catch(() => ({ data: [] }))
                ]);
                
                if (profileRes?.data) {
                    setIsOnline(profileRes.data.isOnline ?? false);
                }
                if (ridesRes?.data) {
                    setRides(ridesRes.data);
                    calculateStats(ridesRes.data, selectedDate);
                }
                if (locRes?.data) {
                    setLocations(locRes.data);
                }
            } catch (err) {
                console.error('Fetch error:', err);
            }
        };
        fetchData();
        // eslint-disable-next-line
    }, []);

    const calculateStats = (allRides, dateFilter) => {
        const completed = allRides.filter(r => r.rideStatus === 'completed' || r.paymentStatus === 'paid');
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const monthStr = todayStr.substring(0, 7);

        let todayTrips = 0, todayEarn = 0;
        let monthTrips = 0, monthEarn = 0;
        let allTrips = 0, allEarn = 0;
        let selTrips = 0, selEarn = 0;

        completed.forEach(r => {
            const rDateStr = r.createdAt.substring(0, 10);
            const rMonthStr = r.createdAt.substring(0, 7);
            const fare = r.fare || 0;

            allTrips++;
            allEarn += fare;

            if (rDateStr === todayStr) {
                todayTrips++;
                todayEarn += fare;
            }
            if (rMonthStr === monthStr) {
                monthTrips++;
                monthEarn += fare;
            }
            if (rDateStr === dateFilter) {
                selTrips++;
                selEarn += fare;
            }
        });

        setStats({
            today: { trips: todayTrips, earnings: todayEarn },
            month: { trips: monthTrips, earnings: monthEarn },
            allTime: { trips: allTrips, earnings: allEarn },
            selected: { trips: selTrips, earnings: selEarn }
        });
    };

    const handleDateChange = (e) => {
        const d = e.target.value;
        setSelectedDate(d);
        calculateStats(rides, d);
    };


    /* ── Socket setup ─────────────────────────────────── */
    useEffect(() => {
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const sock = io(SOCKET_URL, {
            auth: { token: user?.token || storedUser?.token },
        });
        setSocket(sock);

        sock.on('connect', () => console.log('Driver socket connected:', sock.id));

        /* New ride assigned to this driver */
        sock.on('newRide', (rideData) => {
            console.log('📩 New ride request:', rideData);
            setIncomingRide(rideData);
            setCountdown(30);
        });

        /* Ride cancelled (while waiting for response) */
        sock.on('rideCancelled', () => {
            setIncomingRide(null);
            clearCountdown();
        });

        return () => {
            sock.close();
            clearGeoWatch();
            clearCountdown();
        };
    }, [user.token]);

    /* ── Countdown auto-decline ───────────────────────── */
    const clearCountdown = () => {
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
        }
    };

    useEffect(() => {
        if (!incomingRide) { clearCountdown(); return; }

        setCountdown(30);
        clearCountdown();

        countdownRef.current = setInterval(() => {
            setCountdown((c) => {
                if (c <= 1) {
                    clearCountdown();
                    declineRide();
                    return 0;
                }
                return c - 1;
            });
        }, 1000);

        return clearCountdown;
    }, [incomingRide]);

    /* ── Geo-location watch ───────────────────────────── */
    const startGeoWatch = (sock) => {
        if (!navigator.geolocation) return;
        geoWatchRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const { longitude, latitude } = pos.coords;
                setMyLocation({ lng: longitude, lat: latitude });

                // Update Redis geo-cache via REST
                api.put('/driver/location', { longitude, latitude }).catch(() => {});

                // Emit real-time to socket (for active ride)
                if (sock?.connected) {
                    sock.emit('locationUpdate', { longitude, latitude });
                }
            },
            (err) => console.warn('Geo error:', err.message),
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        );
    };

    const clearGeoWatch = () => {
        if (geoWatchRef.current && navigator.geolocation) {
            navigator.geolocation.clearWatch(geoWatchRef.current);
            geoWatchRef.current = null;
        }
    };

    /* ── Update driver location from admin location list ─── */
    const updateDriverLocation = (locationName) => {
        const loc = locations.find(l => l.name === locationName);
        if (!loc) return;
        const longitude = loc.coordinates[0];
        const latitude  = loc.coordinates[1];
        setMyLocationName(locationName);
        setMyLocation({ lng: longitude, lat: latitude });
        api.put('/driver/location', { longitude, latitude }).catch(() => {});
        if (socket?.connected) socket.emit('locationUpdate', { longitude, latitude });
    };

    /* ── Toggle online / offline ──────────────────────── */
    const toggleStatus = async () => {
        try {
            const next = !isOnline;
            await api.put('/driver/status', { isOnline: next });
            setIsOnline(next);

            if (socket) socket.emit(next ? 'driverOnline' : 'driverOffline');

            if (next) {
                setRadarActive(true);   // show radar ONLY on manual click
                startGeoWatch(socket);
            } else {
                setRadarActive(false);
                clearGeoWatch();
                setMyLocation(null);
                setMyLocationName('');
            }
        } catch (err) {
            console.error('Status toggle error:', err);
        }
    };

    /* ── Accept ride ──────────────────────────────────── */
    const acceptRide = async () => {
        clearCountdown();
        try {
            await api.put(`/rides/${incomingRide._id}/accept`);

            if (socket) {
                const passengerId = incomingRide.passengerId?._id || incomingRide.passengerId;
                socket.emit('acceptRide', {
                    rideId: incomingRide._id,
                    passengerId: passengerId?.toString(),
                });
            }

            navigate(`/ride/${incomingRide._id}`);
        } catch (err) {
            console.error('Accept ride error:', err);
            alert('Ride no longer available or error occurred.');
            setIncomingRide(null);
        }
    };

    /* ── Decline ride ─────────────────────────────────── */
    const declineRide = async () => {
        clearCountdown();
        if (!incomingRide) return;
        try {
            await api.put(`/rides/${incomingRide._id}/decline`);
        } catch (err) {
            console.error('Decline error:', err);
        } finally {
            setIncomingRide(null);
        }
    };

    /* ── Render ───────────────────────────────────────── */
    return (
        <div className="min-h-screen bg-gray-100 p-6">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl shadow-sm gap-4">
                    <div>
                        <h1 className="text-3xl font-bold">Driver Dashboard</h1>
                        <p className="text-gray-500 mt-1">Welcome back, {user?.name}</p>
                        {myLocation && (
                            <p className="text-xs text-green-600 font-semibold mt-1">
                                📍 GPS Active · {myLocation.lat.toFixed(4)}, {myLocation.lng.toFixed(4)}
                            </p>
                        )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Status</span>
                        <button
                            id="driver-status-toggle"
                            onClick={toggleStatus}
                            className={`px-8 py-3 rounded-full font-black text-white text-sm tracking-widest transition-all duration-300 shadow-lg
                                ${isOnline
                                    ? 'bg-green-500 hover:bg-green-600 shadow-[0_0_20px_rgba(34,197,94,0.4)]'
                                    : 'bg-gray-400 hover:bg-gray-500'}`}
                        >
                            {isOnline ? '🟢 ONLINE' : '⚫ OFFLINE'}
                        </button>
                    </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                        { label: "Today's",        val1: `Earned: $${stats.today.earnings}`, val2: `Trips: ${stats.today.trips}`, icon: '⚡', color: 'text-green-600' },
                        { label: 'This Month',      val1: `Earned: $${stats.month.earnings}`, val2: `Trips: ${stats.month.trips}`, icon: '📅', color: 'text-blue-600' },
                        { label: 'All-Time',        val1: `Earned: $${stats.allTime.earnings}`, val2: `Trips: ${stats.allTime.trips}`, icon: '🏆', color: 'text-purple-600' },
                        { label: 'GPS / Status',    val1: isOnline ? 'Online' : 'Offline', val2: myLocation ? 'Location Active' : 'Location Off', icon: isOnline ? '🟢' : '⚫', color: isOnline ? 'text-green-600' : 'text-gray-500' },
                    ].map((stat, i) => (
                        <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col justify-between">
                            <span className="text-2xl">{stat.icon}</span>
                            <div className="mt-3">
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-wide">{stat.label}</p>
                                <p className={`text-xl font-black mt-1 ${stat.color} truncate`}>{stat.val1}</p>
                                <p className={`text-sm font-semibold mt-1 text-gray-400 truncate`}>{stat.val2}</p>
                            </div>
                        </div>
                    ))}
                </div>
                
                {/* Custom Date Stats */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col md:flex-row items-center gap-6">
                    <div className="flex-1 w-full">
                       <h3 className="text-lg font-bold">Historical Statistics</h3>
                       <p className="text-gray-500 text-sm">Select any date to view your exact earnings and trips for that day</p>
                    </div>
                    <div className="flex items-center gap-4 bg-gray-50 p-3 rounded-xl border border-gray-100 shadow-inner">
                        <input 
                            type="date" 
                            name="stat-date"
                            value={selectedDate}
                            onChange={handleDateChange}
                            className="bg-transparent font-bold text-gray-700 outline-none"
                        />
                    </div>
                    <div className="text-right min-w-[120px]">
                        <p className="text-xs text-gray-400 font-bold uppercase">Trips that Day</p>
                        <p className="text-xl font-black text-gray-800">{stats.selected.trips}</p>
                    </div>
                    <div className="text-right min-w-[120px]">
                        <p className="text-xs text-gray-400 font-bold uppercase">Earned that Day</p>
                        <p className="text-xl font-black text-green-600">${stats.selected.earnings}</p>
                    </div>
                </div>

                {/* ── Location Pin (shows when online) ── */}
                {isOnline && (
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col md:flex-row items-center gap-4">
                        <div className="flex-1 w-full">
                            <h3 className="text-lg font-bold">📍 Pin Your Current Location</h3>
                            <p className="text-gray-500 text-sm">Select where you are stationed so passengers can find you</p>
                        </div>
                        <select
                            className="w-full md:w-64 p-3 border-2 border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-500 font-semibold text-gray-700 bg-gray-50"
                            value={myLocationName}
                            onChange={(e) => updateDriverLocation(e.target.value)}
                        >
                            <option value="" disabled>Select your location...</option>
                            {locations.map(loc => (
                                <option key={loc._id} value={loc.name}>{loc.name}</option>
                            ))}
                        </select>
                        {myLocationName && (
                            <span className="text-green-600 font-bold text-sm whitespace-nowrap">✅ Pinned: {myLocationName}</span>
                        )}
                    </div>
                )}

                {/* ── Radar / waiting card — only shows after clicking Status toggle ── */}
                {radarActive ? (
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center relative overflow-hidden">
                    {isOnline ? (
                        <>
                            <div className="absolute inset-0 bg-green-50 opacity-50 animate-pulse pointer-events-none"></div>
                            <div className="relative z-10">
                                <div className="w-20 h-20 border-4 border-green-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                                <h3 className="text-xl font-bold text-gray-700">Radar Active</h3>
                                <p className="text-gray-400 mt-1">Waiting for ride requests nearby...</p>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="text-4xl">😴</span>
                            </div>
                            <h3 className="text-xl font-bold text-gray-400">You are offline</h3>
                            <p className="text-gray-400 text-sm mt-1">Go online to receive ride requests.</p>
                        </>
                    )}
                </div>
                ) : null}

            </div>

            {/* ════════════════════════════════
                INCOMING RIDE MODAL
            ════════════════════════════════ */}
            {incomingRide && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">

                        {/* Header */}
                        <div className="bg-gray-900 p-6 text-white text-center relative">
                            <h2 className="text-2xl font-black uppercase tracking-widest">🚨 New Ride!</h2>
                            {/* Countdown ring */}
                            <div className="mt-3 flex items-center justify-center gap-2">
                                <div className={`w-10 h-10 rounded-full border-4 flex items-center justify-center font-black text-sm
                                    ${countdown > 15 ? 'border-green-400 text-green-400' : countdown > 5 ? 'border-yellow-400 text-yellow-400' : 'border-red-400 text-red-400 animate-pulse'}`}>
                                    {countdown}
                                </div>
                                <span className="text-gray-400 text-sm">sec to auto-decline</span>
                            </div>
                        </div>

                        <div className="p-6">
                            {/* Passenger info */}
                            <div className="flex items-center gap-4 mb-5">
                                <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-xl">👤</div>
                                <div>
                                    <h3 className="font-bold text-lg">
                                        {incomingRide.passengerId?.name || 'Passenger'}
                                    </h3>
                                    <p className="text-gray-500 text-sm">Distance: <span className="text-blue-600 font-bold">{incomingRide.distance} km</span></p>
                                </div>
                            </div>

                            {/* Route */}
                            <div className="bg-gray-50 p-4 rounded-xl mb-5 border border-gray-100 space-y-2">
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 bg-blue-500 rounded-full flex-shrink-0"></div>
                                    <p className="font-semibold text-gray-700 text-sm truncate">{incomingRide.pickup}</p>
                                </div>
                                <div className="ml-1.5 w-0.5 h-5 bg-gray-300 mx-3"></div>
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 bg-green-500 rounded-full flex-shrink-0"></div>
                                    <p className="font-semibold text-gray-700 text-sm truncate">{incomingRide.destination}</p>
                                </div>
                            </div>

                            {/* Fare + cab type */}
                            <div className="flex justify-between items-center mb-6 px-1">
                                <div>
                                    <p className="text-xs text-gray-400 font-bold uppercase">Cab Type</p>
                                    <p className="font-bold text-gray-700">{incomingRide.cabType}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-400 font-bold uppercase">Est. Fare</p>
                                    <p className="text-3xl font-black text-green-600">${incomingRide.fare}</p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="space-y-3">
                                <button id="accept-ride-btn" onClick={acceptRide}
                                    className="w-full bg-green-500 text-white font-black text-xl py-4 rounded-xl hover:bg-green-600 transition shadow-lg">
                                    ✅ ACCEPT RIDE
                                </button>
                                <button id="decline-ride-btn" onClick={declineRide}
                                    className="w-full bg-gray-100 text-gray-600 font-bold text-lg py-3 rounded-xl hover:bg-gray-200 transition">
                                    ✗ Decline
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DriverDashboard;
