'use strict';

/**
 * Seeder: demo-school-and-sessions
 * Creates:
 *  - 1 school
 *  - 2 sessions (one closed, one active/current)
 *  - working days for each session
 *  - 3 holidays (national, regional, school-level)
 */

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    // ── 1. School ────────────────────────────────────────────────────────
    await queryInterface.bulkInsert('schools', [
      {
        name        : 'Greenwood Academy',
        branch_name : 'Main Campus',
        address     : '12 Education Lane, Guwahati, Assam 781001',
        phone       : '+91-361-2345678',
        email       : 'admin@greenwoodacademy.edu.in',
        is_active   : true,
        created_at  : now,
        updated_at  : now,
      },
    ]);

    // Fetch the inserted school's id
    const [schools] = await queryInterface.sequelize.query(
      `SELECT id FROM schools WHERE email = 'admin@greenwoodacademy.edu.in' LIMIT 1;`
    );
    const schoolId = schools[0].id;

    // ── 2. Sessions ──────────────────────────────────────────────────────
    await queryInterface.bulkInsert('sessions', [
      {
        school_id  : schoolId,
        name       : '2023-2024',
        start_date : '2023-04-01',
        end_date   : '2024-03-31',
        status     : 'closed',
        is_current : false,
        created_by : null,
        created_at : now,
        updated_at : now,
      },
      {
        school_id  : schoolId,
        name       : '2024-2025',
        start_date : '2024-04-01',
        end_date   : '2025-03-31',
        status     : 'active',
        is_current : true,     // ← current session
        created_by : null,
        created_at : now,
        updated_at : now,
      },
    ]);

    // Fetch both session IDs
    const [sessions] = await queryInterface.sequelize.query(
      `SELECT id, name FROM sessions WHERE school_id = ${schoolId} ORDER BY id ASC;`
    );
    const session2023 = sessions[0].id;
    const session2024 = sessions[1].id;

    // ── 3. Working Days ──────────────────────────────────────────────────
    await queryInterface.bulkInsert('session_working_days', [
      {
        // 2023-2024: Mon–Sat working week
        session_id : session2023,
        monday     : true,
        tuesday    : true,
        wednesday  : true,
        thursday   : true,
        friday     : true,
        saturday   : true,
        sunday     : false,
      },
      {
        // 2024-2025: Mon–Fri only
        session_id : session2024,
        monday     : true,
        tuesday    : true,
        wednesday  : true,
        thursday   : true,
        friday     : true,
        saturday   : false,
        sunday     : false,
      },
    ]);

    // ── 4. Holidays (all in current session 2024-2025) ───────────────────
    await queryInterface.bulkInsert('session_holidays', [
      {
        session_id   : session2024,
        holiday_date : '2024-08-15',
        name         : 'Independence Day',
        type         : 'national',
        added_by     : null,
        created_at   : now,
      },
      {
        session_id   : session2024,
        holiday_date : '2024-11-01',
        name         : 'Assam Foundation Day',
        type         : 'regional',
        added_by     : null,
        created_at   : now,
      },
      {
        session_id   : session2024,
        holiday_date : '2025-01-26',
        name         : 'Republic Day',
        type         : 'national',
        added_by     : null,
        created_at   : now,
      },
    ]);
  },

  async down(queryInterface) {
    // Delete in reverse FK order
    await queryInterface.bulkDelete('session_holidays', null, {});
    await queryInterface.bulkDelete('session_working_days', null, {});
    await queryInterface.bulkDelete('sessions', null, {});
    await queryInterface.bulkDelete('schools', null, {});
  },
};