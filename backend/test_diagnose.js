import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Ride } from './src/models/Ride.js';
import { Driver } from './src/models/Driver.js';

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/cab-booking').then(async () => {
    const rides = await Ride.find({ rideStatus: { $in: ['accepted', 'started'] } });
    console.log('Stuck rides:', rides.length);
    console.log('Stuck driver IDs:', rides.map(r => r.driverId));

    const drivers = await Driver.find({ isOnline: true });
    console.log('Online drivers:', drivers.length);
    console.log('Drivers:', drivers.map(d => ({ 
        id: d._id, 
        coords: d.currentLocation?.coordinates,
        vehicleType: d.vehicleType
    })));

    mongoose.disconnect();
}).catch(console.error);
