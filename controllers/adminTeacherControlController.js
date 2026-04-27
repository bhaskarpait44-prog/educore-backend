'use strict';

const sequelize = require('../config/database');
const { clearPermissionCache } = require('../middlewares/checkPermission');

const DAY_NAMES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const TEACHER_BASE_PERMISSION_NAMES = [
  'classes.view',
];
const CLASS_TEACHER_PERMISSION_NAMES = [
  'classes.view',
  'attendance.view',
  'attendance.mark',
  'attendance.edit',
];
const DEFAULT_LEAVE_BALANCES = [
  { leave_type: 'casual', total_allowed: Number(process.env.DEFAULT_CASUAL_LEAVE || 12) },
  { leave_type: 'sick', total_allowed: Number(process.env.DEFAULT_SICK_LEAVE || 10) },
  { leave_type: 'emergency', total_allowed: Number(process.env.DEFAULT_EMERGENCY_LEAVE || 5) },
  { leave_type: 'earned', total_allowed: Number(process.env.DEFAULT_EARNED_LEAVE || 15) },
];

async function audit(tableName, recordId, changes, req) {
  const rows = (Array.isArray(changes) ? changes : [changes]).map((change) => ({
    table_name: tableName,
    record_id: recordId,
    field_name: change.field,
    old_value: change.oldValue != null ? String(change.oldValue) : null,
    new_value: change.newValue != null ? String(change.newValue) : null,
    changed_by: req.user?.id || null,
    reason: change.reason || null,
    ip_address: req.ip || null,
    device_info: (req.headers['user-agent'] || '').slice(0, 299),
    created_at: new Date(),
  }));

  if (rows.length) {
    await sequelize.getQueryInterface().bulkInsert('audit_logs', rows);
  }
}

function requireFields(payload, fields) {
  for (const field of fields) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
      const error = new Error(`${field} is required.`);
      error.status = 422;
      throw error;
    }
  }
}

async function getCurrentSession(schoolId) {
  const [[session]] = await sequelize.query(`
    SELECT id, name
    FROM sessions
    WHERE school_id = :schoolId
    ORDER BY CASE WHEN is_current = true THEN 0 ELSE 1 END, start_date DESC
    LIMIT 1;
  `, { replacements: { schoolId } });

  return session || null;
}

async function ensureTeacherLeaveBalances(teacherId, sessionId, transaction = null) {
  if (!teacherId || !sessionId) return;

  for (const balance of DEFAULT_LEAVE_BALANCES) {
    const totalAllowed = Number.isFinite(balance.total_allowed) ? balance.total_allowed : 0;
    await sequelize.query(`
      INSERT INTO leave_balances (
        teacher_id, session_id, leave_type, total_allowed, used, remaining, created_at, updated_at
      )
      VALUES (
        :teacherId, :sessionId, :leaveType, :totalAllowed, 0, :totalAllowed, NOW(), NOW()
      )
      ON CONFLICT (teacher_id, session_id, leave_type) DO NOTHING;
    `, {
      replacements: {
        teacherId,
        sessionId,
        leaveType: balance.leave_type,
        totalAllowed,
      },
      transaction,
    });
  }
}

async function grantTeacherAssignmentPermissions(teacherId, { isClassTeacher = false } = {}, grantedBy = null) {
  const names = isClassTeacher
    ? CLASS_TEACHER_PERMISSION_NAMES
    : TEACHER_BASE_PERMISSION_NAMES;

  const [perms] = await sequelize.query(`
    SELECT id, name
    FROM permissions
    WHERE name IN (:names);
  `, {
    replacements: { names },
  });

  if (perms.length > 0) {
    await sequelize.getQueryInterface().bulkInsert(
      'user_permissions',
      perms.map((permission) => ({
        user_id: Number(teacherId),
        permission_id: permission.id,
        granted_by: grantedBy,
        granted_at: new Date(),
      })),
      { ignoreDuplicates: true }
    );

    clearPermissionCache(Number(teacherId));
  }

  return perms.map((permission) => permission.name);
}

