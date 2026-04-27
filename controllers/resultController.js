'use strict';

const sequelize    = require('../config/database');
const examEngine   = require('../utils/examEngine');

async function getClassReviewSummary(sessionId, classId) {
  const [[row]] = await sequelize.query(`
    SELECT
      COUNT(es.id) AS total_subjects,
      COUNT(es.id) FILTER (WHERE es.review_status = 'approved') AS approved_count,
      COUNT(es.id) FILTER (WHERE es.review_status = 'submitted') AS submitted_count,
      COUNT(es.id) FILTER (WHERE es.review_status = 'rejected') AS rejected_count,
      COUNT(es.id) FILTER (WHERE es.review_status = 'draft') AS draft_count
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
      `SELECT id, status, class_id, session_id FROM exams WHERE id = :exam_id;`,
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

    const saved = [];
    let examStatus = exam.status;
    await sequelize.transaction(async (t) => {
      for (const r of results) {
        const [[subject]] = await sequelize.query(
          `SELECT es.subject_id AS id, s.class_id, es.subject_type, es.combined_total_marks, es.combined_passing_marks,
                  es.theory_total_marks, es.theory_passing_marks, es.practical_total_marks, es.practical_passing_marks
           FROM exam_subjects es
           JOIN subjects s ON s.id = es.subject_id
           WHERE es.exam_id = :examId
             AND es.subject_id = :sid
           LIMIT 1;`,
          { replacements: { examId: exam_id, sid: r.subject_id }, transaction: t }
        );
        if (!subject) {
          throw Object.assign(
            new Error(`Subject ${r.subject_id} is not configured for this exam.`),
            { status: 422 }
          );
        }

        if (Number(subject.class_id) !== Number(exam.class_id)) {
          throw Object.assign(
            new Error(`Subject ${r.subject_id} does not belong to this exam class.`),
            { status: 422 }
          );
        }

        const isAbsent = r.is_absent === true;
        const rawMarks = r.marks_obtained;
        const marks = isAbsent || rawMarks === null || rawMarks === undefined || rawMarks === ''
          ? null
          : parseFloat(rawMarks);

        if (!isAbsent && marks != null && marks > parseFloat(subject.combined_total_marks)) {
          throw Object.assign(
            new Error(`Marks for subject ${r.subject_id} exceed total marks (${subject.combined_total_marks}).`),
            { status: 422 }
          );
        }

        const { grade, isPass } = examEngine.calcSubjectResult(
          marks,
          parseFloat(subject.combined_total_marks),
          parseFloat(subject.combined_passing_marks),
          isAbsent
        );

        await sequelize.query(`
          INSERT INTO exam_results
            (exam_id, enrollment_id, subject_id, marks_obtained, is_absent, grade, is_pass, entered_by, created_at, updated_at)
          VALUES (:exam_id, :enrollment_id, :subject_id, :marks, :isAbsent, :grade, :isPass, :enteredBy, NOW(), NOW())
          ON CONFLICT (exam_id, enrollment_id, subject_id) DO UPDATE
            SET marks_obtained = :marks, is_absent = :isAbsent, grade = :grade,
                is_pass = :isPass, entered_by = :enteredBy, updated_at = NOW();
        `, { replacements: { exam_id, enrollment_id, subject_id: r.subject_id, marks, isAbsent, grade, isPass, enteredBy: req.user.id }, transaction: t });

        saved.push({ subject_id: r.subject_id, grade, is_pass: isPass });
      }

      examStatus = await syncExamStatus(exam_id, t);
    });

    res.ok({ exam_id, enrollment_id, results: saved, exam_status: examStatus }, `${saved.length} subject result(s) saved.`);
  } catch (err) { next(err); }
};

exports.getResults = async (req, res, next) => {
  try {
    const { enrollment_id } = req.params;

    const [subjectResults] = await sequelize.query(`
      SELECT er.id, sub.name AS subject, sub.code, sub.is_core,
             er.marks_obtained, es.combined_total_marks AS total_marks, er.is_absent, er.grade, er.is_pass,
             e.name AS exam_name, e.exam_type
      FROM exam_results er
      JOIN exam_subjects es ON es.exam_id = er.exam_id AND es.subject_id = er.subject_id
      JOIN subjects sub ON sub.id = er.subject_id
      JOIN exams    e   ON e.id   = er.exam_id
      WHERE er.enrollment_id = :enrollment_id
      ORDER BY e.start_date, sub.order_number;
    `, { replacements: { enrollment_id } });

    const examSummaries = Object.values(subjectResults.reduce((acc, row) => {
      const key = `${row.exam_name}::${row.exam_type}`;
      if (!acc[key]) {
        acc[key] = {
          exam_name: row.exam_name,
          exam_type: row.exam_type,
          total_marks: 0,
          marks_obtained: 0,
          failed_subjects: 0,
        };
      }

      acc[key].total_marks += Number(row.total_marks || 0);
      acc[key].marks_obtained += row.is_absent ? 0 : Number(row.marks_obtained || 0);
      if (row.is_pass === false) acc[key].failed_subjects += 1;

      return acc;
    }, {})).map((exam) => {
      const percentage = exam.total_marks > 0
        ? Number(((exam.marks_obtained / exam.total_marks) * 100).toFixed(2))
        : null;

      let result = 'pass';
      if (exam.failed_subjects > 2) result = 'fail';
      else if (exam.failed_subjects > 0) result = 'compartment';

      return {
        exam_name: exam.exam_name,
        exam_type: exam.exam_type,
        total_marks: exam.total_marks,
        marks_obtained: exam.marks_obtained,
        percentage,
        grade: percentage == null ? null : examEngine.percentageToGrade(percentage),
        result,
      };
    });

    const [[finalResult]] = await sequelize.query(`
      SELECT sr.percentage, sr.grade, sr.result, sr.is_promoted,
             sr.compartment_subjects, sr.promotion_override_reason
      FROM student_results sr WHERE sr.enrollment_id = :enrollment_id;
    `, { replacements: { enrollment_id } });

    res.ok({
      subject_results: subjectResults,
      exam_summaries: examSummaries,
      final_result: finalResult || null,
    }, 'Results retrieved.');
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
        s.first_name || ' ' || s.last_name AS student_name,
        e.roll_number,
        c.name AS class_name,
        sec.name AS section_name,
        sr.marks_obtained,
        sr.total_marks,
        sr.percentage,
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
      ORDER BY e.roll_number NULLS LAST, s.first_name
    `, { replacements: { session_id, class_id } });

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

    const { grade, isPass } = examEngine.calcSubjectResult(
      finalMarks,
      Number(subject.combined_total_marks || 0),
      Number(subject.combined_passing_marks || 0),
      !!is_absent
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
