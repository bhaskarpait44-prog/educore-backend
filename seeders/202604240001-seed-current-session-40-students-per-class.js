'use strict';

const STUDENTS_PER_CLASS = 40;
const HIGHER_SECONDARY_START = 11;
const CREATED_AT = new Date('2026-04-24T09:00:00.000Z');
const JOINED_DATE = '2026-04-01';

const FIRST_NAMES_MALE = [
  'Aarav', 'Arjun', 'Vivaan', 'Aditya', 'Vihaan', 'Sai', 'Arnav', 'Ishaan',
  'Rohan', 'Karan', 'Rahul', 'Nikhil', 'Pranav', 'Yash', 'Dev', 'Harsh',
  'Dhruv', 'Kabir', 'Rishabh', 'Ansh', 'Shivam', 'Kunal', 'Tarun', 'Akshat',
  'Mayank', 'Parth', 'Naman', 'Varun', 'Siddharth', 'Aman',
];

const FIRST_NAMES_FEMALE = [
  'Aadhya', 'Ananya', 'Diya', 'Kavya', 'Priya', 'Riya', 'Sneha', 'Tanvi',
  'Pooja', 'Sakshi', 'Simran', 'Neha', 'Anjali', 'Meera', 'Swati', 'Divya',
  'Kritika', 'Nikita', 'Shruti', 'Pallavi', 'Ishita', 'Aditi', 'Shreya', 'Komal',
  'Deepika', 'Garima', 'Preeti', 'Nisha', 'Shweta', 'Ruchi',
];

const LAST_NAMES = [
  'Sharma', 'Verma', 'Singh', 'Patel', 'Gupta', 'Kumar', 'Joshi', 'Mehta',
  'Nair', 'Reddy', 'Yadav', 'Mishra', 'Agarwal', 'Pandey', 'Chauhan', 'Tiwari',
  'Bose', 'Das', 'Ghosh', 'Iyer', 'Pillai', 'Naidu', 'Rao', 'Sinha',
  'Malhotra', 'Chopra', 'Kapoor', 'Bhatia', 'Saxena', 'Chaudhary',
];

const CITIES = [
  'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune',
  'Ahmedabad', 'Jaipur', 'Lucknow', 'Bhopal', 'Indore', 'Nagpur', 'Patna',
  'Surat', 'Kanpur', 'Vadodara', 'Agra', 'Nashik', 'Ranchi',
];

const STATES = {
  Mumbai: 'Maharashtra',
  Pune: 'Maharashtra',
  Nagpur: 'Maharashtra',
  Nashik: 'Maharashtra',
  Delhi: 'Delhi',
  Bengaluru: 'Karnataka',
  Hyderabad: 'Telangana',
  Chennai: 'Tamil Nadu',
  Kolkata: 'West Bengal',
  Ahmedabad: 'Gujarat',
  Surat: 'Gujarat',
  Vadodara: 'Gujarat',
  Jaipur: 'Rajasthan',
  Agra: 'Rajasthan',
  Lucknow: 'Uttar Pradesh',
  Kanpur: 'Uttar Pradesh',
  Bhopal: 'Madhya Pradesh',
  Indore: 'Madhya Pradesh',
  Patna: 'Bihar',
  Ranchi: 'Jharkhand',
};

