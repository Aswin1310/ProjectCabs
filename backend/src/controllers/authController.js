import { User } from '../models/User.js';
import generateToken from '../utils/generateToken.js';
import { validationResult } from 'express-validator';
import { z } from 'zod';

// Zod schemas
const registerSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().regex(/^\d{10}$/, 'Phone number must be exactly 10 digits'),
  role: z.enum(['passenger', 'driver', 'admin']).optional(),
  adminKey: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res) => {
  // Let express-validator run first if still used in routes, but replace with Zod logic
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const validatedData = registerSchema.parse(req.body);
    const { name, email, password, phone, role, adminKey } = validatedData;

    if (role === 'admin') {
      if (adminKey !== process.env.ADMIN_KEY) {
        return res.status(403).json({ message: 'Invalid Admin Key' });
      }
    }

    const userExists = await User.findOne({ $or: [{ email }, { phone }] });

    if (userExists) {
      return res.status(400).json({ message: 'User with this email or phone already exists' });
    }

    const user = await User.create({
      name,
      email,
      password,
      phone,
      role: role || 'passenger',
    });

    if (user) {
      const token = generateToken(res, user._id);
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        token, // For clients that don't easily support cookies (e.g., React Native)
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: error.errors.map(e => ({ msg: e.message, path: e.path.join('.') })) 
      });
    }
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const validatedData = loginSchema.parse(req.body);
    const { email, password } = validatedData;

    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      const token = generateToken(res, user._id);
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        token,
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: error.errors.map(e => ({ msg: e.message, path: e.path.join('.') })) 
      });
    }
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Logout user / clear cookie
// @route   POST /api/auth/logout
// @access  Public
export const logout = (req, res) => {
  res.cookie('jwt', '', {
    httpOnly: true,
    expires: new Date(0),
  });
  res.status(200).json({ message: 'Logged out successfully' });
};
