import { createClient } from 'redis';

let redisClient;

export const connectRedis = async () => {
    redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
    });

    redisClient.on('error', (err) => console.log('Redis Client Error', err));
    redisClient.on('connect', () => {
        console.log('Redis Client Connected');
    });

    await redisClient.connect();
};

export const getRedisClient = () => {
    if (!redisClient) throw new Error('Redis client not initialized yet');
    return redisClient;
};

/* ============================================================
   GEO-LOCATION: Live driver location (Temporary – for fast lookups)
   ============================================================ */

/** Store driver live GPS in Redis geospatial index */
export const updateDriverLocationCache = async (driverId, longitude, latitude) => {
    try {
        await redisClient.geoAdd('driver_locations', { longitude, latitude, member: driverId.toString() });
    } catch (error) {
        console.error('Redis geo update error:', error);
    }
};

/** Find nearby drivers by radius in meters */
export const getNearbyDrivers = async (longitude, latitude, radiusInMeters = 5000) => {
    try {
        return await redisClient.geoSearch(
            'driver_locations',
            { longitude, latitude },
            { radius: radiusInMeters, unit: 'm' },
            { WITHDIST: true, SORT: 'ASC' }
        );
    } catch (error) {
        console.error('Redis geo search error:', error);
        return [];
    }
};

/** Remove driver from geo index (goes offline) */
export const removeDriverFromCache = async (driverId) => {
    try {
        await redisClient.zRem('driver_locations', driverId.toString());
    } catch (error) {
        console.error('Redis geo remove error:', error);
    }
};

/* ============================================================
   ONLINE STATUS: Track which drivers are online (Temporary)
   ============================================================ */

/** Mark driver as online in Redis set */
export const setDriverOnlineStatus = async (driverId, isOnline) => {
    try {
        if (isOnline) {
            await redisClient.sAdd('online_drivers', driverId.toString());
        } else {
            await redisClient.sRem('online_drivers', driverId.toString());
        }
    } catch (error) {
        console.error('Redis online status error:', error);
    }
};

/** Get all currently online driver IDs */
export const getOnlineDriverIds = async () => {
    try {
        return await redisClient.sMembers('online_drivers');
    } catch (error) {
        console.error('Redis get online drivers error:', error);
        return [];
    }
};

/** Check if a specific driver is online */
export const isDriverOnline = async (driverId) => {
    try {
        return await redisClient.sIsMember('online_drivers', driverId.toString());
    } catch (error) {
        return false;
    }
};

/* ============================================================
   ACTIVE RIDE STATE: Cache current ride info (Temporary)
   ============================================================ */

/** Cache ride state for fast lookups – expires after 2 hours */
export const cacheRideState = async (rideId, rideData) => {
    try {
        await redisClient.setEx(`ride:${rideId}`, 7200, JSON.stringify(rideData));
    } catch (error) {
        console.error('Redis cache ride error:', error);
    }
};

/** Get cached ride state */
export const getCachedRide = async (rideId) => {
    try {
        const data = await redisClient.get(`ride:${rideId}`);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error('Redis get ride error:', error);
        return null;
    }
};

/** Delete ride from cache when it ends */
export const deleteCachedRide = async (rideId) => {
    try {
        await redisClient.del(`ride:${rideId}`);
    } catch (error) {
        console.error('Redis delete ride error:', error);
    }
};

/* ============================================================
   ETA CACHE: Live ETA updates (Temporary – TTL 30 seconds)
   ============================================================ */

/** Store live ETA for a ride */
export const cacheRideETA = async (rideId, etaMinutes) => {
    try {
        await redisClient.setEx(`eta:${rideId}`, 30, etaMinutes.toString());
    } catch (error) {
        console.error('Redis ETA cache error:', error);
    }
};

/** Get cached ETA */
export const getCachedETA = async (rideId) => {
    try {
        const val = await redisClient.get(`eta:${rideId}`);
        return val ? parseFloat(val) : null;
    } catch (error) {
        return null;
    }
};

/* ============================================================
   OTP STORE: Ride verification OTPs (Temporary – TTL 10 min)
   ============================================================ */

/** Store OTP for a ride */
export const storeRideOTP = async (rideId, otp) => {
    try {
        await redisClient.setEx(`otp:${rideId}`, 600, otp.toString());
        await redisClient.del(`otp_attempts:${rideId}`);
    } catch (error) {
        console.error('Redis OTP store error:', error);
    }
};

/** Verify OTP for a ride */
export const verifyRideOTP = async (rideId, otp) => {
    try {
        const stored = await redisClient.get(`otp:${rideId}`);
        return stored === otp.toString();
    } catch (error) {
        return false;
    }
};

/** Get OTP for a ride (for passenger UI reconnects) */
export const getRideOTPRaw = async (rideId) => {
    try {
        return await redisClient.get(`otp:${rideId}`);
    } catch (error) {
        return null;
    }
};

/** Delete OTP after it's used */
export const deleteRideOTP = async (rideId) => {
    try {
        await redisClient.del(`otp:${rideId}`);
        await redisClient.del(`otp_attempts:${rideId}`);
    } catch (error) {
        console.error('Redis OTP delete error:', error);
    }
};

/** Increment OTP verification attempts */
export const incrementRideOTPAttempts = async (rideId) => {
    try {
        const attempts = await redisClient.incr(`otp_attempts:${rideId}`);
        if (attempts === 1) {
            await redisClient.expire(`otp_attempts:${rideId}`, 600); // 10 min
        }
        return attempts;
    } catch (error) {
        return 0;
    }
};

/** Get OTP verification attempts */
export const getRideOTPAttempts = async (rideId) => {
    try {
        const attempts = await redisClient.get(`otp_attempts:${rideId}`);
        return attempts ? parseInt(attempts) : 0;
    } catch (error) {
        return 0;
    }
};

/* ============================================================
   JWT BLACKLIST: Track logged-out tokens (Temporary – TTL matches JWT)
   ============================================================ */

/** Add a JWT to the blacklist */
export const blacklistToken = async (token, expiresInSeconds = 86400) => {
    try {
        await redisClient.setEx(`blacklist:${token}`, expiresInSeconds, '1');
    } catch (error) {
        console.error('Redis blacklist error:', error);
    }
};

/** Check if a JWT is blacklisted */
export const isTokenBlacklisted = async (token) => {
    try {
        const val = await redisClient.get(`blacklist:${token}`);
        return val === '1';
    } catch (error) {
        return false;
    }
};
