import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';

const SOCKET_URL = import.meta.env.VITE_API_URL;

const DriverDashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [isOnline, setIsOnline]         = useState(false);
    const [incomingRide, setIncomingRide] = useState(null);
    const [socket, setSocket]             = useState(null);
    const [myLocation, setMyLocation]     = useState(null);
    const [myLocationName, setMyLocationName] = useState('');
    const [driverRating, setDriverRating] = useState(5.0);

    const [radarActive, setRadarActive]   = useState(false); // only true after manual toggle click

    // Stats states
    const [stats, setStats] = useState({
        today: { trips: 0, earnings: 0 },
        month: { trips: 0, earnings: 0 },
        allTime: { trips: 0, earnings: 0 }
    });

    /* countdown timer for incoming ride */
    const [countdown, setCountdown]       = useState(30);
    const countdownRef                    = useRef(null);
    const geoWatchRef                     = useRef(null);
    const isOnlineRef                     = useRef(false); // mirrors isOnline for socket closures

    /* ── Fetch driver profile & stats ─────────────── */
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [profileRes, ridesRes] = await Promise.all([
                    api.get('/driver/me').catch(() => null),
                    api.get('/rides').catch(() => ({ data: [] }))
                ]);

                if (profileRes?.data) {
                    const online = profileRes.data.isOnline ?? false;
                    setIsOnline(online);
                    isOnlineRef.current = online;
                    if (profileRes.data.rating !== undefined) {
                        setDriverRating(profileRes.data.rating);
                    }
                }
                if (ridesRes?.data) {
                    calculateStats(ridesRes.data);
                }

            } catch (err) {
                console.error('Fetch error:', err);
            }
        };
        fetchData();
        // eslint-disable-next-line
    }, []);

    const calculateStats = (allRides) => {
        const completed = allRides.filter(r => r.rideStatus === 'completed' || r.paymentStatus === 'paid');
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const monthStr = todayStr.substring(0, 7);

        let todayTrips = 0, todayEarn = 0;
        let monthTrips = 0, monthEarn = 0;
        let allTrips = 0, allEarn = 0;

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
        });

        setStats({
            today: { trips: todayTrips, earnings: todayEarn },
            month: { trips: monthTrips, earnings: monthEarn },
            allTime: { trips: allTrips, earnings: allEarn }
        });
    };


    /* ── Socket setup ─────────────────────────────────── */
    useEffect(() => {
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const sock = io(SOCKET_URL, {
            auth: { token: user?.token || storedUser?.token },
        });
        setSocket(sock);

        sock.on('connect', () => {
            console.log('Driver socket connected:', sock.id);
            // On reconnect (e.g. page refresh or brief disconnect), re-register
            // this socket with the backend if the driver was already online.
            // Uses isOnlineRef to avoid reading a stale closure variable.
            if (isOnlineRef.current) {
                sock.emit('driverOnline');
                console.log('♻️ Re-emitted driverOnline on reconnect (was already online).');
            }
        });

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

        /* Special ride explicitly assigned by Admin */
        sock.on('rideAssigned', (data) => {
            alert(`🚨 ${data.message}`);
            navigate(`/ride/${data.rideId}`);
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
        if (!navigator.geolocation) {
            setMyLocationName('GPS Not Supported 🚫');
            return;
        }

        // Fallback for desktop/non-https testing where GPS might hang eternally
        const fallbackTimer = setTimeout(() => {
            setMyLocation(prev => {
                if (!prev) {
                    const fallbackLat = 11.0168, fallbackLon = 76.9558; // Coimbatore
                    api.put('/driver/location', { longitude: fallbackLon, latitude: fallbackLat }).catch(() => {});
                    if (sock?.connected) sock.emit('locationUpdate', { longitude: fallbackLon, latitude: fallbackLat });
                    setMyLocationName(`Fallback GPS Active`);
                    return { lat: fallbackLat, lng: fallbackLon };
                }
                return prev;
            });
        }, 5000);

        geoWatchRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                clearTimeout(fallbackTimer);
                const { longitude, latitude } = pos.coords;
                if (!isFinite(latitude) || !isFinite(longitude)) return;
                setMyLocation({ lng: longitude, lat: latitude });

                // Live Update Pinned GPS Name
                setMyLocationName(prev => {
                    if (!prev || prev.includes('.')) {
                        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`)
                            .then(r => r.json())
                            .then(data => {
                                const address = data.display_name?.split(',').slice(0, 3).join(',') || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
                                setMyLocationName(address);
                            }).catch(() => {});
                    }
                    return prev;
                });

                // Update Redis geo-cache via REST
                api.put('/driver/location', { longitude, latitude }).catch(() => {});

                // Emit real-time to socket (for active ride)
                if (sock?.connected) {
                    sock.emit('locationUpdate', { longitude, latitude });
                }
            },
            (err) => {
                if (err.code === 1) { // PERMISSION_DENIED
                    setMyLocationName('GPS Access Blocked 🚫');
                } else {
                    setMyLocationName('GPS Signal Lost 📶');
                }
                console.warn('Geo error:', err.message);
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
        );
    };

    const clearGeoWatch = () => {
        if (geoWatchRef.current && navigator.geolocation) {
            navigator.geolocation.clearWatch(geoWatchRef.current);
            geoWatchRef.current = null;
        }
    };



    /* ── Toggle online / offline ────────────────── */
    const toggleStatus = async () => {
        try {
            const next = !isOnline;
            await api.put('/driver/status', { isOnline: next });
            setIsOnline(next);
            isOnlineRef.current = next; // keep ref in sync for socket closures

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

                <div className="space-y-6">
                    {/* Stats grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: "Today's",      val1: `Earned: $${stats.today.earnings}`, val2: `Trips: ${stats.today.trips}`, icon: '⚡', color: 'text-green-600' },
                            { label: 'This Month',   val1: `Earned: $${stats.month.earnings}`, val2: `Trips: ${stats.month.trips}`, icon: '📅', color: 'text-blue-600' },
                            { label: 'All-Time',     val1: `Earned: $${stats.allTime.earnings}`, val2: `Trips: ${stats.allTime.trips}`, icon: '🏆', color: 'text-purple-600' },
                            { label: 'Avg Rating',   val1: `${driverRating.toFixed(1)} ⭐`, val2: 'Passenger rated', icon: '⭐', color: 'text-yellow-500' },
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

                    {/* ── Location Pin (shows when online) ── */}
                    {isOnline && (
                        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center justify-between gap-4 w-full">
                            <div>
                                <h3 className="text-lg font-bold flex items-center gap-2">📍 Location Broadcast</h3>
                                <p className="text-gray-500 text-sm">Transmitting your live coordinates.</p>
                            </div>
                            <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 max-w-sm ml-auto text-right ${myLocation ? 'bg-green-50 border-green-100' : 'bg-yellow-50 border-yellow-100'}`}>
                                <span className={`w-2 h-2 rounded-full animate-pulse flex-shrink-0 ${myLocation ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                                <span className={`font-bold text-sm truncate ${myLocation ? 'text-green-700' : 'text-yellow-700'}`}>
                                    {myLocationName ? myLocationName : myLocation ? `Locating... (${myLocation.lat.toFixed(4)}, ${myLocation.lng.toFixed(4)})` : 'Waiting for Signal...'}
                                </span>
                            </div>
                        </div>
                    )}

                </div>
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
                                    className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-extrabold text-lg py-3.5 rounded-2xl hover:from-emerald-400 hover:to-emerald-500 transition-all shadow-md flex items-center justify-center gap-2">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/></svg>
                                    Accept Ride
                                </button>
                                <button id="decline-ride-btn" onClick={declineRide}
                                    className="w-full bg-white border-2 border-stone-200 text-stone-500 font-bold text-lg py-3 rounded-2xl hover:border-red-200 hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center gap-2">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                                    Decline (Auto in {countdown}s)
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
