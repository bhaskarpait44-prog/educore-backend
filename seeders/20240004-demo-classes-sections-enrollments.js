'use strict';

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    // ── Fetch prerequisites ───────────────────────────────────────────────
    const [schools] = await queryInterface.sequelize.query(
      `SELECT id FROM schools LIMIT 1;`
    );
    const schoolId = schools[0].id;

    const [allSessions] = await queryInterface.sequelize.query(
      `SELECT id, name, start_date FROM sessions WHERE school_id = ${schoolId} ORDER BY start_date ASC;`
    );
    // session2023 = 2023-2024 (closed), session2024 = 2024-2025 (current)
    const session2023 = allSessions[0].id;
    const session2024 = allSessions[1].id;

    const [allStudents] = await queryInterface.sequelize.query(
      `SELECT id, admission_no FROM students WHERE school_id = ${schoolId} ORDER BY id ASC;`
    );
    // Map admission_no → id for clarity in seeding
    const studentMap = {};
    allStudents.forEach(s => { studentMap[s.admission_no] = s.id; });

    // ── 1. Classes (Grade 1–5) ────────────────────────────────────────────
    await queryInterface.bulkInsert('classes', [
      { school_id: schoolId, name: 'Grade 1', order_number: 1, min_age: 5,  max_age: 7,  is_active: true, created_at: now, updated_at: now },
      { school_id: schoolId, name: 'Grade 2', order_number: 2, min_age: 6,  max_age: 8,  is_active: true, created_at: now, updated_at: now },
      { school_id: schoolId, name: 'Grade 3', order_number: 3, min_age: 7,  max_age: 9,  is_active: true, created_at: now, updated_at: now },
      { school_id: schoolId, name: 'Grade 4', order_number: 4, min_age: 8,  max_age: 10, is_active: true, created_at: now, updated_at: now },
      { school_id: schoolId, name: 'Grade 5', order_number: 5, min_age: 9,  max_age: 11, is_active: true, created_at: now, updated_at: now },
    ]);

    const [classes] = await queryInterface.sequelize.query(
      `SELECT id, name, order_number FROM classes WHERE school_id = ${schoolId} ORDER BY order_number ASC;`
    );
    // classMap: { 1: id_of_grade1, 2: id_of_grade2, ... }
    const classMap = {};
    classes.forEach(c => { classMap[c.order_number] = c.id; });

    // ── 2. Sections (A and B for each class) ─────────────────────────────
    const sectionRows = [];
    for (const cls of classes) {
      sectionRows.push(
        { class_id: cls.id, name: 'A', capacity: 40, is_active: true, created_at: now, updated_at: now },
        { class_id: cls.id, name: 'B', capacity: 40, is_active: true, created_at: now, updated_at: now },
      );
    }
    await queryInterface.bulkInsert('sections', sectionRows);

    const [sections] = await queryInterface.sequelize.query(
      `SELECT id, class_id, name FROM sections ORDER BY class_id ASC, name ASC;`
    );
    // sectionMap: { 'classId-A': sectionId, 'classId-B': sectionId }
    const sectionMap = {};
    sections.forEach(s => { sectionMap[`${s.class_id}-${s.name}`] = s.id; });

    // Helper shorthands
    const secA = (order) => sectionMap[`${classMap[order]}-A`];
    const secB = (order) => sectionMap[`${classMap[order]}-B`];

    // ═══════════════════════════════════════════════════════════════════════
    // 3. ENROLLMENTS
    //
    // Students:
    //   GWA-2024-001  Priya   → 3-year history: G1→G2→G3 (promoted each year)
    //   GWA-2024-002  Rahul   → failed G2, repeated G2, then promoted to G3
    //   GWA-2024-003  Anjali  → current session only (Grade 4-A)
    //   GWA-2024-004  Rohan   → current session only (Grade 2-B)
    //   GWA-2024-005  Meena   → current session only (Grade 1-A)
    // ═══════════════════════════════════════════════════════════════════════

    // ── PRIYA: 3-year history (promoted each year) ────────────────────────
    //
    //  Session 2022-2023: Grade 1-A  (fresh admission)          [not seeded — pre-dates seed data]
    //  Session 2023-2024: Grade 2-A  (promoted from Grade 1)    ← we seed this
    //  Session 2024-2025: Grade 3-A  (promoted from Grade 2)    ← and this

    await queryInterface.bulkInsert('enrollments', [{
      student_id             : studentMap['GWA-2024-001'],
      session_id             : session2023,
      class_id               : classMap[2],               // Grade 2
      section_id             : secA(2),                   // Section A
      roll_number            : '02',
      joined_date            : '2023-04-01',
      joining_type           : 'promoted',                // Came from Grade 1
      left_date              : '2024-03-31',              // Session ended
      leaving_type           : 'promoted',                // Moved to Grade 3
      previous_enrollment_id : null,                      // Grade 1 not in seed data
      status                 : 'inactive',
      created_at             : now,
      updated_at             : now,
    }]);

    const [priyaE1] = await queryInterface.sequelize.query(
      `SELECT id FROM enrollments WHERE student_id = ${studentMap['GWA-2024-001']} AND session_id = ${session2023};`
    );

    await queryInterface.bulkInsert('enrollments', [{
      student_id             : studentMap['GWA-2024-001'],
      session_id             : session2024,
      class_id               : classMap[3],               // Grade 3
      section_id             : secA(3),                   // Section A
      roll_number            : '03',
      joined_date            : '2024-04-01',
      joining_type           : 'promoted',
      left_date              : null,                       // Still enrolled
      leaving_type           : null,
      previous_enrollment_id : priyaE1[0].id,             // → Grade 2 record
      status                 : 'active',
      created_at             : now,
      updated_at             : now,
    }]);

    // ── RAHUL: Failed Grade 2, repeated, then promoted ────────────────────
    //
    //  Session 2023-2024: Grade 2-B  (fresh)      → left_date set, leaving_type=failed
    //  Session 2024-2025: Grade 2-B  (failed)     → repeating same class (joining_type=failed)
    //                                               still active

    await queryInterface.bulkInsert('enrollments', [{
      student_id             : studentMap['GWA-2024-002'],
      session_id             : session2023,
      class_id               : classMap[2],               // Grade 2
      section_id             : secB(2),                   // Section B
      roll_number            : '15',
      joined_date            : '2023-04-01',
      joining_type           : 'fresh',
      left_date              : '2024-03-31',
      leaving_type           : 'failed',                  // Did not pass
      previous_enrollment_id : null,
      status                 : 'inactive',
      created_at             : now,
      updated_at             : now,
    }]);

    const [rahulE1] = await queryInterface.sequelize.query(
      `SELECT id FROM enrollments WHERE student_id = ${studentMap['GWA-2024-002']} AND session_id = ${session2023};`
    );

    await queryInterface.bulkInsert('enrollments', [{
      student_id             : studentMap['GWA-2024-002'],
      session_id             : session2024,
      class_id               : classMap[2],               // Grade 2 again
      section_id             : secB(2),
      roll_number            : '22',
      joined_date            : '2024-04-01',
      joining_type           : 'failed',                  // Repeating after failure
      left_date              : null,
      leaving_type           : null,
      previous_enrollment_id : rahulE1[0].id,
      status                 : 'active',
      created_at             : now,
      updated_at             : now,
    }]);

    // ── ANJALI, ROHAN, MEENA: Current session only ────────────────────────
    await queryInterface.bulkInsert('enrollments', [
      {
        student_id             : studentMap['GWA-2024-003'],
        session_id             : session2024,
        class_id               : classMap[4],             // Grade 4
        section_id             : secA(4),
        roll_number            : '07',
        joined_date            : '2024-04-01',
        joining_type           : 'fresh',
        left_date              : null,
        leaving_type           : null,
        previous_enrollment_id : null,
        status                 : 'active',
        created_at             : now,
        updated_at             : now,
      },
      {
        student_id             : studentMap['GWA-2024-004'],
        session_id             : session2024,
        class_id               : classMap[2],             // Grade 2
        section_id             : secB(2),
        roll_number            : '23',
        joined_date            : '2024-04-01',
        joining_type           : 'fresh',
        left_date              : null,
        leaving_type           : null,
        previous_enrollment_id : null,
        status                 : 'active',
        created_at             : now,
        updated_at             : now,
      },
      {
        student_id             : studentMap['GWA-2024-005'],
        session_id             : session2024,
        class_id               : classMap[1],             // Grade 1
        section_id             : secA(1),
        roll_number            : '04',
        joined_date            : '2024-04-01',
        joining_type           : 'fresh',
        left_date              : null,
        leaving_type           : null,
        previous_enrollment_id : null,
        status                 : 'active',
        created_at             : now,
        updated_at             : now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('enrollments', null, {});
    await queryInterface.bulkDelete('sections', null, {});
    await queryInterface.bulkDelete('classes', null, {});
  },
};