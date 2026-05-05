'use strict';

/**
 * Seed: students
 *
 * Creates 10 students per section across all 48 sections = 480 students.
 * Each student gets:
 *   - A students row
 *   - A student_profiles row (SCD-2 current version)
 *   - An enrollments row for the active session
 */

const FIRST_NAMES_MALE = [
  'Aarav','Arjun','Rohan','Vikram','Kabir','Ishaan','Dev','Aditya',
  'Nikhil','Rahul','Saurabh','Manish','Deepak','Rajesh','Suresh',
  'Amit','Vivek','Harsh','Kunal','Ankit','Pranav','Yash','Karan',
  'Mohit','Ravi','Sachin','Tarun','Uday','Varun','Gaurav',
];

const FIRST_NAMES_FEMALE = [
  'Aanya','Priya','Sneha','Pooja','Riya','Simran','Neha','Kavya',
  'Divya','Meera','Ananya','Shruti','Tanya','Nisha','Komal',
  'Sakshi','Pallavi','Swati','Ankita','Isha','Khushi','Sonal',
  'Deepika','Monika','Reshma','Jyoti','Geeta','Lata','Mamta','Sunita',
];

const LAST_NAMES = [
  'Sharma','Verma','Singh','Gupta','Patel','Kumar','Joshi','Mishra',
  'Yadav','Tiwari','Pandey','Srivastava','Chauhan','Dubey','Shukla',
  'Agarwal','Bose','Das','Nair','Pillai','Mehta','Shah','Jain',
  'Chopra','Malhotra','Kapoor','Khanna','Bhatia','Sethi','Bajaj',
];

const CITIES    = ['Delhi','Mumbai','Kolkata','Chennai','Hyderabad','Bengaluru','Jaipur','Lucknow','Bhopal','Guwahati'];
const STATES    = ['Assam','Uttar Pradesh','Maharashtra','Delhi','Karnataka','Rajasthan','Madhya Pradesh','West Bengal'];
const BLOOD_GRP = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];

function pick(arr, idx) { return arr[idx % arr.length]; }

function dob(orderInClass, grade) {
  // age roughly: grade + 5 years, ± months
  const baseYear = new Date().getFullYear() - (grade + 5);
  const month    = String((orderInClass % 12) + 1).padStart(2, '0');
  const day      = String((orderInClass % 28) + 1).padStart(2, '0');
  return `${baseYear}-${month}-${day}`;
}

