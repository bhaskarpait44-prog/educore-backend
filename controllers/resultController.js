'use strict';

const sequelize    = require('../config/database');
const examEngine   = require('../utils/examEngine');
const { MarkHistory, GradingScale } = require('../models');

async function getClassReviewSummary(sessionId, classId) {
  const [[row]] = await sequelize.query(`
    SELECT
      COUNT(es.id) AS total_subjects,
      SUM(CASE WHEN es.review_status = 'approved' THEN 1 ELSE 0 END) AS approved_count,
      SUM(CASE WHEN es.review_status = 'submitted' THEN 1 ELSE 0 END) AS submitted_count,
      SUM(CASE WHEN es.review_status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count,
      SUM(CASE WHEN es.review_status = 'draft' THEN 1 ELSE 0 END) AS draft_count
    FROM exams ex
    JOIN exam_subjects es ON es.exam_id = ex.id
    WHERE ex.session_id = :sessionId
      AND ex.class_id = :classId;
  `, {
    replacements: {
      sessionId,
      classId,
    },
  });

  return {
    total_subjects: Number(row?.total_subjects || 0),
    approved_count: Number(row?.approved_count || 0),
    submitted_count: Number(row?.submitted_count || 0),
    rejected_count: Number(row?.rejected_count || 0),
    draft_count: Number(row?.draft_count || 0),
  };
}

async function syncExamStatus(examId, transaction) {
  const [[examMeta]] = await sequelize.query(`
    SELECT session_id, class_id, status
    FROM exams
    WHERE id = :examId
    LIMIT 1;
  `, {
    replacements: { examId },
    transaction,
  });

  if (!examMeta) return 'upcoming';
  if (['draft', 'published'].includes(examMeta.status)) return examMeta.status;

  const [[subjectRow]] = await sequelize.query(`
    SELECT COUNT(*) AS cnt
    FROM subjects
    WHERE class_id = :classId
      AND is_deleted = false;
  `, {
    replacements: { classId: examMeta.class_id },
    transaction,
  });

  const [[enrollmentRow]] = await sequelize.query(`
    SELECT COUNT(*) AS cnt
    FROM enrollments
    WHERE session_id = :sessionId
      AND class_id = :classId
      AND status = 'active';
  `, {
    replacements: {
      sessionId: examMeta.session_id,
      classId: examMeta.class_id,
    },
    transaction,
  });

  const subjectCount = Number(subjectRow?.cnt || 0);
  const enrollmentCount = Number(enrollmentRow?.cnt || 0);
  const requiredEntries = subjectCount * enrollmentCount;

  const [[entryRow]] = await sequelize.query(`
    SELECT COUNT(*) AS cnt
    FROM exam_results
    WHERE exam_id = :examId;
  `, {
    replacements: { examId },
    transaction,
  });

  const enteredEntries = Number(entryRow?.cnt || 0);
  const nextStatus = requiredEntries > 0 && enteredEntries >= requiredEntries ? 'completed' : 'ongoing';

  await sequelize.query(`
    UPDATE exams
    SET status = :status,
        updated_at = NOW()
    WHERE id = :examId;
  `, {
    replacements: {
      examId,
      status: nextStatus,
    },
    transaction,
  });

  return nextStatus;
}

exports.enterMarks = async (req, res, next) => {
  try {
    const { exam_id, enrollment_id, results } = req.body;

    const [[exam]] = await sequelize.query(
      `SELECT e.id, e.status, e.class_id, e.session_id, s.school_id 
       FROM exams e 
       JOIN sessions s ON s.id = e.session_id
       WHERE e.id = :exam_id;`,
      { replacements: { exam_id } }
    );

    if (!exam) return res.fail('Exam not found.', [], 404);
    if (exam.status === 'completed') {
      return res.fail('Exam is already completed. Marks can no longer be edited.');
    }

    const [[enrollment]] = await sequelize.query(`
      SELECT id, class_id, session_id
      FROM enrollments
      WHERE id = :enrollmentId
      LIMIT 1;
    `, { replacements: { enrollmentId: enrollment_id } });

    if (!enrollment) {
      return res.fail('Enrollment not found.', [], 404);
    }

    if (Number(enrollment.class_id) !== Number(exam.class_id) || Number(enrollment.session_id) !== Number(exam.session_id)) {
      return res.fail('This enrollment does not belong to the selected exam class/session.', [], 422);
    }

    const gradingScale = await examEngine.getActiveGradingScale(exam.school_id);
    const saved = await examEngine.saveStudentMarks({
      exam,
      enrollment_id,
      results,
      userId: req.user.id,
      gradingScale
    });

    const examStatus = await syncExamStatus(exam_id);

    res.ok({ exam_id, enrollment_id, results: saved, exam_status: examStatus }, `${saved.length} subject result(s) saved.`);
  } catch (err) { next(err); }
};

