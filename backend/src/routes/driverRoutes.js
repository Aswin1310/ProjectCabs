import express from 'express';
import { body } from 'express-validator';
import { registerDriver, updateLocation, updateStatus, getDriverProfile } from '../controllers/driverController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

const registerValidation = [
  body('name', 'Name is required').not().isEmpty(),
  body('email', 'Please include a valid email').isEmail(),
  body('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
  body('phone', 'Phone number is required').not().isEmpty(),
  body('vehicleType', 'Vehicle Type is required').isIn(['4 Seater', '5 Seater', '6 Seater', '7 Seater', 'Mini', 'Sedan', 'SUV', 'Auto']),
  body('vehicleNumber', 'Vehicle Number is required').not().isEmpty(),
  body('licenseNumber', 'License Number is required').not().isEmpty(),
];

router.post('/register', registerValidation, registerDriver);
router.get('/me', protect, authorize('driver', 'admin'), getDriverProfile);
router.put('/location', protect, authorize('driver', 'admin'), updateLocation);
router.put('/status', protect, authorize('driver', 'admin'), updateStatus);

export default router;

