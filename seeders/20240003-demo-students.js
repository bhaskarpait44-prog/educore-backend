'use strict';

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    // Get school id seeded in step 2
    const [schools] = await queryInterface.sequelize.query(
      `SELECT id FROM schools LIMIT 1;`
    );
    const schoolId = schools[0].id;

    // ── 5 students ────────────────────────────────────────────────────────
    await queryInterface.bulkInsert('students', [
      {
        school_id     : schoolId,
        admission_no  : 'GWA-2024-001',
        first_name    : 'Priya',
        last_name     : 'Sharma',
        date_of_birth : '2010-03-15',
        gender        : 'female',
        is_deleted    : false,
        created_at    : now,
        updated_at    : now,
      },
      {
        school_id     : schoolId,
        admission_no  : 'GWA-2024-002',
        first_name    : 'Rahul',
        last_name     : 'Das',
        date_of_birth : '2009-11-22',
        gender        : 'male',
        is_deleted    : false,
        created_at    : now,
        updated_at    : now,
      },
      {
        school_id     : schoolId,
        admission_no  : 'GWA-2024-003',
        first_name    : 'Anjali',
        last_name     : 'Borah',
        date_of_birth : '2011-06-08',
        gender        : 'female',
        is_deleted    : false,
        created_at    : now,
        updated_at    : now,
      },
      {
        school_id     : schoolId,
        admission_no  : 'GWA-2024-004',
        first_name    : 'Rohan',
        last_name     : 'Gogoi',
        date_of_birth : '2010-09-30',
        gender        : 'male',
        is_deleted    : false,
        created_at    : now,
        updated_at    : now,
      },
      {
        school_id     : schoolId,
        admission_no  : 'GWA-2024-005',
        first_name    : 'Meena',
        last_name     : 'Kalita',
        date_of_birth : '2011-01-17',
        gender        : 'female',
        is_deleted    : false,
        created_at    : now,
        updated_at    : now,
      },
    ]);

    // ── Seed 3 audit log examples (simulating past admin changes) ─────────
    const [students] = await queryInterface.sequelize.query(
      `SELECT id, first_name FROM students WHERE school_id = ${schoolId} ORDER BY id LIMIT 3;`
    );
    const s1 = students[0].id;
    const s2 = students[1].id;
    const s3 = students[2].id;

    await queryInterface.bulkInsert('audit_logs', [
      // ── Example 1: Name change ─────────────────────────────────────────
      {
        table_name  : 'students',
        record_id   : s1,
        field_name  : 'first_name',
        old_value   : 'Priya',
        new_value   : 'Priyanka',           // Hypothetical correction
        changed_by  : null,                 // null = seeded by system
        reason      : 'Name corrected as per birth certificate submitted by parent',
        ip_address  : '192.168.1.10',
        device_info : 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0',
        created_at  : new Date('2024-05-10T09:23:00Z'),
      },

      // ── Example 2: Date of birth change ───────────────────────────────
      {
        table_name  : 'students',
        record_id   : s2,
        field_name  : 'date_of_birth',
        old_value   : '2009-11-22',
        new_value   : '2009-11-12',         // Day corrected
        changed_by  : null,
        reason      : 'DOB corrected after original birth certificate verification by admin',
        ip_address  : '192.168.1.10',
        device_info : 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0',
        created_at  : new Date('2024-05-11T11:05:00Z'),
      },

      // ── Example 3: Gender change ───────────────────────────────────────
      {
        table_name  : 'students',
        record_id   : s3,
        field_name  : 'gender',
        old_value   : 'male',
        new_value   : 'female',             // Data entry error corrected
        changed_by  : null,
        reason      : 'Gender entry error corrected — data entry mistake during admission',
        ip_address  : '10.0.0.5',
        device_info : 'Mozilla/5.0 (Macintosh) Safari/17.0',
        created_at  : new Date('2024-05-12T14:47:00Z'),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('audit_logs', { table_name: 'students' }, {});
    await queryInterface.bulkDelete('students', null, {});
  },
};