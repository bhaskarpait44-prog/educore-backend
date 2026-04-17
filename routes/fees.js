'use strict';

const router   = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const { requireAdmin, requireAdminOrAccountant } = require('../middlewares/auth');
const ctrl     = require('../controllers/feeController');

router.post('/structure',     requireAdmin, [
  body('class_id').isInt(),
  body('name').notEmpty(),
  body('amount').isDecimal(),
  body('frequency').isIn(['monthly', 'quarterly', 'annual', 'one_time']),
  body('due_day').isInt({ min: 1, max: 28 }),
], validate, ctrl.createStructure);

router.post('/generate',      requireAdmin, [body('session_id').isInt()], validate, ctrl.generate);
router.get('/:enrollment_id',              ctrl.getStudentFees);

router.post('/payment',       requireAdminOrAccountant, [
  body('invoice_id').isInt(),
  body('amount').isDecimal({ gt: '0' }),
  body('payment_date').isDate(),
  body('payment_mode').isIn(['cash', 'online', 'cheque', 'dd']),
], validate, ctrl.recordPayment);

router.post('/carry-forward', requireAdmin, [
  body('student_id').isInt(),
  body('from_session_id').isInt(),
  body('to_session_id').isInt(),
], validate, ctrl.carryForward);

module.exports = router;