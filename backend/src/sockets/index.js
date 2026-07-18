import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { Ride } from '../models/Ride.js';
import { Driver } from '../models/Driver.js';
import {
    updateDriverLocationCache,
    removeDriverFromCache,
    setDriverOnlineStatus,
    cacheRideState,
    getCachedRide,
    cacheRideETA,
    storeRideOTP,
    deleteRideOTP
} from '../redis/index.js';

let io;

// Realtime maps for tracking connected users/drivers
export const activePassengers = new Map();  // userId  -> socketId
export const activeDrivers    = new Map();  // userId  -> socketId
export const activeAdmins     = new Map();  // userId  -> socketId

// Grace-period timers: if a driver disconnects we wait before marking offline
// This prevents page-refresh / brief network blip from wiping driver status
const disconnectTimers = new Map(); // userId -> NodeJS.Timeout
const DRIVER_OFFLINE_GRACE_MS = 30_000; // 30 seconds

/* ============================================================
   Helper: broadcast to all admins
   ============================================================ */
const broadcastToAdmins = (event, payload) => {
    for (const [, socketId] of activeAdmins.entries()) {
        io.to(socketId).emit(event, payload);
    }
    // Also emit globally so admin tabs that are already subscribed receive it
    io.emit(event, payload);
};

/* ============================================================
   Helper: compute rough ETA (km/h = 30 city speed)
   ============================================================ */
const computeETA = (distanceKm) => Math.max(1, Math.round((distanceKm / 30) * 60));

