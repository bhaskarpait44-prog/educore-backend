'use strict';

const sequelize = require('../config/database');

exports.create = async (req, res, next) => {
  try {
    const { class_id, name, exam_type, start_date, end_date, total_marks, passing_marks } = req.body;

    const [[session]] = await sequelize.query(`
      SELECT id FROM sessions WHERE school_id = :schoolId AND is_current = true LIMIT 1;
    `, { replacements: { schoolId: req.user.school_id } });

    if (!session) return res.fail('No active session. Activate a session first.');

    if (new Date(end_date) < new Date(start_date)) {
      return res.fail('end_date must be on or after start_date.');
    }

    const [[exam]] = await sequelize.query(`
      INSERT INTO exams (session_id, class_id, name, exam_type, start_date, end_date, total_marks, passing_marks, status, created_at, updated_at)
      VALUES (:session_id, :class_id, :name, :exam_type, :start_date, :end_date, :total_marks, :passing_marks, 'upcoming', NOW(), NOW())
      RETURNING id, name, exam_type, start_date, end_date, status;
    `, { replacements: { session_id: session.id, class_id, name, exam_type, start_date, end_date, total_marks, passing_marks } });

    res.ok(exam, 'Exam created.', 201);
  } catch (err) { next(err); }
};