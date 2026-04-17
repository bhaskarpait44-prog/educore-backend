'use strict';

/**
 * middlewares/auth.js
 * JWT verification + role-based access control.
 * Attaches req.user to every authenticated request.
 */

const jwt      = require('jsonwebtoken');
const sequelize = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET;

// ── Token verification ───────────────────────────────────────────────────────
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false, data: null,
        message: 'Authorization token required.',
        errors: ['Missing or malformed Authorization header'],
      });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Re-fetch user on each request — catches deactivated accounts immediately
    const [[user]] = await sequelize.query(`
      SELECT id, school_id, name, email, role, is_active
      FROM users WHERE id = :id LIMIT 1;
    `, { replacements: { id: decoded.userId } });

    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false, data: null,
        message: 'Account not found or deactivated.',
        errors: ['Authentication failed'],
      });
    }

    req.user = user;
    next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError'
      ? 'Token expired. Please log in again.'
      : 'Invalid token.';

    return res.status(401).json({
      success: false, data: null, message, errors: [err.message],
    });
  }
};

// ── Role guard factory ───────────────────────────────────────────────────────
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false, data: null,
      message: `Access denied. Required role: ${roles.join(' or ')}.`,
      errors: [`Your role '${req.user.role}' is not permitted for this action`],
    });
  }
  next();
};

const requireAdmin      = requireRole('admin');
const requireAdminOrTeacher  = requireRole('admin', 'teacher');
const requireAdminOrAccountant = requireRole('admin', 'accountant');

module.exports = { authenticate, requireRole, requireAdmin, requireAdminOrTeacher, requireAdminOrAccountant };