const OCCUPATIONS = [
  'Engineer', 'Doctor', 'Teacher', 'Business Owner', 'Farmer', 'Government Employee',
  'Lawyer', 'Accountant', 'Architect', 'Nurse', 'Police Officer', 'Driver',
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'];

const CLASS_AGE = {
  1: { min: 5, max: 6 },
  2: { min: 6, max: 7 },
  3: { min: 7, max: 8 },
  4: { min: 8, max: 9 },
  5: { min: 9, max: 10 },
  6: { min: 10, max: 11 },
  7: { min: 11, max: 12 },
  8: { min: 12, max: 13 },
  9: { min: 13, max: 14 },
  10: { min: 14, max: 15 },
  11: { min: 15, max: 16 },
  12: { min: 16, max: 17 },
};

function seededRand(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pick(arr, rand) {
  return arr[Math.floor(rand() * arr.length)];
}

function pad(value, width = 2) {
  return String(value).padStart(width, '0');
}

function phone(rand) {
  const start = 6 + Math.floor(rand() * 4);
  return `${start}${pad(Math.floor(rand() * 999999999), 9)}`.slice(0, 10);
}

function chunkInsert(queryInterface, table, rows, size = 200) {
  const jobs = [];
  for (let index = 0; index < rows.length; index += size) {
    jobs.push(queryInterface.bulkInsert(table, rows.slice(index, index + size), {}));
  }
  return Promise.all(jobs);
}

function admissionNo(sessionId, classOrder, seat) {
  return `CS${pad(sessionId, 2)}-C${pad(classOrder)}-${pad(seat, 3)}`;
}

module.exports = {
  async up(queryInterface) {
    const { QueryTypes } = require('sequelize');
    const sequelize = queryInterface.sequelize;

    const currentSession = await sequelize.query(
      `
        SELECT id, school_id, name
        FROM sessions
        WHERE is_current = true
        ORDER BY id DESC
        LIMIT 1
      `,
      { type: QueryTypes.SELECT }
    );

    if (!currentSession.length) {
      throw new Error('No current session found. Seed a session with is_current = true first.');
    }

    const session = currentSession[0];

    const classes = await sequelize.query(
      `
        SELECT c.id, c.name, c.order_number, s.id AS section_id, s.name AS section_name
        FROM classes c
        JOIN sections s ON s.class_id = c.id
        WHERE c.school_id = :schoolId
          AND COALESCE(c.is_deleted, false) = false
          AND COALESCE(s.is_deleted, false) = false
        ORDER BY c.order_number ASC, s.id ASC
      `,
      {
        replacements: { schoolId: session.school_id },
        type: QueryTypes.SELECT,
      }
    );

    const classMap = new Map();
    for (const row of classes) {
      if (!classMap.has(row.id)) {
        classMap.set(row.id, row);
      }
    }

    const subjectRows = await sequelize.query(
      `
        SELECT id, class_id, name, subject_type, is_core, order_number
        FROM subjects
        WHERE COALESCE(is_deleted, false) = false
        ORDER BY class_id ASC, order_number ASC, id ASC
      `,
      { type: QueryTypes.SELECT }
    );

    const subjectsByClass = new Map();
    for (const row of subjectRows) {
      if (!subjectsByClass.has(row.class_id)) {
        subjectsByClass.set(row.class_id, []);
      }
      subjectsByClass.get(row.class_id).push(row);
    }

    for (const classRow of classMap.values()) {
      if (!subjectsByClass.has(classRow.id)) {
        throw new Error(`No subjects found for ${classRow.name}. Seed subjects before running this file.`);
      }
    }

    for (const classRow of [...classMap.values()].sort((a, b) => a.order_number - b.order_number)) {
      const existingCountRows = await sequelize.query(
        `
          SELECT COUNT(*)::int AS count
          FROM enrollments
          WHERE session_id = :sessionId
            AND class_id = :classId
            AND status = 'active'
        `,
        {
          replacements: { sessionId: session.id, classId: classRow.id },
          type: QueryTypes.SELECT,
        }
      );

      const existingCount = Number(existingCountRows[0]?.count || 0);
      const toCreate = Math.max(0, STUDENTS_PER_CLASS - existingCount);

      if (toCreate === 0) {
        continue;
      }

      const maxRollRows = await sequelize.query(
        `
          SELECT COALESCE(MAX(NULLIF(regexp_replace(roll_number, '[^0-9]', '', 'g'), '')::int), 0) AS max_roll
          FROM enrollments
          WHERE session_id = :sessionId
            AND class_id = :classId
        `,
        {
          replacements: { sessionId: session.id, classId: classRow.id },
          type: QueryTypes.SELECT,
        }
      );

      const maxRoll = Number(maxRollRows[0]?.max_roll || 0);

      const students = [];
      const profiles = [];
      const enrollments = [];
      const studentSubjects = [];
      const createdAdmissionNos = [];

      for (let offset = 1; offset <= toCreate; offset += 1) {
        const seat = existingCount + offset;
        const rand = seededRand(session.id * 100000 + classRow.order_number * 1000 + seat);
        const isMale = rand() < 0.5;
        const firstName = pick(isMale ? FIRST_NAMES_MALE : FIRST_NAMES_FEMALE, rand);
        const lastName = pick(LAST_NAMES, rand);
        const ageBand = CLASS_AGE[classRow.order_number] || { min: 10, max: 12 };
        const age = ageBand.min + Math.floor(rand() * (ageBand.max - ageBand.min + 1));
        const dobYear = 2026 - age;
        const dob = `${dobYear}-${pad(1 + Math.floor(rand() * 12))}-${pad(1 + Math.floor(rand() * 28))}`;
        const city = pick(CITIES, rand);
        const seatAdmissionNo = admissionNo(session.id, classRow.order_number, seat);
        const studentEmailLocal = `${firstName}.${lastName}.${classRow.order_number}${seat}`.toLowerCase();

        createdAdmissionNos.push(seatAdmissionNo);

        students.push({
          school_id: session.school_id,
          admission_no: seatAdmissionNo,
          first_name: firstName,
          last_name: lastName,
          date_of_birth: dob,
          gender: isMale ? 'male' : 'female',
          is_active: true,
          is_deleted: false,
          created_at: CREATED_AT,
          updated_at: CREATED_AT,
        });

        profiles.push({
          admission_no: seatAdmissionNo,
          address: `${seat * 7}, ${firstName} Nagar, ${lastName} Colony`,
          city,
          state: STATES[city] || 'Unknown',
          pincode: String(100000 + Math.floor(rand() * 899999)),
          phone: phone(rand),
          email: classRow.order_number >= 9 ? `${studentEmailLocal}@student.educore.local` : null,
          father_name: `${pick(FIRST_NAMES_MALE, rand)} ${lastName}`,
          father_phone: phone(rand),
          father_occupation: pick(OCCUPATIONS, rand),
          mother_name: `${pick(FIRST_NAMES_FEMALE, rand)} ${lastName}`,
          mother_phone: phone(rand),
          mother_email: `${pick(FIRST_NAMES_FEMALE, rand).toLowerCase()}.${lastName.toLowerCase()}@mail.local`,
          emergency_contact: phone(rand),
          blood_group: pick(BLOOD_GROUPS, rand),
          medical_notes: null,
          photo_path: null,
          valid_from: JOINED_DATE,
          valid_to: null,
          is_current: true,
          changed_by: null,
          change_reason: 'Current session bulk seed',
          created_at: CREATED_AT,
        });

        enrollments.push({
          admission_no: seatAdmissionNo,
          student_id: null,
          session_id: session.id,
          class_id: classRow.id,
          section_id: classRow.section_id,
          roll_number: `R${pad(maxRoll + offset, 3)}`,
          joined_date: JOINED_DATE,
          joining_type: classRow.order_number === 1 ? 'fresh' : 'promoted',
          left_date: null,
          leaving_type: null,
          previous_enrollment_id: null,
          status: 'active',
          created_at: CREATED_AT,
          updated_at: CREATED_AT,
        });
      }

      await chunkInsert(queryInterface, 'students', students);

      const insertedStudents = await sequelize.query(
        `
          SELECT id, admission_no
          FROM students
          WHERE school_id = :schoolId
            AND admission_no IN (:admissionNos)
        `,
        {
          replacements: {
            schoolId: session.school_id,
            admissionNos: createdAdmissionNos,
          },
          type: QueryTypes.SELECT,
        }
      );

      const idByAdmissionNo = new Map(insertedStudents.map((row) => [row.admission_no, row.id]));

      const profileRows = profiles.map((row) => ({
        student_id: idByAdmissionNo.get(row.admission_no),
        address: row.address,
        city: row.city,
        state: row.state,
        pincode: row.pincode,
        phone: row.phone,
        email: row.email,
        father_name: row.father_name,
        father_phone: row.father_phone,
        father_occupation: row.father_occupation,
        mother_name: row.mother_name,
        mother_phone: row.mother_phone,
        mother_email: row.mother_email,
        emergency_contact: row.emergency_contact,
        blood_group: row.blood_group,
        medical_notes: row.medical_notes,
        photo_path: row.photo_path,
        valid_from: row.valid_from,
        valid_to: row.valid_to,
        is_current: row.is_current,
        changed_by: row.changed_by,
        change_reason: row.change_reason,
        created_at: row.created_at,
      }));

      const enrollmentRows = enrollments.map((row) => ({
        student_id: idByAdmissionNo.get(row.admission_no),
        session_id: row.session_id,
        class_id: row.class_id,
        section_id: row.section_id,
        roll_number: row.roll_number,
        joined_date: row.joined_date,
        joining_type: row.joining_type,
        left_date: row.left_date,
        leaving_type: row.leaving_type,
        previous_enrollment_id: row.previous_enrollment_id,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));

      const classSubjects = subjectsByClass.get(classRow.id) || [];
      for (const subject of classSubjects) {
        for (const admission of createdAdmissionNos) {
          studentSubjects.push({
            student_id: idByAdmissionNo.get(admission),
            session_id: session.id,
            subject_id: subject.id,
            is_core: Boolean(subject.is_core),
            is_active: true,
            created_by: null,
            updated_by: null,
            created_at: CREATED_AT,
            updated_at: CREATED_AT,
          });
        }
      }

      await chunkInsert(queryInterface, 'student_profiles', profileRows);
      await chunkInsert(queryInterface, 'enrollments', enrollmentRows);
      await chunkInsert(queryInterface, 'student_subjects', studentSubjects);
    }

    const pcbValidationRows = await sequelize.query(
      `
        SELECT c.order_number, c.name AS class_name, sub.name AS subject_name, COUNT(DISTINCT ss.student_id)::int AS student_count
        FROM student_subjects ss
        JOIN subjects sub ON sub.id = ss.subject_id
        JOIN classes c ON c.id = sub.class_id
        JOIN enrollments e
          ON e.student_id = ss.student_id
         AND e.session_id = ss.session_id
         AND e.class_id = c.id
         AND e.status = 'active'
        WHERE ss.session_id = :sessionId
          AND ss.is_active = true
          AND c.order_number IN (11, 12)
          AND sub.subject_type = 'both'
        GROUP BY c.order_number, c.name, sub.name
        ORDER BY c.order_number, sub.name
      `,
      {
        replacements: { sessionId: session.id },
        type: QueryTypes.SELECT,
      }
    );

    const expectedPcbRows = [];
    for (const classOrder of [11, 12]) {
      for (const subjectName of ['Physics', 'Chemistry', 'Biology']) {
        expectedPcbRows.push({ classOrder, subjectName });
      }
    }

    const missingPcbSubjects = expectedPcbRows.filter(({ classOrder, subjectName }) => {
      return !pcbValidationRows.some((row) => {
        return Number(row.order_number) === classOrder
          && row.subject_name === subjectName
          && Number(row.student_count) >= STUDENTS_PER_CLASS;
      });
    });

    if (missingPcbSubjects.length) {
      throw new Error(
        `Current session seed completed, but PCB validation failed for: ${missingPcbSubjects
          .map((row) => `Class ${row.classOrder} ${row.subjectName}`)
          .join(', ')}`
      );
    }
  },

  async down(queryInterface) {
    const { QueryTypes } = require('sequelize');
    const sequelize = queryInterface.sequelize;

    const currentSession = await sequelize.query(
      `
        SELECT id, school_id
        FROM sessions
        WHERE is_current = true
        ORDER BY id DESC
        LIMIT 1
      `,
      { type: QueryTypes.SELECT }
    );

    if (!currentSession.length) {
      return;
    }

    const session = currentSession[0];
    const classes = await sequelize.query(
      `
        SELECT id, order_number
        FROM classes
        WHERE school_id = :schoolId
          AND COALESCE(is_deleted, false) = false
      `,
      {
        replacements: { schoolId: session.school_id },
        type: QueryTypes.SELECT,
      }
    );

    const admissionNos = [];
    for (const classRow of classes) {
      for (let seat = 1; seat <= STUDENTS_PER_CLASS; seat += 1) {
        admissionNos.push(admissionNo(session.id, classRow.order_number, seat));
      }
    }

    if (!admissionNos.length) {
      return;
    }

    const students = await sequelize.query(
      `
        SELECT id
        FROM students
        WHERE school_id = :schoolId
          AND admission_no IN (:admissionNos)
      `,
      {
        replacements: {
          schoolId: session.school_id,
          admissionNos,
        },
        type: QueryTypes.SELECT,
      }
    );

    const studentIds = students.map((row) => row.id);

    if (!studentIds.length) {
      return;
    }

    await sequelize.query(
      `DELETE FROM student_subjects WHERE student_id IN (:studentIds)`,
      { replacements: { studentIds }, type: QueryTypes.DELETE }
    );
    await sequelize.query(
      `DELETE FROM enrollments WHERE student_id IN (:studentIds)`,
      { replacements: { studentIds }, type: QueryTypes.DELETE }
    );
    await sequelize.query(`ALTER TABLE student_profiles DISABLE TRIGGER trg_student_profiles_guard`);
    try {
      await sequelize.query(
        `DELETE FROM student_profiles WHERE student_id IN (:studentIds)`,
        { replacements: { studentIds }, type: QueryTypes.DELETE }
      );
    } finally {
      await sequelize.query(`ALTER TABLE student_profiles ENABLE TRIGGER trg_student_profiles_guard`);
    }
    await queryInterface.bulkDelete(
      'students',
      {
        school_id: session.school_id,
        admission_no: admissionNos,
      },
      {}
    );
  },
};
