import mongoose from 'mongoose';

/**
 * Single MongoDB connection — all models use the default mongoose connection
 * via mongoose.model(), so a single mongoose.connect() is the correct approach.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cab-booking'
    );
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
