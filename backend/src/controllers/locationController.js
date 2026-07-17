import { Location } from '../models/Location.js';

// @desc    Get all active locations
// @route   GET /api/locations
// @access  Public (or Private to users/drivers)
export const getLocations = async (req, res) => {
  try {
    const locations = await Location.find({ isActive: true }).sort('name');
    res.json(locations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Add a new location
// @route   POST /api/locations
// @access  Private (Admin)
export const addLocation = async (req, res) => {
  const { name, longitude, latitude } = req.body;

  try {
    const existing = await Location.findOne({ name });
    if (existing) {
      return res.status(400).json({ message: 'Location already exists' });
    }

    const location = await Location.create({
      name,
      coordinates: [parseFloat(longitude), parseFloat(latitude)]
    });

    res.status(201).json(location);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};
