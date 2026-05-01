'use strict';

const SCHOOL_ID   = 1;
const PASSWORD    = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'; // Teacher@123
const ts          = new Date('2024-04-01T08:00:00.000Z').toISOString();

// ── Teacher definitions ────────────────────────────────────────────────────

// Class 1–5: one class teacher per section (15 sections = 15 teachers)
// Named CT-A1 through CT-C5 (Section A/B/C, Grade 1–5)
const primaryTeachers = [];
['A','B','C'].forEach((sec) => {
  for (let g = 1; g <= 5; g++) {
    const names = [
      ['Anita','Sharma'],['Babita','Verma'],['Chanda','Singh'],
      ['Deepa','Gupta'],['Ekta','Patel'],['Farida','Khan'],
      ['Gita','Joshi'],['Hema','Mishra'],['Indira','Yadav'],
      ['Jaya','Tiwari'],['Kamla','Pandey'],['Lata','Srivastava'],
      ['Mala','Chauhan'],['Nita','Dubey'],['Omkar','Shukla'],
    ];
    const idx  = (sec.charCodeAt(0) - 65) * 5 + (g - 1);
    const [fn, ln] = names[idx];
    primaryTeachers.push({
      name  : `${fn} ${ln}`,
      email : `ct.${sec.toLowerCase()}${g}@school.edu`,
      note  : `Class Teacher — Grade ${g} Section ${sec}`,
    });
  }
});

// Class 6–10: subject teachers (7)
const middleTeachers = [
  { name: 'Rekha Sharma',    email: 'rekha.sharma@school.edu',   note: 'English — Class 6 to 12'         },
  { name: 'Sunita Verma',    email: 'sunita.verma@school.edu',   note: 'Hindi — Class 6 to 10'           },
  { name: 'Ramesh Gupta',    email: 'ramesh.gupta@school.edu',   note: 'Mathematics — Class 6 to 10'     },
  { name: 'Vikram Singh',    email: 'vikram.singh@school.edu',   note: 'Science — Class 6 to 10'         },
  { name: 'Kavita Yadav',    email: 'kavita.yadav@school.edu',   note: 'Social Studies — Class 6 to 10'  },
  { name: 'Suresh Pandey',   email: 'suresh.pandey@school.edu',  note: 'Sanskrit — Class 6 to 10'        },
  { name: 'Rohit Kapoor',    email: 'rohit.kapoor@school.edu',   note: 'Computer Science — Class 6 to 10'},
];

// Class 11–12 Arts (5)
const artsTeachers = [
  { name: 'Pallavi Nair',    email: 'pallavi.nair@school.edu',   note: 'History — Arts 11–12'            },
  { name: 'Suman Chandra',   email: 'suman.chandra@school.edu',  note: 'Political Science — Arts 11–12'  },
  { name: 'Renu Bose',       email: 'renu.bose@school.edu',      note: 'Geography — Arts 11–12'          },
  { name: 'Usha Pillai',     email: 'usha.pillai@school.edu',    note: 'Economics — Arts 11–12'          },
  { name: 'Meena Joshi',     email: 'meena.joshi@school.edu',    note: 'Sociology — Arts 11–12'          },
];

// Class 11–12 Commerce (5)
const commerceTeachers = [
  { name: 'Harish Agarwal',  email: 'harish.agarwal@school.edu', note: 'Accountancy — Commerce 11–12'    },
  { name: 'Priti Shah',      email: 'priti.shah@school.edu',     note: 'Business Studies — Commerce 11–12'},
  { name: 'Dinesh Jain',     email: 'dinesh.jain@school.edu',    note: 'Economics — Commerce 11–12'      },
  { name: 'Seema Chopra',    email: 'seema.chopra@school.edu',   note: 'Mathematics — Commerce 11–12'    },
  { name: 'Ajay Malhotra',   email: 'ajay.malhotra@school.edu',  note: 'Computer Science — Commerce 11–12'},
];

