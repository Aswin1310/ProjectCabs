import { Ride } from '../models/Ride.js';
import { Driver } from '../models/Driver.js';
import { Payment } from '../models/Payment.js';
import { activePassengers, activeDrivers, getIO } from '../sockets/index.js';
import { cacheRideState, deleteCachedRide, verifyRideOTP, getRideOTPAttempts, incrementRideOTPAttempts, deleteRideOTP, getRideOTPRaw } from '../redis/index.js';

// @desc    Create a new ride request
// @route   POST /api/rides
// @access  Private (Passenger)
export const createRide = async (req, res) => {
  const { pickup, destination, pickupCoordinates, destinationCoordinates, distance, duration, fare, cabType } = req.body;

  try {
    // Find drivers who are currently busy with accepted or started rides
    const busyRides = await Ride.find({
      rideStatus: { $in: ['accepted', 'started'] },
      driverId: { $ne: null }
    }).select('driverId');
    const busyDriverIds = busyRides.map(r => r.driverId).filter(Boolean);

    // Find closest online driver who matches the desired cabType and is not busy
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

    // Fallback: search for any closest online driver who is not busy
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
    }

    const ride = await Ride.create({
      passengerId: req.user._id,
      pickup,
      destination,
      pickupCoordinates: { type: 'Point', coordinates: pickupCoordinates },
      destinationCoordinates: { type: 'Point', coordinates: destinationCoordinates },
      distance,
      duration,
      fare,
      cabType,
      driverId: nearestDriver ? nearestDriver._id : null,
      rideStatus: 'pending',
    });

    // Notify the admin of a new ride creation
    try {
      const io = getIO();
      io.emit('adminRideUpdate', { message: 'New ride created', rideId: ride._id });
    } catch (socketErr) {
      console.error("Socket emit failed in createRide:", socketErr.message);
    }

    res.status(201).json(ride);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get user or driver rides
// @route   GET /api/rides
// @access  Private
export const getRides = async (req, res) => {
  try {
    let rides;
    if (req.user.role === 'passenger') {
      rides = await Ride.find({ passengerId: req.user._id }).sort({ createdAt: -1 });
    } else if (req.user.role === 'driver') {
      const driver = await Driver.findOne({ userId: req.user._id });
      if (!driver) return res.status(404).json({ message: 'Driver not found' });
      rides = await Ride.find({ driverId: driver._id }).sort({ createdAt: -1 });
    } else if (req.user.role === 'admin') {
      rides = await Ride.find({}).sort({ createdAt: -1 });
    }

    res.json(rides);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get singular ride by ID
// @route   GET /api/rides/:id
// @access  Private
export const getRideById = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id)
      .populate('passengerId', 'name phone profileImage')
      .populate('driverId', 'rating vehicleNumber vehicleType currentLocation');

    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    let rideObj = ride.toObject();

    // If passenger is checking, retrieve active OTP in case socket missed it
    if (req.user.role === 'passenger' && ride.rideStatus === 'accepted') {
      const activeOtp = await getRideOTPRaw(ride._id.toString());
      if (activeOtp) {
        rideObj.activeOtp = activeOtp;
      }
    }

    res.json(rideObj);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Cancel a ride
// @route   PUT /api/rides/:id/cancel
// @access  Private
export const cancelRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);

    if (!ride) return res.status(404).json({ message: 'Ride not found' });

    if (ride.rideStatus === 'started' || ride.rideStatus === 'completed') {
      return res.status(400).json({ message: 'Cannot cancel an ongoing or completed ride' });
    }

    ride.rideStatus = 'cancelled';
    await ride.save();

    // Clear Redis cache
    try { await deleteCachedRide(ride._id.toString()); } catch (_) {}

    // Emit socket cancellation
    try {
      const io = getIO();
      if (ride.driverId) {
        const driver = await Driver.findById(ride.driverId);
        if (driver) {
          const driverSocketId = activeDrivers.get(driver.userId.toString());
          if (driverSocketId) io.to(driverSocketId).emit('rideCancelled', { rideId: ride._id, reason: 'Passenger cancelled.' });
        }
      }
      io.emit('adminRideUpdate', { event: 'ride_cancelled', rideId: ride._id });
    } catch (socketErr) { console.error('Socket error in cancelRide:', socketErr.message); }

    res.json({ message: 'Ride cancelled successfully', ride });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Start ride
// @route   PUT /api/rides/:id/start
// @access  Private (Driver only)
export const startRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);

    if (!ride) return res.status(404).json({ message: 'Ride not found' });
    if (ride.rideStatus !== 'accepted') {
      return res.status(400).json({ message: 'Ride must be accepted first' });
    }

    const { otp } = req.body;
    if (!otp) return res.status(400).json({ message: 'OTP is required to start the ride' });

    const isValid = await verifyRideOTP(ride._id.toString(), otp);
    
    if (!isValid) {
        const attempts = await incrementRideOTPAttempts(ride._id.toString());
        if (attempts >= 3) {
            // Cancel ride
            ride.rideStatus = 'cancelled';
            await ride.save();
            await deleteRideOTP(ride._id.toString());
            
            try { await deleteCachedRide(ride._id.toString()); } catch (_) {}
            try {
                const io = getIO();
                const passengerSocketId = activePassengers.get(ride.passengerId.toString());
                if (passengerSocketId) io.to(passengerSocketId).emit('rideCancelled', { rideId: ride._id, reason: 'Ride cancelled due to too many failed OTP attempts.' });
                io.emit('adminRideUpdate', { event: 'ride_cancelled', rideId: ride._id });
            } catch (socketErr) {}
            
            return res.status(400).json({ message: 'Ride cancelled due to too many failed OTP attempts', cancelled: true });
        }
        return res.status(400).json({ message: `Invalid OTP. You have ${3 - attempts} attempt(s) remaining.` });
    }

    // OTP is valid
    await deleteRideOTP(ride._id.toString());

    ride.rideStatus = 'started';
    await ride.save();

    // Update Redis cache
    try { await cacheRideState(ride._id.toString(), { rideId: ride._id, rideStatus: 'started', passengerId: ride.passengerId.toString() }); } catch (_) {}

    // Notify passenger via socket
    try {
      const io = getIO();
      const passengerSocketId = activePassengers.get(ride.passengerId.toString());
      if (passengerSocketId) {
        io.to(passengerSocketId).emit('rideStatusChanged', { rideId: ride._id, status: 'started', message: 'Your trip has started! Enjoy the ride.' });
      }
      io.emit('adminRideUpdate', { event: 'ride_started', rideId: ride._id });
    } catch (socketErr) { console.error('Socket error in startRide:', socketErr.message); }

    res.json(ride);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Accept ride
