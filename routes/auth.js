'use strict';

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const sequelize = require('../config/database');
const studentLoginValidation = require('../middlewares/studentLoginValidator');
const { loadUserPermissions } = require('../middlewares/checkPermission');
const { normalizeUserRole } = require('../utils/roles');
const { authenticate } = require('../middlewares/auth');
const { authLimiter } = require('../middlewares/rateLimiter');
const { sendEmail } = require('../utils/mailer');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const RESET_TOKEN_EXPIRY = 3600000; // 1 hour

router.post('/forgot-password',
  authLimiter,
  [body('email').isEmail()],
  validate,
  async (req, res, next) => {
    try {
      const email = String(req.body.email || '').trim().toLowerCase();
      
      // Check both users and students
      const [[user]] = await sequelize.query(`
        SELECT id, 'user' as type, name, email FROM users WHERE LOWER(email) = :email AND is_deleted = false
        UNION
        SELECT s.id, 'student' as type, CONCAT(s.first_name, ' ', s.last_name) as name, sp.email 
        FROM students s
        JOIN student_profiles sp ON sp.student_id = s.id AND sp.is_current = true
        WHERE LOWER(sp.email) = :email AND s.is_deleted = false
        LIMIT 1;
      `, { replacements: { email } });

      // Security best practice: don't reveal if email exists
      if (!user) return res.ok({}, 'If an account with that email exists, a password reset link has been sent.');

      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + RESET_TOKEN_EXPIRY);

      const table = user.type === 'user' ? 'users' : 'students';
      await sequelize.query(`
        UPDATE ${table}
        SET reset_password_token = :token,
            reset_password_expires = :expires
        WHERE id = :id;
      `, { replacements: { token, expires, id: user.id } });

      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}&email=${email}`;

      await sendEmail({
        to: user.email,
        subject: 'Password Reset Request',
        text: `Hello ${user.name},\n\nYou requested a password reset. Please click the link below to reset your password:\n\n${resetUrl}\n\nIf you did not request this, please ignore this email.\n`,
        html: `<p>Hello ${user.name},</p><p>You requested a password reset. Please click the link below to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, please ignore this email.</p>`,
      });

      return res.ok({}, 'If an account with that email exists, a password reset link has been sent.');
    } catch (err) { next(err); }
  }
);

router.post('/reset-password',
  authLimiter,
  [
    body('token').notEmpty(),
    body('email').isEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { token, password } = req.body;
      const email = String(req.body.email || '').trim().toLowerCase();

      // Check both users and students
      const [[user]] = await sequelize.query(`
        SELECT id, 'user' as type FROM users 
        WHERE LOWER(email) = :email AND reset_password_token = :token AND reset_password_expires > NOW() AND is_deleted = false
        UNION
        SELECT s.id, 'student' as type
        FROM students s
        JOIN student_profiles sp ON sp.student_id = s.id AND sp.is_current = true
        WHERE LOWER(sp.email) = :email AND s.reset_password_token = :token AND s.reset_password_expires > NOW() AND s.is_deleted = false
        LIMIT 1;
      `, { replacements: { email, token } });

      if (!user) return res.fail('Invalid or expired reset token.', [], 400);

      const hash = await bcrypt.hash(password, 12);
      const table = user.type === 'user' ? 'users' : 'students';

      await sequelize.query(`
        UPDATE ${table}
        SET password_hash = :hash,
            reset_password_token = NULL,
            reset_password_expires = NULL,
            failed_login_attempts = 0,
            locked_until = NULL,
            force_password_change = false,
            updated_at = NOW()
        WHERE id = :id;
      `, { replacements: { hash, id: user.id } });

      return res.ok({}, 'Password has been reset successfully. You can now log in with your new password.');
    } catch (err) { next(err); }
  }
);

router.post('/login',
  authLimiter,
  [body('email').isEmail(), body('password').notEmpty()],
  validate,
  async (req, res, next) => {
    try {
      const { password } = req.body;
      const email = String(req.body.email || '').trim().toLowerCase();
      const [[user]] = await sequelize.query(`
        SELECT id, school_id, name, email, password_hash, role, is_active, force_password_change, 
               failed_login_attempts, locked_until
        FROM users
        WHERE LOWER(email) = :email
          AND is_deleted = false
        LIMIT 1;
      `, { replacements: { email } });

      if (!user) return res.fail('Invalid credentials.', [], 401);
      if (!user.is_active) return res.fail('Account is deactivated.', [], 401);

      // Check if account is locked
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const remainingMinutes = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
        return res.fail(`Account is temporarily locked. Please try again in ${remainingMinutes} minutes.`, [], 401);
      }

      const valid = await bcrypt.compare(password, user.password_hash);

      if (!valid) {
        // Increment failed attempts
        const failedAttempts = (user.failed_login_attempts || 0) + 1;
        let lockedUntil = null;

        if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
          lockedUntil = new Date(Date.now() + LOCKOUT_DURATION);
        }

        await sequelize.query(`
          UPDATE users
          SET failed_login_attempts = :failedAttempts,
              locked_until = :lockedUntil
          WHERE id = :id;
        `, { replacements: { failedAttempts, lockedUntil, id: user.id } });

        if (lockedUntil) {
          return res.fail(`Account locked due to too many failed attempts. Try again in 15 minutes.`, [], 401);
        }
        return res.fail('Invalid credentials.', [], 401);
      }

      const normalizedRole = normalizeUserRole(user.role);
      const permissions = Array.from(await loadUserPermissions(user.id, normalizedRole));

      // Reset failed attempts on success
      await sequelize.query(`
        UPDATE users
        SET last_login_at = NOW(),
            failed_login_attempts = 0,
            locked_until = NULL
        WHERE id = :id;
      `, { replacements: { id: user.id } });

      const token = jwt.sign(
        { userId: user.id, schoolId: user.school_id, role: normalizedRole },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      const refresh_token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      return res.ok({
        token,
        refresh_token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: normalizedRole,
          school_id: user.school_id,
          force_password_change: user.force_password_change,
          permissions,
        },
      }, 'Login successful.');
    } catch (err) { next(err); }
  }
);

router.post('/refresh',
  [body('refresh_token').notEmpty().withMessage('refresh_token is required')],
  validate,
  async (req, res, next) => {
    try {
      const refreshToken = String(req.body.refresh_token || '').trim();
      const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);

      if (decoded.studentId || decoded.role === 'student') {
        const [[student]] = await sequelize.query(`
          SELECT id, school_id, admission_no, first_name, last_name, is_active, is_deleted
          FROM students
          WHERE id = :id
          LIMIT 1;
        `, { replacements: { id: decoded.studentId || decoded.userId } });

        if (!student || !student.is_active || student.is_deleted) {
          return res.fail('Student account not found or deactivated.', [], 401);
        }

        const token = jwt.sign(
          { studentId: student.id, schoolId: student.school_id, role: 'student' },
          process.env.JWT_SECRET,
          { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
        );

        const newRefreshToken = jwt.sign(
          { studentId: student.id, role: 'student' },
          process.env.JWT_SECRET,
          { expiresIn: '30d' }
        );

        return res.ok({
          token,
          refresh_token: newRefreshToken,
        }, 'Token refreshed successfully.');
      }

      const [[user]] = await sequelize.query(`
        SELECT id, school_id, role, is_active
        FROM users
        WHERE id = :id
          AND is_deleted = false
        LIMIT 1;
      `, { replacements: { id: decoded.userId } });

      if (!user || !user.is_active) {
        return res.fail('Account not found or deactivated.', [], 401);
      }

      const normalizedRole = normalizeUserRole(user.role);

      const token = jwt.sign(
        { userId: user.id, schoolId: user.school_id, role: normalizedRole },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      const newRefreshToken = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      return res.ok({
        token,
        refresh_token: newRefreshToken,
      }, 'Token refreshed successfully.');
    } catch (err) {
      if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
        return res.fail('Invalid or expired refresh token.', [err.message], 401);
      }
      return next(err);
    }
  }
);

router.post('/student/login',
  authLimiter,
  studentLoginValidation,
  validate,
  async (req, res, next) => {
    try {
      const { admission_no, email, identifier, password } = req.body;
      const loginIdentifier = (identifier || email || admission_no || '').trim();
      const [[student]] = await sequelize.query(`
        SELECT
          s.id,
          s.school_id,
          s.admission_no,
          s.first_name,
          s.last_name,
          s.password_hash,
          s.is_active,
          s.is_deleted,
          s.failed_login_attempts,
          s.locked_until,
          sp.email
        FROM students
        s
        LEFT JOIN student_profiles sp
          ON sp.student_id = s.id
         AND sp.is_current = true
        WHERE (
          s.admission_no = :identifier
          OR LOWER(COALESCE(sp.email, '')) = LOWER(:identifier)
        )
          AND s.is_deleted = false
        LIMIT 1;
      `, { replacements: { identifier: loginIdentifier } });

      if (!student) return res.fail('Invalid credentials.', [], 401);
      if (!student.is_active) return res.fail('Account is deactivated.', [], 401);

      // Check if account is locked
      if (student.locked_until && new Date(student.locked_until) > new Date()) {
        const remainingMinutes = Math.ceil((new Date(student.locked_until) - new Date()) / 60000);
        return res.fail(`Account is temporarily locked. Please try again in ${remainingMinutes} minutes.`, [], 401);
      }

      if (!student.password_hash) return res.fail('Portal access not set up.', [], 401);

      const valid = await bcrypt.compare(password, student.password_hash);
      
      if (!valid) {
        // Increment failed attempts
        const failedAttempts = (student.failed_login_attempts || 0) + 1;
        let lockedUntil = null;

        if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
          lockedUntil = new Date(Date.now() + LOCKOUT_DURATION);
        }

        await sequelize.query(`
          UPDATE students
          SET failed_login_attempts = :failedAttempts,
              locked_until = :lockedUntil
          WHERE id = :id;
        `, { replacements: { failedAttempts, lockedUntil, id: student.id } });

        if (lockedUntil) {
          return res.fail(`Account locked due to too many failed attempts. Try again in 15 minutes.`, [], 401);
        }
        return res.fail('Invalid credentials.', [], 401);
      }

      await sequelize.query(`
        UPDATE students
        SET last_login_at = NOW(),
            updated_at = NOW(),
            failed_login_attempts = 0,
            locked_until = NULL
        WHERE id = :id;
      `, { replacements: { id: student.id } });

      const token = jwt.sign(
        { studentId: student.id, schoolId: student.school_id, role: 'student' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      const refresh_token = jwt.sign(
        { studentId: student.id, role: 'student' },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );

      return res.ok({
        token,
        refresh_token,
        user: {
          id: student.id,
          student_id: student.id,
          name: `${student.first_name} ${student.last_name}`.trim(),
          admission_no: student.admission_no,
          email: student.email || null,
          role: 'student',
          school_id: student.school_id,
          permissions: [],
        },
      }, 'Student login successful.');
    } catch (err) { next(err); }
  }
);

router.post('/register-push-token',
  authenticate,
  [body('token').notEmpty()],
  validate,
  async (req, res, next) => {
    try {
      const { token, platform, device_name } = req.body;
      const isStudent = req.user.role === 'student';
      const userId = isStudent ? null : req.user.id;
      const studentId = isStudent ? req.user.id : null;

      await sequelize.query(`
        INSERT INTO push_tokens (user_id, student_id, token, platform, device_name, last_used, created_at, updated_at)
        VALUES (:userId, :studentId, :token, :platform, :device_name, NOW(), NOW(), NOW())
        ON CONFLICT (token) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          student_id = EXCLUDED.student_id,
          last_used = NOW(),
          updated_at = NOW();
      `, {
        replacements: { userId, studentId, token, platform: platform || null, device_name: device_name || null },
      });

      res.ok({}, 'Push token registered.');
    } catch (err) { next(err); }
  }
);

module.exports = router;