// Class 11–12 Science (5)
const scienceTeachers = [
  { name: 'Dr. Anil Kumar',  email: 'anil.kumar@school.edu',     note: 'Physics — Science 11–12'         },
  { name: 'Dr. Priya Mehta', email: 'priya.mehta@school.edu',    note: 'Chemistry — Science 11–12'       },
  { name: 'Dr. Sonal Reddy', email: 'sonal.reddy@school.edu',    note: 'Biology — Science 11–12'         },
  { name: 'Prof. Manoj Tiwari',email:'manoj.tiwari@school.edu',  note: 'Mathematics — Science 11–12'     },
  { name: 'Neha Bajaj',      email: 'neha.bajaj@school.edu',     note: 'Computer Science — Science 11–12'},
];

// HOD (1)
const hodTeachers = [
  { name: 'Geeta Mishra',    email: 'geeta.mishra@school.edu',   note: 'HOD / Administration'            },
];

const allTeachers = [
  ...primaryTeachers,
  ...middleTeachers,
  ...artsTeachers,
  ...commerceTeachers,
  ...scienceTeachers,
  ...hodTeachers,
];

module.exports = {
  async up(queryInterface) {
    const emails = allTeachers.map((t) => t.email);

    const existingUsers = await queryInterface.sequelize.query(
      `SELECT email FROM users WHERE school_id = :sid AND email IN (:emails)`,
      {
        replacements : { sid: SCHOOL_ID, emails },
        type         : queryInterface.sequelize.QueryTypes.SELECT,
      }
    );
    const existingSet = new Set(existingUsers.map((r) => r.email));

    const toInsert = allTeachers
      .filter((t) => !existingSet.has(t.email))
      .map(({ name, email }) => ({
        school_id     : SCHOOL_ID,
        name,
        email,
        password_hash : PASSWORD,
        role          : 'teacher',
        is_active     : true,
        last_login_at : null,
        created_at    : ts,
        updated_at    : ts,
      }));

    if (toInsert.length) {
      await queryInterface.bulkInsert('users', toInsert);
    }

    console.log(`\n[seed-teachers] Inserted ${toInsert.length} of ${allTeachers.length} teachers:\n`);
    console.log('  PRIMARY (Class 1–5 class teachers):');
    primaryTeachers.forEach((t, i) =>
      console.log(`    ${String(i+1).padStart(2)}. ${t.name.padEnd(22)} → ${t.note}`)
    );
    console.log('\n  MIDDLE (Class 6–10 subject teachers):');
    middleTeachers.forEach((t, i) =>
      console.log(`    ${String(i+1).padStart(2)}. ${t.name.padEnd(22)} → ${t.note}`)
    );
    console.log('\n  SENIOR ARTS (Class 11–12):');
    artsTeachers.forEach((t, i) =>
      console.log(`    ${String(i+1).padStart(2)}. ${t.name.padEnd(22)} → ${t.note}`)
    );
    console.log('\n  SENIOR COMMERCE (Class 11–12):');
    commerceTeachers.forEach((t, i) =>
      console.log(`    ${String(i+1).padStart(2)}. ${t.name.padEnd(22)} → ${t.note}`)
    );
    console.log('\n  SENIOR SCIENCE (Class 11–12):');
    scienceTeachers.forEach((t, i) =>
      console.log(`    ${String(i+1).padStart(2)}. ${t.name.padEnd(22)} → ${t.note}`)
    );
    console.log('\n  HOD / ADMIN:');
    hodTeachers.forEach((t) =>
      console.log(`     1. ${t.name.padEnd(22)} → ${t.note}`)
    );
    console.log('\n  Default password : Teacher@123');
    console.log('  Total teachers   : 38');
    console.log('  ⚠  Change all passwords before going to production.\n');
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', {
      school_id : SCHOOL_ID,
      email     : allTeachers.map((t) => t.email),
      role      : 'teacher',
    });
    console.log('[seed-teachers] 38 teacher users removed.');
  },
};