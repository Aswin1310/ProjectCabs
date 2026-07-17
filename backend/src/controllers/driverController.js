import { User } from '../models/User.js';
import { Driver } from '../models/Driver.js';
import generateToken from '../utils/generateToken.js';
import { validationResult } from 'express-validator';
import { updateDriverLocationCache, setDriverOnlineStatus, removeDriverFromCache } from '../redis/index.js';

// @desc    Register a new driver
// @route   POST /api/driver/register
// @access  Public
export const registerDriver = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, email, password, phone, vehicleType, vehicleNumber, licenseNumber } = req.body;

  try {
    const userExists = await User.findOne({ $or: [{ email }, { phone }] });
    if (userExists) {
      return res.status(400).json({ message: 'User with this email or phone already exists' });
    }

    const driverExists = await Driver.findOne({ $or: [{ licenseNumber }, { vehicleNumber }] });
    if (driverExists) {
      return res.status(400).json({ message: 'License or Vehicle already registered' });
    }

    // 1. Create User
    const user = await User.create({
      name,
      email,
      password,
      phone,
      role: 'driver',
    });

    // 2. Create Driver Profile referencing User
    const driver = await Driver.create({
      userId: user._id,
      vehicleType,
      vehicleNumber,
      licenseNumber,
    });

    if (user && driver) {
      const token = generateToken(res, user._id);
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        driverId: driver._id,
        token,
      });
    } else {
      res.status(400).json({ message: 'Invalid data' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get own driver profile
// @route   GET /api/driver/me
// @access  Private (Driver)
export const getDriverProfile = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id }).populate('userId', '-password');
    if (!driver) return res.status(404).json({ message: 'Driver profile not found' });
    res.json(driver);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Update driver location (Live Tracking)
// @route   PUT /api/driver/location
// @access  Private (Driver only)
export const updateLocation = async (req, res) => {
  const { longitude, latitude } = req.body;

  if (longitude == null || latitude == null) {
      return res.status(400).json({ message: 'Please provide longitude and latitude' });
  }

  try {
    const driver = await Driver.findOne({ userId: req.user._id });

    if (!driver) {
      return res.status(404).json({ message: 'Driver profile not found' });
    }

    driver.currentLocation = {
      type: 'Point',
      coordinates: [longitude, latitude],
    };

    await driver.save();

    // Cache in Redis for fast geo-queries
    try {
      await updateDriverLocationCache(driver._id.toString(), longitude, latitude);
    } catch (redisErr) {
      console.error('Redis location cache error:', redisErr.message);
    }

    res.json({ message: 'Location updated successfully', currentLocation: driver.currentLocation });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Update driver online/offline status
// @route   PUT /api/driver/status
// @access  Private (Driver only)
export const updateStatus = async (req, res) => {
  const { isOnline } = req.body;

  if (typeof isOnline !== 'boolean') {
    return res.status(400).json({ message: 'Please provide valid online status boolean' });
  }

  try {
    const driver = await Driver.findOne({ userId: req.user._id });

    if (!driver) {
       return res.status(404).json({ message: 'Driver profile not found' });
    }

    driver.isOnline = isOnline;
    await driver.save();

    // Sync with Redis
    try {
      await setDriverOnlineStatus(driver._id.toString(), isOnline);
      if (!isOnline) {
        await removeDriverFromCache(driver._id.toString());
      }
    } catch (redisErr) {
      console.error('Redis status sync error:', redisErr.message);
    }

    res.json({ message: `Driver went ${isOnline ? 'online' : 'offline'}`, isOnline: driver.isOnline });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};
