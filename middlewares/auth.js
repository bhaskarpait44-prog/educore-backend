'use strict';

/**
 * middlewares/auth.js
 * JWT verification + role-based access control.
 * Attaches req.user to every authenticated request.
 */

const jwt = require('jsonwebtoken');
const sequelize = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET;

async function resolveStudentFromToken(decoded) {
  if (decoded.studentId) {
    const [[student]] = await sequelize.query(`
      SELECT id, school_id, admission_no, first_name, last_name, is_active, is_deleted
      FROM students
      WHERE id = :id
      LIMIT 1;
    `, { replacements: { id: decoded.studentId } });
    return student || null;
  }

  if (!decoded.userId) return null;

  const [[student]] = await sequelize.query(`
    SELECT
      s.id,
      s.school_id,
      s.admission_no,
      s.first_name,
      s.last_name,
      s.is_active,
      s.is_deleted
    FROM users u
    JOIN students s
      ON s.school_id = u.school_id
     AND s.is_deleted = false
    LEFT JOIN student_profiles sp
      ON sp.student_id = s.id
     AND sp.is_current = true
    WHERE u.id = :userId
      AND u.role = 'student'
      AND u.is_deleted = false
      AND (
        (u.employee_id IS NOT NULL AND s.admission_no = u.employee_id)
        OR LOWER(COALESCE(sp.email, '')) = LOWER(COALESCE(u.email, ''))
      )
    ORDER BY s.id DESC
    LIMIT 1;
  `, { replacements: { userId: decoded.userId } });

  return student || null;
}

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        data: null,
        message: 'Authorization token required.',
        errors: ['Missing or malformed Authorization header'],
      });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.studentId || decoded.role === 'student') {
      const student = await resolveStudentFromToken(decoded);

      if (!student || !student.is_active || student.is_deleted) {
        return res.status(401).json({
          success: false,
          data: null,
          message: 'Student account not found or deactivated.',
          errors: ['Authentication failed'],
        });
      }

      req.user = {
        id: student.id,
        student_id: student.id,
        school_id: student.school_id,
        name: [student.first_name, student.last_name].filter(Boolean).join(' ').trim(),
        admission_no: student.admission_no,
        role: 'student',
        is_active: student.is_active,
      };

      return next();
    }

    const [[user]] = await sequelize.query(`
      SELECT id, school_id, name, email, role, is_active
      FROM users
      WHERE id = :id
      LIMIT 1;
    `, { replacements: { id: decoded.userId } });

    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        data: null,
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
      success: false,
      data: null,
      message,
      errors: [err.message],
    });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      data: null,
      message: `Access denied. Required role: ${roles.join(' or ')}.`,
      errors: [`Your role '${req.user.role}' is not permitted for this action`],
    });
  }
  next();
};

const requireAdmin = requireRole('admin');
const requireAdminOrTeacher = requireRole('admin', 'teacher');
const requireAdminOrAccountant = requireRole('admin', 'accountant');

module.exports = { authenticate, requireRole, requireAdmin, requireAdminOrTeacher, requireAdminOrAccountant };
