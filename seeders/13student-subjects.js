'use strict';

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    // Fetch school
    const [[school]] = await queryInterface.sequelize.query(
      `SELECT id FROM schools ORDER BY id ASC LIMIT 1;`
    );
    if (!school) { console.warn('No school found.'); return; }

    // Fetch session
    const [[session]] = await queryInterface.sequelize.query(
      `SELECT id FROM sessions WHERE school_id = ${school.id} ORDER BY id DESC LIMIT 1;`
    );
    if (!session) { console.warn('No session found.'); return; }
    const sessionId = session.id;

    // Fetch all active enrollments for this session
    const [enrollments] = await queryInterface.sequelize.query(`
      SELECT e.student_id, e.class_id, e.section_id
      FROM enrollments e
      WHERE e.session_id = :sessionId AND e.status = 'active';
    `, { replacements: { sessionId } });

    if (!enrollments.length) {
      console.warn('No enrollments found — run students seeder first.');
      return;
    }

    // Fetch subjects for each class
    const [subjects] = await queryInterface.sequelize.query(`
      SELECT id, class_id, is_core FROM subjects WHERE is_deleted = false;
    `);

    const classSubjectsMap = {};
    subjects.forEach((sub) => {
      if (!classSubjectsMap[sub.class_id]) classSubjectsMap[sub.class_id] = [];
      classSubjectsMap[sub.class_id].push(sub);
    });

    const studentSubjectRows = [];

    enrollments.forEach((e) => {
      const classSubs = classSubjectsMap[e.class_id] || [];
      classSubs.forEach((sub) => {
        studentSubjectRows.push({
          student_id  : e.student_id,
          session_id  : sessionId,
          subject_id  : sub.id,
          is_core     : sub.is_core,
          is_active   : true,
          created_at  : now,
          updated_at  : now,
        });
      });
    });

    if (studentSubjectRows.length > 0) {
      // Use chunks to avoid large insert issues
      const chunkSize = 1000;
      for (let i = 0; i < studentSubjectRows.length; i += chunkSize) {
        const chunk = studentSubjectRows.slice(i, i + chunkSize);
        await queryInterface.bulkInsert('student_subjects', chunk);
      }
      console.log(`✓ Seeded ${studentSubjectRows.length} student_subject assignments.`);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('student_subjects', null, {});
  },
};
