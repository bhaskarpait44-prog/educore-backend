'use strict';

/**
 * Seeder: demo-attendance
 *
 * Seeds one month of attendance (April 2024) for all 5 students.
 * April 2024 working days: Mon–Fri only = 22 days
 * Declared holidays in seed data: none in April yet
 *   (we'll add one retroactively to demonstrate Function 3)
 *
 * Student scenarios:
 *   Priya   (Grade 3-A) → 20/22 present = 90.9%  (2 absences)
 *   Rahul   (Grade 2-B) → 15/22 = 68.2%          (4 absent, 2 late, 1 half_day)
 *   Anjali  (Grade 4-A) → 22/22 = 100%            (perfect attendance)
 *   Rohan   (Grade 2-B) → 18/22 = 82.7%           (3 absent, 1 half_day)
 *   Meena   (Grade 1-A) → 19/22 = 86.4%           (2 absent, 1 late)
 */

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    // ── Fetch all active enrollments ────────────────────────────────────
    const [enrollments] = await queryInterface.sequelize.query(`
      SELECT e.id, s.admission_no, e.joined_date
      FROM enrollments e
      JOIN students s ON s.id = e.student_id
      WHERE e.status = 'active'
      ORDER BY s.admission_no ASC;
    `);

    // Map admission_no → enrollment_id
    const eMap = {};
    enrollments.forEach(e => { eMap[e.admission_no] = e.id; });

    const e1 = eMap['GWA-2024-001']; // Priya   — Grade 3-A
    const e2 = eMap['GWA-2024-002']; // Rahul   — Grade 2-B
    const e3 = eMap['GWA-2024-003']; // Anjali  — Grade 4-A
    const e4 = eMap['GWA-2024-004']; // Rohan   — Grade 2-B
    const e5 = eMap['GWA-2024-005']; // Meena   — Grade 1-A

    // ── Build working days for April 2024 (Mon–Fri) ──────────────────────
    // April 1 2024 = Monday. April 30 = Tuesday.
    // Weekends: 6,7,13,14,20,21,27,28 April → 8 weekend days
    // Working days: 30 - 8 = 22 days
    const aprilWorkingDays = [
      '2024-04-01','2024-04-02','2024-04-03','2024-04-04','2024-04-05',
      '2024-04-08','2024-04-09','2024-04-10','2024-04-11','2024-04-12',
      '2024-04-15','2024-04-16','2024-04-17','2024-04-18','2024-04-19',
      '2024-04-22','2024-04-23','2024-04-24','2024-04-25','2024-04-26',
      '2024-04-29','2024-04-30',
    ];

    /**
     * Per-student attendance plan.
     * Keys are dates with non-present status.
     * All other working days default to present/manual.
     */
    const attendancePlan = {
      // ── Priya: 2 absences → 20/22 = 90.9% ──────────────────────────
      [e1]: {
        '2024-04-10' : { status: 'absent',   method: 'manual' },
        '2024-04-22' : { status: 'absent',   method: 'manual' },
      },

      // ── Rahul: 4 absent, 2 late, 1 half_day ─────────────────────────
      // effective = 15 + 2 + 0.5 = 17.5 / 22 = 79.5% ... wait let me recount
      // present=15, late=2, half_day=1, absent=4
      // effective = 15×1 + 2×1 + 1×0.5 = 17.5 / 22 = 79.5%
      [e2]: {
        '2024-04-03' : { status: 'absent',   method: 'manual' },
        '2024-04-08' : { status: 'late',     method: 'manual' },
        '2024-04-12' : { status: 'absent',   method: 'manual' },
        '2024-04-16' : { status: 'half_day', method: 'manual' },
        '2024-04-19' : { status: 'late',     method: 'manual' },
        '2024-04-24' : { status: 'absent',   method: 'manual' },
        '2024-04-29' : { status: 'absent',   method: 'manual' },
      },

      // ── Anjali: Perfect attendance ───────────────────────────────────
      [e3]: {},

      // ── Rohan: 3 absent, 1 half_day ─────────────────────────────────
      // effective = 18 + 0.5 = 18.5 / 22 = 84.1%
      [e4]: {
        '2024-04-04' : { status: 'absent',   method: 'manual' },
        '2024-04-11' : { status: 'half_day', method: 'manual' },
        '2024-04-17' : { status: 'absent',   method: 'manual' },
        '2024-04-26' : { status: 'absent',   method: 'manual' },
      },

      // ── Meena: 2 absent, 1 late ──────────────────────────────────────
      // effective = 19 + 1 = 20 / 22 = 90.9%
      [e5]: {
        '2024-04-09' : { status: 'absent',   method: 'manual' },
        '2024-04-18' : { status: 'late',     method: 'manual' },
        '2024-04-25' : { status: 'absent',   method: 'manual' },
      },
    };

    // ── Build insert rows ─────────────────────────────────────────────────
    const rows = [];

    for (const [enrollmentId, exceptions] of Object.entries(attendancePlan)) {
      for (const date of aprilWorkingDays) {
        const override = exceptions[date];
        rows.push({
          enrollment_id   : parseInt(enrollmentId, 10),
          date,
          status          : override ? override.status : 'present',
          method          : override ? override.method : 'manual',
          marked_by       : null,
          marked_at       : new Date(`${date}T08:30:00Z`),
          override_reason : null,
          created_at      : now,
          updated_at      : now,
        });
      }
    }

    await queryInterface.bulkInsert('attendance', rows);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('attendance', null, {});
  },
};