import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { io } from 'socket.io-client';

const RIDES_PER_PAGE = 10;

const AdminDashboard = () => {
    const { user } = useAuth();
    const [stats, setStats]           = useState(null);
    const [usersList, setUsersList]   = useState([]);
    const [driversList, setDriversList] = useState([]);
    const [ridesList, setRidesList]   = useState([]);
    const [loading, setLoading]       = useState(true);
    const [locations, setLocations]   = useState([]);
    const [newLocName, setNewLocName] = useState('');
    const [newLocLat, setNewLocLat]   = useState('');
    const [newLocLng, setNewLocLng]   = useState('');

    // Live socket counters
    const [liveOnlineDrivers, setLiveOnlineDrivers]       = useState(0);
    const [liveOnlinePassengers, setLiveOnlinePassengers] = useState(0);
    const [activityLog, setActivityLog] = useState([]);

    // Chat monitor: map of rideId -> messages[]
    const [chatLogs, setChatLogs] = useState({});
    // Which ride row has chat expanded
    const [expandedChat, setExpandedChat] = useState(null);

    // Pagination
    const [ridePage, setRidePage] = useState(0);

    // Driver stats modal
    const [selectedDriver, setSelectedDriver] = useState(null);
    const [driverModalDate, setDriverModalDate] = useState(new Date().toISOString().split('T')[0]);

    const addActivity = (msg) => setActivityLog(prev => [{ msg, ts: new Date().toLocaleTimeString() }, ...prev.slice(0, 49)]);

    const openDriverStats = async (driverId) => {
        try {
            const res = await api.get(`/admin/drivers/${driverId}/stats`);
            setSelectedDriver(res.data);
            setDriverModalDate(new Date().toISOString().split('T')[0]);
        } catch (err) {
            console.error('Failed to load driver stats:', err);
        }
    };

    const fetchDashboardData = async () => {
        try {
            const [statsRes, usersRes, driversRes, ridesRes, locRes] = await Promise.all([
                api.get('/admin/dashboard'),
                api.get('/admin/users'),
                api.get('/admin/drivers'),
                api.get('/admin/rides'),
                api.get('/locations')
            ]);
            setStats(statsRes.data);
            setUsersList(usersRes.data);
            setDriversList(driversRes.data);
            setRidesList(ridesRes.data);
            setLocations(locRes.data || []);
            setLoading(false);
        } catch (error) {
            console.error('Failed to fetch admin data', error);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();

        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const socket = io('http://localhost:5000', {
            auth: { token: user?.token || storedUser?.token }
        });

        socket.on('connect', () => console.log('Admin socket connected'));

        socket.on('adminRideUpdate', (data) => {
            addActivity(`🚗 ${data.event?.replace(/_/g, ' ') || 'Ride update'} [${(data.rideId?.toString() || '').slice(-6).toUpperCase()}]`);
            fetchDashboardData();
        });

        socket.on('adminOnlineStats', (data) => {
            setLiveOnlineDrivers(data.onlineDrivers ?? 0);
            setLiveOnlinePassengers(data.onlinePassengers ?? 0);
        });

        socket.on('adminDriverStatus', (data) => {
            const icon = data.isOnline ? '🟢' : '🔴';
            addActivity(`${icon} Driver ${data.driverName} went ${data.isOnline ? 'online' : 'offline'}`);
            setDriversList(prev => prev.map(d =>
                d.userId?._id?.toString() === data.driverId || d.userId?.toString() === data.driverId
                    ? { ...d, isOnline: data.isOnline }
                    : d
            ));
        });

        socket.on('adminEtaUpdate', (data) => {
            addActivity(`⏱ ETA ${data.etaMinutes} min for ride ${(data.rideId?.toString() || '').slice(-6).toUpperCase()}`);
        });

        socket.on('adminChatMessage', (msg) => {
            const rideId = msg.rideId?.toString();
            setChatLogs(prev => ({
                ...prev,
                [rideId]: [{ ...msg, ts: new Date().toLocaleTimeString() }, ...(prev[rideId] || [])].slice(0, 100)
            }));
            addActivity(`💬 Chat [${rideId?.slice(-6).toUpperCase()}]: ${msg.senderName}: "${msg.message.substring(0, 30)}"`);
        });

        return () => socket.close();
    }, [user.token]);

    const handleAddLocation = async (e) => {
        e.preventDefault();
        try {
            const res = await api.post('/locations', { name: newLocName, latitude: newLocLat, longitude: newLocLng });
            setLocations([...locations, res.data]);
            setNewLocName(''); setNewLocLat(''); setNewLocLng('');
            alert('Location added successfully');
        } catch (err) {
            alert('Failed to add location: ' + (err.response?.data?.message || err.message));
        }
    };

    const handleDeleteRide = async (rideId) => {
        if (!window.confirm('Permanently delete this ride record?')) return;
        try {
            await api.delete(`/admin/rides/${rideId}`);
            setRidesList(prev => prev.filter(r => r._id !== rideId));
            addActivity(`🗑 Ride ${rideId.slice(-6).toUpperCase()} deleted by admin`);
        } catch (err) {
            alert(err.response?.data?.message || 'Failed to delete ride');
        }
    };

    // Pagination helpers
    const totalPages = Math.ceil(ridesList.length / RIDES_PER_PAGE);
    const pagedRides = ridesList.slice(ridePage * RIDES_PER_PAGE, (ridePage + 1) * RIDES_PER_PAGE);

    const statusColors = {
        completed: 'bg-green-100 text-green-800',
        started:   'bg-blue-100 text-blue-800',
        accepted:  'bg-indigo-100 text-indigo-800',
        cancelled: 'bg-red-100 text-red-800',
        pending:   'bg-yellow-100 text-yellow-800',
    };

    if (loading) return (
        <div className="flex justify-center items-center h-screen bg-gray-50">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
    );

    return (
        <div className="min-h-[calc(100vh-4rem)] bg-gray-50 p-8">
            <div className="max-w-7xl mx-auto">

                {/* Header */}
                <div className="flex justify-between items-center mb-10">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-900">Admin Control Center</h1>
                        <p className="text-gray-500 mt-2">Welcome back, {user?.name}. Here's what's happening today.</p>
                    </div>
                </div>

                {/* Stats Grid */}
                {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                            <span className="text-gray-500 font-bold text-xs uppercase">Total Revenue</span>
                            <h2 className="text-3xl font-black text-green-600 mt-2">${stats.totalEarnings}</h2>
                        </div>
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                            <span className="text-gray-500 font-bold text-xs uppercase">Active Rides</span>
                            <h2 className="text-3xl font-black text-secondary mt-2">{stats.activeRides}</h2>
                        </div>
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                            <span className="text-gray-500 font-bold text-xs uppercase">Total Drivers</span>
                            <h2 className="text-3xl font-black text-gray-800 mt-2">{stats.totalDrivers}</h2>
                        </div>
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
                            <span className="text-gray-500 font-bold text-xs uppercase">Total Users</span>
                            <h2 className="text-3xl font-black text-gray-800 mt-2">{stats.totalUsers}</h2>
                        </div>
                        <div className="bg-green-50 p-5 rounded-2xl shadow-sm border border-green-200 flex flex-col">
                            <span className="text-green-600 font-bold text-xs uppercase flex items-center gap-1">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse inline-block"></span>Online Drivers
                            </span>
                            <h2 className="text-3xl font-black text-green-600 mt-2">{liveOnlineDrivers}</h2>
                        </div>
                        <div className="bg-blue-50 p-5 rounded-2xl shadow-sm border border-blue-200 flex flex-col">
                            <span className="text-blue-600 font-bold text-xs uppercase flex items-center gap-1">
                                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse inline-block"></span>Online Passengers
                            </span>
                            <h2 className="text-3xl font-black text-blue-600 mt-2">{liveOnlinePassengers}</h2>
                        </div>
                    </div>
                )}

                {/* Users + Drivers Overview */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                        <h2 className="text-2xl font-bold mb-6">Users Overview</h2>
                        <div className="max-h-80 overflow-y-auto pr-2">
                            {usersList.length > 0 ? usersList.map(u => (
                                <div key={u._id} className="p-4 mb-2 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-center hover:shadow-sm transition">
                                    <div><p className="font-bold text-gray-800">{u.name}</p><p className="text-sm text-gray-500">{u.email}</p></div>
                                    <p className="text-sm font-semibold text-gray-600">{u.phone}</p>
                                </div>
                            )) : <p className="text-gray-500 text-center py-4">No users found.</p>}
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                        <h2 className="text-2xl font-bold mb-6">Drivers Overview</h2>
                        <p className="text-xs text-gray-400 mb-3">Click a driver name to view their stats</p>
                        <div className="max-h-80 overflow-y-auto pr-2">
                            {driversList.length > 0 ? driversList.map(d => (
                                <div key={d._id} className="p-4 mb-2 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-center hover:shadow-md transition cursor-pointer"
                                    onClick={() => openDriverStats(d._id)}>
                                    <div>
                                        <p className="font-bold text-gray-800 hover:text-green-600 transition">{d.userId?.name || 'Loading...'}</p>
                                        <p className="text-sm text-gray-500">{d.vehicleType} &bull; {d.vehicleNumber}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-sm font-bold ${d.isOnline ? 'text-green-500' : 'text-gray-400'}`}>{d.isOnline ? '🟢 Online' : '⚫ Offline'}</p>
                                        <p className="text-xs text-gray-400 mt-1">Tap to view stats →</p>
                                    </div>
                                </div>
                            )) : <p className="text-gray-500 text-center py-4">No drivers found.</p>}
                        </div>
                    </div>
                </div>

                {/* Locations Management */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-8">
                    <h2 className="text-2xl font-bold mb-6">Manage Service Locations</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h3 className="text-lg font-bold mb-4">Add New Location</h3>
                            <form onSubmit={handleAddLocation} className="space-y-4">
                                <input type="text" placeholder="Location Name (e.g. RS Puram)" value={newLocName} onChange={e => setNewLocName(e.target.value)} required className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-gray-800" />
                                <div className="flex gap-4">
                                    <input type="number" step="any" placeholder="Latitude" value={newLocLat} onChange={e => setNewLocLat(e.target.value)} required className="w-1/2 p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-gray-800" />
                                    <input type="number" step="any" placeholder="Longitude" value={newLocLng} onChange={e => setNewLocLng(e.target.value)} required className="w-1/2 p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-gray-800" />
                                </div>
                                <button type="submit" className="bg-gray-900 text-white font-bold py-3 px-6 rounded-xl hover:bg-gray-800 transition shadow-md">Add Location</button>
                            </form>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold mb-4">Active Locations</h3>
                            <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                                {locations.length > 0 ? locations.map(loc => (
                                    <div key={loc._id} className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-center">
                                        <p className="font-bold text-gray-800">{loc.name}</p>
                                        <p className="text-xs text-gray-500">{loc.coordinates?.[1]}, {loc.coordinates?.[0]}</p>
                                    </div>
                                )) : <p className="text-gray-500 text-sm">No locations added yet.</p>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ══════════════════════════════════════════
                    LIVE RIDES TRACKER — Paginated + Chat
                ══════════════════════════════════════════ */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 mb-8 overflow-hidden">
                    {/* Header bar */}
                    <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                            <span className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></span>
                            <h2 className="text-2xl font-bold">Live Rides Tracker</h2>
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-bold">{ridesList.length} total</span>
                        </div>
                        {/* Pagination controls */}
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-500 font-semibold">
                                Page {totalPages === 0 ? 0 : ridePage + 1} / {totalPages}
                            </span>
                            <button
                                disabled={ridePage === 0}
                                onClick={() => setRidePage(p => p - 1)}
                                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
                            >← Prev</button>
                            <button
                                disabled={ridePage >= totalPages - 1}
                                onClick={() => setRidePage(p => p + 1)}
                                className="px-4 py-2 rounded-xl bg-gray-900 hover:bg-gray-700 text-white font-bold text-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
                            >Next →</button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-100">
                            <thead className="bg-gray-50">
                                <tr>
                                    {['Ride ID', 'Passenger', 'Driver / Vehicle', 'Route', 'Fare / Dist', 'Status', 'Actions'].map(h => (
                                        <th key={h} className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {pagedRides.length > 0 ? pagedRides.map(r => {
                                    const rideIdStr = r._id.toString();
                                    const isFinished = ['completed', 'cancelled'].includes(r.rideStatus);
                                    const rideChatMsgs = chatLogs[rideIdStr] || [];
                                    const isChatOpen = expandedChat === rideIdStr;

                                    return (
                                        <>
                                            <tr key={r._id} className="hover:bg-gray-50 transition">
                                                <td className="px-5 py-4 whitespace-nowrap text-sm font-bold text-gray-900 font-mono">
                                                    {rideIdStr.slice(-8).toUpperCase()}
                                                </td>
                                                <td className="px-5 py-4 whitespace-nowrap text-sm">
                                                    <div className="font-bold text-gray-800">{r.passengerId?.name || 'Deleted User'}</div>
                                                    <div className="text-xs text-gray-400">{r.passengerId?.phone || ''}</div>
                                                </td>
                                                <td className="px-5 py-4 whitespace-nowrap text-sm">
                                                    {r.driverId ? (
                                                        <div>
                                                            <div className="font-semibold text-gray-700">{r.driverId.vehicleNumber} ({r.driverId.vehicleType})</div>
                                                            <div className="text-xs text-blue-500">⭐ {r.driverId.rating}</div>
                                                        </div>
                                                    ) : <span className="text-gray-400 italic text-xs">Searching...</span>}
                                                </td>
                                                <td className="px-5 py-4 text-sm max-w-[180px]">
                                                    <div className="font-medium text-gray-700 truncate">{r.pickup} → {r.destination}</div>
                                                    <div className="text-xs text-gray-400 font-semibold">{r.cabType}</div>
                                                </td>
                                                <td className="px-5 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                                                    ${r.fare} <span className="text-xs text-gray-400 font-normal">/ {r.distance} km</span>
                                                </td>
                                                <td className="px-5 py-4 whitespace-nowrap">
                                                    <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full ${statusColors[r.rideStatus] || 'bg-gray-100 text-gray-700'}`}>
                                                        {r.rideStatus}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        {/* Chat toggle button */}
                                                        <button
                                                            onClick={() => setExpandedChat(isChatOpen ? null : rideIdStr)}
                                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition border ${isChatOpen ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'}`}
                                                        >
                                                            💬 Chat
                                                            {rideChatMsgs.length > 0 && (
                                                                <span className="bg-blue-800 text-white text-[10px] px-1.5 py-0.5 rounded-full">{rideChatMsgs.length}</span>
                                                            )}
                                                        </button>
                                                        {/* Delete button — only for completed/cancelled */}
                                                        {isFinished && (
                                                            <button
                                                                onClick={() => handleDeleteRide(r._id)}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition"
                                                            >
                                                                🗑 Delete
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* ── Inline Chat Panel ── */}
                                            {isChatOpen && (
                                                <tr key={`${r._id}-chat`}>
                                                    <td colSpan="7" className="px-5 pb-4 bg-blue-50">
                                                        <div className="rounded-2xl border border-blue-200 bg-white shadow-md overflow-hidden">
                                                            <div className="bg-blue-700 text-white px-5 py-3 flex justify-between items-center">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="w-2 h-2 bg-blue-300 rounded-full animate-pulse"></span>
                                                                    <span className="font-bold text-sm">Live Chat Monitor — Ride #{rideIdStr.slice(-6).toUpperCase()}</span>
                                                                </div>
                                                                <button onClick={() => setExpandedChat(null)} className="text-blue-200 hover:text-white text-lg font-light">✕</button>
                                                            </div>
                                                            <div className="max-h-52 overflow-y-auto p-4 space-y-2 bg-gray-50">
                                                                {rideChatMsgs.length === 0 ? (
                                                                    <p className="text-center text-gray-400 text-sm py-6">No messages in this ride yet.</p>
                                                                ) : rideChatMsgs.map((msg, i) => (
                                                                    <div key={i} className={`flex flex-col ${msg.senderRole === 'driver' ? 'items-start' : 'items-end'}`}>
                                                                        <div className={`px-4 py-2 rounded-xl max-w-[70%] text-sm shadow-sm ${msg.senderRole === 'driver' ? 'bg-blue-100 text-blue-900' : 'bg-gray-900 text-white'}`}>
                                                                            <p className="font-bold text-xs mb-0.5 opacity-70">{msg.senderName} ({msg.senderRole})</p>
                                                                            <p>{msg.message}</p>
                                                                        </div>
                                                                        <span className="text-[10px] text-gray-400 mt-0.5">{msg.ts}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan="7" className="text-center py-10 text-gray-400">No rides registered.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Bottom pagination */}
                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-2 py-5 border-t border-gray-100">
                            {Array.from({ length: totalPages }).map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setRidePage(i)}
                                    className={`w-9 h-9 rounded-full text-sm font-bold transition ${i === ridePage ? 'bg-gray-900 text-white shadow-lg' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                >
                                    {i + 1}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Live Activity Log */}
                <div className="bg-gray-900 text-white p-6 rounded-3xl shadow-sm mb-8">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></span>
                        <h2 className="text-xl font-bold">Live Activity Log</h2>
                    </div>
                    <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                        {activityLog.length === 0
                            ? <p className="text-gray-500 text-sm text-center py-6">Waiting for events...</p>
                            : activityLog.map((entry, i) => (
                                <div key={i} className="flex items-start gap-3 text-sm">
                                    <span className="text-gray-500 text-xs flex-shrink-0 mt-0.5">{entry.ts}</span>
                                    <span className="text-gray-200">{entry.msg}</span>
                                </div>
                            ))}
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════
                DRIVER STATS MODAL
            ══════════════════════════════════ */}
            {selectedDriver && (
                <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
                    <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl my-8">
                        <div className="bg-gray-900 p-6 rounded-t-3xl flex justify-between items-center">
                            <div>
                                <h2 className="text-2xl font-black text-white">
                                    🚗 {selectedDriver.driver?.userId?.name || 'Driver'} — Stats
                                </h2>
                                <p className="text-gray-400 text-sm mt-1">
                                    {selectedDriver.driver?.vehicleType} &bull; {selectedDriver.driver?.vehicleNumber}
                                    &nbsp;&bull;&nbsp;
                                    <span className={selectedDriver.driver?.isOnline ? 'text-green-400' : 'text-gray-500'}>
                                        {selectedDriver.driver?.isOnline ? '🟢 Online' : '⚫ Offline'}
                                    </span>
                                </p>
                            </div>
                            <button onClick={() => setSelectedDriver(null)} className="text-gray-400 hover:text-white text-3xl font-light transition">✕</button>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { label: "Today's", icon: '⚡', color: 'text-green-600', bg: 'bg-green-50', earn: selectedDriver.stats.today.earnings, trips: selectedDriver.stats.today.trips },
                                    { label: 'This Month', icon: '📅', color: 'text-blue-600', bg: 'bg-blue-50', earn: selectedDriver.stats.month.earnings, trips: selectedDriver.stats.month.trips },
                                    { label: 'All-Time', icon: '🏆', color: 'text-purple-600', bg: 'bg-purple-50', earn: selectedDriver.stats.allTime.earnings, trips: selectedDriver.stats.allTime.trips },
                                ].map((s, i) => (
                                    <div key={i} className={`${s.bg} rounded-2xl p-4 border border-gray-100`}>
                                        <span className="text-2xl">{s.icon}</span>
                                        <p className="text-xs text-gray-500 font-bold uppercase tracking-wide mt-2">{s.label}</p>
                                        <p className={`text-xl font-black mt-1 ${s.color}`}>₹{s.earn}</p>
                                        <p className="text-sm text-gray-400 font-semibold">{s.trips} trips</p>
                                    </div>
                                ))}
                            </div>
                            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 flex flex-col md:flex-row items-center gap-4">
                                <div className="flex-1">
                                    <h3 className="font-bold text-gray-800">Historical — Pick a Date</h3>
                                    <p className="text-sm text-gray-400">View earnings & trips for any specific day</p>
                                </div>
                                <input type="date" value={driverModalDate} onChange={e => setDriverModalDate(e.target.value)}
                                    className="p-3 border-2 border-gray-200 rounded-xl font-bold text-gray-700 outline-none focus:ring-2 focus:ring-gray-800 bg-white" />
                                <div className="text-center min-w-[90px]">
                                    <p className="text-xs text-gray-400 font-bold uppercase">Trips</p>
                                    <p className="text-2xl font-black text-gray-800">{selectedDriver.stats.ridesByDate?.[driverModalDate]?.trips ?? 0}</p>
                                </div>
                                <div className="text-center min-w-[90px]">
                                    <p className="text-xs text-gray-400 font-bold uppercase">Earned</p>
                                    <p className="text-2xl font-black text-green-600">₹{selectedDriver.stats.ridesByDate?.[driverModalDate]?.earnings ?? 0}</p>
                                </div>
                            </div>
                            {selectedDriver.recentRides?.length > 0 && (
                                <div>
                                    <h3 className="font-bold text-gray-800 mb-3">Recent Completed Rides</h3>
                                    <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                                        {selectedDriver.recentRides.map((r, i) => (
                                            <div key={i} className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex justify-between items-center text-sm">
                                                <div>
                                                    <p className="font-semibold text-gray-700">{r.pickup} → {r.destination}</p>
                                                    <p className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleDateString()} &bull; {r.cabType}</p>
                                                </div>
                                                <p className="font-black text-green-600">₹{r.fare}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div className="flex gap-4 pt-2 border-t border-gray-100">
                                <div>
                                    <p className="text-xs text-gray-400 font-bold uppercase">Email</p>
                                    <p className="font-semibold text-gray-700">{selectedDriver.driver?.userId?.email || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 font-bold uppercase">Phone</p>
                                    <p className="font-semibold text-gray-700">{selectedDriver.driver?.userId?.phone || '—'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-400 font-bold uppercase">Rating</p>
                                    <p className="font-semibold text-gray-700">⭐ {selectedDriver.driver?.rating ?? 'N/A'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