exports.overview = async (req, res, next) => {
  try {
    const session = await getCurrentSession(req.user.school_id);

    const [[counts]] = await sequelize.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE school_id = :schoolId AND role = 'teacher' AND is_active = true AND is_deleted = false) AS teachers,
        (SELECT COUNT(*) FROM teacher_assignments WHERE session_id = :sessionId AND is_active = true) AS active_assignments,
        (SELECT COUNT(*) FROM timetable_slots WHERE session_id = :sessionId AND is_active = true) AS timetable_slots,
        (
          SELECT COUNT(*)
          FROM teacher_leaves tl
          JOIN users teacher ON teacher.id = tl.teacher_id
          WHERE tl.status = 'pending'
            AND teacher.school_id = :schoolId
            AND teacher.role = 'teacher'
            AND teacher.is_deleted = false
        ) AS pending_leaves,
        (
          SELECT COUNT(*)
          FROM profile_correction_requests pcr
          JOIN users teacher ON teacher.id = pcr.user_id
          WHERE pcr.status = 'pending'
            AND teacher.school_id = :schoolId
            AND teacher.role = 'teacher'
            AND teacher.is_deleted = false
        ) AS pending_corrections,
        (SELECT COUNT(*) FROM teacher_notices WHERE is_active = true) AS active_notices,
        (SELECT COUNT(*) FROM homework WHERE session_id = :sessionId AND status = 'active') AS active_homework;
    `, {
      replacements: {
        schoolId: req.user.school_id,
        sessionId: session?.id || 0,
      },
    });

    res.ok({ session, counts }, 'Admin teacher control overview loaded.');
  } catch (err) { next(err); }
};

exports.teachers = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        id,
        name,
        email,
        phone,
        employee_id,
        department,
        designation
      FROM users
      WHERE school_id = :schoolId
        AND role = 'teacher'
        AND is_active = true
        AND is_deleted = false
      ORDER BY name ASC, id ASC;
    `, {
      replacements: {
        schoolId: req.user.school_id,
      },
    });

    res.ok({ teachers: rows }, `${rows.length} teacher(s) found.`);
  } catch (err) { next(err); }
};

exports.assignments = async (req, res, next) => {
  try {
    const session = await getCurrentSession(req.user.school_id);
    const [rows] = await sequelize.query(`
      SELECT
        ta.*,
        u.name AS teacher_name,
        c.name AS class_name,
        sec.name AS section_name,
        sub.name AS subject_name,
        sub.code AS subject_code,
        sess.name AS session_name
      FROM teacher_assignments ta
      JOIN users u ON u.id = ta.teacher_id
      JOIN classes c ON c.id = ta.class_id
      JOIN sections sec ON sec.id = ta.section_id
      JOIN sessions sess ON sess.id = ta.session_id
      LEFT JOIN subjects sub ON sub.id = ta.subject_id
      WHERE ta.session_id = :sessionId
      ORDER BY ta.is_active DESC, u.name ASC, c.name ASC, sec.name ASC, ta.is_class_teacher DESC;
    `, { replacements: { sessionId: session?.id || 0 } });

    res.ok({ session, assignments: rows }, `${rows.length} teacher assignment(s) found.`);
  } catch (err) { next(err); }
};

