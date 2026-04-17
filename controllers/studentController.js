'use strict';

const sequelize        = require('../config/database');
const auditLogger      = require('../utils/auditLogger');
const profileVersioning = require('../utils/profileVersioning');

// ── POST /api/students ────────────────────────────────────────────────────────
exports.admit = async (req, res, next) => {
  try {
    const { admission_no, first_name, last_name, date_of_birth, gender, profile } = req.body;
    const schoolId = req.user.school_id;

    const result = await sequelize.transaction(async (t) => {
      const [[existing]] = await sequelize.query(`
        SELECT id FROM students WHERE school_id = :schoolId AND admission_no = :admission_no LIMIT 1;
      `, { replacements: { schoolId, admission_no }, transaction: t });

      if (existing) throw Object.assign(new Error('Admission number already exists.'), { status: 409 });

      const [[student]] = await sequelize.query(`
        INSERT INTO students (school_id, admission_no, first_name, last_name, date_of_birth, gender, is_deleted, created_at, updated_at)
        VALUES (:schoolId, :admission_no, :first_name, :last_name, :date_of_birth, :gender, false, NOW(), NOW())
        RETURNING id, admission_no, first_name, last_name, date_of_birth, gender;
      `, { replacements: { schoolId, admission_no, first_name, last_name, date_of_birth, gender }, transaction: t });

      return student;
    });

    // Create initial profile version if profile data provided
    if (profile) {
      await profileVersioning.create({
        studentId    : result.id,
        data         : profile,
        changedBy    : req.user.id,
        changeReason : 'Initial profile created on admission',
      });
    }

    res.ok(result, 'Student admitted successfully.', 201);
  } catch (err) { next(err); }
};

// ── GET /api/students/:id ─────────────────────────────────────────────────────
exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[student]] = await sequelize.query(`
      SELECT s.id, s.admission_no, s.first_name, s.last_name, s.date_of_birth, s.gender,
             s.created_at,
             sp.address, sp.city, sp.state, sp.pincode, sp.phone, sp.email,
             sp.father_name, sp.father_phone, sp.mother_name, sp.mother_phone,
             sp.blood_group, sp.medical_notes, sp.photo_path
      FROM students s
      LEFT JOIN student_profiles sp ON sp.student_id = s.id AND sp.is_current = true
      WHERE s.id = :id AND s.school_id = :schoolId AND s.is_deleted = false;
    `, { replacements: { id, schoolId: req.user.school_id } });

    if (!student) return res.fail('Student not found.', [], 404);

    // Current enrollment
    const [[enrollment]] = await sequelize.query(`
      SELECT e.id, c.name AS class, sec.name AS section, e.roll_number, sess.name AS session
      FROM enrollments e
      JOIN classes  c   ON c.id   = e.class_id
      JOIN sections sec ON sec.id = e.section_id
      JOIN sessions sess ON sess.id = e.session_id
      WHERE e.student_id = :id AND e.status = 'active'
      ORDER BY e.id DESC LIMIT 1;
    `, { replacements: { id } });

    res.ok({ ...student, current_enrollment: enrollment || null }, 'Student retrieved.');
  } catch (err) { next(err); }
};

// ── PATCH /api/students/:id/identity ─────────────────────────────────────────
exports.updateIdentity = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, date_of_birth, gender, reason } = req.body;

    const [[student]] = await sequelize.query(`
      SELECT id, first_name, last_name, date_of_birth, gender
      FROM students WHERE id = :id AND school_id = :schoolId AND is_deleted = false;
    `, { replacements: { id, schoolId: req.user.school_id } });

    if (!student) return res.fail('Student not found.', [], 404);

    // Set audit context — trigger reads these for each field change
    await auditLogger.setContext(sequelize, {
      changedBy  : req.user.id,
      reason,
      ipAddress  : req.ip,
      deviceInfo : req.headers['user-agent'],
    });

    const updates = {};
    if (first_name)    updates.first_name    = first_name;
    if (last_name)     updates.last_name     = last_name;
    if (date_of_birth) updates.date_of_birth = date_of_birth;
    if (gender)        updates.gender        = gender;

    if (Object.keys(updates).length === 0) {
      return res.fail('No fields provided to update.');
    }

    const setClauses = Object.keys(updates).map(k => `${k} = :${k}`).join(', ');
    const [[updated]] = await sequelize.query(`
      UPDATE students SET ${setClauses}, updated_at = NOW()
      WHERE id = :id
      RETURNING id, first_name, last_name, date_of_birth, gender;
    `, { replacements: { ...updates, id } });

    res.ok(updated, 'Student identity updated. Audit log written.');
  } catch (err) { next(err); }
};

// ── PATCH /api/students/:id/profile ──────────────────────────────────────────
exports.updateProfile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { change_reason, ...newData } = req.body;

    const [[student]] = await sequelize.query(`
      SELECT id FROM students WHERE id = :id AND school_id = :schoolId AND is_deleted = false;
    `, { replacements: { id, schoolId: req.user.school_id } });

    if (!student) return res.fail('Student not found.', [], 404);

    const result = await profileVersioning.update({
      studentId    : parseInt(id),
      newData,
      changedBy    : req.user.id,
      changeReason : change_reason,
      ipAddress    : req.ip,
      deviceInfo   : req.headers['user-agent'],
    });

    res.ok({
      new_version : result.newVersion,
      old_version : { id: result.oldVersion.id, valid_from: result.oldVersion.valid_from, valid_to: result.oldVersion.valid_to },
    }, 'Profile updated. New version created.');
  } catch (err) { next(err); }
};

// ── GET /api/students/:id/history ────────────────────────────────────────────
exports.getHistory = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Full enrollment history chain
    const [enrollments] = await sequelize.query(`
      WITH RECURSIVE chain AS (
        SELECT e.*, 1 AS depth FROM enrollments e
        WHERE e.student_id = :id AND e.status = 'active'
        UNION ALL
        SELECT prev.*, c.depth + 1 FROM enrollments prev
        JOIN chain c ON c.previous_enrollment_id = prev.id
      )
      SELECT c.id, c.depth, sess.name AS session, cls.name AS class,
             sec.name AS section, c.roll_number, c.joining_type,
             c.leaving_type, c.joined_date, c.left_date, c.status
      FROM chain c
      JOIN sessions sess ON sess.id = c.session_id
      JOIN classes  cls  ON cls.id  = c.class_id
      JOIN sections sec  ON sec.id  = c.section_id
      ORDER BY c.depth DESC;
    `, { replacements: { id } });

    // Profile versions
    const profileHistory = await profileVersioning.getHistory(parseInt(id));

    // Exam results per session
    const [results] = await sequelize.query(`
      SELECT sr.percentage, sr.grade, sr.result, sr.is_promoted,
             sess.name AS session
      FROM student_results sr
      JOIN enrollments e ON e.id = sr.enrollment_id
      JOIN sessions sess ON sess.id = sr.session_id
      WHERE e.student_id = :id
      ORDER BY sess.start_date DESC;
    `, { replacements: { id } });

    res.ok({
      enrollment_history : enrollments,
      profile_history    : profileHistory,
      result_history     : results,
    }, 'Student history retrieved.');
  } catch (err) { next(err); }
};