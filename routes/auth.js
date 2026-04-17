'use strict';

const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const sequelize = require('../config/database');

// POST /api/auth/login
router.post('/login',
  [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      const [[user]] = await sequelize.query(`
        SELECT id, school_id, name, email, password_hash, role, is_active
        FROM users WHERE email = :email LIMIT 1;
      `, { replacements: { email } });

      if (!user || !user.is_active) {
        return res.fail('Invalid credentials.', [], 401);
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.fail('Invalid credentials.', [], 401);

      // Update last_login_at
      await sequelize.query(
        `UPDATE users SET last_login_at = NOW() WHERE id = :id;`,
        { replacements: { id: user.id } }
      );

      const token = jwt.sign(
        { userId: user.id, schoolId: user.school_id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
      );

      return res.ok({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      }, 'Login successful.');
    } catch (err) { next(err); }
  }
);

module.exports = router;