exports.createAssignment = async (req, res, next) => {
  try {
    const session = await getCurrentSession(req.user.school_id);
    const { teacher_id, class_id, section_id, subject_id = null, is_class_teacher = false } = req.body;
    requireFields(req.body, ['teacher_id', 'class_id', 'section_id']);

    if (!is_class_teacher && !subject_id) {
      return res.fail('subject_id is required for subject teacher assignments.', [], 422);
    }

    if (is_class_teacher) {
      const [[existingClassTeacher]] = await sequelize.query(`
        SELECT id
        FROM teacher_assignments
        WHERE session_id = :sessionId
          AND class_id = :classId
          AND section_id = :sectionId
          AND is_class_teacher = true
          AND is_active = true
        LIMIT 1;
      `, {
        replacements: {
          sessionId: session?.id || 0,
          classId: class_id,
          sectionId: section_id,
        },
      });

      if (existingClassTeacher) {
        return res.fail('An active class teacher is already assigned to this section.', [], 422);
      }
    } else {
      const [[existingSubjectAssignment]] = await sequelize.query(`
        SELECT id
        FROM teacher_assignments
        WHERE session_id = :sessionId
          AND teacher_id = :teacherId
          AND class_id = :classId
          AND section_id = :sectionId
          AND subject_id = :subjectId
          AND is_active = true
        LIMIT 1;
      `, {
        replacements: {
          sessionId: session?.id || 0,
          teacherId: teacher_id,
          classId: class_id,
          sectionId: section_id,
          subjectId: subject_id,
        },
      });

      if (existingSubjectAssignment) {
        return res.fail('This subject assignment already exists for the teacher.', [], 422);
      }
    }

    const [[assignment]] = await sequelize.query(`
      INSERT INTO teacher_assignments (
        teacher_id, session_id, class_id, section_id, subject_id, is_class_teacher,
        is_active, created_at, updated_at
      )
      VALUES (
        :teacherId, :sessionId, :classId, :sectionId, :subjectId, :isClassTeacher,
        true, NOW(), NOW()
      )
      RETURNING *;
    `, {
      replacements: {
        teacherId: teacher_id,
        sessionId: session?.id || 0,
        classId: class_id,
        sectionId: section_id,
        subjectId: is_class_teacher ? null : subject_id,
        isClassTeacher: Boolean(is_class_teacher),
      },
    });

    const permissionsGranted = await grantTeacherAssignmentPermissions(
      Number(teacher_id),
      { isClassTeacher: Boolean(is_class_teacher) },
      req.user.id
    );

    await audit('teacher_assignments', assignment.id, {
      field: 'created',
      oldValue: null,
      newValue: is_class_teacher ? 'class_teacher' : `subject:${subject_id}`,
      reason: 'Admin created teacher assignment',
    }, req);

    res.ok({ assignment, permissions_granted: permissionsGranted }, 'Teacher assignment created.', 201);
  } catch (err) { next(err); }
};

exports.updateAssignment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[assignment]] = await sequelize.query(`
      SELECT id, is_active
      FROM teacher_assignments
      WHERE id = :id
      LIMIT 1;
    `, { replacements: { id } });

    if (!assignment) return res.fail('Assignment not found.', [], 404);

    await sequelize.query(`
      UPDATE teacher_assignments
      SET is_active = COALESCE(:isActive, is_active),
          updated_at = NOW()
      WHERE id = :id;
    `, {
      replacements: {
        id,
        isActive: req.body.is_active,
      },
    });

    if (req.body.is_active === true) {
      const [[updatedAssignment]] = await sequelize.query(`
        SELECT teacher_id, is_class_teacher
        FROM teacher_assignments
        WHERE id = :id
        LIMIT 1;
      `, { replacements: { id } });

      if (updatedAssignment) {
        await grantTeacherAssignmentPermissions(
          Number(updatedAssignment.teacher_id),
          { isClassTeacher: Boolean(updatedAssignment.is_class_teacher) },
          req.user.id
        );
      }
    }

    await audit('teacher_assignments', Number(id), {
      field: 'is_active',
      oldValue: assignment.is_active,
      newValue: req.body.is_active,
      reason: 'Admin updated teacher assignment',
    }, req);

    res.ok({ id: Number(id) }, 'Teacher assignment updated.');
  } catch (err) { next(err); }
};

exports.timetable = async (req, res, next) => {
  try {
    const session = await getCurrentSession(req.user.school_id);
    const [rows] = await sequelize.query(`
      SELECT
        ts.*,
        u.name AS teacher_name,
        c.name AS class_name,
        sec.name AS section_name,
        sub.name AS subject_name
      FROM timetable_slots ts
      JOIN users u ON u.id = ts.teacher_id
      JOIN classes c ON c.id = ts.class_id
      JOIN sections sec ON sec.id = ts.section_id
      JOIN subjects sub ON sub.id = ts.subject_id
      JOIN teacher_assignments ta
        ON ta.session_id = ts.session_id
       AND ta.class_id = ts.class_id
       AND ta.section_id = ts.section_id
       AND ta.teacher_id = ts.teacher_id
       AND ta.subject_id = ts.subject_id
       AND ta.is_active = true
      WHERE ts.session_id = :sessionId
      ORDER BY ts.day_of_week ASC, ts.period_number ASC, u.name ASC;
    `, { replacements: { sessionId: session?.id || 0 } });

    res.ok({ session, timetable: rows }, `${rows.length} timetable slot(s) found.`);
  } catch (err) { next(err); }
};

