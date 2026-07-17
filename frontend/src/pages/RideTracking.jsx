import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:5000';

/* ─── Status colour mapping ─────────────────────────────── */
const STATUS_CONFIG = {
    pending:   { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending',   icon: '⏳' },
    accepted:  { bg: 'bg-blue-100',   text: 'text-blue-800',   label: 'Accepted',  icon: '✅' },
    started:   { bg: 'bg-green-100',  text: 'text-green-800',  label: 'In Progress', icon: '🚗' },
    completed: { bg: 'bg-gray-100',   text: 'text-gray-800',   label: 'Completed', icon: '🎉' },
    cancelled: { bg: 'bg-red-100',    text: 'text-red-800',    label: 'Cancelled', icon: '❌' },
};

const RideTracking = () => {
    const { id } = useParams();
    const { user } = useAuth();
    const navigate = useNavigate();

    const [ride, setRide]             = useState(null);
    const [loading, setLoading]       = useState(true);
    const [socket, setSocket]         = useState(null);

    /* Location */
    const [driverPos, setDriverPos]   = useState(null);
    const [myPos, setMyPos]           = useState(null);

    /* ETA */
    const [etaMinutes, setEtaMinutes] = useState(null);

    /* Chat */
    const [chatOpen, setChatOpen]     = useState(false);
    const [messages, setMessages]     = useState([]);
    const [newMsg, setNewMsg]         = useState('');
    const [unread, setUnread]         = useState(0);
    const msgEndRef = useRef(null);

    /* Toast */
    const [toast, setToast]           = useState(null);

    const isDriver = user.role === 'driver';

    /* ── Show toast ─────────────────────────────────────── */
    const showToast = (message, type = 'info') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    /* ── Scroll chat to bottom ──────────────────────────── */
    useEffect(() => {
        if (chatOpen) msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, chatOpen]);

    /* ── Main effect: fetch ride + setup socket ─────────── */
    useEffect(() => {
        let geoWatcher = null;

        const fetchRide = async () => {
            try {
                const res = await api.get(`/rides/${id}`);
                setRide(res.data);
                setLoading(false);
            } catch (err) {
                console.error('Failed to fetch ride:', err);
                navigate('/');
            }
        };
        fetchRide();

        /* -- Socket setup -- */
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const sock = io(SOCKET_URL, {
            auth: { token: user?.token || storedUser?.token },
        });
        setSocket(sock);

        /* Join ride room for chat */
        sock.on('connect', () => {
            sock.emit('joinRideRoom', { rideId: id });
        });

        /* ── DRIVER location → update map overlay ── */
        sock.on('driverLocation', (data) => {
            if (data.rideId === id) {
                setDriverPos({ lng: data.longitude, lat: data.latitude });
            }
        });

        /* ── Passenger location (received by driver) ── */
        sock.on('passengerLocation', (data) => {
            if (data.rideId === id) {
                setMyPos({ lng: data.longitude, lat: data.latitude });
            }
        });

        /* ── Live ETA ── */
        sock.on('etaUpdate', (data) => {
            if (data.rideId === id) setEtaMinutes(data.etaMinutes);
        });

        /* ── Ride status changes ── */
        sock.on('rideStatusChanged', (data) => {
            if (data.rideId === id || data.rideId?.toString() === id) {
                setRide(prev => prev ? { ...prev, rideStatus: data.status } : prev);
                showToast(data.message || `Ride status: ${data.status}`, data.status === 'completed' ? 'success' : 'info');
            }
        });

        /* ── Driver arrived ── */
        sock.on('driverArrived', (data) => {
            if (data.rideId === id || data.rideId?.toString() === id) {
                showToast('🚗 Your driver has arrived!', 'success');
            }
        });

        /* ── Ride completed (passenger gets receipt prompt) ── */
        sock.on('rideCompleted', (data) => {
            if (data.rideId === id || data.rideId?.toString() === id) {
                setRide(prev => prev ? { ...prev, rideStatus: 'completed' } : prev);
                showToast(`Ride completed! Fare: $${data.fare}`, 'success');
            }
        });

        /* ── Ride cancelled (by other party) ── */
        sock.on('rideCancelled', (data) => {
            if (data.rideId === id || data.rideId?.toString() === id) {
                setRide(prev => prev ? { ...prev, rideStatus: 'cancelled' } : prev);
                showToast(data.reason || 'Ride was cancelled.', 'error');
            }
        });

        /* ── Chat messages ── */
        sock.on('receiveMessage', (msg) => {
            setMessages(prev => [...prev, msg]);
            if (!chatOpen) setUnread(u => u + 1);
        });

        /* ── GPS tracking (if driver: broadcast location; if passenger: share optionally) ── */
        if (navigator.geolocation) {
            geoWatcher = navigator.geolocation.watchPosition(
                (pos) => {
                    const { longitude, latitude } = pos.coords;
                    setMyPos({ lng: longitude, lat: latitude });

                    if (isDriver && sock.connected) {
                        const ridePassengerId = ride?.passengerId?._id || ride?.passengerId;
                        sock.emit('locationUpdate', {
                            longitude,
                            latitude,
                            rideId: id,
                            passengerId: ridePassengerId?.toString(),
                        });
                    } else if (!isDriver && sock.connected) {
                        // Passenger optionally shares location to driver
                        const rideDriverUserId = ride?.driverId?.userId;
                        if (rideDriverUserId) {
                            sock.emit('passengerLocation', { longitude, latitude, rideId: id, driverUserId: rideDriverUserId });
                        }
                    }
                },
                (err) => console.warn('Geolocation error:', err.message),
                { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
            );
        }

        return () => {
            sock.emit('leaveRideRoom', { rideId: id });
            sock.close();
            if (geoWatcher && navigator.geolocation) {
                navigator.geolocation.clearWatch(geoWatcher);
            }
        };
        // eslint-disable-next-line
    }, [id, user.token]);

    /* ── REST action handler ─────────────────────────────── */
    const handleAction = async (action) => {
        try {
            await api.put(`/rides/${id}/${action}`);
            setRide(prev => ({ ...prev, rideStatus: action === 'cancel' ? 'cancelled' : action === 'start' ? 'started' : 'completed' }));

            if (action === 'complete') {
                showToast('Ride completed! Payment processed.', 'success');
                setTimeout(() => navigate(`/${user.role}-dashboard`), 2500);
            }
        } catch (err) {
            console.error(`Failed to ${action} ride:`, err);
            showToast(`Failed to ${action} ride`, 'error');
        }
    };

    /* ── Driver arrives action ───────────────────────────── */
    const handleArrived = () => {
        if (socket) {
            const passengerId = ride?.passengerId?._id || ride?.passengerId;
            socket.emit('driverArrived', { rideId: id, passengerId: passengerId?.toString() });
            showToast('Passenger notified that you have arrived!', 'success');
        }
    };

    /* ── Send chat message ───────────────────────────────── */
    const sendMessage = (e) => {
        e.preventDefault();
        if (!newMsg.trim() || !socket) return;
        socket.emit('sendMessage', { rideId: id, message: newMsg.trim() });
        setNewMsg('');
    };

    /* ── Open chat tab ───────────────────────────────────── */
    const openChat = () => {
        setChatOpen(true);
        setUnread(0);
    };

    if (loading || !ride) return (
        <div className="flex h-screen items-center justify-center bg-gray-100">
            <div className="w-16 h-16 border-4 border-secondary border-t-transparent rounded-full animate-spin"></div>
        </div>
    );

    const statusCfg = STATUS_CONFIG[ride.rideStatus] || STATUS_CONFIG.pending;

    return (
        <div className="min-h-[calc(100vh-4rem)] flex flex-col md:flex-row bg-gray-100 relative">

            {/* ── Toast ──────────────────────────────────── */}
            {toast && (
                <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl font-bold text-white text-sm transition-all
                    ${toast.type === 'success' ? 'bg-green-500' : toast.type === 'error' ? 'bg-red-500' : 'bg-gray-800'}`}>
                    {toast.message}
                </div>
            )}

            {/* ════════════════════════════════════════════
                LEFT PANEL
            ════════════════════════════════════════════ */}
            <div className="w-full md:w-[360px] bg-white shadow-xl z-10 flex flex-col p-6 overflow-y-auto">

                {/* Status badge */}
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold mb-4 w-fit ${statusCfg.bg} ${statusCfg.text}`}>
                    <span>{statusCfg.icon}</span>
                    <span>{statusCfg.label}</span>
                </div>

                {/* ETA */}
                {etaMinutes && ride.rideStatus === 'accepted' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4 flex items-center gap-3">
                        <span className="text-2xl">⏱</span>
                        <div>
                            <p className="text-xs text-blue-500 font-bold uppercase tracking-wide">Live ETA</p>
                            <p className="text-2xl font-black text-blue-700">{etaMinutes} min</p>
                        </div>
                    </div>
                )}

                {/* Route */}
                <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 mb-4 space-y-3">
                    <div>
                        <span className="text-gray-400 text-xs font-bold block mb-1">PICKUP</span>
                        <p className="font-bold text-gray-800">{ride.pickup}</p>
                    </div>
                    <div className="w-full h-px bg-gray-200"></div>
                    <div>
                        <span className="text-gray-400 text-xs font-bold block mb-1">DESTINATION</span>
                        <p className="font-bold text-gray-800">{ride.destination}</p>
                    </div>
                </div>

                {/* Fare */}
                <div className="flex items-center justify-between bg-gray-900 text-white p-5 rounded-2xl shadow-lg mb-4">
                    <div>
                        <span className="text-gray-400 text-xs font-bold block mb-1">TOTAL FARE</span>
                        <p className="text-3xl font-black text-green-400">${ride.fare}</p>
                    </div>
                    <div className="text-right">
                        <span className="text-gray-400 text-xs font-bold block mb-1">CAB TYPE</span>
                        <p className="font-bold text-gray-200">{ride.cabType}</p>
                    </div>
                </div>

                {/* Driver info (for passengers) */}
                {!isDriver && ride.driverId && (
                    <div className="bg-indigo-50 rounded-2xl p-4 mb-4 flex items-center gap-3 border border-indigo-100">
                        <div className="w-12 h-12 bg-indigo-200 rounded-full flex items-center justify-center text-xl font-black text-indigo-700">
                            🚗
                        </div>
                        <div>
                            <p className="text-xs text-indigo-400 font-bold uppercase">Your Driver</p>
                            <p className="font-bold text-gray-800">{ride.driverId?.vehicleNumber || 'Assigned'}</p>
                            <p className="text-xs text-gray-500">{ride.driverId?.vehicleType} · ⭐ {ride.driverId?.rating || '5.0'}</p>
                        </div>
                    </div>
                )}

                {/* ── DRIVER ACTIONS ── */}
                {isDriver && (
                    <div className="mt-auto space-y-3">
                        {ride.rideStatus === 'accepted' && (
                            <>
                                <button onClick={handleArrived}
                                    className="w-full py-3 bg-yellow-400 text-gray-900 font-bold rounded-xl hover:bg-yellow-500 transition shadow-md">
                                    📍 I've Arrived at Pickup
                                </button>
                                <button onClick={() => handleAction('start')}
                                    className="w-full py-4 bg-green-500 text-white font-bold text-lg rounded-xl shadow-lg hover:bg-green-600 transition">
                                    🚀 Start Trip
                                </button>
                            </>
                        )}
                        {ride.rideStatus === 'started' && (
                            <button onClick={() => handleAction('complete')}
                                className="w-full py-4 bg-gray-900 text-white font-bold text-lg rounded-xl shadow-lg hover:bg-gray-700 transition">
                                🏁 End Trip & Collect Payment
                            </button>
                        )}
                    </div>
                )}

                {/* ── PASSENGER ACTIONS ── */}
                {!isDriver && ride.rideStatus === 'accepted' && (
                    <div className="mt-auto text-center p-5 bg-blue-50 rounded-2xl border border-blue-100">
                        <p className="text-2xl mb-2">🚗</p>
                        <h4 className="font-bold text-lg text-gray-800">Driver is on the way!</h4>
                        <p className="text-gray-500 text-sm mb-3">Stay near the pickup point.</p>
                        <button onClick={() => handleAction('cancel')} className="text-red-500 font-bold hover:underline text-sm">
                            Cancel Ride
                        </button>
                    </div>
                )}
            </div>

            {/* ════════════════════════════════════════════
                RIGHT PANEL – Map + Chat
            ════════════════════════════════════════════ */}
            <div className="flex-1 relative min-h-[400px]">
                {/* Simulated map */}
                <img
                    src="https://images.unsplash.com/photo-1524661135-423995f22d0b?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80"
                    alt="Map"
                    className="w-full h-full object-cover"
                />

                {/* Live GPS indicators */}
                {driverPos && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                        <div className="w-8 h-8 bg-blue-500 border-4 border-white rounded-full shadow-xl animate-pulse"></div>
                        <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full mt-1 font-bold">Driver</span>
                    </div>
                )}
                {myPos && !isDriver && (
                    <div className="absolute top-1/3 left-1/3 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                        <div className="w-8 h-8 bg-red-500 border-4 border-white rounded-full shadow-xl"></div>
                        <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full mt-1 font-bold">You</span>
                    </div>
                )}

                {/* Live GPS badge */}
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-4 py-2 rounded-xl shadow-xl flex items-center gap-2 text-sm font-bold">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span>Live Tracking</span>
                </div>

                {/* ETA badge on map */}
                {etaMinutes && ride.rideStatus === 'accepted' && (
                    <div className="absolute top-4 left-4 bg-blue-600 text-white px-4 py-2 rounded-xl shadow-xl font-bold text-sm">
                        ETA: {etaMinutes} min
                    </div>
                )}

                {/* ── CHAT BUTTON ── */}
                <button
                    onClick={openChat}
                    className="absolute bottom-6 right-6 bg-gray-900 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-2xl hover:bg-gray-700 transition relative"
                    aria-label="Open Chat"
                >
                    <span className="text-2xl">💬</span>
                    {unread > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-black w-5 h-5 rounded-full flex items-center justify-center">
                            {unread}
                        </span>
                    )}
                </button>
            </div>

            {/* ════════════════════════════════════════════
                CHAT PANEL (slide-in from right)
            ════════════════════════════════════════════ */}
            {chatOpen && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    {/* Backdrop */}
                    <div className="flex-1 bg-black/40" onClick={() => setChatOpen(false)}></div>

                    {/* Chat panel */}
                    <div className="w-full max-w-sm bg-white flex flex-col shadow-2xl">
                        {/* Chat header */}
                        <div className="bg-gray-900 text-white px-6 py-4 flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-lg">Live Chat</h3>
                                <p className="text-gray-400 text-xs">
                                    {isDriver ? 'Passenger' : 'Driver'} · Ride #{id.slice(-6).toUpperCase()}
                                </p>
                            </div>
                            <button onClick={() => setChatOpen(false)} className="text-2xl text-gray-400 hover:text-white transition">×</button>
                        </div>

                        {/* Messages area */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50 min-h-0" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                            {messages.length === 0 && (
                                <div className="text-center text-gray-400 text-sm py-8">
                                    <p className="text-3xl mb-2">💬</p>
                                    <p>No messages yet.</p>
                                    <p>Start the conversation!</p>
                                </div>
                            )}
                            {messages.map((msg, i) => {
                                const isMine = msg.senderId === user._id;
                                return (
                                    <div key={i} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} gap-1`}>
                                        <span className="text-xs text-gray-400 font-semibold">{msg.senderName} · {msg.senderRole}</span>
                                        <div className={`px-4 py-2 rounded-2xl max-w-[80%] shadow-sm ${isMine
                                            ? 'bg-gray-900 text-white rounded-br-none'
                                            : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'}`}>
                                            <p className="text-sm">{msg.message}</p>
                                        </div>
                                        <span className="text-[10px] text-gray-400">
                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                );
                            })}
                            <div ref={msgEndRef}></div>
                        </div>

                        {/* Chat input */}
                        <form onSubmit={sendMessage} className="p-4 border-t border-gray-200 flex gap-2 bg-white">
                            <input
                                type="text"
                                value={newMsg}
                                onChange={(e) => setNewMsg(e.target.value)}
                                placeholder="Type a message..."
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-gray-800 text-sm"
                            />
                            <button type="submit"
                                className="bg-gray-900 text-white px-4 py-2 rounded-xl font-bold hover:bg-gray-700 transition">
                                Send
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RideTracking;