module.exports = {
  async up(queryInterface) {
    const now     = new Date();
    const today   = now.toISOString().slice(0, 10);

    // ── Fetch reference data ──────────────────────────────────────────────
    const [[school]] = await queryInterface.sequelize.query(
      `SELECT id FROM schools ORDER BY id ASC LIMIT 1;`
    );
    if (!school) { console.warn('No school found.'); return; }
    const schoolId = school.id;

    const [sessions] = await queryInterface.sequelize.query(
      `SELECT id FROM sessions WHERE school_id = ${schoolId} ORDER BY id DESC LIMIT 1;`
    );
    if (!sessions.length) { console.warn('No session found.'); return; }
    const sessionId = sessions[0].id;

    // sections with their class order_number and stream
    const [sections] = await queryInterface.sequelize.query(`
      SELECT s.id AS section_id, s.name AS section_name,
             c.id AS class_id,   c.order_number, c.stream
      FROM   sections s
      JOIN   classes  c ON c.id = s.class_id
      WHERE  s.is_deleted = false AND c.is_deleted = false
      ORDER  BY c.order_number ASC, c.stream ASC, s.name ASC;
    `);

    if (!sections.length) { console.warn('No sections found.'); return; }

    // ── Build rows ────────────────────────────────────────────────────────
    const studentRows    = [];
    const profileRows    = [];
    const enrollmentRows = [];

    let globalStudentIdx = 0; // used for name/detail variety

    for (const sec of sections) {
      const grade = sec.order_number; // 1–12

      for (let s = 0; s < 10; s++) {
        const gender     = s % 2 === 0 ? 'male' : 'female';
        const firstName  = gender === 'male'
          ? pick(FIRST_NAMES_MALE,   globalStudentIdx)
          : pick(FIRST_NAMES_FEMALE, globalStudentIdx);
        const lastName   = pick(LAST_NAMES, globalStudentIdx + 7);
        const admissionNo = `ADM-${schoolId}-${String(globalStudentIdx + 1).padStart(5, '0')}`;

        studentRows.push({
          school_id     : schoolId,
          admission_no  : admissionNo,
          first_name    : firstName,
          last_name     : lastName,
          date_of_birth : dob(s, grade),
          gender,
          is_deleted    : false,
          created_at    : now,
          updated_at    : now,
        });

        globalStudentIdx++;
      }
    }

    // Bulk insert students and get back their IDs
    await queryInterface.bulkInsert('students', studentRows);

    const [insertedStudents] = await queryInterface.sequelize.query(`
      SELECT id, admission_no FROM students
      WHERE  school_id = ${schoolId}
      ORDER  BY id ASC;
    `);

    // Map admissionNo → id
    const admissionToId = {};
    for (const st of insertedStudents) {
      admissionToId[st.admission_no] = st.id;
    }

    // ── Build profiles + enrollments ──────────────────────────────────────
    let globalIdx2 = 0;

    for (const sec of sections) {
      const grade = sec.order_number;

      for (let s = 0; s < 10; s++) {
        const admissionNo = `ADM-${schoolId}-${String(globalIdx2 + 1).padStart(5, '0')}`;
        const studentId   = admissionToId[admissionNo];
        const city        = pick(CITIES, globalIdx2);
        const state       = pick(STATES, globalIdx2 + 3);

        profileRows.push({
          student_id        : studentId,
          address           : `${(globalIdx2 % 99) + 1}, Main Street`,
          city,
          state,
          pincode           : String(100000 + (globalIdx2 % 899999)),
          phone             : `9${String(800000000 + globalIdx2).slice(0, 9)}`,
          email             : null,
          father_name       : `${pick(FIRST_NAMES_MALE, globalIdx2 + 5)} ${pick(LAST_NAMES, globalIdx2)}`,
          father_phone      : `9${String(700000000 + globalIdx2).slice(0, 9)}`,
          father_occupation : pick(['Farmer','Teacher','Engineer','Doctor','Businessman','Govt. Employee'], globalIdx2),
          mother_name       : `${pick(FIRST_NAMES_FEMALE, globalIdx2 + 3)} ${pick(LAST_NAMES, globalIdx2)}`,
          mother_phone      : null,
          mother_email      : null,
          emergency_contact : `9${String(700000000 + globalIdx2).slice(0, 9)}`,
          blood_group       : pick(BLOOD_GRP, globalIdx2),
          medical_notes     : null,
          photo_path        : null,
          valid_from        : today,
          valid_to          : null,
          is_current        : true,
          changed_by        : null,
          change_reason     : 'Initial profile — seeded',
          created_at        : now,
        });

        enrollmentRows.push({
          student_id             : studentId,
          session_id             : sessionId,
          class_id               : sec.class_id,
          section_id             : sec.section_id,
          roll_number            : String(s + 1).padStart(3, '0'),
          joined_date            : today,
          joining_type           : 'fresh',
          left_date              : null,
          leaving_type           : null,
          previous_enrollment_id : null,
          status                 : 'active',
          created_at             : now,
          updated_at             : now,
        });

        globalIdx2++;
      }
    }

    await queryInterface.bulkInsert('student_profiles', profileRows);
    await queryInterface.bulkInsert('enrollments',      enrollmentRows);

    console.log(`✓ Seeded ${studentRows.length} students across ${sections.length} sections.`);
  },

  async down(queryInterface) {
    const [[school]] = await queryInterface.sequelize.query(
      `SELECT id FROM schools ORDER BY id ASC LIMIT 1;`
    );
    if (!school) return;

    // enrollments first (FK), then profiles (trigger-guarded — bypass needed)
    await queryInterface.sequelize.query(`
      DELETE FROM enrollments
      WHERE student_id IN (
        SELECT id FROM students WHERE school_id = ${school.id}
          AND admission_no LIKE 'ADM-${school.id}-%'
      );
    `);

    // Disable the immutability trigger temporarily to allow profile deletion
    await queryInterface.sequelize.query(`
      ALTER TABLE student_profiles DISABLE TRIGGER trg_student_profiles_guard;

      DELETE FROM student_profiles
      WHERE student_id IN (
        SELECT id FROM students WHERE school_id = ${school.id}
          AND admission_no LIKE 'ADM-${school.id}-%'
      );

      ALTER TABLE student_profiles ENABLE TRIGGER trg_student_profiles_guard;
    `);

    await queryInterface.bulkDelete('students', {
      school_id    : school.id,
      admission_no : { [require('sequelize').Op.like]: `ADM-${school.id}-%` },
    });
  },
};