exports.createTimetableSlot = async (req, res, next) => {
  try {
    const session = await getCurrentSession(req.user.school_id);
    const {
      teacher_id, class_id, section_id, subject_id,
      day_of_week, period_number, start_time, end_time, room_number = null,
    } = req.body;

    requireFields(req.body, ['teacher_id', 'class_id', 'section_id', 'subject_id', 'day_of_week', 'period_number', 'start_time', 'end_time']);
    if (!DAY_NAMES.includes(day_of_week)) {
      return res.fail('Invalid day_of_week.', [], 422);
    }

    const [[assignment]] = await sequelize.query(`
      SELECT id
      FROM teacher_assignments
      WHERE session_id = :sessionId
        AND teacher_id = :teacherId
        AND class_id = :classId
        AND section_id = :sectionId
        AND subject_id = :subjectId
        AND is_active = true
      LIMIT 1;
    `, {
      replacements: {
        sessionId: session?.id || 0,
        teacherId: teacher_id,
        classId: class_id,
        sectionId: section_id,
        subjectId: subject_id,
      },
    });

    if (!assignment) {
      return res.fail('The selected teacher is not actively assigned to this subject for the chosen class and section.', [], 422);
    }

    const [[slot]] = await sequelize.query(`
      INSERT INTO timetable_slots (
        session_id, class_id, section_id, teacher_id, subject_id, day_of_week,
        period_number, start_time, end_time, room_number, is_active
      )
      VALUES (
        :sessionId, :classId, :sectionId, :teacherId, :subjectId, :dayOfWeek,
        :periodNumber, :startTime, :endTime, :roomNumber, true
      )
      RETURNING *;
    `, {
      replacements: {
        sessionId: session?.id || 0,
        classId: class_id,
        sectionId: section_id,
        teacherId: teacher_id,
        subjectId: subject_id,
        dayOfWeek: day_of_week,
        periodNumber: period_number,
        startTime: start_time,
        endTime: end_time,
        roomNumber: room_number,
      },
    });

    await audit('timetable_slots', slot.id, {
      field: 'created',
      oldValue: null,
      newValue: `${day_of_week}:${period_number}`,
      reason: 'Admin created timetable slot',
    }, req);

    res.ok({ slot }, 'Timetable slot created.', 201);
  } catch (err) { next(err); }
};

exports.updateTimetableSlot = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[slot]] = await sequelize.query(`
      SELECT id, is_active
      FROM timetable_slots
      WHERE id = :id
      LIMIT 1;
    `, { replacements: { id } });

    if (!slot) return res.fail('Timetable slot not found.', [], 404);

    const fields = ['room_number', 'start_time', 'end_time', 'is_active'];
    const updates = fields.filter((field) => req.body[field] !== undefined);
    if (!updates.length) return res.fail('No timetable fields provided.', [], 422);

    const setClause = updates.map((field) => `${field} = :${field}`).join(', ');
    await sequelize.query(`
      UPDATE timetable_slots
      SET ${setClause}
      WHERE id = :id;
    `, { replacements: { ...req.body, id } });

    await audit('timetable_slots', Number(id), {
      field: 'updated',
      oldValue: slot.is_active,
      newValue: req.body.is_active ?? slot.is_active,
      reason: 'Admin updated timetable slot',
    }, req);

    res.ok({ id: Number(id) }, 'Timetable slot updated.');
  } catch (err) { next(err); }
};

