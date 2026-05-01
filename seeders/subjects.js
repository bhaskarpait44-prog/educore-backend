'use strict';

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    const [classes] = await queryInterface.sequelize.query(
      `SELECT id, name, order_number, stream FROM classes WHERE is_deleted = false ORDER BY order_number ASC, stream ASC;`
    );

    if (!classes.length) {
      console.warn('No classes found — run class seed first.');
      return;
    }

    // ── Subject definitions ────────────────────────────────────────────────

    // Class 1–5: Primary
    const primarySubjects = [
      { name: 'English',              code_prefix: 'ENG',  order: 1 },
      { name: 'Mathematics',          code_prefix: 'MATH', order: 2 },
      { name: 'Environmental Science',code_prefix: 'EVS',  order: 3 },
      { name: 'Hindi',                code_prefix: 'HIN',  order: 4 },
      { name: 'General Knowledge',    code_prefix: 'GK',   order: 5 },
      { name: 'Computer Science',     code_prefix: 'CS',   order: 6 },
      { name: 'Art & Craft',          code_prefix: 'ART',  order: 7 },
    ];

    // Class 6–10: Secondary
    const secondarySubjects = [
      { name: 'English',       code_prefix: 'ENG',  order: 1 },
      { name: 'Mathematics',   code_prefix: 'MATH', order: 2 },
      { name: 'Science',       code_prefix: 'SCI',  order: 3 },
      { name: 'Social Science',code_prefix: 'SST',  order: 4 },
      { name: 'Hindi',         code_prefix: 'HIN',  order: 5 },
      { name: 'Sanskrit',      code_prefix: 'SAN',  order: 6 },
      { name: 'Computer Science', code_prefix: 'CS', order: 7 },
    ];

    // Class 11–12 stream subjects
    const seniorStreamSubjects = {
      arts: [
        { name: 'English',           code_prefix: 'ENG',  order: 1 },
        { name: 'History',           code_prefix: 'HIST', order: 2 },
        { name: 'Political Science', code_prefix: 'POL',  order: 3 },
        { name: 'Geography',         code_prefix: 'GEO',  order: 4 },
        { name: 'Economics',         code_prefix: 'ECO',  order: 5 },
        { name: 'Hindi',             code_prefix: 'HIN',  order: 6 },
        { name: 'Sociology',         code_prefix: 'SOC',  order: 7 },
      ],
      commerce: [
        { name: 'English',            code_prefix: 'ENG',  order: 1 },
        { name: 'Accountancy',        code_prefix: 'ACC',  order: 2 },
        { name: 'Business Studies',   code_prefix: 'BST',  order: 3 },
        { name: 'Economics',          code_prefix: 'ECO',  order: 4 },
        { name: 'Mathematics',        code_prefix: 'MATH', order: 5 },
        { name: 'Hindi',              code_prefix: 'HIN',  order: 6 },
        { name: 'Computer Science',   code_prefix: 'CS',   order: 7 },
      ],
      science: [
        { name: 'English',   code_prefix: 'ENG',  order: 1, type: 'theory'    },
        { name: 'Physics',   code_prefix: 'PHY',  order: 2, type: 'both'      },
        { name: 'Chemistry', code_prefix: 'CHEM', order: 3, type: 'both'      },
        { name: 'Biology',   code_prefix: 'BIO',  order: 4, type: 'both'      },
        { name: 'Mathematics',code_prefix: 'MATH',order: 5, type: 'theory'    },
        { name: 'Hindi',     code_prefix: 'HIN',  order: 6, type: 'theory'    },
        { name: 'Computer Science', code_prefix: 'CS', order: 7, type: 'both' },
      ],
    };

    // ── Helper to build a subject row ──────────────────────────────────────
    const makeSubject = (classId, orderNum, subjectDef, subjectType = 'theory') => {
      const type = subjectDef.type || subjectType;

      const theoryTotal    = (type === 'theory' || type === 'both') ? 80.00  : null;
      const theoryPassing  = (type === 'theory' || type === 'both') ? 27.00  : null;
      const practTotal     = (type === 'practical' || type === 'both') ? 20.00 : null;
      const practPassing   = (type === 'practical' || type === 'both') ? 7.00  : null;
      const combinedTotal  = (theoryTotal  || 0) + (practTotal  || 0);
      const combinedPass   = (theoryPassing || 0) + (practPassing || 0);

      return {
        class_id                : classId,
        name                    : subjectDef.name,
        code                    : `${subjectDef.code_prefix}-${orderNum}`,
        subject_type            : type,
        is_core                 : true,
        theory_total_marks      : theoryTotal,
        theory_passing_marks    : theoryPassing,
        practical_total_marks   : practTotal,
        practical_passing_marks : practPassing,
        combined_total_marks    : combinedTotal,
        combined_passing_marks  : combinedPass,
        order_number            : subjectDef.order,
        is_active               : true,
        is_deleted              : false,
        created_at              : now,
        updated_at              : now,
      };
    };

    // ── Build all rows ─────────────────────────────────────────────────────
    const rows = [];

    for (const cls of classes) {
      const n = cls.order_number;
      const stream = cls.stream;

      if (n >= 1 && n <= 5) {
        // Primary: Class 1–5
        primarySubjects.forEach((s) => rows.push(makeSubject(cls.id, n, s)));

      } else if (n >= 6 && n <= 10) {
        // Secondary: Class 6–10
        secondarySubjects.forEach((s) => rows.push(makeSubject(cls.id, n, s)));

      } else if (n === 11 || n === 12) {
        // Senior: stream-specific
        const streamSubs = seniorStreamSubjects[stream];
        if (streamSubs) {
          streamSubs.forEach((s) => rows.push(makeSubject(cls.id, n, s)));
        }
      }
    }

    await queryInterface.bulkInsert('subjects', rows);
  },

  async down(queryInterface) {
    const [classes] = await queryInterface.sequelize.query(
      `SELECT id FROM classes WHERE name ~ '^Class [0-9]+$';`
    );

    if (!classes.length) return;

    await queryInterface.bulkDelete('subjects', {
      class_id: classes.map((c) => c.id),
    });
  },
};