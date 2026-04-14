'use strict';

/**
 * Seeder: demo-student-profiles
 *
 * Creates 3 profile versions for student GWA-2024-001 (Priya Sharma):
 *
 *   Version 1 (2024-04-01 → 2024-06-14): Initial address on admission
 *   Version 2 (2024-06-15 → 2024-11-02): Family moved within Guwahati
 *   Version 3 (2024-11-03 → NULL)      : Family relocated to Jorhat (current)
 */

module.exports = {
  async up(queryInterface) {

    // Get Priya Sharma's student id (first student seeded)
    const [students] = await queryInterface.sequelize.query(
      `SELECT id FROM students WHERE admission_no = 'GWA-2024-001' LIMIT 1;`
    );
    const studentId = students[0].id;

    // ── Base profile data (same across all versions) ──────────────────────
    const base = {
      student_id        : studentId,
      phone             : '91-9876543210',
      email             : 'priya.sharma@gmail.com',
      father_name       : 'Rajesh Sharma',
      father_phone      : '91-9876500001',
      father_occupation : 'Government Teacher',
      mother_name       : 'Sunita Sharma',
      mother_phone      : '91-9876500002',
      mother_email      : 'sunita.sharma@gmail.com',
      emergency_contact : '91-9876500001',
      blood_group       : 'B+',
      medical_notes     : 'Mild dust allergy. Carries antihistamine.',
      photo_path        : 'uploads/students/gwa-2024-001.jpg',
      changed_by        : null,
    };

    const now = new Date();

    // ── Version 1: Initial address on admission (2024-04-01) ─────────────
    await queryInterface.bulkInsert('student_profiles', [{
      ...base,
      address       : '14 Rajgarh Road',
      city          : 'Guwahati',
      state         : 'Assam',
      pincode       : '781003',
      valid_from    : '2024-04-01',
      valid_to      : '2024-06-14',       // Closed when version 2 was created
      is_current    : false,
      change_reason : 'Initial profile created on admission',
      created_at    : new Date('2024-04-01T08:00:00Z'),
    }]);

    // ── Version 2: Moved within Guwahati (2024-06-15) ────────────────────
    await queryInterface.bulkInsert('student_profiles', [{
      ...base,
      address       : '7B Beltola Bazar Road',
      city          : 'Guwahati',
      state         : 'Assam',
      pincode       : '781028',
      valid_from    : '2024-06-15',
      valid_to      : '2024-11-02',       // Closed when version 3 was created
      is_current    : false,
      change_reason : 'Family relocated to new apartment in Beltola area',
      created_at    : new Date('2024-06-15T10:30:00Z'),
    }]);

    // ── Version 3: Relocated to Jorhat (2024-11-03) — CURRENT ────────────
    await queryInterface.bulkInsert('student_profiles', [{
      ...base,
      address       : '22 AT Road',
      city          : 'Jorhat',
      state         : 'Assam',
      pincode       : '785001',
      valid_from    : '2024-11-03',
      valid_to      : null,              // NULL = still current
      is_current    : true,
      change_reason : 'Family permanently relocated to Jorhat after job transfer',
      created_at    : new Date('2024-11-03T09:15:00Z'),
    }]);

    // ── Corresponding audit log entries (address + city + pincode changed) ─
    const [[v2], [v3]] = await Promise.all([
      queryInterface.sequelize.query(
        `SELECT id FROM student_profiles WHERE student_id = ${studentId} AND valid_from = '2024-06-15' LIMIT 1;`
      ),
      queryInterface.sequelize.query(
        `SELECT id FROM student_profiles WHERE student_id = ${studentId} AND is_current = true LIMIT 1;`
      ),
    ]);

    await queryInterface.bulkInsert('audit_logs', [
      // Version 2 audit entries (address + pincode changed)
      {
        table_name  : 'student_profiles',
        record_id   : v2[0].id,
        field_name  : 'address',
        old_value   : '14 Rajgarh Road',
        new_value   : '7B Beltola Bazar Road',
        changed_by  : null,
        reason      : 'Family relocated to new apartment in Beltola area',
        ip_address  : '192.168.1.10',
        device_info : 'Mozilla/5.0 Chrome/120.0',
        created_at  : new Date('2024-06-15T10:30:00Z'),
      },
      {
        table_name  : 'student_profiles',
        record_id   : v2[0].id,
        field_name  : 'pincode',
        old_value   : '781003',
        new_value   : '781028',
        changed_by  : null,
        reason      : 'Family relocated to new apartment in Beltola area',
        ip_address  : '192.168.1.10',
        device_info : 'Mozilla/5.0 Chrome/120.0',
        created_at  : new Date('2024-06-15T10:30:00Z'),
      },
      // Version 3 audit entries (address + city + pincode all changed)
      {
        table_name  : 'student_profiles',
        record_id   : v3[0].id,
        field_name  : 'address',
        old_value   : '7B Beltola Bazar Road',
        new_value   : '22 AT Road',
        changed_by  : null,
        reason      : 'Family permanently relocated to Jorhat after job transfer',
        ip_address  : '10.0.0.5',
        device_info : 'Mozilla/5.0 Safari/17.0',
        created_at  : new Date('2024-11-03T09:15:00Z'),
      },
      {
        table_name  : 'student_profiles',
        record_id   : v3[0].id,
        field_name  : 'city',
        old_value   : 'Guwahati',
        new_value   : 'Jorhat',
        changed_by  : null,
        reason      : 'Family permanently relocated to Jorhat after job transfer',
        ip_address  : '10.0.0.5',
        device_info : 'Mozilla/5.0 Safari/17.0',
        created_at  : new Date('2024-11-03T09:15:00Z'),
      },
      {
        table_name  : 'student_profiles',
        record_id   : v3[0].id,
        field_name  : 'pincode',
        old_value   : '781028',
        new_value   : '785001',
        changed_by  : null,
        reason      : 'Family permanently relocated to Jorhat after job transfer',
        ip_address  : '10.0.0.5',
        device_info : 'Mozilla/5.0 Safari/17.0',
        created_at  : new Date('2024-11-03T09:15:00Z'),
      },
    ]);
  },

  async down(queryInterface) {
    const [students] = await queryInterface.sequelize.query(
      `SELECT id FROM students WHERE admission_no = 'GWA-2024-001' LIMIT 1;`
    );
    if (students.length) {
      await queryInterface.bulkDelete('audit_logs', {
        table_name : 'student_profiles',
        record_id  : students[0].id,
      }, {});
      await queryInterface.bulkDelete('student_profiles', {
        student_id: students[0].id,
      }, {});
    }
  },
};