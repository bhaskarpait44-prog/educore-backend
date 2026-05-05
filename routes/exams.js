// routes/exams.js
'use strict';

const router   = require('express').Router();
const { body, param } = require('express-validator');
const validate = require('../middlewares/validate');
const { requireAdmin, requireAdminOrTeacher } = require('../middlewares/auth');
const ctrl     = require('../controllers/examController');

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// GET /api/exams - List exams
router.get('/', requireAdminOrTeacher, ctrl.list);

router.get('/:id/subjects/:subjectId/template', requireAdminOrTeacher, ctrl.getTemplate);

router.post('/:id/subjects/:subjectId/upload-marks', 
  requireAdminOrTeacher, 
  upload.single('file'), 
  ctrl.uploadMarks
);

// POST /api/exams - Create exam
router.post('/', requireAdmin, [
  body('class_id').isInt(),
  body('name').notEmpty(),
  body('exam_type').isIn(['term', 'midterm', 'final', 'compartment']),
  body('start_date').isDate(),
  body('end_date').isDate(),
  body('status').optional().isIn(['draft', 'published']),
  body('subjects').isArray({ min: 1 }),
  body('subjects.*.subject_id').isInt(),
], validate, ctrl.create);

router.patch('/:id', requireAdmin, [
  param('id').isInt(),
  body('status').isIn(['draft', 'published']),
], validate, ctrl.update);

// GET /api/exams/:id/subjects - Get subjects for an exam's class
router.get('/:id/subjects', requireAdminOrTeacher, ctrl.getSubjects);

router.patch('/:id/subjects/approve-all', requireAdmin, [
  param('id').isInt(),
], validate, ctrl.approveAllSubjects);

router.patch('/:id/subjects/:subjectId/review', requireAdmin, [
  param('id').isInt(),
  param('subjectId').isInt(),
  body('review_status').isIn(['approved', 'rejected']),
  body('review_note').optional({ nullable: true }).isString(),
], validate, ctrl.reviewSubject);

// DELETE /api/exams/:id - Delete exam
router.delete('/:id', requireAdmin, [
  param('id').isInt(),
], validate, ctrl.remove);

module.exports = router;
