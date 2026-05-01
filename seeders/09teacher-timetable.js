'use strict';

/**
 * Seed: timetable_slots
 *
 * Schedule: Monday–Saturday, 7 periods per day
 * Period times:
 *   P1  08:00–08:45
 *   P2  08:45–09:30
 *   P3  09:30–10:15
 *   --- Break 10:15–10:30 ---
 *   P4  10:30–11:15
 *   P5  11:15–12:00
 *   --- Lunch 12:00–12:30 ---
 *   P6  12:30–13:15
 *   P7  13:15–14:00
 *
 * Strategy:
 *   Class 1–5   : class teacher teaches all subjects, rotated across periods/days
 *   Class 6–12  : each subject gets its own teacher, distributed evenly
 *
 * Each subject gets ~6 periods/week (7 periods × 6 days = 42 slots ÷ 7 subjects ≈ 6)
 */

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday'];

const PERIODS = [
  { period: 1, start: '08:00:00', end: '08:45:00' },
  { period: 2, start: '08:45:00', end: '09:30:00' },
  { period: 3, start: '09:30:00', end: '10:15:00' },
  { period: 4, start: '10:30:00', end: '11:15:00' },
  { period: 5, start: '11:15:00', end: '12:00:00' },
  { period: 6, start: '12:30:00', end: '13:15:00' },
  { period: 7, start: '13:15:00', end: '14:00:00' },
];

// 42 slots per week distributed across 7 subjects → each subject gets exactly 6 periods
// Pattern: for each day, assign subjects in a rotating order so no subject
// repeats on the same day and distribution is even.
//
// Day rotation offsets (0-indexed subject index shift per day):
//   Mon: 0,1,2,3,4,5,6
//   Tue: 1,2,3,4,5,6,0
//   Wed: 2,3,4,5,6,0,1
//   Thu: 3,4,5,6,0,1,2
//   Fri: 4,5,6,0,1,2,3
//   Sat: 5,6,0,1,2,3,4  (only 7 periods — each subject gets 1 per day × 6 days = 6)

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    // ── Fetch reference data ──────────────────────────────────────────────
    const [[school]] = await queryInterface.sequelize.query(
      `SELECT id FROM schools ORDER BY id ASC LIMIT 1;`
    );
    if (!school) { console.warn('No school found.'); return; }

    const [[session]] = await queryInterface.sequelize.query(
      `SELECT id FROM sessions WHERE school_id = ${school.id} ORDER BY id DESC LIMIT 1;`
    );
    if (!session) { console.warn('No session found.'); return; }
    const sessionId = session.id;

    const [sections] = await queryInterface.sequelize.query(`
      SELECT s.id   AS section_id,
             s.name AS section_name,
             c.id   AS class_id,
             c.order_number,
             c.stream
      FROM   sections s
      JOIN   classes  c ON c.id = s.class_id
      WHERE  s.is_deleted = false AND c.is_deleted = false
      ORDER  BY c.order_number ASC, c.stream ASC, s.name ASC;
    `);

    // subjects per class, ordered
    const [allSubjects] = await queryInterface.sequelize.query(`
      SELECT id, class_id, name, code
      FROM   subjects
      WHERE  is_deleted = false
      ORDER  BY class_id ASC, order_number ASC;
    `);

    // teacher assignments: class+section+subject → teacher_id
    const [assignments] = await queryInterface.sequelize.query(`
      SELECT teacher_id, class_id, section_id, subject_id
      FROM   teacher_assignments
      WHERE  session_id = ${sessionId}
        AND  is_active  = true
        AND  is_class_teacher = false
        AND  subject_id IS NOT NULL;
    `);

    // Build lookup: `${classId}-${sectionId}-${subjectId}` → teacher_id
    const assignmentMap = {};
    assignments.forEach((a) => {
      assignmentMap[`${a.class_id}-${a.section_id}-${a.subject_id}`] = a.teacher_id;
    });

    // Build subject list per class_id
    const subjectsByClass = {};
    allSubjects.forEach((s) => {
      if (!subjectsByClass[s.class_id]) subjectsByClass[s.class_id] = [];
      subjectsByClass[s.class_id].push(s);
    });

    // ── Build timetable rows ──────────────────────────────────────────────
    const rows = [];

    for (const sec of sections) {
      const { section_id, class_id, order_number: grade } = sec;
      const classSubjects = subjectsByClass[class_id] || [];

      if (!classSubjects.length) {
        console.warn(`No subjects for class_id=${class_id}`);
        continue;
      }

      // Room number: Grade + Section (e.g. "6-A", "11-A")
      const room = `${grade}-${sec.section_name}`;

      // Assign subjects to 42 slots (6 days × 7 periods) using rotation
      // so each subject appears exactly 6 times (once per day)
      for (let dayIdx = 0; dayIdx < DAYS.length; dayIdx++) {
        const day = DAYS[dayIdx];

        for (let pIdx = 0; pIdx < PERIODS.length; pIdx++) {
          const { period, start, end } = PERIODS[pIdx];

          // Rotate subject assignment: shift by dayIdx so no subject repeats on same day
          const subjectIdx   = (dayIdx + pIdx) % classSubjects.length;
          const subject      = classSubjects[subjectIdx];
          const teacherId    = assignmentMap[`${class_id}-${section_id}-${subject.id}`];

          if (!teacherId) {
            console.warn(`No teacher assigned for class=${class_id} section=${section_id} subject=${subject.id}`);
            continue;
          }

          rows.push({
            session_id    : sessionId,
            class_id,
            section_id,
            teacher_id    : teacherId,
            subject_id    : subject.id,
            day_of_week   : day,
            period_number : period,
            start_time    : start,
            end_time      : end,
            room_number   : room,
            is_active     : true,
          });
        }
      }
    }

    // Insert in batches of 500 to avoid hitting query size limits
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      await queryInterface.bulkInsert('timetable_slots', rows.slice(i, i + BATCH));
    }

    console.log(`\n[seed-timetable] Inserted ${rows.length} timetable slots.`);
    console.log(`  Sections : ${sections.length}`);
    console.log(`  Days     : 6 (Mon–Sat)`);
    console.log(`  Periods  : 7 per day`);
    console.log(`  Slots/section : 42\n`);
  },

  async down(queryInterface) {
    const [[school]] = await queryInterface.sequelize.query(
      `SELECT id FROM schools ORDER BY id ASC LIMIT 1;`
    );
    if (!school) return;

    const [[session]] = await queryInterface.sequelize.query(
      `SELECT id FROM sessions WHERE school_id = ${school.id} ORDER BY id DESC LIMIT 1;`
    );
    if (!session) return;

    await queryInterface.bulkDelete('timetable_slots', {
      session_id: session.id,
    });

    console.log('[seed-timetable] Timetable slots removed.');
  },
};