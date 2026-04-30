'use strict';

const sequelize        = require('../config/database');
const bcrypt           = require('bcryptjs');
const auditLogger      = require('../utils/auditLogger');
const profileVersioning = require('../utils/profileVersioning');
const { generateStudentPassword } = require('../utils/studentCredentials');

// ── GET /api/students ────────────────────────────────────────────────────────
exports.list = async (req, res, next) => {
  try {
    const schoolId = req.user.school_id;
    const {
      search = '',
      class_id = '',
      section_id = '',
      session_id = '',
      page = 1,
      perPage = 20,
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(perPage, 10) || 20, 1);
    const offset = (pageNum - 1) * limitNum;

    const [classColumns] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'classes';
    `);
    const hasDisplayName = classColumns.some(col => col.column_name === 'display_name');
    const classLabelSelect = hasDisplayName
      ? `COALESCE(NULLIF(c.display_name, ''), c.name)`
      : 'c.name';

    const replacements = {
      schoolId,
      search: `%${search}%`,
      class_id: class_id || null,
      section_id: section_id || null,
      session_id: session_id || null,
      limit: limitNum,
      offset,
    };

    const whereClause = `
      s.school_id = :schoolId
      AND s.is_deleted = false
      AND (
        :search = '%%'
        OR s.first_name ILIKE :search
        OR s.last_name ILIKE :search
        OR s.admission_no ILIKE :search
        OR CONCAT(s.first_name, ' ', s.last_name) ILIKE :search
      )
      AND (
        (:class_id IS NULL AND :section_id IS NULL AND :session_id IS NULL)
        OR e.id IS NOT NULL
      )
    `;

    const [[{ total }]] = await sequelize.query(`
      SELECT COUNT(DISTINCT s.id)::int AS total
      FROM students s
      LEFT JOIN LATERAL (
        SELECT
          en.id,
          en.class_id,
          en.section_id,
          en.session_id
        FROM enrollments en
        WHERE en.student_id = s.id
          AND (:class_id IS NULL OR en.class_id = CAST(:class_id AS INTEGER))
          AND (:section_id IS NULL OR en.section_id = CAST(:section_id AS INTEGER))
          AND (:session_id IS NULL OR en.session_id = CAST(:session_id AS INTEGER))
        ORDER BY CASE WHEN en.status = 'active' THEN 0 ELSE 1 END, en.joined_date DESC, en.id DESC
        LIMIT 1
      ) e ON true
      WHERE ${whereClause};
    `, { replacements });

    const [students] = await sequelize.query(`
      SELECT
        s.id,
        s.admission_no,
        s.first_name,
        s.last_name,
        s.date_of_birth,
        s.gender,
        s.is_deleted,
        e.id AS enrollment_id,
        e.class_id,
        e.section_id,
        e.session_id,
        e.stream,
        e.roll_number,
        e.joined_date,
        e.enrollment_status,
        e.class_name AS class,
        e.section_name AS section,
        e.session_name AS session
      FROM students s
      LEFT JOIN LATERAL (
        SELECT
          en.id,
          en.class_id,
          en.section_id,
          en.session_id,
          en.stream,
          en.roll_number,
          en.joined_date,
          en.status AS enrollment_status,
          ${classLabelSelect} AS class_name,
          sec.name AS section_name,
          sess.name AS session_name
        FROM enrollments en
        LEFT JOIN classes c ON c.id = en.class_id
        LEFT JOIN sections sec ON sec.id = en.section_id
        LEFT JOIN sessions sess ON sess.id = en.session_id
        WHERE en.student_id = s.id
          AND (:class_id IS NULL OR en.class_id = CAST(:class_id AS INTEGER))
          AND (:section_id IS NULL OR en.section_id = CAST(:section_id AS INTEGER))
          AND (:session_id IS NULL OR en.session_id = CAST(:session_id AS INTEGER))
        ORDER BY CASE WHEN en.status = 'active' THEN 0 ELSE 1 END, en.joined_date DESC, en.id DESC
        LIMIT 1
      ) e ON true
      WHERE ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT :limit OFFSET :offset;
    `, { replacements });

    const formatted = students.map(student => ({
      id: student.id,
      admission_no: student.admission_no,
      first_name: student.first_name,
      last_name: student.last_name,
      date_of_birth: student.date_of_birth,
      gender: student.gender,
      is_deleted: student.is_deleted,
      enrollment_id: student.enrollment_id || null,
      roll_number: student.roll_number || null,
      current_enrollment: student.enrollment_id
        ? {
            id: student.enrollment_id,
            class_id: student.class_id,
            section_id: student.section_id,
            session_id: student.session_id,
            class: student.class,
            section: student.section,
            session: student.session,
            stream: student.stream,
            roll_number: student.roll_number,
            joined_date: student.joined_date,
            status: student.enrollment_status,
          }
        : null,
    }));

    res.ok({
      students: formatted,
      meta: {
        page: pageNum,
        perPage: limitNum,
        total,
        totalPages: Math.max(Math.ceil(total / limitNum), 1),
      },
    }, `${formatted.length} student(s) found.`);
  } catch (err) { next(err); }
};

// ── POST /api/students ────────────────────────────────────────────────────────
exports.admit = async (req, res, next) => {
  try {
    const { admission_no, first_name, last_name, date_of_birth, gender, profile } = req.body;
    const schoolId = req.user.school_id;
    const studentEmail = profile?.email?.trim().toLowerCase();

    if (!studentEmail) {
      return res.fail('Student email is required at admission.', [], 422);
    }

    const generatedPassword = generateStudentPassword();
    const passwordHash = await bcrypt.hash(generatedPassword, 12);

    const result = await sequelize.transaction(async (t) => {
      const [[existing]] = await sequelize.query(`
        SELECT id FROM students WHERE school_id = :schoolId AND admission_no = :admission_no LIMIT 1;
      `, { replacements: { schoolId, admission_no }, transaction: t });

      if (existing) throw Object.assign(new Error('Admission number already exists.'), { status: 409 });

      const [[emailInUse]] = await sequelize.query(`
        SELECT sp.id
        FROM student_profiles sp
        JOIN students s ON s.id = sp.student_id
        WHERE s.school_id = :schoolId
          AND s.is_deleted = false
          AND sp.is_current = true
          AND LOWER(sp.email) = LOWER(:email)
        LIMIT 1;
      `, { replacements: { schoolId, email: studentEmail }, transaction: t });

      if (emailInUse) throw Object.assign(new Error('Student email already exists.'), { status: 409 });

      const [[student]] = await sequelize.query(`
        INSERT INTO students (
          school_id,
          admission_no,
          first_name,
          last_name,
          date_of_birth,
          gender,
          password_hash,
          is_active,
          last_password_change,
          is_deleted,
          created_at,
          updated_at
        )
        VALUES (
          :schoolId,
          :admission_no,
          :first_name,
          :last_name,
          :date_of_birth,
          :gender,
          :passwordHash,
          true,
          NOW(),
          false,
          NOW(),
          NOW()
        )
        RETURNING id, admission_no, first_name, last_name, date_of_birth, gender;
      `, {
        replacements: {
          schoolId,
          admission_no,
          first_name,
          last_name,
          date_of_birth,
          gender,
          passwordHash,
        },
        transaction: t,
      });

      return student;
    });

    // Create initial profile version if profile data provided
    if (profile) {
      await profileVersioning.create({
        studentId    : result.id,
        data         : { ...profile, email: studentEmail },
        changedBy    : req.user.id,
        changeReason : 'Initial profile created on admission',
      });
    }

    res.ok({
      ...result,
      login_credentials: {
        email: studentEmail,
        admission_no,
        password: generatedPassword,
        password_auto_generated: true,
      },
    }, 'Student admitted successfully.', 201);
  } catch (err) { next(err); }
};

// ── GET /api/students/:id ─────────────────────────────────────────────────────
exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [classColumns] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'classes';
    `);
    const hasDisplayName = classColumns.some(col => col.column_name === 'display_name');
    const classLabelSelect = hasDisplayName
      ? `COALESCE(NULLIF(c.display_name, ''), c.name)`
      : 'c.name';

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
      SELECT
        e.id,
        e.class_id,
        e.section_id,
        e.session_id,
        e.stream,
        ${classLabelSelect} AS class,
        sec.name AS section,
        e.roll_number,
        e.joined_date,
        sess.name AS session,
        e.status
      FROM enrollments e
      JOIN classes  c   ON c.id   = e.class_id
      JOIN sections sec ON sec.id = e.section_id
      JOIN sessions sess ON sess.id = e.session_id
      WHERE e.student_id = :id
      ORDER BY CASE WHEN e.status = 'active' THEN 0 ELSE 1 END, e.joined_date DESC, e.id DESC
      LIMIT 1;
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

// ── DELETE /api/students/:id ─────────────────────────────────────────────
exports.resetPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { new_password } = req.body;

    const [[student]] = await sequelize.query(`
      SELECT s.id, s.admission_no, sp.email
      FROM students s
      LEFT JOIN student_profiles sp
        ON sp.student_id = s.id
       AND sp.is_current = true
      WHERE s.id = :id
        AND s.school_id = :schoolId
        AND s.is_deleted = false;
    `, { replacements: { id, schoolId: req.user.school_id } });

    if (!student) return res.fail('Student not found.', [], 404);

    const rawPassword = (new_password || '').trim() || generateStudentPassword();
    const hash = await bcrypt.hash(rawPassword, 12);

    await sequelize.query(`
      UPDATE students
      SET password_hash = :hash,
          last_password_change = NOW(),
          updated_at = NOW()
      WHERE id = :id;
    `, { replacements: { hash, id } });

    res.ok({
      admission_no: student.admission_no,
      email: student.email || null,
      generated_password: rawPassword,
    }, 'Student portal password reset successfully.');
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { confirm_name, reason } = req.body;
    const schoolId = req.user.school_id;

    const [[student]] = await sequelize.query(`
      SELECT id, first_name, last_name
      FROM students
      WHERE id = :id AND school_id = :schoolId AND is_deleted = false;
    `, { replacements: { id, schoolId } });

    if (!student) return res.fail('Student not found.', [], 404);

    const expectedName = `${student.first_name} ${student.last_name}`.trim();
    if ((confirm_name || '').trim() !== expectedName) {
      return res.fail('Typed student name does not match.', [], 400);
    }

    await sequelize.transaction(async (t) => {
      await auditLogger.setContext(sequelize, {
        changedBy  : req.user.id,
        reason     : reason || `Student deleted after confirming name ${expectedName}`,
        ipAddress  : req.ip,
        deviceInfo : req.headers['user-agent'],
      }, { transaction: t });

      await sequelize.query(`
        UPDATE students
        SET is_deleted = true, updated_at = NOW()
        WHERE id = :id AND school_id = :schoolId AND is_deleted = false;
      `, { replacements: { id, schoolId }, transaction: t });
    });

    res.ok({}, 'Student deleted successfully.');
  } catch (err) { next(err); }
};

// ── GET /api/students/:id/history ────────────────────────────────────────────
exports.getHistory = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [classColumns] = await sequelize.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'classes';
    `);
    const hasDisplayName = classColumns.some(col => col.column_name === 'display_name');
    const historyClassLabelSelect = hasDisplayName
      ? `COALESCE(NULLIF(cls.display_name, ''), cls.name)`
      : 'cls.name';

    // Full enrollment history chain
    const [enrollments] = await sequelize.query(`
      WITH RECURSIVE chain AS (
        SELECT e.*, 1 AS depth
        FROM enrollments e
        WHERE e.id = (
          SELECT en.id
          FROM enrollments en
          WHERE en.student_id = :id
          ORDER BY CASE WHEN en.status = 'active' THEN 0 ELSE 1 END, en.joined_date DESC, en.id DESC
          LIMIT 1
        )
        UNION ALL
        SELECT prev.*, c.depth + 1 FROM enrollments prev
        JOIN chain c ON c.previous_enrollment_id = prev.id
      )
      SELECT c.id, c.depth, c.class_id, c.section_id, c.session_id,
             sess.name AS session, ${historyClassLabelSelect} AS class,
             sec.name AS section, c.stream, c.roll_number, c.joining_type,
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