export const configureSockets = (server) => {
    io = new Server(server, {
        cors: {
            origin: process.env.NODE_ENV === 'production' ? false : '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
        },
        pingTimeout: 60000,
    });

    /* ----------------------------------------------------------
       AUTH MIDDLEWARE
       ---------------------------------------------------------- */
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) return next(new Error('Authentication error: No token'));

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId).select('-password');

            if (!user) return next(new Error('Authentication error: User not found'));

            socket.user = user;
            next();
        } catch (error) {
            console.error('Socket Auth Error:', error.message);
            next(new Error('Authentication error'));
        }
    });

    /* ----------------------------------------------------------
       CONNECTION
       ---------------------------------------------------------- */
    io.on('connection', async (socket) => {
        const uid = socket.user._id.toString();
        const role = socket.user.role;

        console.log(`✅ Connected: ${socket.user.name} (${role}) [${socket.id}]`);

        // Register in correct role map
        if (role === 'passenger') {
            activePassengers.set(uid, socket.id);
        } else if (role === 'driver') {
            // Cancel any pending offline grace-period timer for this driver
            if (disconnectTimers.has(uid)) {
                clearTimeout(disconnectTimers.get(uid));
                disconnectTimers.delete(uid);
                console.log(`⏳ Grace-period cancelled — driver ${socket.user.name} reconnected in time.`);
            }

            activeDrivers.set(uid, socket.id);

            // Auto-restore: if this driver was marked online in the DB (e.g. they
            // refreshed the page), re-register them in Redis so they can receive rides
            // without having to manually toggle the status button again.
            try {
                const dbDriver = await Driver.findOne({ userId: uid }).select('isOnline');
                if (dbDriver?.isOnline) {
                    await setDriverOnlineStatus(uid, true);
                    console.log(`♻️  Driver ${socket.user.name} was already online in DB — Redis status restored.`);
                }
            } catch (err) {
                console.error('Auto-restore driver online status error:', err.message);
            }
        } else if (role === 'admin') {
            activeAdmins.set(uid, socket.id);
            // Send current online driver count immediately
            socket.emit('adminOnlineStats', { onlineDrivers: activeDrivers.size, onlinePassengers: activePassengers.size });
        }

        /* ======================================================
           DRIVER EVENTS
           ====================================================== */

        /** Driver goes online */
        socket.on('driverOnline', async () => {
            try {
                activeDrivers.set(uid, socket.id);
                await setDriverOnlineStatus(uid, true);

                // Update DB
                await Driver.findOneAndUpdate({ userId: uid }, { isOnline: true });

                console.log(`🟢 Driver online: ${socket.user.name}`);
                broadcastToAdmins('adminOnlineStats', { onlineDrivers: activeDrivers.size, onlinePassengers: activePassengers.size });
                broadcastToAdmins('adminDriverStatus', { driverId: uid, driverName: socket.user.name, isOnline: true });
            } catch (err) {
                console.error('driverOnline error:', err);
            }
        });

        /** Driver goes offline */
        socket.on('driverOffline', async () => {
            try {
                activeDrivers.delete(uid);
                await setDriverOnlineStatus(uid, false);
                await removeDriverFromCache(uid);

                await Driver.findOneAndUpdate({ userId: uid }, { isOnline: false });

                console.log(`🔴 Driver offline: ${socket.user.name}`);
                broadcastToAdmins('adminOnlineStats', { onlineDrivers: activeDrivers.size, onlinePassengers: activePassengers.size });
                broadcastToAdmins('adminDriverStatus', { driverId: uid, driverName: socket.user.name, isOnline: false });
            } catch (err) {
                console.error('driverOffline error:', err);
            }
        });

        /** Driver broadcasts live GPS location
         *  Payload: { longitude, latitude, rideId?, passengerId? }
         */
        socket.on('locationUpdate', async (data) => {
            try {
                const { longitude, latitude, rideId, passengerId } = data;

                // 1. Update Redis geo cache
                await updateDriverLocationCache(uid, longitude, latitude);

                // 2. Update MongoDB (debounced in a real app)
                await Driver.findOneAndUpdate(
                    { userId: uid },
                    { currentLocation: { type: 'Point', coordinates: [longitude, latitude] } }
                );

                // 3. Forward to the assigned passenger
                if (passengerId) {
                    const passengerSocketId = activePassengers.get(passengerId);
                    if (passengerSocketId) {
                        io.to(passengerSocketId).emit('driverLocation', { longitude, latitude, rideId });
                    }
                }

                // 4. Forward to admins (throttled view)
                broadcastToAdmins('adminDriverLocation', { driverId: uid, longitude, latitude });

                // 5. Recompute & cache ETA if ride active
                if (rideId) {
                    const ride = await Ride.findById(rideId).select('pickupCoordinates distance rideStatus');
                    if (ride && ride.rideStatus === 'accepted') {
                        // Simple distance approximation (driver → pickup)
                        const etaMin = computeETA(ride.distance || 5);
                        await cacheRideETA(rideId, etaMin);

                        if (passengerId) {
                            const passengerSocketId = activePassengers.get(passengerId);
                            if (passengerSocketId) {
                                io.to(passengerSocketId).emit('etaUpdate', { rideId, etaMinutes: etaMin });
                            }
                        }
                        broadcastToAdmins('adminEtaUpdate', { rideId, etaMinutes: etaMin });
                    }
                }
            } catch (err) {
                console.error('locationUpdate error:', err);
            }
        });

        /** Driver arrives at pickup point
         *  Payload: { rideId, passengerId }
         */
        socket.on('driverArrived', async (data) => {
            try {
                const { rideId, passengerId } = data;

                const otp = Math.floor(1000 + Math.random() * 9000).toString();
                await storeRideOTP(rideId, otp);

                const room = `ride:${rideId}`;
                // Broadcast to room instead of single socket (safeguard against socket desync)
                io.to(room).emit('driverArrived', { rideId, otp, message: 'Your driver has arrived! Please come to the pickup point.' });

                broadcastToAdmins('adminRideUpdate', { event: 'driver_arrived', rideId });
            } catch (err) {
                console.error('driverArrived error:', err);
            }
        });

        /** Resend OTP
         *  Payload: { rideId, passengerId }
         */
        socket.on('resendOTP', async (data) => {
            try {
                const { rideId, passengerId } = data;
                
                const otp = Math.floor(1000 + Math.random() * 9000).toString();
                await storeRideOTP(rideId, otp);
                
                const room = `ride:${rideId}`;
                io.to(room).emit('otpResent', { rideId, otp, message: 'Driver sent a new OTP.' });
            } catch (err) {
                console.error('resendOTP error:', err);
            }
        });

        /** Accept Ride (Driver confirms)
         *  Payload: { rideId, passengerId }
         */
        socket.on('acceptRide', async (data) => {
            try {
                const { rideId, passengerId } = data;

                // Cache ride state in Redis
                const ride = await Ride.findById(rideId).populate('passengerId', 'name phone').populate('driverId');
                if (ride) {
                    await cacheRideState(rideId, { rideId, rideStatus: 'accepted', passengerId, driverName: socket.user.name });
                }

                const passengerSocketId = activePassengers.get(passengerId);
                if (passengerSocketId) {
                    io.to(passengerSocketId).emit('rideAccepted', {
                        rideId,
                        driverId: uid,
                        driverName: socket.user.name,
                        message: `${socket.user.name} accepted your ride!`,
                    });
                }

                broadcastToAdmins('adminRideUpdate', { event: 'ride_accepted', rideId, driverName: socket.user.name });
            } catch (err) {
                console.error('acceptRide socket error:', err);
            }
        });

        /** Ride Status Update (driver moves through states)
         *  Payload: { rideId, passengerId, status }   status ∈ 'accepted'|'started'|'completed'
         */
        socket.on('rideStatusUpdate', async (data) => {
            try {
                const { rideId, passengerId, status } = data;

                // Forward to passenger
                const passengerSocketId = activePassengers.get(passengerId);
                if (passengerSocketId) {
                    io.to(passengerSocketId).emit('rideStatusChanged', { rideId, status });
                }

                // Cache updated state
                await cacheRideState(rideId, { rideId, rideStatus: status, passengerId });

                if (status === 'completed') {
                    await deleteCachedRide(rideId);
                }

                broadcastToAdmins('adminRideUpdate', { event: `ride_${status}`, rideId });
            } catch (err) {
                console.error('rideStatusUpdate error:', err);
            }
        });

        /* ======================================================
           PASSENGER EVENTS
           ====================================================== */

        /** Passenger location (optional live sharing)
         *  Payload: { longitude, latitude, rideId?, driverUserId? }
         */
        socket.on('passengerLocation', (data) => {
            try {
                const { longitude, latitude, rideId, driverUserId } = data;
                if (driverUserId) {
                    const driverSocketId = activeDrivers.get(driverUserId);
                    if (driverSocketId) {
                        io.to(driverSocketId).emit('passengerLocation', { longitude, latitude, rideId });
                    }
                }
            } catch (err) {
                console.error('passengerLocation error:', err);
            }
        });

        /** Passenger requests a new ride
         *  Payload: ride document from MongoDB
         */
        socket.on('requestRide', async (data) => {
            try {
                const rideId = data._id || data.rideId;
                const ride = await Ride.findById(rideId).populate('passengerId', 'name phone');
                if (!ride) return;

                // Cache initial state
                await cacheRideState(rideId, { rideId, rideStatus: 'pending', passengerId: uid });

                broadcastToAdmins('adminRideUpdate', { event: 'ride_requested', rideId, pickup: ride.pickup, destination: ride.destination });

                // If driver already assigned, send directly
                if (ride.driverId) {
                    const driver = await Driver.findById(ride.driverId);
                    if (driver) {
                        const driverUserId = driver.userId.toString();
                        const driverSocketId = activeDrivers.get(driverUserId);
                        
                        console.log(`Searching for socket for Driver ${driverUserId}. Active drivers:`, Array.from(activeDrivers.keys()));
                        
                        if (driverSocketId) {
                            io.to(driverSocketId).emit('newRide', ride);
                            console.log(`📨 Ride ${rideId} dispatched → driver ${driverUserId}`);
                            return;
                        } else {
                            console.log(`Driver ${driverUserId} is assigned in DB but not connected to sockets! Falling back.`);
                        }
                    }
                }

                // Fallback: no driver available
                socket.emit('noDriversAvailable', { message: 'No drivers available near your pickup point.' });
            } catch (err) {
                console.error('requestRide socket error:', err);
            }
        });

        /** Passenger cancels a ride
         *  Payload: { rideId, driverUserId? }
         */
        socket.on('cancelRide', async (data) => {
            try {
                const { rideId, driverUserId } = data;

                await deleteCachedRide(rideId);

                if (driverUserId) {
                    const driverSocketId = activeDrivers.get(driverUserId);
                    if (driverSocketId) {
                        io.to(driverSocketId).emit('rideCancelled', { rideId, reason: 'Passenger cancelled the ride.' });
                    }
                } else {
                    // No specific driver yet – notify all active drivers
                    for (const [, socketId] of activeDrivers.entries()) {
                        io.to(socketId).emit('rideCancelled', { rideId });
                    }
                }

                broadcastToAdmins('adminRideUpdate', { event: 'ride_cancelled', rideId });
            } catch (err) {
                console.error('cancelRide socket error:', err);
            }
        });

        /* ======================================================
           CHAT: Driver ↔ Passenger (per-ride room)
           ====================================================== */

        /** Join a ride-specific chat room
         *  Payload: { rideId }
         */
        socket.on('joinRideRoom', (data) => {
            const room = `ride:${data.rideId}`;
            socket.join(room);
            console.log(`💬 ${socket.user.name} joined room ${room}`);
        });

        /** Leave a ride-specific chat room */
        socket.on('leaveRideRoom', (data) => {
            const room = `ride:${data.rideId}`;
            socket.leave(room);
        });

        /** Send a chat message within a ride room
         *  Payload: { rideId, message, to? }
         */
        socket.on('sendMessage', (data) => {
            try {
                const { rideId, message } = data;
                const room = `ride:${rideId}`;

                const msgPayload = {
                    rideId,
                    senderId: uid,
                    senderName: socket.user.name,
                    senderRole: role,
                    message,
                    timestamp: new Date().toISOString(),
                };

                // Broadcast to everyone in the ride room (driver + passenger)
                io.to(room).emit('receiveMessage', msgPayload);

                // Also notify admins
                broadcastToAdmins('adminChatMessage', msgPayload);
            } catch (err) {
                console.error('sendMessage error:', err);
            }
        });

        /* ======================================================
           COMMON EVENTS
           ====================================================== */

        socket.on('disconnect', async () => {
            console.log(`❌ Disconnected: ${socket.user.name} (${role}) [${socket.id}]`);

            if (role === 'passenger') {
                if (activePassengers.get(uid) === socket.id) {
                    activePassengers.delete(uid);
                }
            } else if (role === 'driver') {
                // Only act if this socket was the registered one for this driver
                if (activeDrivers.get(uid) !== socket.id) return;

                // Remove from in-memory map immediately so new booking requests
                // don't try to route to a dead socket.
                activeDrivers.delete(uid);

                // Use a grace period before committing "offline" to DB/Redis.
                // This handles page refreshes and brief network blips gracefully.
                const timer = setTimeout(async () => {
                    disconnectTimers.delete(uid);
                    // If the driver reconnected within the grace window,
                    // activeDrivers will have their uid again — don't mark offline.
                    if (activeDrivers.has(uid)) return;

                    try {
                        await setDriverOnlineStatus(uid, false);
                        await removeDriverFromCache(uid);
                        await Driver.findOneAndUpdate({ userId: uid }, { isOnline: false });
                        console.log(`🔴 Driver ${socket.user.name} marked offline after grace period.`);
                        broadcastToAdmins('adminOnlineStats', { onlineDrivers: activeDrivers.size, onlinePassengers: activePassengers.size });
                        broadcastToAdmins('adminDriverStatus', { driverId: uid, driverName: socket.user.name, isOnline: false });
                    } catch (err) {
                        console.error('Grace-period offline update error:', err.message);
                    }
                }, DRIVER_OFFLINE_GRACE_MS);

                disconnectTimers.set(uid, timer);
                console.log(`⏳ Driver ${socket.user.name} disconnected — grace period started (${DRIVER_OFFLINE_GRACE_MS / 1000}s).`);

                // Immediately update admin UI count (optimistic)
                broadcastToAdmins('adminOnlineStats', { onlineDrivers: activeDrivers.size, onlinePassengers: activePassengers.size });
            } else if (role === 'admin') {
                if (activeAdmins.get(uid) === socket.id) {
                    activeAdmins.delete(uid);
                }
            }
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) throw new Error('Socket.io not initialized');
    return io;
};
