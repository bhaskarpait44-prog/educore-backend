'use strict';

/**
 * EduCore — Teacher User Seeds
 *
 * Strategy: one teacher per SUBJECT TYPE (not per class)
 * Each subject teacher handles that subject across all relevant classes.
 *
 * Subject layout (matches seed-subjects):
 *   Class 1–5   : English, Hindi, Math, EVS, GK, Art
 *   Class 6–8   : English, Hindi, Math, Science, SST, Sanskrit
 *   Class 9–10  : English, Hindi, Math, Science, Social Science, Sanskrit
 *   Class 11–12 : Physics, Chemistry, Biology, English, Math, CS
 *
 * Teachers (15 total — realistic for a mid-size school):
 *   1.  English Teacher          → teaches English, classes 1–12
 *   2.  Hindi Teacher            → teaches Hindi, classes 1–10
 *   3.  Mathematics Teacher      → teaches Math, classes 1–10
 *   4.  EVS Teacher              → teaches EVS, classes 1–5
 *   5.  GK Teacher               → teaches GK, classes 1–5
 *   6.  Art Teacher              → teaches Drawing & Art, classes 1–5
 *   7.  Science Teacher          → teaches Science, classes 6–10
 *   8.  Social Studies Teacher   → teaches SST/Social Science, classes 6–10
 *   9.  Sanskrit Teacher         → teaches Sanskrit, classes 6–10
 *   10. Physics Teacher          → teaches Physics, classes 11–12
 *   11. Chemistry Teacher        → teaches Chemistry, classes 11–12
 *   12. Biology Teacher          → teaches Biology, classes 11–12
 *   13. Senior Math Teacher      → teaches Mathematics, classes 11–12
 *   14. Computer Science Teacher → teaches CS, classes 11–12
 *   15. Class Teacher / HOD      → admin/class teacher role, no specific subject
 *
 * Assumptions:
 *   school_id = 1
 *   password  = bcrypt hash of 'Teacher@123' (pre-computed, same for all seed users)
 *   All teachers are active, role = 'teacher'
 */

const SCHOOL_ID = 1;

// bcrypt hash of 'Teacher@123' (cost 10) — pre-computed so seed has no bcrypt dep
const PASSWORD_HASH = '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

const ts = new Date('2024-04-01T08:00:00.000Z').toISOString();

const teachers = [
  {
    name  : 'Rekha Sharma',
    email : 'rekha.sharma@school.edu',
    note  : 'English — Class 1 to 12',
  },
  {
    name  : 'Sunita Verma',
    email : 'sunita.verma@school.edu',
    note  : 'Hindi — Class 1 to 10',
  },
  {
    name  : 'Ramesh Gupta',
    email : 'ramesh.gupta@school.edu',
    note  : 'Mathematics — Class 1 to 10',
  },
  {
    name  : 'Meena Joshi',
    email : 'meena.joshi@school.edu',
    note  : 'EVS — Class 1 to 5',
  },
  {
    name  : 'Pooja Nair',
    email : 'pooja.nair@school.edu',
    note  : 'General Knowledge — Class 1 to 5',
  },
  {
    name  : 'Anita Das',
    email : 'anita.das@school.edu',
    note  : 'Drawing & Art — Class 1 to 5',
  },
  {
    name  : 'Vikram Singh',
    email : 'vikram.singh@school.edu',
    note  : 'Science — Class 6 to 10',
  },
  {
    name  : 'Kavita Yadav',
    email : 'kavita.yadav@school.edu',
    note  : 'Social Studies / Social Science — Class 6 to 10',
  },
  {
    name  : 'Suresh Pandey',
    email : 'suresh.pandey@school.edu',
    note  : 'Sanskrit — Class 6 to 10',
  },
  {
    name  : 'Dr. Anil Kumar',
    email : 'anil.kumar@school.edu',
    note  : 'Physics — Class 11 to 12',
  },
  {
    name  : 'Dr. Priya Mehta',
    email : 'priya.mehta@school.edu',
    note  : 'Chemistry — Class 11 to 12',
  },
  {
    name  : 'Dr. Sonal Reddy',
    email : 'sonal.reddy@school.edu',
    note  : 'Biology — Class 11 to 12',
  },
  {
    name  : 'Prof. Manoj Tiwari',
    email : 'manoj.tiwari@school.edu',
    note  : 'Mathematics (Senior) — Class 11 to 12',
  },
  {
    name  : 'Rohit Kapoor',
    email : 'rohit.kapoor@school.edu',
    note  : 'Computer Science — Class 11 to 12',
  },
  {
    name  : 'Geeta Mishra',
    email : 'geeta.mishra@school.edu',
    note  : 'HOD / Class Teacher — Administration',
  },
];

const userRows = teachers.map(({ name, email }) => ({
  school_id    : SCHOOL_ID,
  name,
  email,
  password_hash: PASSWORD_HASH,
  role         : 'teacher',
  is_active    : true,
  last_login_at: null,
  created_at   : ts,
  updated_at   : ts,
}));

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('users', userRows, {});

    console.log('\n[seed-teachers] Inserted 15 teacher users:');
    teachers.forEach((t, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. ${t.name.padEnd(25)} → ${t.note}`);
    });
    console.log('\n  Default password: Teacher@123');
    console.log('  ⚠  Change all passwords before going to production.\n');
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete(
      'users',
      {
        school_id: SCHOOL_ID,
        email    : teachers.map(t => t.email),
        role     : 'teacher',
      },
      {},
    );
    console.log('[seed-teachers] Teacher users removed.');
  },
};