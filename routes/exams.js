// routes/exams.js
'use strict';

const router   = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middlewares/validate');
const { requireAdmin } = require('../middlewares/auth');
const ctrl     = require('../controllers/examController');

router.post('/', requireAdmin, [
  body('class_id').isInt(),
  body('name').notEmpty(),
  body('exam_type').isIn(['term', 'midterm', 'final', 'compartment']),
  body('start_date').isDate(),
  body('end_date').isDate(),
  body('total_marks').isDecimal(),
  body('passing_marks').isDecimal(),
], validate, ctrl.create);

module.exports = router;