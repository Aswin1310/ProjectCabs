import express from 'express';
import { getProfile, updateProfile, getRideHistory } from '../controllers/passengerController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router
  .route('/profile')
  .get(protect, authorize('passenger', 'admin'), getProfile)
  .put(protect, authorize('passenger', 'admin'), updateProfile);

router.get('/rides', protect, authorize('passenger', 'admin'), getRideHistory);

export default router;