const { generateReportCard } = require('../utils/pdfGenerator');

exports.getResults = async (req, res, next) => {
  try {
    const { enrollment_id } = req.params;

    // 1. Fetch Subject Wise Results
    const [subjectResults] = await sequelize.query(`
      SELECT 
        sub.id AS subject_id,
        sub.name AS subject_name,
        sub.code AS subject_code,
        er.marks_obtained,
        er.theory_marks_obtained,
        er.practical_marks_obtained,
        er.is_absent,
        er.grade,
        er.is_pass,
        es.theory_total_marks,
        es.practical_total_marks,
        es.combined_total_marks,
        e.name AS exam_name,
        e.exam_type,
        e.start_date
      FROM exam_results er
      JOIN exam_subjects es ON es.exam_id = er.exam_id AND es.subject_id = er.subject_id
      JOIN subjects sub ON sub.id = er.subject_id
      JOIN exams e ON e.id = er.exam_id
      WHERE er.enrollment_id = :enrollment_id
      ORDER BY e.start_date DESC, sub.order_number;
    `, { replacements: { enrollment_id } });

    // 2. Fetch Final Result Summary
    const [[finalResult]] = await sequelize.query(`
      SELECT 
        sr.*,
        sess.name AS session_name
      FROM student_results sr
      JOIN sessions sess ON sess.id = sr.session_id
      WHERE sr.enrollment_id = :enrollment_id
      LIMIT 1;
    `, { replacements: { enrollment_id } });

    res.ok({
      subject_results: subjectResults,
      final_result: finalResult || null
    });
  } catch (err) { next(err); }
};