exports.homework = async (req, res, next) => {
  try {
    const session = await getCurrentSession(req.user.school_id);
    const [rows] = await sequelize.query(`
      SELECT
        h.*,
        u.name AS teacher_name,
        c.name AS class_name,
        sec.name AS section_name,
        sub.name AS subject_name,
        COUNT(DISTINCT e.id) AS student_count,
        COUNT(hs.id) FILTER (WHERE hs.status IN ('submitted', 'graded')) AS submitted_count
      FROM homework h
      JOIN users u ON u.id = h.teacher_id
      JOIN classes c ON c.id = h.class_id
      JOIN sections sec ON sec.id = h.section_id
      JOIN subjects sub ON sub.id = h.subject_id
      JOIN enrollments e
        ON e.class_id = h.class_id
       AND e.section_id = h.section_id
       AND e.session_id = h.session_id
       AND e.status = 'active'
      LEFT JOIN homework_submissions hs
        ON hs.homework_id = h.id
       AND hs.enrollment_id = e.id
      WHERE h.session_id = :sessionId
      GROUP BY h.id, u.name, c.name, sec.name, sub.name
      ORDER BY h.created_at DESC;
    `, { replacements: { sessionId: session?.id || 0 } });

    res.ok({ homework: rows }, `${rows.length} homework item(s) found.`);
  } catch (err) { next(err); }
};

exports.updateHomework = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['active', 'completed', 'cancelled'].includes(status)) {
      return res.fail('Invalid homework status.', [], 422);
    }

    const [[homework]] = await sequelize.query(`
      SELECT id, status
      FROM homework
      WHERE id = :id
      LIMIT 1;
    `, { replacements: { id } });
    if (!homework) return res.fail('Homework not found.', [], 404);

    await sequelize.query(`
      UPDATE homework
      SET status = :status,
          updated_at = NOW()
      WHERE id = :id;
    `, { replacements: { id, status } });

    await audit('homework', Number(id), {
      field: 'status',
      oldValue: homework.status,
      newValue: status,
      reason: 'Admin updated homework status',
    }, req);

    res.ok({ id: Number(id), status }, 'Homework status updated.');
  } catch (err) { next(err); }
};

exports.notices = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        n.*,
        u.name AS teacher_name,
        c.name AS class_name,
        sec.name AS section_name,
        COUNT(nr.id) AS read_count
      FROM teacher_notices n
      JOIN users u ON u.id = n.teacher_id
      LEFT JOIN classes c ON c.id = n.class_id
      LEFT JOIN sections sec ON sec.id = n.section_id
      LEFT JOIN teacher_notice_reads nr ON nr.notice_id = n.id
      GROUP BY n.id, u.name, c.name, sec.name
      ORDER BY n.publish_date DESC;
    `);

    res.ok({ notices: rows }, `${rows.length} notice(s) found.`);
  } catch (err) { next(err); }
};

exports.updateNotice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[notice]] = await sequelize.query(`
      SELECT id, is_active
      FROM teacher_notices
      WHERE id = :id
      LIMIT 1;
    `, { replacements: { id } });
    if (!notice) return res.fail('Notice not found.', [], 404);

    await sequelize.query(`
      UPDATE teacher_notices
      SET is_active = COALESCE(:isActive, is_active),
          expiry_date = COALESCE(:expiryDate, expiry_date),
          updated_at = NOW()
      WHERE id = :id;
    `, {
      replacements: {
        id,
        isActive: req.body.is_active,
        expiryDate: req.body.expiry_date,
      },
    });

    await audit('teacher_notices', Number(id), {
      field: 'is_active',
      oldValue: notice.is_active,
      newValue: req.body.is_active,
      reason: 'Admin updated teacher notice',
    }, req);

    res.ok({ id: Number(id) }, 'Teacher notice updated.');
  } catch (err) { next(err); }
};

exports.leaves = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        tl.*,
        u.name AS teacher_name,
        reviewer.name AS reviewed_by_name
      FROM teacher_leaves tl
      JOIN users u ON u.id = tl.teacher_id
      LEFT JOIN users reviewer ON reviewer.id = tl.reviewed_by
      WHERE u.school_id = :schoolId
        AND u.role = 'teacher'
        AND u.is_deleted = false
      ORDER BY CASE WHEN tl.status = 'pending' THEN 0 ELSE 1 END, tl.created_at DESC;
    `, {
      replacements: {
        schoolId: req.user.school_id,
      },
    });

    res.ok({ applications: rows }, `${rows.length} leave application(s) found.`);
  } catch (err) { next(err); }
};

