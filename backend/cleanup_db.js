import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Ride } from './src/models/Ride.js';
import { Driver } from './src/models/Driver.js';

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cab-booking').then(async () => {
    // 1. Cancel stuck rides to unblock drivers
    const res = await Ride.updateMany(
        { rideStatus: { $in: ['accepted', 'started'] } },
        { $set: { rideStatus: 'cancelled' } }
    );
    console.log(`Cancelled ${res.modifiedCount} stuck rides.`);

    // 2. Check all drivers
    const drivers = await Driver.find({});
    console.log(`Found ${drivers.length} drivers.`);
    drivers.forEach(d => {
        console.log(`Driver ${d._id} (${d.vehicleType}): Coords [${d.currentLocation?.coordinates}] isOnline: ${d.isOnline}`);
    });

    mongoose.disconnect();
}).catch(console.error);
