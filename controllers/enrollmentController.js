'use strict';

const sequelize = require('../config/database');

// ── POST /api/enrollments ─────────────────────────────────────────────────────
exports.enroll = async (req, res, next) => {
  try {
    const { student_id, session_id, class_id, section_id, joining_type, joined_date, roll_number } = req.body;

    // Check section capacity
    const [[capacityCheck]] = await sequelize.query(`
      SELECT sec.capacity,
             COUNT(e.id) AS current_count
      FROM sections sec
      LEFT JOIN enrollments e ON e.section_id = sec.id
        AND e.session_id = :session_id AND e.status = 'active'
      WHERE sec.id = :section_id
      GROUP BY sec.capacity;
    `, { replacements: { section_id, session_id } });

    if (capacityCheck && parseInt(capacityCheck.current_count) >= capacityCheck.capacity) {
      return res.fail(`Section is at full capacity (${capacityCheck.capacity} students).`);
    }

    const [[enrollment]] = await sequelize.query(`
      INSERT INTO enrollments
        (student_id, session_id, class_id, section_id, roll_number, joined_date,
         joining_type, left_date, leaving_type, previous_enrollment_id, status, created_at, updated_at)
      VALUES
        (:student_id, :session_id, :class_id, :section_id, :roll_number, :joined_date,
         :joining_type, NULL, NULL, NULL, 'active', NOW(), NOW())
      RETURNING id, student_id, session_id, class_id, section_id, roll_number, joining_type, status;
    `, { replacements: { student_id, session_id, class_id, section_id, roll_number: roll_number || null, joined_date, joining_type } });

    res.ok(enrollment, 'Student enrolled successfully.', 201);
  } catch (err) { next(err); }
};

// ── GET /api/enrollments/:id ──────────────────────────────────────────────────
exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[enrollment]] = await sequelize.query(`
      SELECT e.*, s.first_name, s.last_name, s.admission_no,
             c.name AS class_name, sec.name AS section_name,
             sess.name AS session_name
      FROM enrollments e
      JOIN students  s   ON s.id   = e.student_id
      JOIN classes   c   ON c.id   = e.class_id
      JOIN sections  sec ON sec.id = e.section_id
      JOIN sessions  sess ON sess.id = e.session_id
      WHERE e.id = :id AND s.school_id = :schoolId;
    `, { replacements: { id, schoolId: req.user.school_id } });

    if (!enrollment) return res.fail('Enrollment not found.', [], 404);
    res.ok(enrollment, 'Enrollment retrieved.');
  } catch (err) { next(err); }
};

// ── POST /api/enrollments/promote ────────────────────────────────────────────
exports.promote = async (req, res, next) => {
  try {
    const { session_id, new_session_id, class_id, new_class_id, new_section_id } = req.body;
    const today = new Date().toISOString().split('T')[0];

    const [eligible] = await sequelize.query(`
      SELECT e.id, e.student_id, sr.result
      FROM enrollments e
      JOIN student_results sr ON sr.enrollment_id = e.id
      WHERE e.session_id = :session_id AND e.class_id = :class_id
        AND e.status = 'active' AND sr.is_promoted = true;
    `, { replacements: { session_id, class_id } });

    if (eligible.length === 0) {
      return res.fail('No students eligible for promotion in this class.');
    }

    const promoted = [];
    await sequelize.transaction(async (t) => {
      for (const en of eligible) {
        // Close old enrollment
        await sequelize.query(`
          UPDATE enrollments SET status = 'inactive', left_date = :today,
            leaving_type = 'promoted', updated_at = NOW()
          WHERE id = :id;
        `, { replacements: { today, id: en.id }, transaction: t });

        // Create new enrollment
        const [[newEnrollment]] = await sequelize.query(`
          INSERT INTO enrollments
            (student_id, session_id, class_id, section_id, joined_date, joining_type,
             previous_enrollment_id, status, created_at, updated_at)
          VALUES
            (:student_id, :new_session_id, :new_class_id, :new_section_id, :today,
             'promoted', :prev_id, 'active', NOW(), NOW())
          RETURNING id;
        `, {
          replacements: {
            student_id: en.student_id,
            new_session_id, new_class_id, new_section_id,
            today, prev_id: en.id,
          },
          transaction: t,
        });

        promoted.push({ student_id: en.student_id, new_enrollment_id: newEnrollment.id });
      }
    });

    res.ok({ promoted_count: promoted.length, students: promoted }, `${promoted.length} student(s) promoted.`);
  } catch (err) { next(err); }
};

// ── POST /api/enrollments/transfer ───────────────────────────────────────────
exports.transfer = async (req, res, next) => {
  try {
    const { enrollment_id, new_section_id, reason } = req.body;
    const today = new Date().toISOString().split('T')[0];

    const [[current]] = await sequelize.query(`
      SELECT id, student_id, session_id, class_id FROM enrollments
      WHERE id = :enrollment_id AND status = 'active';
    `, { replacements: { enrollment_id } });

    if (!current) return res.fail('Active enrollment not found.', [], 404);

    await sequelize.transaction(async (t) => {
      // Close current
      await sequelize.query(`
        UPDATE enrollments SET status = 'inactive', left_date = :today,
          leaving_type = 'transfer_out', updated_at = NOW()
        WHERE id = :id;
      `, { replacements: { today, id: enrollment_id }, transaction: t });

      // Open new in different section
      await sequelize.query(`
        INSERT INTO enrollments
          (student_id, session_id, class_id, section_id, joined_date, joining_type,
           previous_enrollment_id, status, created_at, updated_at)
        VALUES
          (:student_id, :session_id, :class_id, :new_section_id, :today,
           'transfer_in', :prev_id, 'active', NOW(), NOW());
      `, {
        replacements: {
          student_id: current.student_id,
          session_id: current.session_id,
          class_id  : current.class_id,
          new_section_id, today,
          prev_id   : enrollment_id,
        },
        transaction: t,
      });
    });

    res.ok({ enrollment_id, new_section_id }, 'Student transferred to new section.');
  } catch (err) { next(err); }
};