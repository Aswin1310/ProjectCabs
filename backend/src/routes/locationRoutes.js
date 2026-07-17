import express from 'express';
import { getLocations, addLocation } from '../controllers/locationController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public/Protected route to list locations
router.get('/', protect, getLocations);

// Admin only route to add a location
router.post('/', protect, authorize('admin'), addLocation);

export default router;
