import { User } from '../models/User.js';
import { Driver } from '../models/Driver.js';
import { Ride } from '../models/Ride.js';
import { Payment } from '../models/Payment.js';
import { activePassengers, activeDrivers, getIO } from '../sockets/index.js';
import { cacheRideState } from '../redis/index.js';

// @desc    Get dashboard stats
// @route   GET /api/admin/dashboard
// @access  Private (Admin)
export const getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'passenger' });
    const totalDrivers = await Driver.countDocuments();
    const totalRides = await Ride.countDocuments();
    
    const payments = await Payment.find({ paymentStatus: 'completed' });
    const totalEarnings = payments.reduce((acc, curr) => acc + curr.amount, 0);

    const activeRides = await Ride.countDocuments({ rideStatus: { $in: ['accepted', 'started'] } });

    res.json({
        totalUsers,
        totalDrivers,
        totalRides,
        totalEarnings,
        activeRides,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private (Admin)
export const getUsers = async (req, res) => {
  try {
    const users = await User.find({ role: 'passenger' }).select('-password');
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get all drivers
// @route   GET /api/admin/drivers
// @access  Private (Admin)
export const getDrivers = async (req, res) => {
  try {
    const drivers = await Driver.find().populate('userId', 'name email phone profileImage');
    res.json(drivers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get all rides
// @route   GET /api/admin/rides
// @access  Private (Admin)
export const getAllRides = async (req, res) => {
  try {
    const rides = await Ride.find().sort({ createdAt: -1 })
        .populate('passengerId', 'name phone')
        .populate({
            path: 'driverId',
            populate: {
                path: 'userId',
                select: 'name email phone'
            }
        });
    res.json(rides);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get individual driver stats (earnings + trips breakdown)
// @route   GET /api/admin/drivers/:id/stats
// @access  Private (Admin)
export const getDriverStats = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id).populate('userId', 'name email phone profileImage');
    if (!driver) return res.status(404).json({ message: 'Driver not found' });

    const allRides = await Ride.find({
      driverId: driver._id,
      rideStatus: 'completed'
    }).sort({ createdAt: -1 }).lean();

    const now       = new Date();
    const todayStr  = now.toISOString().split('T')[0];
    const monthStr  = todayStr.substring(0, 7);

    let todayTrips = 0, todayEarn = 0;
    let monthTrips = 0, monthEarn = 0;
    let allTrips   = 0, allEarn   = 0;
    const ridesByDate = {};

    allRides.forEach(r => {
      const createdStr = r.createdAt instanceof Date
        ? r.createdAt.toISOString()
        : String(r.createdAt);
      const d    = createdStr.substring(0, 10);
      const m    = d.substring(0, 7);
      const fare = r.fare || 0;

      allTrips++; allEarn += fare;
      if (d === todayStr) { todayTrips++; todayEarn += fare; }
      if (m === monthStr) { monthTrips++; monthEarn += fare; }

      if (!ridesByDate[d]) ridesByDate[d] = { trips: 0, earnings: 0 };
      ridesByDate[d].trips++;
      ridesByDate[d].earnings += fare;
    });

    res.json({
      driver,
      stats: {
        today:   { trips: todayTrips, earnings: todayEarn },
        month:   { trips: monthTrips, earnings: monthEarn },
        allTime: { trips: allTrips,   earnings: allEarn },
        ridesByDate,
      },
      recentRides: allRides.slice(0, 10),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Delete a ride
// @route   DELETE /api/admin/rides/:id
// @access  Private (Admin)
export const deleteRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) return res.status(404).json({ message: 'Ride not found' });
    
    await ride.deleteOne();
    res.json({ message: 'Ride deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Assign a driver to a ride
// @route   PUT /api/admin/rides/:id/assign
// @access  Private (Admin)
export const assignRideToDriver = async (req, res) => {
  try {
    const { driverId } = req.body;
    const rideId = req.params.id;

    const ride = await Ride.findById(rideId);
    if (!ride) return res.status(404).json({ message: 'Ride not found' });
    if (ride.rideStatus !== 'pending') return res.status(400).json({ message: 'Ride is no longer pending' });
    
    const driver = await Driver.findById(driverId).populate('userId');
    if (!driver) return res.status(404).json({ message: 'Driver not found' });

    ride.driverId = driver._id;
    ride.rideStatus = 'accepted';
    await ride.save();

    // Cache in Redis
    try {
      await cacheRideState(ride._id.toString(), {
        rideId: ride._id,
        rideStatus: 'accepted',
        passengerId: ride.passengerId.toString(),
        driverUserId: driver.userId._id.toString(),
        driverName: driver.userId.name
      });
    } catch (_) {}

    // Emit sockets
    try {
      const io = getIO();
      
      const passengerSocketId = activePassengers.get(ride.passengerId.toString());
      if (passengerSocketId) {
         io.to(passengerSocketId).emit('rideAccepted', {
           rideId: ride._id,
           driverId: driver.userId._id.toString(),
           driverName: driver.userId.name,
           message: `Admin assigned ${driver.userId.name} to your ride!`,
         });
      }
      
      const driverSocketId = activeDrivers.get(driver.userId._id.toString());
      if (driverSocketId) {
          io.to(driverSocketId).emit('rideAssigned', { message: 'Admin assigned a special ride to you!', rideId: ride._id });
      }

      io.emit('adminRideUpdate', { event: 'ride_accepted', rideId: ride._id, driverName: driver.userId.name });
    } catch (socketErr) {
      console.error('Socket emit failed in assignRideToDriver:', socketErr.message);
    }

    res.json(ride);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};
