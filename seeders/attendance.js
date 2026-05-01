'use strict';

/**
 * Seed: attendance
 *
 * Fills attendance from 2026-04-01 to today for all active enrollments.
 * School days: Monday–Saturday (no Sundays).
 * Realistic distribution per student:
 *   85% present, 8% absent, 4% late, 2% half_day, 1% holiday
 * 2nd Saturday of each month = holiday.
 * Method: manual (teacher-marked).
 */

const START_DATE = new Date('2026-04-01');

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

// Seeded pseudo-random so data is deterministic
function seededRand(seed) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function pickStatus(rand) {
  const r = rand();
  if (r < 0.85) return 'present';
  if (r < 0.93) return 'absent';
  if (r < 0.97) return 'late';
  if (r < 0.99) return 'half_day';
  return 'present'; // fallback (holiday handled at day level)
}

// 2nd Saturday of a month
function isSecondSaturday(date) {
  if (date.getDay() !== 6) return false;
  const day = date.getDate();
  return day >= 8 && day <= 14;
}

// Collect all school days in range
function getSchoolDays(start, end) {
  const days = [];
  let cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0) { // exclude Sunday
      days.push({ dateStr: toDateStr(cur), isHoliday: isSecondSaturday(cur) });
    }
    cur = addDays(cur, 1);
  }
  return days;
}

module.exports = {
  async up(queryInterface) {
    const now   = new Date();
    const today = new Date(toDateStr(now)); // strip time

    const schoolDays = getSchoolDays(START_DATE, today);
    if (!schoolDays.length) { console.warn('No school days in range.'); return; }

    console.log(`\n[seed-attendance] Date range : 2026-04-01 → ${toDateStr(today)}`);
    console.log(`[seed-attendance] School days: ${schoolDays.length}`);

    // ── Fetch all active enrollments with a teacher (marked_by) ──────────
    const [enrollments] = await queryInterface.sequelize.query(`
      SELECT e.id AS enrollment_id,
             e.student_id,
             e.session_id,
             e.class_id,
             e.section_id
      FROM   enrollments e
      WHERE  e.status = 'active'
      ORDER  BY e.id ASC;
    `);

    if (!enrollments.length) { console.warn('No active enrollments found.'); return; }

    // Fetch one teacher per section to use as marked_by
    const [sectionTeachers] = await queryInterface.sequelize.query(`
      SELECT DISTINCT ON (section_id)
             section_id, teacher_id
      FROM   teacher_assignments
      WHERE  is_class_teacher = true AND is_active = true
      ORDER  BY section_id ASC, teacher_id ASC;
    `);

    const teacherBySection = {};
    sectionTeachers.forEach((r) => {
      teacherBySection[r.section_id] = r.teacher_id;
    });

    console.log(`[seed-attendance] Enrollments: ${enrollments.length}`);
    console.log(`[seed-attendance] Building rows (${enrollments.length} × ${schoolDays.length} = ${enrollments.length * schoolDays.length} max)...\n`);

    // ── Build rows in batches ─────────────────────────────────────────────
    const BATCH = 1000;
    let totalInserted = 0;

    // Process day by day to keep memory manageable
    for (let dIdx = 0; dIdx < schoolDays.length; dIdx++) {
      const { dateStr, isHoliday } = schoolDays[dIdx];
      const markedAt = `${dateStr}T09:00:00.000Z`;
      const batch    = [];

      for (const enr of enrollments) {
        const teacherId = teacherBySection[enr.section_id] || null;

        let status, method;

        if (isHoliday) {
          status = 'holiday';
          method = 'manual';
        } else {
          // Deterministic random per student per day
          const seed = enr.enrollment_id * 10000 + dIdx;
          const rand = seededRand(seed);
          status = pickStatus(rand);
          method = 'manual';
        }

        batch.push({
          enrollment_id   : enr.enrollment_id,
          date            : dateStr,
          status,
          method,
          marked_by       : teacherId,
          marked_at       : markedAt,
          override_reason : null,
          created_at      : now,
          updated_at      : now,
        });
      }

      // Insert this day's batch in chunks
      for (let i = 0; i < batch.length; i += BATCH) {
        await queryInterface.bulkInsert('attendance', batch.slice(i, i + BATCH));
      }

      totalInserted += batch.length;

      // Progress every 10 days
      if (dIdx % 10 === 0 || dIdx === schoolDays.length - 1) {
        process.stdout.write(`\r  Progress: day ${dIdx + 1}/${schoolDays.length} — ${totalInserted.toLocaleString()} rows inserted`);
      }
    }

    console.log(`\n\n[seed-attendance] Done. Total rows: ${totalInserted.toLocaleString()}`);
    console.log(`  Present   ~85% | Absent ~8% | Late ~4% | Half-day ~2%`);
    console.log(`  2nd Saturday of each month marked as holiday\n`);
  },

  async down(queryInterface) {
    const [enrollments] = await queryInterface.sequelize.query(`
      SELECT id FROM enrollments WHERE status = 'active';
    `);

    if (!enrollments.length) return;

    const ids = enrollments.map((e) => e.id);

    // Delete in chunks to avoid query size limits
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      await queryInterface.sequelize.query(`
        DELETE FROM attendance
        WHERE enrollment_id IN (${ids.slice(i, i + CHUNK).join(',')})
          AND date >= '2026-04-01';
      `);
    }

    console.log('[seed-attendance] Attendance records removed.');
  },
};