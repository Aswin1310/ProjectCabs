import express from 'express';
import { createRide, getRides, getRideById, cancelRide, startRide, completeRide, acceptRide, declineRide, rateRide } from '../controllers/rideController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .post(protect, authorize('passenger', 'admin'), createRide)
  .get(protect, getRides);

router.route('/:id')
  .get(protect, getRideById);

router.route('/:id/cancel')
  .put(protect, cancelRide);

router.route('/:id/accept')
  .put(protect, authorize('driver', 'admin'), acceptRide);

router.route('/:id/decline')
  .put(protect, authorize('driver', 'admin'), declineRide);

router.route('/:id/start')
  .put(protect, authorize('driver', 'admin'), startRide);

router.route('/:id/complete')
  .put(protect, authorize('driver', 'admin'), completeRide);

router.route('/:id/rate')
  .post(protect, authorize('passenger'), rateRide);

export default router;
