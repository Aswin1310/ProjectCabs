import { User } from '../models/User.js';
import { Ride } from '../models/Ride.js';

// @desc    Get passenger profile
// @route   GET /api/passenger/profile
// @access  Private
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Update passenger profile
// @route   PUT /api/passenger/profile
// @access  Private
export const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;
      user.phone = req.body.phone || user.phone;
      if (req.body.profileImage) {
        user.profileImage = req.body.profileImage;
      }
      
      if (req.body.password) {
        user.password = req.body.password;
      }

      const updatedUser = await user.save();

      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role,
        profileImage: updatedUser.profileImage,
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Get passenger ride history
// @route   GET /api/passenger/rides
// @access  Private
export const getRideHistory = async (req, res) => {
  try {
    const rides = await Ride.find({ passengerId: req.user._id })
      .sort({ createdAt: -1 })
      .populate({ path: 'driverId', populate: { path: 'userId', select: 'name phone' } });
    res.json(rides);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};
