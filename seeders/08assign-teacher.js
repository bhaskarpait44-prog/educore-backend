'use strict';

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

    // sections with class info
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

    // subjects with class info
    const [subjects] = await queryInterface.sequelize.query(`
      SELECT id, class_id, name, code
      FROM   subjects
      WHERE  is_deleted = false
      ORDER  BY class_id ASC, order_number ASC;
    `);

    // teachers keyed by email
    const [teachers] = await queryInterface.sequelize.query(`
      SELECT id, email, name FROM users
      WHERE  role = 'teacher' AND school_id = ${school.id} AND is_active = true;
    `);
    const byEmail = {};
    teachers.forEach((t) => { byEmail[t.email] = t; });

    // ── Teacher routing maps ──────────────────────────────────────────────

    // Class 1–5: class teacher per section (email pattern ct.{sec}{grade}@school.edu)
    // Class 6–10: subject → teacher email
    const middleSubjectTeacher = {
      'ENG'  : 'rekha.sharma@school.edu',
      'HIN'  : 'sunita.verma@school.edu',
      'MATH' : 'ramesh.gupta@school.edu',
      'SCI'  : 'vikram.singh@school.edu',
      'SST'  : 'kavita.yadav@school.edu',
      'SAN'  : 'suresh.pandey@school.edu',
      'CS'   : 'rohit.kapoor@school.edu',
    };

    // Class 11–12 per stream → subject code prefix → teacher email
    const seniorSubjectTeacher = {
      arts: {
        'ENG'  : 'rekha.sharma@school.edu',
        'HIN'  : 'sunita.verma@school.edu',
        'HIST' : 'pallavi.nair@school.edu',
        'POL'  : 'suman.chandra@school.edu',
        'GEO'  : 'renu.bose@school.edu',
        'ECO'  : 'usha.pillai@school.edu',
        'SOC'  : 'meena.joshi@school.edu',
      },
      commerce: {
        'ENG'  : 'rekha.sharma@school.edu',
        'HIN'  : 'sunita.verma@school.edu',
        'ACC'  : 'harish.agarwal@school.edu',
        'BST'  : 'priti.shah@school.edu',
        'ECO'  : 'dinesh.jain@school.edu',
        'MATH' : 'seema.chopra@school.edu',
        'CS'   : 'ajay.malhotra@school.edu',
      },
      science: {
        'ENG'  : 'rekha.sharma@school.edu',
        'HIN'  : 'sunita.verma@school.edu',
        'PHY'  : 'anil.kumar@school.edu',
        'CHEM' : 'priya.mehta@school.edu',
        'BIO'  : 'sonal.reddy@school.edu',
        'MATH' : 'manoj.tiwari@school.edu',
        'CS'   : 'neha.bajaj@school.edu',
      },
    };

    // subject_id lookup: class_id → code_prefix → subject_id
    const subjectMap = {};
    subjects.forEach((sub) => {
      const prefix = sub.code.split('-')[0];
      if (!subjectMap[sub.class_id]) subjectMap[sub.class_id] = {};
      subjectMap[sub.class_id][prefix] = sub.id;
    });

    // ── Build assignment rows ─────────────────────────────────────────────
    const rows = [];

    for (const sec of sections) {
      const grade    = sec.order_number;
      const stream   = sec.stream;
      const classId  = sec.class_id;
      const sectionId = sec.section_id;
      const sectionName = sec.section_name; // A, B, C

      // ── PRIMARY: Class 1–5 ────────────────────────────────────────────
      if (grade >= 1 && grade <= 5) {
        const ctEmail = `ct.${sectionName.toLowerCase()}${grade}@school.edu`;
        const ct = byEmail[ctEmail];
        if (!ct) { console.warn(`Missing class teacher: ${ctEmail}`); continue; }

        // 1. Class teacher assignment (subject_id = NULL)
        rows.push({
          session_id       : sessionId,
          teacher_id       : ct.id,
          class_id         : classId,
          section_id       : sectionId,
          subject_id       : null,
          is_class_teacher : true,
          is_active        : true,
          created_at       : now,
          updated_at       : now,
        });

        // 2. Subject assignments — same teacher teaches all subjects
        const classSubjects = subjectMap[classId] || {};
        Object.values(classSubjects).forEach((subjectId) => {
          rows.push({
            session_id       : sessionId,
            teacher_id       : ct.id,
            class_id         : classId,
            section_id       : sectionId,
            subject_id       : subjectId,
            is_class_teacher : false,
            is_active        : true,
            created_at       : now,
            updated_at       : now,
          });
        });
      }

      // ── MIDDLE: Class 6–10 ────────────────────────────────────────────
      else if (grade >= 6 && grade <= 10) {
        const classSubjects = subjectMap[classId] || {};

        Object.entries(classSubjects).forEach(([prefix, subjectId]) => {
          const email = middleSubjectTeacher[prefix];
          if (!email) { console.warn(`No teacher mapped for prefix: ${prefix}`); return; }
          const teacher = byEmail[email];
          if (!teacher) { console.warn(`Teacher not found: ${email}`); return; }

          rows.push({
            session_id       : sessionId,
            teacher_id       : teacher.id,
            class_id         : classId,
            section_id       : sectionId,
            subject_id       : subjectId,
            is_class_teacher : false,
            is_active        : true,
            created_at       : now,
            updated_at       : now,
          });
        });

        // Class teacher for 6–10: English teacher acts as class teacher
        const englishTeacher = byEmail['rekha.sharma@school.edu'];
        if (englishTeacher) {
          rows.push({
            session_id       : sessionId,
            teacher_id       : englishTeacher.id,
            class_id         : classId,
            section_id       : sectionId,
            subject_id       : null,
            is_class_teacher : true,
            is_active        : true,
            created_at       : now,
            updated_at       : now,
          });
        }
      }

      // ── SENIOR: Class 11–12 ───────────────────────────────────────────
      else if (grade >= 11 && grade <= 12) {
        const streamMap = seniorSubjectTeacher[stream];
        if (!streamMap) { console.warn(`No subject map for stream: ${stream}`); continue; }

        const classSubjects = subjectMap[classId] || {};

        Object.entries(classSubjects).forEach(([prefix, subjectId]) => {
          const email = streamMap[prefix];
          if (!email) { console.warn(`No teacher for prefix ${prefix} in stream ${stream}`); return; }
          const teacher = byEmail[email];
          if (!teacher) { console.warn(`Teacher not found: ${email}`); return; }

          rows.push({
            session_id       : sessionId,
            teacher_id       : teacher.id,
            class_id         : classId,
            section_id       : sectionId,
            subject_id       : subjectId,
            is_class_teacher : false,
            is_active        : true,
            created_at       : now,
            updated_at       : now,
          });
        });

        // Class teacher for 11–12: English teacher acts as class teacher
        const englishTeacher = byEmail['rekha.sharma@school.edu'];
        if (englishTeacher) {
          rows.push({
            session_id       : sessionId,
            teacher_id       : englishTeacher.id,
            class_id         : classId,
            section_id       : sectionId,
            subject_id       : null,
            is_class_teacher : true,
            is_active        : true,
            created_at       : now,
            updated_at       : now,
          });
        }
      }
    }

    await queryInterface.bulkInsert('teacher_assignments', rows);

    console.log(`\n[seed-assignments] Inserted ${rows.length} teacher assignment rows.`);
    console.log(`  Sessions : ${sessionId}`);
    console.log(`  Sections : ${sections.length}`);
    console.log(`  Subjects : ${subjects.length}\n`);
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

    await queryInterface.bulkDelete('teacher_assignments', {
      session_id: session.id,
    });

    console.log('[seed-assignments] Teacher assignments removed.');
  },
};