import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

const protect = async (req, res, next) => {
  let token;

  // Read the JWT from the cookie
  token = req.cookies?.jwt;

  // If cookie doesn't exist, check Authorization header (for mobile apps or generic clients)
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.userId).select('-password');

      if (!req.user) {
        return res.status(401).json({ message: 'Not authorized, user not found' });
      }

      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } else {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized, invalid role' });
    }
    next();
  };
};

export { protect, authorize };