exports.reviewLeave = async (req, res, next) => {
  const tx = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { status, review_note = null } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      await tx.rollback();
      return res.fail('status must be approved or rejected.', [], 422);
    }

    const [[leave]] = await sequelize.query(`
      SELECT tl.*
      FROM teacher_leaves tl
      JOIN users teacher ON teacher.id = tl.teacher_id
      WHERE tl.id = :id
        AND teacher.school_id = :schoolId
        AND teacher.role = 'teacher'
        AND teacher.is_deleted = false
      LIMIT 1;
    `, {
      replacements: {
        id,
        schoolId: req.user.school_id,
      },
      transaction: tx,
    });

    if (!leave) {
      await tx.rollback();
      return res.fail('Leave application not found.', [], 404);
    }
    if (leave.status !== 'pending') {
      await tx.rollback();
      return res.fail('Only pending leave applications can be reviewed.', [], 422);
    }

    await sequelize.query(`
      UPDATE teacher_leaves
      SET status = :status,
          reviewed_by = :reviewedBy,
          review_note = :reviewNote,
          reviewed_at = NOW(),
          updated_at = NOW()
      WHERE id = :id;
    `, {
      replacements: {
        id,
        status,
        reviewedBy: req.user.id,
        reviewNote: review_note,
      },
      transaction: tx,
    });

    if (status === 'approved' && leave.leave_type !== 'without_pay') {
      const session = await getCurrentSession(req.user.school_id);
      await ensureTeacherLeaveBalances(leave.teacher_id, session?.id || 0, tx);

      await sequelize.query(`
        UPDATE leave_balances
        SET used = used + :daysCount,
            remaining = remaining - :daysCount,
            updated_at = NOW()
        WHERE teacher_id = :teacherId
          AND session_id = (
            SELECT id
            FROM sessions
            WHERE school_id = :schoolId
            ORDER BY CASE WHEN is_current = true THEN 0 ELSE 1 END, start_date DESC
            LIMIT 1
          )
          AND leave_type = :leaveType;
      `, {
        replacements: {
          teacherId: leave.teacher_id,
          schoolId: req.user.school_id,
          leaveType: leave.leave_type,
          daysCount: leave.days_count,
        },
        transaction: tx,
      });
    }

    await tx.commit();

    await audit('teacher_leaves', Number(id), {
      field: 'status',
      oldValue: leave.status,
      newValue: status,
      reason: 'Admin reviewed leave application',
    }, req);

    res.ok({ id: Number(id), status }, 'Leave application reviewed.');
  } catch (err) {
    await tx.rollback();
    next(err);
  }
};

