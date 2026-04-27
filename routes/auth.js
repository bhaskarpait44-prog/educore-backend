'use strict';

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const sequelize = require('../config/database');
const studentLoginValidation = require('../middlewares/studentLoginValidator');
const { loadUserPermissions } = require('../middlewares/checkPermission');

router.post('/login',
  [body('email').isEmail(), body('password').notEmpty()],
  validate,
  async (req, res, next) => {
    try {
      const { password } = req.body;
      const email = String(req.body.email || '').trim().toLowerCase();
      const [[user]] = await sequelize.query(`
        SELECT id, school_id, name, email, password_hash, role, is_active, force_password_change
        FROM users
        WHERE LOWER(email) = :email
          AND is_deleted = false
        LIMIT 1;
      `, { replacements: { email } });

      if (!user || !user.is_active) return res.fail('Invalid credentials.', [], 401);

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.fail('Invalid credentials.', [], 401);

      const permissions = Array.from(await loadUserPermissions(user.id, user.role));

      await sequelize.query(`
        UPDATE users
        SET last_login_at = NOW()
        WHERE id = :id;
      `, { replacements: { id: user.id } });

      const token = jwt.sign(
        { userId: user.id, schoolId: user.school_id, role: user.role },
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
          role: user.role,
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

      const token = jwt.sign(
        { userId: user.id, schoolId: user.school_id, role: user.role },
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

      if (!student || !student.is_active || !student.password_hash) {
        return res.fail('Invalid credentials.', [], 401);
      }

      const valid = await bcrypt.compare(password, student.password_hash);
      if (!valid) return res.fail('Invalid credentials.', [], 401);

      await sequelize.query(`
        UPDATE students
        SET last_login_at = NOW(),
            updated_at = NOW()
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

module.exports = router;
