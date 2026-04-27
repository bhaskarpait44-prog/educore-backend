'use strict';

const sequelize = require('../config/database');
const { getAttendancePercent } = require('../utils/attendanceCalculator');

function parseOptionalInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) return null;
  return Number(normalized);
}

// ── POST /api/attendance/mark ─────────────────────────────────────────────────
exports.markSingle = async (req, res, next) => {
  try {
    const { enrollment_id, date, status, method } = req.body;

    const [[existing]] = await sequelize.query(`
      SELECT id FROM attendance WHERE enrollment_id = :enrollment_id AND date = :date;
    `, { replacements: { enrollment_id, date } });

    if (existing) {
      return res.fail('Attendance already marked for this date. Use PATCH to override.', [], 409);
    }

    const [[record]] = await sequelize.query(`
      INSERT INTO attendance (enrollment_id, date, status, method, marked_by, marked_at, created_at, updated_at)
      VALUES (:enrollment_id, :date, :status, :method, :marked_by, NOW(), NOW(), NOW())
      RETURNING id, enrollment_id, date, status, method;
    `, { replacements: { enrollment_id, date, status, method, marked_by: req.user.id } });

    res.ok(record, 'Attendance marked.', 201);
  } catch (err) { next(err); }
};

// ── POST /api/attendance/bulk ─────────────────────────────────────────────────
exports.markBulk = async (req, res, next) => {
  try {
    const { date, records } = req.body;

    const inserted = [];
    const updated  = [];

    await sequelize.transaction(async (t) => {
      for (const rec of records) {
        const [[existing]] = await sequelize.query(`
          SELECT id, status FROM attendance WHERE enrollment_id = :eid AND date = :date;
        `, { replacements: { eid: rec.enrollment_id, date }, transaction: t });

        if (existing) {
          await sequelize.query(`
            UPDATE attendance
            SET status = :status,
                method = 'manual',
                marked_by = :marked_by,
                marked_at = NOW(),
                updated_at = NOW()
            WHERE id = :id;
          `, {
            replacements: {
              id: existing.id,
              status: rec.status,
              marked_by: req.user.id,
            },
            transaction: t,
          });

          updated.push(rec.enrollment_id);
          continue;
        }

        await sequelize.query(`
          INSERT INTO attendance (enrollment_id, date, status, method, marked_by, marked_at, created_at, updated_at)
          VALUES (:eid, :date, :status, 'manual', :marked_by, NOW(), NOW(), NOW());
        `, { replacements: { eid: rec.enrollment_id, date, status: rec.status, marked_by: req.user.id }, transaction: t });

        inserted.push(rec.enrollment_id);
      }
    });

    res.ok({
      date,
      marked  : inserted.length,
      updated : updated.length,
      skipped : 0,
      updated_enrollment_ids: updated,
    }, `${inserted.length} record(s) marked. ${updated.length} updated.`);
  } catch (err) { next(err); }
};

// ── GET /api/attendance/:enrollment_id ────────────────────────────────────────
exports.getByEnrollment = async (req, res, next) => {
  try {
    const { enrollment_id } = req.params;
    const { from, to } = req.query;

    let dateFilter = '';
    if (from && to) dateFilter = `AND a.date BETWEEN '${from}' AND '${to}'`;

    const [records] = await sequelize.query(`
      SELECT a.id, a.date, a.status, a.method, a.marked_at, a.override_reason
      FROM attendance a
      WHERE a.enrollment_id = :eid ${dateFilter}
      ORDER BY a.date DESC;
    `, { replacements: { eid: enrollment_id } });

    const stats = await getAttendancePercent(parseInt(enrollment_id));

    res.ok({ records, summary: stats }, `${records.length} attendance record(s) retrieved.`);
  } catch (err) { next(err); }
};

// ── GET /api/attendance/report/:session_id ────────────────────────────────────
exports.sessionReport = async (req, res, next) => {
  try {
    const { session_id } = req.params;
    const parsedSessionId = parseOptionalInteger(session_id);
    const parsedClassId = parseOptionalInteger(req.query.class_id);
    const parsedSectionId = parseOptionalInteger(req.query.section_id);

    if (parsedSessionId == null) {
      return res.fail('session_id must be a valid integer.', [], 422);
    }

    const [rows] = await sequelize.query(`
      SELECT
        e.id AS enrollment_id,
        s.admission_no,
        s.first_name,
        s.last_name,
        s.first_name || ' ' || s.last_name   AS student_name,
        c.name   AS class,
        sec.name AS section,
        e.roll_number,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', a.id,
              'date', a.date,
              'status', a.status,
              'method', a.method,
              'override_reason', a.override_reason
            )
            ORDER BY a.date
          ) FILTER (WHERE a.id IS NOT NULL),
          '[]'::json
        ) AS attendance,
        COUNT(*) FILTER (WHERE a.status = 'present')  AS present,
        COUNT(*) FILTER (WHERE a.status = 'absent')   AS absent,
        COUNT(*) FILTER (WHERE a.status = 'late')     AS late,
        COUNT(*) FILTER (WHERE a.status = 'half_day') AS half_day,
        COUNT(*) FILTER (WHERE a.status = 'holiday')  AS holiday,
        ROUND(
          (
            (
              COUNT(*) FILTER (WHERE a.status IN ('present','late'))
              + COUNT(*) FILTER (WHERE a.status = 'half_day') * 0.5
            )::numeric
            / NULLIF((COUNT(*) FILTER (WHERE a.status != 'holiday'))::numeric, 0)
          ) * 100,
          2
        ) AS percentage
      FROM enrollments e
      JOIN students  s   ON s.id   = e.student_id
      JOIN classes   c   ON c.id   = e.class_id
      JOIN sections  sec ON sec.id = e.section_id
      LEFT JOIN attendance a ON a.enrollment_id = e.id
      WHERE e.session_id = :session_id
        AND e.status = 'active'
        AND (:class_id IS NULL OR e.class_id = :class_id)
        AND (:section_id IS NULL OR e.section_id = :section_id)
      GROUP BY e.id, s.admission_no, s.first_name, s.last_name, c.name, sec.name, c.order_number
      ORDER BY
        c.order_number,
        sec.name,
        COALESCE(NULLIF(REGEXP_REPLACE(e.roll_number, '\D', '', 'g'), ''), '999999')::integer,
        e.roll_number,
        s.admission_no;
    `, {
      replacements: {
        session_id: parsedSessionId,
        class_id: parsedClassId,
        section_id: parsedSectionId,
      },
    });

    res.ok(rows, `Attendance report for ${rows.length} student(s).`);
  } catch (err) { next(err); }
};

// ── PATCH /api/attendance/:id ─────────────────────────────────────────────────
exports.override = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, override_reason } = req.body;

    const [[updated]] = await sequelize.query(`
      UPDATE attendance SET
        status          = :status,
        override_reason = :reason,
        marked_by       = :markedBy,
        marked_at       = NOW(),
        updated_at      = NOW()
      WHERE id = :id
      RETURNING id, enrollment_id, date, status, override_reason;
    `, { replacements: { status, reason: override_reason, markedBy: req.user.id, id } });

    if (!updated) return res.fail('Attendance record not found.', [], 404);
    res.ok(updated, 'Attendance overridden.');
  } catch (err) { next(err); }
};
