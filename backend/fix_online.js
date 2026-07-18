import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Driver } from './src/models/Driver.js';

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cab-booking').then(async () => {
    // Force all existing drivers online for the user to test successfully without clicking
    const res = await Driver.updateMany({}, { $set: { isOnline: true } });
    console.log(`Forced ${res.modifiedCount} drivers online in DB.`);
    mongoose.disconnect();
}).catch(console.error);