exports.correctionRequests = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        pcr.*,
        u.name AS teacher_name,
        reviewer.name AS reviewed_by_name
      FROM profile_correction_requests pcr
      JOIN users u ON u.id = pcr.user_id
      LEFT JOIN users reviewer ON reviewer.id = pcr.reviewed_by
      WHERE u.school_id = :schoolId
        AND u.role = 'teacher'
        AND u.is_deleted = false
      ORDER BY CASE WHEN pcr.status = 'pending' THEN 0 ELSE 1 END, pcr.created_at DESC;
    `, {
      replacements: {
        schoolId: req.user.school_id,
      },
    });

    res.ok({ requests: rows }, `${rows.length} correction request(s) found.`);
  } catch (err) { next(err); }
};

exports.reviewCorrectionRequest = async (req, res, next) => {
  const tx = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { status, review_note = null } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      await tx.rollback();
      return res.fail('status must be approved or rejected.', [], 422);
    }

    const [[request]] = await sequelize.query(`
      SELECT pcr.*
      FROM profile_correction_requests pcr
      JOIN users teacher ON teacher.id = pcr.user_id
      WHERE pcr.id = :id
        AND teacher.school_id = :schoolId
        AND teacher.role = 'teacher'
        AND teacher.is_deleted = false
      LIMIT 1;
    `, {
      replacements: {
        id,
        schoolId: req.user.school_id,
      },
      transaction: tx,
    });

    if (!request) {
      await tx.rollback();
      return res.fail('Correction request not found.', [], 404);
    }
    if (request.status !== 'pending') {
      await tx.rollback();
      return res.fail('Only pending correction requests can be reviewed.', [], 422);
    }

    const allowedFields = new Set(['phone', 'email', 'address', 'name', 'department', 'designation', 'joining_date', 'employee_id']);
    ['highest_qualification', 'specialization', 'university_name', 'graduation_year', 'years_of_experience'].forEach((field) => allowedFields.add(field));
    if (status === 'approved' && !allowedFields.has(request.field_name)) {
      await tx.rollback();
      return res.fail('This profile field cannot be updated from correction requests.', [], 422);
    }

    if (status === 'approved') {
      await sequelize.query(`
        UPDATE users
        SET ${request.field_name} = :requestedValue,
            updated_at = NOW()
        WHERE id = :userId;
      `, {
        replacements: {
          requestedValue: request.requested_value,
          userId: request.user_id,
        },
        transaction: tx,
      });
    }

    await sequelize.query(`
      UPDATE profile_correction_requests
      SET status = :status,
          reviewed_by = :reviewedBy,
          review_note = :reviewNote,
          reviewed_at = NOW(),
          updated_at = NOW()
      WHERE id = :id;
    `, {
      replacements: {
        id,
        status,
        reviewedBy: req.user.id,
        reviewNote: review_note,
      },
      transaction: tx,
    });

    await tx.commit();

    await audit('profile_correction_requests', Number(id), {
      field: 'status',
      oldValue: request.status,
      newValue: status,
      reason: 'Admin reviewed teacher profile correction request',
    }, req);

    res.ok({ id: Number(id), status }, 'Correction request reviewed.');
  } catch (err) {
    await tx.rollback();
    next(err);
  }
};

exports.attendance = async (req, res, next) => {
  try {
    const session = await getCurrentSession(req.user.school_id);
    const [rows] = await sequelize.query(`
      SELECT
        a.id,
        a.date,
        a.status,
        a.override_reason,
        a.marked_at,
        s.first_name,
        s.last_name,
        e.roll_number,
        c.name AS class_name,
        sec.name AS section_name,
        marker.name AS marked_by_name
      FROM attendance a
      JOIN enrollments e ON e.id = a.enrollment_id
      JOIN students s ON s.id = e.student_id
      JOIN classes c ON c.id = e.class_id
      JOIN sections sec ON sec.id = e.section_id
      LEFT JOIN users marker ON marker.id = a.marked_by
      WHERE e.session_id = :sessionId
      ORDER BY a.date DESC, c.name ASC, sec.name ASC, e.roll_number ASC
      LIMIT 300;
    `, { replacements: { sessionId: session?.id || 0 } });

    res.ok({ attendance: rows }, `${rows.length} attendance record(s) found.`);
  } catch (err) { next(err); }
};

exports.updateAttendance = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    requireFields(req.body, ['status', 'reason']);

    const [[record]] = await sequelize.query(`
      SELECT id, status, override_reason
      FROM attendance
      WHERE id = :id
      LIMIT 1;
    `, { replacements: { id } });
    if (!record) return res.fail('Attendance record not found.', [], 404);

    await sequelize.query(`
      UPDATE attendance
      SET status = :status,
          override_reason = :reason,
          marked_by = :markedBy,
          marked_at = NOW(),
          updated_at = NOW()
      WHERE id = :id;
    `, {
      replacements: {
        id,
        status,
        reason,
        markedBy: req.user.id,
      },
    });

    await audit('attendance', Number(id), {
      field: 'status',
      oldValue: record.status,
      newValue: status,
      reason: `Admin override: ${reason}`,
    }, req);

    res.ok({ id: Number(id), status }, 'Attendance updated by admin.');
  } catch (err) { next(err); }
};

exports.marks = async (req, res, next) => {
  try {
    const session = await getCurrentSession(req.user.school_id);
    const [rows] = await sequelize.query(`
      SELECT
        er.id,
        er.exam_id,
        er.enrollment_id,
        er.subject_id,
        er.marks_obtained,
        er.grade,
        er.is_absent,
        er.is_pass,
        er.override_reason,
        ex.name AS exam_name,
        s.first_name,
        s.last_name,
        e.roll_number,
        c.name AS class_name,
        sec.name AS section_name,
        sub.name AS subject_name
      FROM exam_results er
      JOIN exams ex ON ex.id = er.exam_id
      JOIN enrollments e ON e.id = er.enrollment_id
      JOIN students s ON s.id = e.student_id
      JOIN classes c ON c.id = e.class_id
      JOIN sections sec ON sec.id = e.section_id
      JOIN subjects sub ON sub.id = er.subject_id
      WHERE e.session_id = :sessionId
      ORDER BY ex.id DESC, c.name ASC, sec.name ASC, e.roll_number ASC
      LIMIT 300;
    `, { replacements: { sessionId: session?.id || 0 } });

    res.ok({ marks: rows }, `${rows.length} mark record(s) found.`);
  } catch (err) { next(err); }
};

exports.updateMark = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { marks_obtained, is_absent = false, reason } = req.body;
    requireFields(req.body, ['reason']);

    const [[record]] = await sequelize.query(`
      SELECT er.id, er.marks_obtained, er.is_absent, er.subject_id, er.exam_id, ex.total_marks
      FROM exam_results er
      JOIN exams ex ON ex.id = er.exam_id
      WHERE er.id = :id
      LIMIT 1;
    `, { replacements: { id } });
    if (!record) return res.fail('Mark record not found.', [], 404);

    if (!is_absent && (marks_obtained === undefined || marks_obtained === null || Number(marks_obtained) < 0 || Number(marks_obtained) > Number(record.total_marks))) {
      return res.fail('marks_obtained must be within valid exam range.', [], 422);
    }

    await sequelize.query(`
      UPDATE exam_results
      SET marks_obtained = :marksObtained,
          is_absent = :isAbsent,
          override_reason = :reason,
          entered_by = :enteredBy,
          updated_at = NOW()
      WHERE id = :id;
    `, {
      replacements: {
        id,
        marksObtained: is_absent ? null : marks_obtained,
        isAbsent: Boolean(is_absent),
        reason,
        enteredBy: req.user.id,
      },
    });

    await audit('exam_results', Number(id), {
      field: 'marks_obtained',
      oldValue: record.marks_obtained,
      newValue: is_absent ? 'ABSENT' : marks_obtained,
      reason: `Admin override: ${reason}`,
    }, req);

    res.ok({ id: Number(id) }, 'Marks updated by admin.');
  } catch (err) { next(err); }
};

exports.remarks = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        sr.id,
        sr.student_id,
        sr.teacher_id,
        sr.remark_type,
        sr.remark_text,
        sr.visibility,
        sr.is_edited,
        sr.is_deleted,
        sr.created_at,
        t.name AS teacher_name,
        s.first_name,
        s.last_name,
        e.roll_number,
        c.name AS class_name,
        sec.name AS section_name
      FROM student_remarks sr
      JOIN students s ON s.id = sr.student_id
      JOIN enrollments e ON e.id = sr.enrollment_id
      JOIN classes c ON c.id = e.class_id
      JOIN sections sec ON sec.id = e.section_id
      JOIN users t ON t.id = sr.teacher_id
      WHERE sr.is_deleted = false
      ORDER BY sr.created_at DESC
      LIMIT 300;
    `);

    res.ok({ remarks: rows }, `${rows.length} remark(s) found.`);
  } catch (err) { next(err); }
};

exports.updateRemark = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { remark_text, visibility, reason } = req.body;
    requireFields(req.body, ['remark_text', 'reason']);

    const [[record]] = await sequelize.query(`
      SELECT id, remark_text, visibility
      FROM student_remarks
      WHERE id = :id AND is_deleted = false
      LIMIT 1;
    `, { replacements: { id } });
    if (!record) return res.fail('Remark not found.', [], 404);

    await sequelize.query(`
      UPDATE student_remarks
      SET remark_text = :remarkText,
          visibility = COALESCE(:visibility, visibility),
          is_edited = true,
          edited_at = NOW(),
          updated_at = NOW()
      WHERE id = :id;
    `, {
      replacements: {
        id,
        remarkText: remark_text,
        visibility: visibility || null,
      },
    });

    await audit('student_remarks', Number(id), {
      field: 'remark_text',
      oldValue: record.remark_text,
      newValue: remark_text,
      reason: `Admin override: ${reason}`,
    }, req);

    res.ok({ id: Number(id) }, 'Remark updated by admin.');
  } catch (err) { next(err); }
};
