'use strict';

/**
 * utils/examEngine.js
 *
 * Three exam result functions + one shared grade calculator.
 * No Express — called by controllers in Step 9.
 *
 * Result decision tree:
 *
 *   attendance < 75%
 *       └─► FAIL  (attendance rule overrides marks entirely)
 *
 *   core subjects failed = 0
 *       └─► PASS
 *
 *   core subjects failed = 1 or 2
 *       └─► COMPARTMENT  (eligible for re-exam)
 *
 *   core subjects failed > 2
 *       └─► FAIL
 */

const sequelize            = require('../config/database');
const { getAttendancePercent } = require('./attendanceCalculator');
const auditLogger          = require('./auditLogger');

const RESULT_RULES = {
  minAttendancePercent: Number(process.env.RESULT_MIN_ATTENDANCE_PERCENT || 75),
  maxCoreFailuresForCompartment: Number(process.env.RESULT_MAX_CORE_FAILURES_FOR_COMPARTMENT || 2),
  grades: [
    { min: Number(process.env.GRADE_A_PLUS_MIN || 90), grade: 'A+' },
    { min: Number(process.env.GRADE_A_MIN || 80), grade: 'A' },
    { min: Number(process.env.GRADE_B_PLUS_MIN || 70), grade: 'B+' },
    { min: Number(process.env.GRADE_B_MIN || 60), grade: 'B' },
    { min: Number(process.env.GRADE_C_MIN || 50), grade: 'C' },
    { min: Number(process.env.GRADE_D_MIN || 40), grade: 'D' },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED: Grade calculator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a percentage to a letter grade.
 * Applied consistently to both subject-level and session-level percentages.
 */
function percentageToGrade(pct) {
  for (const band of RESULT_RULES.grades) {
    if (pct >= band.min) return band.grade;
  }
  return 'F';
}

/**
 * Calculates grade and pass/fail for a single subject result.
 * @param {number} marksObtained
 * @param {number} totalMarks
 * @param {number} passingMarks
 * @param {boolean} isAbsent
 */
function calcSubjectResult(marksObtained, totalMarks, passingMarks, isAbsent) {
  if (isAbsent) {
    return { grade: 'F', isPass: false, percentage: 0 };
  }
  const pct    = parseFloat(((marksObtained / totalMarks) * 100).toFixed(2));
  const isPass = marksObtained >= passingMarks;
  return { grade: percentageToGrade(pct), isPass, percentage: pct };
}


// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 1: calculateResult
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates and SAVES the final session result for one student.
 *
 * Algorithm:
 *   1. Fetch all exam_results for this enrollment across all FINAL exams
 *   2. Check attendance percentage — if < 75%, result = FAIL regardless
 *   3. Aggregate marks across all subjects
 *   4. Check core subject pass/fail individually
 *   5. Apply result rule: 0 failed = pass, 1-2 failed = compartment, 3+ = fail
 *   6. Upsert into student_results
 *
 * @param {number} enrollmentId
 * @param {number} sessionId
 */
async function calculateResult(enrollmentId, sessionId) {

  // ── Step 1: Fetch all completed exam results for this enrollment ─────────
  const [examResults] = await sequelize.query(`
    SELECT
      er.id,
      er.marks_obtained,
      er.is_absent,
      er.is_pass,
      sub.id            AS subject_id,
      sub.name          AS subject_name,
      es.combined_total_marks   AS subject_total,
      es.combined_passing_marks AS subject_passing,
      sub.is_core,
      e.exam_type,
      e.status          AS exam_status,
      es.review_status
    FROM exam_results  er
    JOIN exams         e   ON e.id   = er.exam_id
    JOIN exam_subjects es  ON es.exam_id = er.exam_id
                           AND es.subject_id = er.subject_id
    JOIN subjects      sub ON sub.id = er.subject_id
    WHERE er.enrollment_id = :enrollmentId
      AND e.session_id     = :sessionId
      AND es.review_status = 'approved'
      AND e.exam_type     != 'compartment';
  `, { replacements: { enrollmentId, sessionId } });

  if (examResults.length === 0) {
    throw new Error(
      `No completed exam results found for enrollment_id=${enrollmentId} in session_id=${sessionId}.`
    );
  }

  // ── Step 2: Attendance check ─────────────────────────────────────────────
  const attendanceStats = await getAttendancePercent(enrollmentId);
  const attendancePct   = attendanceStats.percentage;
  const failedAttendance = attendancePct < RESULT_RULES.minAttendancePercent;

  // ── Step 3: Aggregate marks ──────────────────────────────────────────────
  let totalMarks    = 0;
  let marksObtained = 0;

  // Consolidate by subject — if multiple exams exist, sum them
  const subjectMap = {};

  for (const row of examResults) {
    const key = row.subject_id;
    if (!subjectMap[key]) {
      subjectMap[key] = {
        subject_id      : row.subject_id,
        subject_name    : row.subject_name,
        is_core         : row.is_core,
        total_marks     : 0,
        passing_marks   : parseFloat(row.subject_passing),
        obtained        : 0,
        is_absent       : false,
      };
    }
    subjectMap[key].total_marks += parseFloat(row.subject_total);
    subjectMap[key].obtained    += row.is_absent ? 0 : parseFloat(row.marks_obtained || 0);
    if (row.is_absent) subjectMap[key].is_absent = true;
  }

  const subjectSummaries    = Object.values(subjectMap);
  const failedCoreSubjects  = [];

  for (const sub of subjectSummaries) {
    totalMarks    += sub.total_marks;
    marksObtained += sub.obtained;

    // Recalculate pass/fail using aggregated marks across exams
    const subPassed = !sub.is_absent && (sub.obtained >= sub.passing_marks);

    if (sub.is_core && !subPassed) {
      failedCoreSubjects.push({
        subject_id   : sub.subject_id,
        subject_name : sub.subject_name,
        obtained     : sub.obtained,
        passing_marks: sub.passing_marks,
        total_marks  : sub.total_marks,
      });
    }
  }

  // ── Step 4: Apply result rules ────────────────────────────────────────────
  const percentage         = parseFloat(((marksObtained / totalMarks) * 100).toFixed(2));
  const overallGrade       = percentageToGrade(percentage);
  const failedCoreCount    = failedCoreSubjects.length;

  let result;
  let compartmentSubjects = null;
  let isPromoted          = false;

  if (failedAttendance) {
    // Attendance rule overrides everything
    result      = 'fail';
    isPromoted  = false;
  } else if (failedCoreCount === 0) {
    result      = 'pass';
    isPromoted  = true;
  } else if (failedCoreCount <= RESULT_RULES.maxCoreFailuresForCompartment) {
    result             = 'compartment';
    compartmentSubjects = failedCoreSubjects.map(s => s.subject_id);
    isPromoted         = false;  // Pending compartment exam
  } else {
    result      = 'fail';
    isPromoted  = false;
  }

  // ── Step 5: Upsert student_results ───────────────────────────────────────
  const [existing] = await sequelize.query(`
    SELECT id FROM student_results WHERE enrollment_id = :enrollmentId LIMIT 1;
  `, { replacements: { enrollmentId } });

  const resultPayload = {
    enrollment_id         : enrollmentId,
    session_id            : sessionId,
    total_marks           : totalMarks.toFixed(2),
    marks_obtained        : marksObtained.toFixed(2),
    percentage,
    grade                 : overallGrade,
    result,
    compartment_subjects  : compartmentSubjects ? JSON.stringify(compartmentSubjects) : null,
    is_promoted           : isPromoted,
    promotion_override_by : null,
    promotion_override_reason: null,
    updated_at            : new Date(),
  };

  if (existing.length > 0) {
    await sequelize.query(`
      UPDATE student_results SET
        total_marks          = :total_marks,
        marks_obtained       = :marks_obtained,
        percentage           = :percentage,
        grade                = :grade,
        result               = :result,
        compartment_subjects = :compartment_subjects,
        is_promoted          = :is_promoted,
        updated_at           = NOW()
      WHERE enrollment_id = :enrollment_id;
    `, { replacements: resultPayload });
  } else {
    await sequelize.query(`
      INSERT INTO student_results
        (enrollment_id, session_id, total_marks, marks_obtained, percentage,
         grade, result, compartment_subjects, is_promoted,
         promotion_override_by, promotion_override_reason, created_at, updated_at)
      VALUES
        (:enrollment_id, :session_id, :total_marks, :marks_obtained, :percentage,
         :grade, :result, :compartment_subjects, :is_promoted,
         NULL, NULL, NOW(), NOW());
    `, { replacements: resultPayload });
  }

  return {
    enrollmentId,
    sessionId,
    totalMarks,
    marksObtained,
    percentage,
    grade            : overallGrade,
    result,
    failedCoreSubjects,
    compartmentSubjects,
    isPromoted,
    attendancePct,
    failedAttendance,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 2: processCompartment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Updates compartment exam marks for one subject and recalculates overall result.
 *
 * Steps:
 *   1. Validate a compartment exam exists for this session
 *   2. Upsert exam_result for the compartment exam + this subject
 *   3. Recalculate full result via calculateResult()
 *   4. If now passes → is_promoted = true, compartment_subjects cleared
 *   5. Return updated result
 *
 * @param {number} enrollmentId
 * @param {number} subjectId
 * @param {number} newMarks
 * @param {number} enteredBy   user id
 */
async function processCompartment(enrollmentId, subjectId, newMarks, enteredBy) {
  return sequelize.transaction(async (t) => {

    // ── Fetch enrollment + session ────────────────────────────────────────
    const [[enrollment]] = await sequelize.query(`
      SELECT e.id, e.session_id, e.class_id
      FROM enrollments e
      WHERE e.id = :enrollmentId;
    `, { replacements: { enrollmentId }, transaction: t });

    if (!enrollment) throw new Error(`Enrollment id=${enrollmentId} not found.`);

    // ── Verify student is in compartment status ───────────────────────────
    const [[currentResult]] = await sequelize.query(`
      SELECT id, result, compartment_subjects
      FROM student_results
      WHERE enrollment_id = :enrollmentId;
    `, { replacements: { enrollmentId }, transaction: t });

    if (!currentResult || currentResult.result !== 'compartment') {
      throw new Error(
        `Enrollment id=${enrollmentId} is not in compartment status. ` +
        `Current result: ${currentResult?.result || 'not calculated'}.`
      );
    }

    // ── Fetch subject details for grade calc ─────────────────────────────
    const [[subject]] = await sequelize.query(`
      SELECT id, total_marks, passing_marks FROM subjects WHERE id = :subjectId;
    `, { replacements: { subjectId }, transaction: t });

    if (!subject) throw new Error(`Subject id=${subjectId} not found.`);

    if (newMarks > parseFloat(subject.total_marks)) {
      throw new Error(
        `Marks entered (${newMarks}) exceed subject total marks (${subject.total_marks}).`
      );
    }

    // ── Find or create the compartment exam for this session/class ────────
    const [[compartmentExam]] = await sequelize.query(`
      SELECT id FROM exams
      WHERE session_id = :sessionId
        AND class_id   = :classId
        AND exam_type  = 'compartment'
        AND status IN ('completed', 'published')
      LIMIT 1;
    `, {
      replacements: { sessionId: enrollment.session_id, classId: enrollment.class_id },
      transaction: t,
    });

    if (!compartmentExam) {
      throw new Error(
        `No completed compartment exam found for session_id=${enrollment.session_id}, ` +
        `class_id=${enrollment.class_id}. Create and complete the compartment exam first.`
      );
    }

    // ── Calculate grade for this compartment result ───────────────────────
    const { grade, isPass } = calcSubjectResult(
      newMarks,
      parseFloat(subject.total_marks),
      parseFloat(subject.passing_marks),
      false
    );

    // ── Upsert exam_result for compartment exam ───────────────────────────
    const [existingResult] = await sequelize.query(`
      SELECT id FROM exam_results
      WHERE exam_id       = :examId
        AND enrollment_id = :enrollmentId
        AND subject_id    = :subjectId;
    `, {
      replacements: { examId: compartmentExam.id, enrollmentId, subjectId },
      transaction: t,
    });

    if (existingResult.length > 0) {
      await sequelize.query(`
        UPDATE exam_results SET
          marks_obtained  = :marks,
          is_absent       = false,
          grade           = :grade,
          is_pass         = :isPass,
          entered_by      = :enteredBy,
          updated_at      = NOW()
        WHERE id = :id;
      `, {
        replacements: { marks: newMarks, grade, isPass, enteredBy, id: existingResult[0].id },
        transaction: t,
      });
    } else {
      await sequelize.query(`
        INSERT INTO exam_results
          (exam_id, enrollment_id, subject_id, marks_obtained, is_absent,
           grade, is_pass, entered_by, override_by, override_reason, created_at, updated_at)
        VALUES
          (:examId, :enrollmentId, :subjectId, :marks, false,
           :grade, :isPass, :enteredBy, NULL, NULL, NOW(), NOW());
      `, {
        replacements: {
          examId: compartmentExam.id, enrollmentId, subjectId,
          marks: newMarks, grade, isPass, enteredBy,
        },
        transaction: t,
      });
    }

    // ── Recalculate full result (runs outside transaction — reads committed data)
    // We commit first, then recalculate
    // NOTE: recalculation happens after transaction commits in the caller
    return {
      enrollmentId,
      subjectId,
      newMarks,
      subjectGrade     : grade,
      subjectPass      : isPass,
      compartmentExamId: compartmentExam.id,
      sessionId        : enrollment.session_id,
    };
  }).then(async (interim) => {
    // Recalculate now that transaction is committed
    const newResult = await calculateResult(interim.enrollmentId, interim.sessionId);
    return {
      ...interim,
      updatedResult: newResult,
    };
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 3: overrideResult
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Admin override of a student's final result.
 *
 * Steps:
 *   1. Read current result — save to audit_log
 *   2. Apply new result
 *   3. If new result is 'pass', set is_promoted = true
 *   4. If new result is 'fail' or 'detained', set is_promoted = false
 *   5. Write audit log entry
 *
 * @param {number} enrollmentId
 * @param {'pass'|'fail'|'compartment'|'detained'} newResult
 * @param {string} reason    min 10 chars
 * @param {number} adminId
 */
async function overrideResult(enrollmentId, newResult, reason, adminId) {
  if (!reason || reason.trim().length < 10) {
    throw new Error('Override reason must be at least 10 characters.');
  }

  const validResults = ['pass', 'fail', 'compartment', 'detained'];
  if (!validResults.includes(newResult)) {
    throw new Error(`Invalid result value. Must be one of: ${validResults.join(', ')}.`);
  }

  return sequelize.transaction(async (t) => {

    // ── Fetch current result ──────────────────────────────────────────────
    const [[current]] = await sequelize.query(`
      SELECT id, result, is_promoted, percentage, grade
      FROM student_results
      WHERE enrollment_id = :enrollmentId
      FOR UPDATE;
    `, { replacements: { enrollmentId }, transaction: t });

    if (!current) {
      throw new Error(
        `No student_result found for enrollment_id=${enrollmentId}. ` +
        `Run calculateResult() first.`
      );
    }

    const oldResult    = current.result;
    const isPromoted   = newResult === 'pass';

    // ── Update student_results ────────────────────────────────────────────
    await sequelize.query(`
      UPDATE student_results SET
        result                    = :newResult,
        is_promoted               = :isPromoted,
        compartment_subjects      = CASE WHEN :newResult = 'compartment'
                                         THEN compartment_subjects
                                         ELSE NULL END,
        promotion_override_by     = :adminId,
        promotion_override_reason = :reason,
        updated_at                = NOW()
      WHERE enrollment_id = :enrollmentId;
    `, {
      replacements: { newResult, isPromoted, adminId, reason, enrollmentId },
      transaction: t,
    });

    // ── Write audit log ───────────────────────────────────────────────────
    await sequelize.getQueryInterface().bulkInsert('audit_logs', [{
      table_name  : 'student_results',
      record_id   : current.id,
      field_name  : 'result',
      old_value   : oldResult,
      new_value   : newResult,
      changed_by  : adminId,
      reason      : reason.trim(),
      ip_address  : null,    // Populated by controller in Step 9
      device_info : null,
      created_at  : new Date(),
    }], { transaction: t });

    // Also log is_promoted change
    await sequelize.getQueryInterface().bulkInsert('audit_logs', [{
      table_name  : 'student_results',
      record_id   : current.id,
      field_name  : 'is_promoted',
      old_value   : String(current.is_promoted),
      new_value   : String(isPromoted),
      changed_by  : adminId,
      reason      : reason.trim(),
      ip_address  : null,
      device_info : null,
      created_at  : new Date(),
    }], { transaction: t });

    return {
      enrollmentId,
      oldResult,
      newResult,
      oldIsPromoted : current.is_promoted,
      newIsPromoted : isPromoted,
      reason,
      adminId,
      auditRowsWritten: 2,
    };
  });
}


module.exports = {
  calculateResult,
  processCompartment,
  overrideResult,
  percentageToGrade,
  calcSubjectResult,
  RESULT_RULES,
};