// @route   PUT /api/rides/:id/accept
// @access  Private (Driver only)
export const acceptRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);

    if (!ride) return res.status(404).json({ message: 'Ride not found' });
    if (ride.rideStatus !== 'pending') return res.status(400).json({ message: 'Ride is no longer available' });

    const driver = await Driver.findOne({ userId: req.user._id });

    ride.rideStatus = 'accepted';
    ride.driverId = driver._id;
    await ride.save();

    // Cache in Redis
    try {
      await cacheRideState(ride._id.toString(), {
        rideId: ride._id,
        rideStatus: 'accepted',
        passengerId: ride.passengerId.toString(),
        driverUserId: req.user._id.toString(),
      });
    } catch (_) {}

    res.json(ride);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Complete ride
// @route   PUT /api/rides/:id/complete
// @access  Private (Driver only)
export const completeRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);

    if (!ride) return res.status(404).json({ message: 'Ride not found' });
    if (ride.rideStatus !== 'started') return res.status(400).json({ message: 'Ride is not started yet' });

    ride.rideStatus = 'completed';
    ride.paymentStatus = 'paid';
    await ride.save();

    // Create Payment Record
    await Payment.create({
      rideId: ride._id,
      amount: ride.fare,
      paymentMethod: 'cash',
      paymentStatus: 'completed'
    });

    // Update Driver Earnings & Trips
    const driver = await Driver.findById(ride.driverId);
    if (driver) {
      driver.earnings += ride.fare;
      driver.totalTrips += 1;
      await driver.save();
    }

    // Clear Redis cache for this ride
    try { await deleteCachedRide(ride._id.toString()); } catch (_) {}

    // Notify passenger
    try {
      const io = getIO();
      const passengerSocketId = activePassengers.get(ride.passengerId.toString());
      if (passengerSocketId) {
        io.to(passengerSocketId).emit('rideStatusChanged', { rideId: ride._id, status: 'completed', message: 'Ride completed! Thank you for riding with us.' });
        io.to(passengerSocketId).emit('rideCompleted', { rideId: ride._id, fare: ride.fare });
      }
      io.emit('adminRideUpdate', { event: 'ride_completed', rideId: ride._id, fare: ride.fare });
    } catch (socketErr) { console.error('Socket error in completeRide:', socketErr.message); }

    res.json(ride);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Decline a ride
