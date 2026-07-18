import http from 'http';
import app from './app.js';
import { configureSockets } from './sockets/index.js';
import { connectRedis, getRedisClient } from './redis/index.js';
import { Driver } from './models/Driver.js';
import { Ride } from './models/Ride.js';

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Initialize Socket.io (Phase 6)
const io = configureSockets(server);

const startServer = async () => {
    try {
        await connectRedis();

        // ── Startup cleanup ──────────────────────────────────────────
        // Reset all driver online statuses so the DB matches reality:
        // no drivers are socket-connected yet when the server just booted.
        try {
            await Driver.updateMany({}, { isOnline: false });
            console.log('✅ All drivers reset to offline on startup.');
        } catch (err) {
            console.warn('⚠️  Could not reset driver statuses on startup:', err.message);
        }

        // Cancel all rides that were in-progress — their socket sessions no longer
        // exist, so they would permanently block drivers via the busyDriverIds filter.
        try {
            const staleResult = await Ride.updateMany(
                { rideStatus: { $in: ['pending', 'accepted', 'started'] } },
                { $set: { rideStatus: 'cancelled' } }
            );
            if (staleResult.modifiedCount > 0) {
                console.log(`✅ ${staleResult.modifiedCount} stale ride(s) cancelled on startup.`);
            }
        } catch (err) {
            console.warn('⚠️  Could not cancel stale rides on startup:', err.message);
        }

        // Flush stale Redis driver caches from the previous server session
        try {
            const redis = getRedisClient();
            await redis.del('driver_locations');
            await redis.del('online_drivers');
            console.log('✅ Stale Redis driver caches flushed on startup.');
        } catch (err) {
            console.warn('⚠️  Could not flush Redis caches on startup:', err.message);
        }
        // ─────────────────────────────────────────────────────────────

        server.listen(PORT, () => {
          console.log(`Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error("Failed to start server", err);
    }
};

startServer();
