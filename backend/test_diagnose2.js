import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Ride } from './src/models/Ride.js';
import { Driver } from './src/models/Driver.js';

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/cab_booking').then(async () => {
    // Create a dummy online driver
    let dummy = await Driver.findOne({ vehicleNumber: 'TEST-123' });
    if (!dummy) {
        // Need to find an existing user or mock it.
        // Let's just create a quick query
    }
    
    // We can just add one.
    // Wait, let's just create a raw query for an existing driver offline.
    const allDrivers = await Driver.find({});
    console.log('All drivers count:', allDrivers.length);
    if(allDrivers.length > 0) {
        await Driver.updateOne({_id: allDrivers[0]._id}, {isOnline: true, vehicleType: 'Mini'});
        
        let nearestDriver = await Driver.findOne({
          isOnline: true,
          vehicleType: 'Mini',
          currentLocation: {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates: [76.9558, 11.0168]
              }
            }
          }
        });
        console.log('Nearest found:', !!nearestDriver);
        
        await Driver.updateOne({_id: allDrivers[0]._id}, {isOnline: false});
    }

    mongoose.disconnect();
}).catch(console.error);