// @route   PUT /api/rides/:id/decline
// @access  Private (Driver only)
export const declineRide = async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);

    if (!ride) return res.status(404).json({ message: 'Ride not found' });
    if (ride.rideStatus !== 'pending') return res.status(400).json({ message: 'Ride is no longer requestable' });

    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) return res.status(404).json({ message: 'Driver profile not found' });

    // Add this driver to declined list
    if (!ride.declinedDrivers.includes(driver._id)) {
      ride.declinedDrivers.push(driver._id);
    }

    // Find the next closest driver who is online, not busy, and hasn't declined
    const busyRides = await Ride.find({
      rideStatus: { $in: ['accepted', 'started'] },
      driverId: { $ne: null }
    }).select('driverId');

    const excludeDriverIds = [
      ...busyRides.map(r => r.driverId ? r.driverId.toString() : null).filter(Boolean),
      ...ride.declinedDrivers.map(id => id.toString()),
      driver._id.toString()
    ];

    let nextDriver = await Driver.findOne({
      isOnline: true,
      vehicleType: ride.cabType,
      _id: { $nin: excludeDriverIds },
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: ride.pickupCoordinates.coordinates
          }
        }
      }
    });

    if (!nextDriver) {
      nextDriver = await Driver.findOne({
        isOnline: true,
        _id: { $nin: excludeDriverIds },
        currentLocation: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: ride.pickupCoordinates.coordinates
            }
          }
        }
      });
    }

    if (nextDriver) {
      ride.driverId = nextDriver._id;
    } else {
      ride.driverId = null;
    }

    await ride.save();

    // Notify sockets
    try {
      const io = getIO();
      
      // Notify the declining driver to clear their screen
      const decliningDriverSocketId = activeDrivers.get(req.user._id.toString());
      if (decliningDriverSocketId) {
        io.to(decliningDriverSocketId).emit('rideCancelled', { rideId: ride._id });
      }

      // Notify the next driver if found
      if (nextDriver) {
        const nextDriverUserId = nextDriver.userId.toString();
        const nextDriverSocketId = activeDrivers.get(nextDriverUserId);
        if (nextDriverSocketId) {
          const populatedRide = await Ride.findById(ride._id).populate('passengerId', 'name phone');
          io.to(nextDriverSocketId).emit('newRide', populatedRide);
        }
      } else {
        // If no more drivers, notify passenger
        const passengerSocketId = activePassengers.get(ride.passengerId.toString());
        if (passengerSocketId) {
          io.to(passengerSocketId).emit('noDriversAvailable', { message: 'No drivers available in your area.' });
        }
      }

      // Live updates for admin dashboard
      io.emit('adminRideUpdate', { message: 'Ride declined/reassigned', rideId: ride._id });

    } catch (socketErr) {
      console.error("Socket emit failed in declineRide:", socketErr.message);
    }

    res.json({ message: 'Ride declined and reassigned successfully', ride });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};