exports.getReportCard = async (req, res, next) => {
  try {
    const { enrollment_id } = req.params;

    // 1. Fetch Enrollment, Student, School, Session
    const [[data]] = await sequelize.query(`
      SELECT 
        e.id AS enrollment_id, e.roll_number, e.joined_date,
        s.id AS student_id, s.first_name, s.last_name, s.admission_no, s.father_name,
        c.name AS class_name,
        sec.name AS section_name,
        sess.id AS session_id, sess.name AS session_name,
        sch.id AS school_id, sch.name AS school_name, sch.address AS school_address, sch.phone AS school_phone
      FROM enrollments e
      JOIN students s ON s.id = e.student_id
      JOIN classes c ON c.id = e.class_id
      LEFT JOIN sections sec ON sec.id = e.section_id
      JOIN sessions sess ON sess.id = e.session_id
      JOIN schools sch ON sch.id = sess.school_id
      WHERE e.id = :enrollment_id
      LIMIT 1;
    `, { replacements: { enrollment_id } });

    if (!data) return res.fail('Enrollment not found.', [], 404);

    // 2. Fetch Subject Results
    const [subjectResults] = await sequelize.query(`
      SELECT 
        sub.name AS subject, sub.code,
        er.marks_obtained, er.theory_marks_obtained, er.practical_marks_obtained, er.is_absent, er.grade, er.is_pass,
        es.theory_total_marks AS theory_total, es.practical_total_marks AS practical_total, es.combined_total_marks AS total_marks
      FROM exam_results er
      JOIN exam_subjects es ON es.exam_id = er.exam_id AND es.subject_id = er.subject_id
      JOIN subjects sub ON sub.id = er.subject_id
      JOIN exams e ON e.id = er.exam_id
      WHERE er.enrollment_id = :enrollment_id
        AND e.exam_type != 'compartment'
      ORDER BY sub.order_number;
    `, { replacements: { enrollment_id } });

    // 3. Fetch Final Result
    const [[finalResult]] = await sequelize.query(`
      SELECT total_marks, marks_obtained, percentage, grade, result, grace_marks_info
      FROM student_results
      WHERE enrollment_id = :enrollment_id
      LIMIT 1;
    `, { replacements: { enrollment_id } });

    if (!finalResult) {
      return res.fail('Result not yet calculated for this student.', [], 400);
    }

    // 4. Fetch Attendance
    const { getAttendancePercent } = require('../utils/attendanceCalculator');
    const attendance = await getAttendancePercent(enrollment_id);

    // 5. Generate PDF
    const pdfBuffer = await generateReportCard({
      school: { name: data.school_name, address: data.school_address, phone: data.school_phone },
      student: { first_name: data.first_name, last_name: data.last_name, admission_no: data.admission_no, father_name: data.father_name },
      enrollment: { roll_number: data.roll_number, class_name: data.class_name, section_name: data.section_name },
      session: { name: data.session_name },
      results: subjectResults,
      attendance,
      finalResult
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=ReportCard_${data.admission_no}.pdf`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) { next(err); }
};

// GET /api/results/class - Get results for all students in a class
exports.getClassResults = async (req, res, next) => {
  try {
    const { session_id, class_id } = req.query;

    if (!session_id || !class_id) {
      return res.fail('session_id and class_id are required.');
    }

    const [results] = await sequelize.query(`
      SELECT
        e.id AS enrollment_id,
        s.admission_no,
        CONCAT(s.first_name, ' ', s.last_name) AS student_name,
        e.roll_number,
        c.name AS class_name,
        sec.name AS section_name,
        COALESCE(sr.marks_obtained, 0) AS marks_obtained,
        COALESCE(sr.total_marks, 0) AS total_marks,
        COALESCE(sr.percentage, 0) AS percentage,
        sr.grade,
        sr.result,
        sr.is_promoted,
        sr.compartment_subjects,
        sr.promotion_override_reason
      FROM enrollments e
      JOIN students s ON s.id = e.student_id
      JOIN classes c ON c.id = e.class_id
      LEFT JOIN sections sec ON sec.id = e.section_id
      LEFT JOIN student_results sr ON sr.enrollment_id = e.id AND sr.session_id = :session_id
      WHERE e.session_id = :session_id AND e.class_id = :class_id
      ORDER BY (CASE WHEN e.roll_number IS NULL THEN 1 ELSE 0 END), e.roll_number, s.first_name
    `, { 
      replacements: { 
        session_id: Number(session_id), 
        class_id: Number(class_id) 
      } 
    });

    const reviewSummary = await getClassReviewSummary(session_id, class_id);

    res.ok({
      results,
      review_summary: reviewSummary,
    });
  } catch (err) { next(err); }
};

exports.calculate = async (req, res, next) => {
  try {
    const { enrollment_id, session_id } = req.body;

    const [[enrollment]] = await sequelize.query(`
      SELECT id, class_id
      FROM enrollments
      WHERE id = :enrollmentId
        AND session_id = :sessionId
      LIMIT 1;
    `, {
      replacements: {
        enrollmentId: enrollment_id,
        sessionId: session_id,
      },
    });

    if (!enrollment) {
      return res.fail('Enrollment not found for the selected session.', [], 404);
    }

    const reviewSummary = await getClassReviewSummary(session_id, enrollment.class_id);
    if (reviewSummary.submitted_count > 0 || reviewSummary.rejected_count > 0) {
      return res.fail('Approve all submitted marks before calculating final results.', [], 422);
    }

    const result = await examEngine.calculateResult(enrollment_id, session_id);
    res.ok(result, `Result calculated: ${result.result.toUpperCase()} (${result.percentage}%).`);
  } catch (err) { next(err); }
};

exports.override = async (req, res, next) => {
  try {
    const { enrollment_id, new_result, reason } = req.body;
    const result = await examEngine.overrideResult(enrollment_id, new_result, reason, req.user.id);
    res.ok(result, `Result overridden: ${result.oldResult} → ${result.newResult}.`);
  } catch (err) { next(err); }
};

exports.overrideMark = async (req, res, next) => {
  try {
    const {
      exam_id,
      enrollment_id,
      subject_id,
      is_absent = false,
      marks_obtained = null,
      theory_marks_obtained = null,
      practical_marks_obtained = null,
      reason,
    } = req.body;

    const [[exam]] = await sequelize.query(`
      SELECT id, class_id, session_id
      FROM exams
      WHERE id = :examId
      LIMIT 1;
    `, { replacements: { examId: exam_id } });

    if (!exam) {
      return res.fail('Exam not found.', [], 404);
    }

    const [[enrollment]] = await sequelize.query(`
      SELECT id, class_id, session_id
      FROM enrollments
      WHERE id = :enrollmentId
      LIMIT 1;
    `, { replacements: { enrollmentId: enrollment_id } });

    if (!enrollment) {
      return res.fail('Enrollment not found.', [], 404);
    }

    if (Number(enrollment.class_id) !== Number(exam.class_id) || Number(enrollment.session_id) !== Number(exam.session_id)) {
      return res.fail('Selected student does not belong to this exam class/session.', [], 422);
    }

    const [[subject]] = await sequelize.query(`
      SELECT
        es.subject_id,
        es.subject_type,
        es.theory_total_marks,
        es.theory_passing_marks,
        es.practical_total_marks,
        es.practical_passing_marks,
        es.combined_total_marks,
        es.combined_passing_marks
      FROM exam_subjects es
      WHERE es.exam_id = :examId
        AND es.subject_id = :subjectId
      LIMIT 1;
    `, {
      replacements: {
        examId: exam_id,
        subjectId: subject_id,
      },
    });

    if (!subject) {
      return res.fail('Subject is not configured for this exam.', [], 422);
    }

    let finalMarks = null;
    let theoryMarks = null;
    let practicalMarks = null;

    if (!is_absent) {
      if (subject.subject_type === 'both') {
        theoryMarks = theory_marks_obtained === '' || theory_marks_obtained == null ? null : Number(theory_marks_obtained);
        practicalMarks = practical_marks_obtained === '' || practical_marks_obtained == null ? null : Number(practical_marks_obtained);

        if (!Number.isFinite(theoryMarks) || !Number.isFinite(practicalMarks)) {
          return res.fail('Both theory and practical marks are required for this subject.', [], 422);
        }
        if (theoryMarks < 0 || theoryMarks > Number(subject.theory_total_marks || 0)) {
          return res.fail(`Theory marks must be between 0 and ${subject.theory_total_marks}.`, [], 422);
        }
        if (practicalMarks < 0 || practicalMarks > Number(subject.practical_total_marks || 0)) {
          return res.fail(`Practical marks must be between 0 and ${subject.practical_total_marks}.`, [], 422);
        }

        finalMarks = Number((theoryMarks + practicalMarks).toFixed(2));
      } else {
        finalMarks = marks_obtained === '' || marks_obtained == null ? null : Number(marks_obtained);
        if (!Number.isFinite(finalMarks)) {
          return res.fail('Marks are required for this subject.', [], 422);
        }
        if (finalMarks < 0 || finalMarks > Number(subject.combined_total_marks || 0)) {
          return res.fail(`Marks must be between 0 and ${subject.combined_total_marks}.`, [], 422);
        }
      }
    }

    const gradingScale = await examEngine.getActiveGradingScale(exam.school_id);
    const { grade, isPass } = examEngine.calcSubjectResult(
      finalMarks,
      Number(subject.combined_total_marks || 0),
      Number(subject.combined_passing_marks || 0),
      !!is_absent,
      gradingScale
    );

    // Fetch old result for history
    const [[oldResult]] = await sequelize.query(
      `SELECT marks_obtained, theory_marks_obtained, practical_marks_obtained, is_absent 
       FROM exam_results 
       WHERE exam_id = :exam_id AND enrollment_id = :enrollment_id AND subject_id = :subject_id 
       LIMIT 1;`,
      { replacements: { exam_id, enrollment_id, subject_id }, transaction: null }
    );

    const [updatedRows] = await sequelize.query(`
      UPDATE exam_results
      SET marks_obtained = :marks,
          theory_marks_obtained = :theoryMarks,
          practical_marks_obtained = :practicalMarks,
          is_absent = :isAbsent,
          grade = :grade,
          is_pass = :isPass,
          override_by = :userId,
          override_reason = :reason,
          updated_at = NOW()
      WHERE exam_id = :examId
        AND enrollment_id = :enrollmentId
        AND subject_id = :subjectId
      RETURNING exam_id, enrollment_id, subject_id, marks_obtained, theory_marks_obtained,
        practical_marks_obtained, is_absent, grade, is_pass, override_reason, override_by, updated_at;
    `, {
      replacements: {
        examId: exam_id,
        enrollmentId: enrollment_id,
        subjectId: subject_id,
        marks: finalMarks,
        theoryMarks,
        practicalMarks,
        isAbsent: !!is_absent,
        grade,
        isPass,
        userId: req.user.id,
        reason,
      },
    });

    if (updatedRows.length === 0) {
      return res.fail('Teacher marks have not been entered for this student yet.', [], 404);
    }

    // Log to MarkHistory
    await MarkHistory.create({
      exam_id,
      enrollment_id,
      subject_id,
      old_marks_obtained: oldResult?.marks_obtained,
      new_marks_obtained: finalMarks,
      old_theory_marks: oldResult?.theory_marks_obtained,
      new_theory_marks: theoryMarks,
      old_practical_marks: oldResult?.practical_marks_obtained,
      new_practical_marks: practicalMarks,
      old_is_absent: oldResult?.is_absent,
      new_is_absent: !!is_absent,
      changed_by: req.user.id,
      change_reason: reason,
      change_type: 'override',
    });

    const [[resultRow]] = await sequelize.query(`
      SELECT id
      FROM student_results
      WHERE enrollment_id = :enrollmentId
        AND session_id = :sessionId
      LIMIT 1;
    `, {
      replacements: {
        enrollmentId: enrollment_id,
        sessionId: exam.session_id,
      },
    });

    if (resultRow) {
      await examEngine.calculateResult(enrollment_id, exam.session_id);
    }

    res.ok(updatedRows[0], 'Marks overridden successfully.');
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    return res.fail('Deleting calculated results is disabled. Use admin override if a correction is needed.', [], 403);
  } catch (err) { next(err); }
};
