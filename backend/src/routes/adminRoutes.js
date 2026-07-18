import express from 'express';
import { getDashboardStats, getUsers, getDrivers, getAllRides, getDriverStats, deleteRide, assignRideToDriver } from '../controllers/adminController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect, authorize('admin')); // Apply middleware to all routes in this router

router.get('/dashboard', getDashboardStats);
router.get('/users', getUsers);
router.get('/drivers', getDrivers);
router.get('/drivers/:id/stats', getDriverStats);
router.get('/rides', getAllRides);
router.delete('/rides/:id', deleteRide);
router.put('/rides/:id/assign', assignRideToDriver);

export default router;
