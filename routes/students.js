'use strict';

const router   = require('express').Router();
const { body, param } = require('express-validator');
const validate = require('../middlewares/validate');
const { requireAdmin, requireAdminOrTeacher } = require('../middlewares/auth');
const ctrl     = require('../controllers/studentController');

router.post('/',                  requireAdmin, [
  body('admission_no').notEmpty(),
  body('first_name').notEmpty(),
  body('last_name').notEmpty(),
  body('date_of_birth').isDate(),
  body('gender').isIn(['male', 'female', 'other']),
], validate, ctrl.admit);

router.get('/:id',                requireAdminOrTeacher, [
  param('id').isInt(),
], validate, ctrl.getById);

router.patch('/:id/identity',     requireAdmin, [
  param('id').isInt(),
  body('reason').isLength({ min: 10 }).withMessage('reason must be at least 10 characters'),
], validate, ctrl.updateIdentity);

router.patch('/:id/profile',      requireAdmin, [
  param('id').isInt(),
  body('change_reason').isLength({ min: 10 }).withMessage('change_reason must be at least 10 characters'),
], validate, ctrl.updateProfile);

router.get('/:id/history',        requireAdminOrTeacher, [
  param('id').isInt(),
], validate, ctrl.getHistory);

module.exports = router;