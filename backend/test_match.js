import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Ride } from './src/models/Ride.js';
import { Driver } from './src/models/Driver.js';

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cab-booking').then(async () => {
    
    const busyRides = await Ride.find({
      rideStatus: { $in: ['accepted', 'started'] },
      driverId: { $ne: null }
    }).select('driverId');
    const busyDriverIds = busyRides.map(r => r.driverId).filter(Boolean);
    console.log('Busy Drivers:', busyDriverIds);

    const checkOnline = await Driver.find({ isOnline: true });
    console.log('Drivers currently online:', checkOnline.map(d => ({id: d._id, type: d.vehicleType, coords: d.currentLocation.coordinates})));

    // Mock search
    const pickupCoordinates = [76.9558, 11.0168];
    const cabType = 'Mini';

    let nearestDriver = await Driver.findOne({
      isOnline: true,
      vehicleType: cabType,
      _id: { $nin: busyDriverIds },
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: pickupCoordinates
          }
        }
      }
    });

    console.log('Match 1 NearestDriver:', nearestDriver ? nearestDriver._id : 'null');
    
    if (!nearestDriver) {
        nearestDriver = await Driver.findOne({
            isOnline: true,
            _id: { $nin: busyDriverIds },
            currentLocation: {
              $near: {
                $geometry: {
                  type: 'Point',
                  coordinates: pickupCoordinates
                }
              }
            }
        });
        console.log('Match 2 (Fallback) NearestDriver:', nearestDriver ? nearestDriver._id : 'null');
    }

    mongoose.disconnect();

}).catch(console.error);
