'use strict';

/**
 * Seed: exams + exam_subjects + exam_results + student_results
 *
 * Exam schedule per class per session:
 *   Term 1   : 2026-04-15 → 2026-04-22  (completed)
 *   Midterm  : 2026-06-01 → 2026-06-08  (upcoming)
 *   Final    : 2026-10-01 → 2026-10-10  (upcoming)
 *
 * exam_results only seeded for Term 1 (completed exam).
 * Marks distribution: realistic bell curve per student per subject.
 */

// ── Grade calculator ────────────────────────────────────────────────────────
function calcGrade(pct) {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 40) return 'D';
  return 'F';
}

// Seeded deterministic random (same data every run)
function seededRand(seed) {
  let s = seed >>> 0 || 1;
  return function () {
    s = Math.imul(s ^ (s >>> 17), 0xb5a4bcae);
    s ^= s << 7;
    s = Math.imul(s ^ (s >>> 13), 0x45d9f3b);
    s ^= s >> 16;
    return ((s >>> 0) / 0xffffffff);
  };
}

// Bell-curve marks: most students score 55–85%
function genMarks(total, passing, enrollmentId, subjectId, examId) {
  const rand  = seededRand(enrollmentId * 997 + subjectId * 31 + examId * 7);
  // Box-Muller for normal distribution
  const u1    = Math.max(rand(), 1e-10);
  const u2    = rand();
  const z     = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  // Mean 70%, std 15%
  const pct   = Math.min(100, Math.max(0, 70 + z * 15));
  const marks = Math.round((pct / 100) * total * 2) / 2; // round to 0.5
  const isPass = marks >= passing;
  return { marks, isPass, grade: calcGrade(pct) };
}

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    // ── Fetch reference data ────────────────────────────────────────────
    const [[school]] = await queryInterface.sequelize.query(
      `SELECT id FROM schools ORDER BY id ASC LIMIT 1;`
    );
    if (!school) { console.warn('No school found.'); return; }

    const [[session]] = await queryInterface.sequelize.query(
      `SELECT id FROM sessions WHERE school_id = ${school.id} ORDER BY id DESC LIMIT 1;`
    );
    if (!session) { console.warn('No session found.'); return; }
    const sessionId = session.id;

    // All classes
    const [classes] = await queryInterface.sequelize.query(`
      SELECT id, order_number, stream, name
      FROM   classes
      WHERE  is_deleted = false
      ORDER  BY order_number ASC, stream ASC;
    `);

    // Subjects per class
    const [allSubjects] = await queryInterface.sequelize.query(`
      SELECT id, class_id, name, code,
             subject_type,
             combined_total_marks,
             combined_passing_marks,
             theory_total_marks,
             theory_passing_marks,
             practical_total_marks,
             practical_passing_marks
      FROM   subjects
      WHERE  is_deleted = false
      ORDER  BY class_id ASC, order_number ASC;
    `);

    const subjectsByClass = {};
    allSubjects.forEach((s) => {
      if (!subjectsByClass[s.class_id]) subjectsByClass[s.class_id] = [];
      subjectsByClass[s.class_id].push(s);
    });

    // Enrollments per class
    const [allEnrollments] = await queryInterface.sequelize.query(`
      SELECT e.id AS enrollment_id, e.class_id, e.section_id, e.student_id
      FROM   enrollments e
      WHERE  e.session_id = ${sessionId} AND e.status = 'active'
      ORDER  BY e.class_id ASC, e.id ASC;
    `);

    const enrollmentsByClass = {};
    allEnrollments.forEach((e) => {
      if (!enrollmentsByClass[e.class_id]) enrollmentsByClass[e.class_id] = [];
      enrollmentsByClass[e.class_id].push(e);
    });

    // HOD teacher id for entered_by
    const [[hod]] = await queryInterface.sequelize.query(
      `SELECT id FROM users WHERE email = 'geeta.mishra@school.edu' LIMIT 1;`
    );
    const hodId = hod ? hod.id : null;

    // ── Exam schedule definition ────────────────────────────────────────
    const examSchedule = [
      {
        name        : 'Term 1 Examination',
        exam_type   : 'term',
        start_date  : '2026-04-15',
        end_date    : '2026-04-22',
        status      : 'completed',
        seedResults : true,
      },
      {
        name        : 'Midterm Examination',
        exam_type   : 'midterm',
        start_date  : '2026-06-01',
        end_date    : '2026-06-08',
        status      : 'upcoming',
        seedResults : false,
      },
      {
        name        : 'Final Examination',
        exam_type   : 'final',
        start_date  : '2026-10-01',
        end_date    : '2026-10-10',
        status      : 'upcoming',
        seedResults : false,
      },
    ];

    // ── Insert exams ────────────────────────────────────────────────────
    const examRows = [];
    for (const cls of classes) {
      const subs     = subjectsByClass[cls.id] || [];
      const totalMks = subs.reduce((sum, s) => sum + parseFloat(s.combined_total_marks), 0);
      const passMks  = subs.reduce((sum, s) => sum + parseFloat(s.combined_passing_marks), 0);

      for (const sch of examSchedule) {
        examRows.push({
          session_id    : sessionId,
          class_id      : cls.id,
          name          : sch.name,
          exam_type     : sch.exam_type,
          start_date    : sch.start_date,
          end_date      : sch.end_date,
          total_marks   : totalMks,
          passing_marks : passMks,
          status        : sch.status,
          created_at    : now,
          updated_at    : now,
        });
      }
    }

    await queryInterface.bulkInsert('exams', examRows);
    console.log(`\n[seed-exams] Inserted ${examRows.length} exams (${classes.length} classes × ${examSchedule.length} exams).`);

    // Fetch inserted exams to get IDs
    const [insertedExams] = await queryInterface.sequelize.query(`
      SELECT id, class_id, name, exam_type, status
      FROM   exams
      WHERE  session_id = ${sessionId}
      ORDER  BY class_id ASC, id ASC;
    `);

    // Map: class_id + exam_type → exam row
    const examMap = {};
    insertedExams.forEach((ex) => {
      examMap[`${ex.class_id}-${ex.exam_type}`] = ex;
    });

    // ── Insert exam_subjects ────────────────────────────────────────────
    // Fetch teacher assignments for subject → teacher lookup
    const [assignments] = await queryInterface.sequelize.query(`
      SELECT subject_id, class_id, section_id, teacher_id
      FROM   teacher_assignments
      WHERE  session_id = ${sessionId}
        AND  is_active = true
        AND  is_class_teacher = false
        AND  subject_id IS NOT NULL;
    `);

    // Use first section's teacher per class+subject
    const subjectTeacherMap = {};
    assignments.forEach((a) => {
      const key = `${a.class_id}-${a.subject_id}`;
      if (!subjectTeacherMap[key]) subjectTeacherMap[key] = a.teacher_id;
    });

    const examSubjectRows = [];
    for (const ex of insertedExams) {
      const subs = subjectsByClass[ex.class_id] || [];
      for (const sub of subs) {
        const teacherId = subjectTeacherMap[`${ex.class_id}-${sub.id}`] || hodId;
        examSubjectRows.push({
          exam_id                 : ex.id,
          subject_id              : sub.id,
          subject_type            : sub.subject_type,
          theory_total_marks      : sub.theory_total_marks,
          theory_passing_marks    : sub.theory_passing_marks,
          practical_total_marks   : sub.practical_total_marks,
          practical_passing_marks : sub.practical_passing_marks,
          combined_total_marks    : sub.combined_total_marks,
          combined_passing_marks  : sub.combined_passing_marks,
          assigned_teacher_id     : teacherId,
          review_status           : ex.status === 'completed' ? 'approved' : 'draft',
          submitted_by            : ex.status === 'completed' ? teacherId  : null,
          submitted_at            : ex.status === 'completed' ? now        : null,
          reviewed_by             : ex.status === 'completed' ? hodId      : null,
          reviewed_at             : ex.status === 'completed' ? now        : null,
          review_note             : null,
          created_by              : hodId,
          updated_by              : null,
          created_at              : now,
          updated_at              : now,
        });
      }
    }

    const BATCH = 500;
    for (let i = 0; i < examSubjectRows.length; i += BATCH) {
      await queryInterface.bulkInsert('exam_subjects', examSubjectRows.slice(i, i + BATCH));
    }
    console.log(`[seed-exams] Inserted ${examSubjectRows.length} exam_subject rows.`);

    // ── Insert exam_results for completed exams only ────────────────────
    const completedExams = insertedExams.filter((ex) => ex.status === 'completed');
    const resultRows     = [];

    for (const ex of completedExams) {
      const subs        = subjectsByClass[ex.class_id] || [];
      const enrollments = enrollmentsByClass[ex.class_id] || [];

      for (const enr of enrollments) {
        // 5% chance student was absent for the exam
        const absentRand = seededRand(enr.enrollment_id * 13 + ex.id);
        const isAbsent   = absentRand() < 0.05;

        for (const sub of subs) {
          if (isAbsent) {
            resultRows.push({
              exam_id         : ex.id,
              enrollment_id   : enr.enrollment_id,
              subject_id      : sub.id,
              marks_obtained  : null,
              is_absent       : true,
              grade           : 'F',
              is_pass         : false,
              entered_by      : hodId,
              override_by     : null,
              override_reason : null,
              created_at      : now,
              updated_at      : now,
            });
          } else {
            const { marks, isPass, grade } = genMarks(
              parseFloat(sub.combined_total_marks),
              parseFloat(sub.combined_passing_marks),
              enr.enrollment_id,
              sub.id,
              ex.id
            );
            resultRows.push({
              exam_id         : ex.id,
              enrollment_id   : enr.enrollment_id,
              subject_id      : sub.id,
              marks_obtained  : marks,
              is_absent       : false,
              grade,
              is_pass         : isPass,
              entered_by      : hodId,
              override_by     : null,
              override_reason : null,
              created_at      : now,
              updated_at      : now,
            });
          }
        }
      }
    }

    for (let i = 0; i < resultRows.length; i += BATCH) {
      await queryInterface.bulkInsert('exam_results', resultRows.slice(i, i + BATCH));
    }
    console.log(`[seed-exams] Inserted ${resultRows.length} exam_result rows.`);

    // ── Insert student_results (aggregate per enrollment) ───────────────
    // Group exam_results by enrollment_id for Term 1
    const aggregates = {};
    for (const row of resultRows) {
      if (!aggregates[row.enrollment_id]) {
        aggregates[row.enrollment_id] = {
          totalMax     : 0,
          totalObt     : 0,
          failedCore   : [],
          allPassed    : true,
        };
      }
      const agg = aggregates[row.enrollment_id];
      // Find subject total from allSubjects
      const sub = allSubjects.find((s) => s.id === row.subject_id);
      if (!sub) continue;
      agg.totalMax += parseFloat(sub.combined_total_marks);
      agg.totalObt += row.is_absent ? 0 : parseFloat(row.marks_obtained || 0);
      if (!row.is_pass) {
        agg.failedCore.push(row.subject_id);
        agg.allPassed = false;
      }
    }

    // Fetch enrollments for session to get session_id on student_results
    const studentResultRows = [];
    for (const enr of allEnrollments) {
      const agg = aggregates[enr.enrollment_id];
      if (!agg) continue;

      const pct  = agg.totalMax > 0 ? (agg.totalObt / agg.totalMax) * 100 : 0;
      const grade = calcGrade(pct);

      let result = 'pass';
      let compartmentSubjects = null;
      let isPromoted = true;

      if (agg.failedCore.length === 0) {
        result = 'pass'; isPromoted = true;
      } else if (agg.failedCore.length <= 2) {
        result = 'compartment';
        compartmentSubjects = agg.failedCore;
        isPromoted = false;
      } else {
        result = 'fail'; isPromoted = false;
      }

      studentResultRows.push({
        enrollment_id             : enr.enrollment_id,
        session_id                : sessionId,
        total_marks               : Math.round(agg.totalMax * 100) / 100,
        marks_obtained            : Math.round(agg.totalObt * 100) / 100,
        percentage                : Math.round(pct * 100) / 100,
        grade,
        result,
        compartment_subjects      : compartmentSubjects ? JSON.stringify(compartmentSubjects) : null,
        is_promoted               : isPromoted,
        promotion_override_by     : null,
        promotion_override_reason : null,
        created_at                : now,
        updated_at                : now,
      });
    }

    for (let i = 0; i < studentResultRows.length; i += BATCH) {
      await queryInterface.bulkInsert('student_results', studentResultRows.slice(i, i + BATCH));
    }
    console.log(`[seed-exams] Inserted ${studentResultRows.length} student_result rows.`);
    console.log(`\n[seed-exams] Summary:`);
    console.log(`  Exams          : ${examRows.length}`);
    console.log(`  Exam subjects  : ${examSubjectRows.length}`);
    console.log(`  Exam results   : ${resultRows.length}`);
    console.log(`  Student results: ${studentResultRows.length}\n`);
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

    const [exams] = await queryInterface.sequelize.query(
      `SELECT id FROM exams WHERE session_id = ${session.id};`
    );
    const examIds = exams.map((e) => e.id);

    if (examIds.length) {
      await queryInterface.sequelize.query(
        `DELETE FROM exam_results  WHERE exam_id IN (${examIds.join(',')});`
      );
      await queryInterface.sequelize.query(
        `DELETE FROM exam_subjects WHERE exam_id IN (${examIds.join(',')});`
      );
    }

    const [enrollments] = await queryInterface.sequelize.query(
      `SELECT id FROM enrollments WHERE session_id = ${session.id};`
    );
    if (enrollments.length) {
      const eIds = enrollments.map((e) => e.id);
      await queryInterface.sequelize.query(
        `DELETE FROM student_results WHERE enrollment_id IN (${eIds.join(',')});`
      );
    }

    await queryInterface.bulkDelete('exams', { session_id: session.id });
    console.log('[seed-exams] Exams and results removed.');
  },
};