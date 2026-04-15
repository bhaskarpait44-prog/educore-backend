'use strict';

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    // ── Prerequisites ─────────────────────────────────────────────────────
    const [sessions] = await queryInterface.sequelize.query(
      `SELECT id, name FROM sessions ORDER BY id ASC;`
    );
    const session2024 = sessions.find(s => s.name === '2024-2025').id;

    const [classes] = await queryInterface.sequelize.query(
      `SELECT id, order_number FROM classes ORDER BY order_number ASC;`
    );
    const grade1Id = classes.find(c => c.order_number === 1).id;
    const grade2Id = classes.find(c => c.order_number === 2).id;
    const grade3Id = classes.find(c => c.order_number === 3).id;

    const [enrollments] = await queryInterface.sequelize.query(`
      SELECT e.id, s.admission_no, e.class_id
      FROM enrollments e
      JOIN students s ON s.id = e.student_id
      WHERE e.status = 'active'
      ORDER BY s.admission_no ASC;
    `);
    const eMap = {};
    enrollments.forEach(e => { eMap[e.admission_no] = { id: e.id, classId: e.class_id }; });

    // ── 1. Subjects for Grade 1, 2, 3 ────────────────────────────────────
    await queryInterface.bulkInsert('subjects', [
      // Grade 1
      { class_id: grade1Id, name: 'Mathematics',  code: 'MATH', total_marks: '100.00', passing_marks: '35.00', is_core: true,  order_number: 1, is_active: true, created_at: now, updated_at: now },
      { class_id: grade1Id, name: 'English',       code: 'ENG',  total_marks: '100.00', passing_marks: '35.00', is_core: true,  order_number: 2, is_active: true, created_at: now, updated_at: now },
      { class_id: grade1Id, name: 'General Science',code: 'SCI', total_marks: '100.00', passing_marks: '35.00', is_core: true,  order_number: 3, is_active: true, created_at: now, updated_at: now },
      { class_id: grade1Id, name: 'Drawing',       code: 'DRW',  total_marks: '50.00',  passing_marks: '17.00', is_core: false, order_number: 4, is_active: true, created_at: now, updated_at: now },

      // Grade 2
      { class_id: grade2Id, name: 'Mathematics',   code: 'MATH', total_marks: '100.00', passing_marks: '35.00', is_core: true,  order_number: 1, is_active: true, created_at: now, updated_at: now },
      { class_id: grade2Id, name: 'English',        code: 'ENG',  total_marks: '100.00', passing_marks: '35.00', is_core: true,  order_number: 2, is_active: true, created_at: now, updated_at: now },
      { class_id: grade2Id, name: 'General Science',code: 'SCI',  total_marks: '100.00', passing_marks: '35.00', is_core: true,  order_number: 3, is_active: true, created_at: now, updated_at: now },
      { class_id: grade2Id, name: 'Social Studies', code: 'SST',  total_marks: '100.00', passing_marks: '35.00', is_core: true,  order_number: 4, is_active: true, created_at: now, updated_at: now },

      // Grade 3
      { class_id: grade3Id, name: 'Mathematics',   code: 'MATH', total_marks: '100.00', passing_marks: '35.00', is_core: true,  order_number: 1, is_active: true, created_at: now, updated_at: now },
      { class_id: grade3Id, name: 'English',        code: 'ENG',  total_marks: '100.00', passing_marks: '35.00', is_core: true,  order_number: 2, is_active: true, created_at: now, updated_at: now },
      { class_id: grade3Id, name: 'General Science',code: 'SCI',  total_marks: '100.00', passing_marks: '35.00', is_core: true,  order_number: 3, is_active: true, created_at: now, updated_at: now },
      { class_id: grade3Id, name: 'Hindi',          code: 'HIN',  total_marks: '100.00', passing_marks: '35.00', is_core: false, order_number: 4, is_active: true, created_at: now, updated_at: now },
    ]);

    // Fetch subject ids
    const [subjects] = await queryInterface.sequelize.query(
      `SELECT id, class_id, code FROM subjects ORDER BY class_id, order_number;`
    );
    const subMap = {};
    subjects.forEach(s => { subMap[`${s.class_id}-${s.code}`] = s.id; });

    // ── 2. Final Exams (one per class) ────────────────────────────────────
    await queryInterface.bulkInsert('exams', [
      {
        session_id: session2024, class_id: grade1Id,
        name: 'Final Examination 2024-25', exam_type: 'final',
        start_date: '2025-02-15', end_date: '2025-02-25',
        total_marks: '350.00', passing_marks: '122.00',
        status: 'completed', created_at: now, updated_at: now,
      },
      {
        session_id: session2024, class_id: grade2Id,
        name: 'Final Examination 2024-25', exam_type: 'final',
        start_date: '2025-02-15', end_date: '2025-02-25',
        total_marks: '400.00', passing_marks: '140.00',
        status: 'completed', created_at: now, updated_at: now,
      },
      {
        session_id: session2024, class_id: grade3Id,
        name: 'Final Examination 2024-25', exam_type: 'final',
        start_date: '2025-02-15', end_date: '2025-02-25',
        total_marks: '400.00', passing_marks: '140.00',
        status: 'completed', created_at: now, updated_at: now,
      },
    ]);

    const [exams] = await queryInterface.sequelize.query(
      `SELECT id, class_id FROM exams WHERE session_id = ${session2024} AND exam_type = 'final';`
    );
    const examByClass = {};
    exams.forEach(e => { examByClass[e.class_id] = e.id; });

    // ── 3. Exam Results for 5 students ────────────────────────────────────
    //
    // Priya   (Grade 3) → PASS:        all subjects passed
    // Rahul   (Grade 2) → COMPARTMENT: failed 1 core subject (Math)
    // Anjali  (Grade 4) → no exam seeded (Grade 4 has no exam)
    // Rohan   (Grade 2) → FAIL:        failed 3 core subjects
    // Meena   (Grade 1) → PASS:        all subjects passed
    //
    // ──────────────────────────────────────────────────────────────────────

    const resultRows = [];

    // ── PRIYA (Grade 3) — PASS ────────────────────────────────────────────
    const priyaExam = examByClass[eMap['GWA-2024-001'].classId];
    const g3        = eMap['GWA-2024-001'].classId;
    resultRows.push(
      { exam_id: priyaExam, enrollment_id: eMap['GWA-2024-001'].id, subject_id: subMap[`${g3}-MATH`], marks_obtained: '78.00', is_absent: false, grade: 'B+', is_pass: true,  entered_by: null, override_by: null, override_reason: null, created_at: now, updated_at: now },
      { exam_id: priyaExam, enrollment_id: eMap['GWA-2024-001'].id, subject_id: subMap[`${g3}-ENG`],  marks_obtained: '85.00', is_absent: false, grade: 'A',  is_pass: true,  entered_by: null, override_by: null, override_reason: null, created_at: now, updated_at: now },
      { exam_id: priyaExam, enrollment_id: eMap['GWA-2024-001'].id, subject_id: subMap[`${g3}-SCI`],  marks_obtained: '91.00', is_absent: false, grade: 'A+', is_pass: true,  entered_by: null, override_by: null, override_reason: null, created_at: now, updated_at: now },
      { exam_id: priyaExam, enrollment_id: eMap['GWA-2024-001'].id, subject_id: subMap[`${g3}-HIN`],  marks_obtained: '72.00', is_absent: false, grade: 'B+', is_pass: true,  entered_by: null, override_by: null, override_reason: null, created_at: now, updated_at: now },
    );

    // ── RAHUL (Grade 2) — COMPARTMENT (failed Math only) ──────────────────
    const rahulExam = examByClass[eMap['GWA-2024-002'].classId];
    const g2        = eMap['GWA-2024-002'].classId;
    resultRows.push(
      { exam_id: rahulExam, enrollment_id: eMap['GWA-2024-002'].id, subject_id: subMap[`${g2}-MATH`], marks_obtained: '28.00', is_absent: false, grade: 'F',  is_pass: false, entered_by: null, override_by: null, override_reason: null, created_at: now, updated_at: now },
      { exam_id: rahulExam, enrollment_id: eMap['GWA-2024-002'].id, subject_id: subMap[`${g2}-ENG`],  marks_obtained: '62.00', is_absent: false, grade: 'B',  is_pass: true,  entered_by: null, override_by: null, override_reason: null, created_at: now, updated_at: now },
      { exam_id: rahulExam, enrollment_id: eMap['GWA-2024-002'].id, subject_id: subMap[`${g2}-SCI`],  marks_obtained: '55.00', is_absent: false, grade: 'C',  is_pass: true,  entered_by: null, override_by: null, override_reason: null, created_at: now, updated_at: now },
      { exam_id: rahulExam, enrollment_id: eMap['GWA-2024-002'].id, subject_id: subMap[`${g2}-SST`],  marks_obtained: '48.00', is_absent: false, grade: 'D',  is_pass: true,  entered_by: null, override_by: null, override_reason: null, created_at: now, updated_at: now },
    );

    // ── ROHAN (Grade 2) — FAIL (failed 3 core subjects) ───────────────────
    const rohanExam = examByClass[eMap['GWA-2024-004'].classId];
    resultRows.push(
      { exam_id: rohanExam, enrollment_id: eMap['GWA-2024-004'].id, subject_id: subMap[`${g2}-MATH`], marks_obtained: '22.00', is_absent: false, grade: 'F', is_pass: false, entered_by: null, override_by: null, override_reason: null, created_at: now, updated_at: now },
      { exam_id: rohanExam, enrollment_id: eMap['GWA-2024-004'].id, subject_id: subMap[`${g2}-ENG`],  marks_obtained: '30.00', is_absent: false, grade: 'F', is_pass: false, entered_by: null, override_by: null, override_reason: null, created_at: now, updated_at: now },
      { exam_id: rohanExam, enrollment_id: eMap['GWA-2024-004'].id, subject_id: subMap[`${g2}-SCI`],  marks_obtained: '18.00', is_absent: false, grade: 'F', is_pass: false, entered_by: null, override_by: null, override_reason: null, created_at: now, updated_at: now },
      { exam_id: rohanExam, enrollment_id: eMap['GWA-2024-004'].id, subject_id: subMap[`${g2}-SST`],  marks_obtained: '52.00', is_absent: false, grade: 'C', is_pass: true,  entered_by: null, override_by: null, override_reason: null, created_at: now, updated_at: now },
    );

    // ── MEENA (Grade 1) — PASS ────────────────────────────────────────────
    const meenaExam = examByClass[eMap['GWA-2024-005'].classId];
    const g1        = eMap['GWA-2024-005'].classId;
    resultRows.push(
      { exam_id: meenaExam, enrollment_id: eMap['GWA-2024-005'].id, subject_id: subMap[`${g1}-MATH`], marks_obtained: '88.00', is_absent: false, grade: 'A',  is_pass: true, entered_by: null, override_by: null, override_reason: null, created_at: now, updated_at: now },
      { exam_id: meenaExam, enrollment_id: eMap['GWA-2024-005'].id, subject_id: subMap[`${g1}-ENG`],  marks_obtained: '76.00', is_absent: false, grade: 'B+', is_pass: true, entered_by: null, override_by: null, override_reason: null, created_at: now, updated_at: now },
      { exam_id: meenaExam, enrollment_id: eMap['GWA-2024-005'].id, subject_id: subMap[`${g1}-SCI`],  marks_obtained: '81.00', is_absent: false, grade: 'A',  is_pass: true, entered_by: null, override_by: null, override_reason: null, created_at: now, updated_at: now },
      { exam_id: meenaExam, enrollment_id: eMap['GWA-2024-005'].id, subject_id: subMap[`${g1}-DRW`],  marks_obtained: '44.00', is_absent: false, grade: 'A+', is_pass: true, entered_by: null, override_by: null, override_reason: null, created_at: now, updated_at: now },
    );

    await queryInterface.bulkInsert('exam_results', resultRows);

    // ── 4. Seed student_results (calculated values) ────────────────────────
    await queryInterface.bulkInsert('student_results', [
      // Priya — PASS: 78+85+91+72 = 326/400 = 81.5%
      {
        enrollment_id: eMap['GWA-2024-001'].id, session_id: session2024,
        total_marks: '400.00', marks_obtained: '326.00', percentage: '81.50',
        grade: 'A', result: 'pass', compartment_subjects: null,
        is_promoted: true,  promotion_override_by: null, promotion_override_reason: null,
        created_at: now, updated_at: now,
      },
      // Rahul — COMPARTMENT: 28+62+55+48 = 193/400 = 48.25% but only 1 core failed
      {
        enrollment_id: eMap['GWA-2024-002'].id, session_id: session2024,
        total_marks: '400.00', marks_obtained: '193.00', percentage: '48.25',
        grade: 'D', result: 'compartment',
        compartment_subjects: JSON.stringify([subMap[`${g2}-MATH`]]),
        is_promoted: false, promotion_override_by: null, promotion_override_reason: null,
        created_at: now, updated_at: now,
      },
      // Rohan — FAIL: 22+30+18+52 = 122/400 = 30.5%, 3 core subjects failed
      {
        enrollment_id: eMap['GWA-2024-004'].id, session_id: session2024,
        total_marks: '400.00', marks_obtained: '122.00', percentage: '30.50',
        grade: 'F', result: 'fail', compartment_subjects: null,
        is_promoted: false, promotion_override_by: null, promotion_override_reason: null,
        created_at: now, updated_at: now,
      },
      // Meena — PASS: 88+76+81+44 = 289/350 = 82.57%
      {
        enrollment_id: eMap['GWA-2024-005'].id, session_id: session2024,
        total_marks: '350.00', marks_obtained: '289.00', percentage: '82.57',
        grade: 'A', result: 'pass', compartment_subjects: null,
        is_promoted: true, promotion_override_by: null, promotion_override_reason: null,
        created_at: now, updated_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('student_results', null, {});
    await queryInterface.bulkDelete('exam_results',    null, {});
    await queryInterface.bulkDelete('exams',           null, {});
    await queryInterface.bulkDelete('subjects',        null, {});
  },
};