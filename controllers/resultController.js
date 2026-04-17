'use strict';

const sequelize    = require('../config/database');
const examEngine   = require('../utils/examEngine');

exports.enterMarks = async (req, res, next) => {
  try {
    const { exam_id, enrollment_id, results } = req.body;

    const [[exam]] = await sequelize.query(
      `SELECT id, status FROM exams WHERE id = :exam_id;`,
      { replacements: { exam_id } }
    );

    if (!exam) return res.fail('Exam not found.', [], 404);
    if (exam.status === 'upcoming') return res.fail('Exam has not started yet.');

    const saved = [];
    await sequelize.transaction(async (t) => {
      for (const r of results) {
        const [[subject]] = await sequelize.query(
          `SELECT id, total_marks, passing_marks FROM subjects WHERE id = :sid;`,
          { replacements: { sid: r.subject_id }, transaction: t }
        );
        if (!subject) continue;

        const isAbsent = r.is_absent === true;
        const marks    = isAbsent ? null : parseFloat(r.marks_obtained);

        if (!isAbsent && marks > parseFloat(subject.total_marks)) {
          throw Object.assign(
            new Error(`Marks for subject ${r.subject_id} exceed total marks (${subject.total_marks}).`),
            { status: 422 }
          );
        }

        const { grade, isPass } = examEngine.calcSubjectResult(
          marks, parseFloat(subject.total_marks), parseFloat(subject.passing_marks), isAbsent
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

      // Auto-mark exam as completed if all subjects entered
      await sequelize.query(`
        UPDATE exams SET status = 'ongoing', updated_at = NOW() WHERE id = :exam_id AND status = 'upcoming';
      `, { replacements: { exam_id }, transaction: t });
    });

    res.ok({ exam_id, enrollment_id, results: saved }, `${saved.length} subject result(s) saved.`);
  } catch (err) { next(err); }
};

exports.getResults = async (req, res, next) => {
  try {
    const { enrollment_id } = req.params;

    const [subjectResults] = await sequelize.query(`
      SELECT er.id, sub.name AS subject, sub.code, sub.is_core,
             er.marks_obtained, sub.total_marks, er.is_absent, er.grade, er.is_pass,
             e.name AS exam_name, e.exam_type
      FROM exam_results er
      JOIN subjects sub ON sub.id = er.subject_id
      JOIN exams    e   ON e.id   = er.exam_id
      WHERE er.enrollment_id = :enrollment_id
      ORDER BY e.start_date, sub.order_number;
    `, { replacements: { enrollment_id } });

    const [[finalResult]] = await sequelize.query(`
      SELECT sr.percentage, sr.grade, sr.result, sr.is_promoted,
             sr.compartment_subjects, sr.promotion_override_reason
      FROM student_results sr WHERE sr.enrollment_id = :enrollment_id;
    `, { replacements: { enrollment_id } });

    res.ok({
      subject_results : subjectResults,
      final_result    : finalResult || null,
    }, 'Results retrieved.');
  } catch (err) { next(err); }
};

exports.calculate = async (req, res, next) => {
  try {
    const { enrollment_id, session_id } = req.body;
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