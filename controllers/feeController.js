'use strict';

const sequelize  = require('../config/database');
const feeManager = require('../utils/feeManager');

// GET /api/fees/structures - List fee structures
exports.getStructures = async (req, res, next) => {
  try {
    const { session_id, class_id } = req.query;

    let sql = `
      SELECT fs.*, c.name AS class_name
      FROM fee_structures fs
      JOIN classes c ON c.id = fs.class_id
      WHERE fs.session_id IN (
        SELECT id FROM sessions WHERE school_id = :schoolId
      )
    `;
    const replacements = { schoolId: req.user.school_id };

    if (session_id) {
      sql += ' AND fs.session_id = :sessionId';
      replacements.sessionId = session_id;
    }

    if (class_id) {
      sql += ' AND fs.class_id = :classId';
      replacements.classId = class_id;
    }

    sql += ' ORDER BY fs.class_id, fs.name';

    const [structures] = await sequelize.query(sql, { replacements });
    res.ok({ structures });
  } catch (err) { next(err); }
};

exports.createStructure = async (req, res, next) => {
  try {
    const { class_id, name, amount, frequency, due_day } = req.body;

    // Find current session for this school
    const [[session]] = await sequelize.query(`
      SELECT id FROM sessions WHERE school_id = :schoolId AND is_current = true LIMIT 1;
    `, { replacements: { schoolId: req.user.school_id } });

    if (!session) return res.fail('No active session found. Activate a session first.');

    const [[structure]] = await sequelize.query(`
      INSERT INTO fee_structures (session_id, class_id, name, amount, frequency, due_day, is_active, created_at, updated_at)
      VALUES (:session_id, :class_id, :name, :amount, :frequency, :due_day, true, NOW(), NOW())
      RETURNING id, session_id, class_id, name, amount, frequency, due_day, is_active;
    `, { replacements: { session_id: session.id, class_id, name, amount, frequency, due_day } });

    const generation = await feeManager.generateInvoices(session.id);

    res.ok({
      ...structure,
      invoices_generated: generation?.invoicesCreated || 0,
      invoices_skipped: generation?.invoicesSkipped || 0,
    }, 'Fee structure created and invoices generated.', 201);
  } catch (err) { next(err); }
};

exports.deleteStructure = async (req, res, next) => {
  try {
    const { id } = req.params;

    await sequelize.query(
      'DELETE FROM fee_structures WHERE id = :id',
      { replacements: { id } }
    );

    res.ok({ id }, 'Fee structure deleted.');
  } catch (err) { next(err); }
};

exports.generate = async (req, res, next) => {
  try {
    const result = await feeManager.generateInvoices(req.body.session_id);
    res.ok(result, `${result.invoicesCreated} invoice(s) generated.`);
  } catch (err) { next(err); }
};

exports.getStudentFees = async (req, res, next) => {
  try {
    const { enrollment_id } = req.params;

    const [invoices] = await sequelize.query(`
      SELECT fi.id, fs.name AS fee_name, fi.amount_due, fi.amount_paid,
             fi.late_fee_amount, fi.concession_amount,
             (fi.amount_due + fi.late_fee_amount - fi.concession_amount - fi.amount_paid) AS balance,
             fi.due_date, fi.paid_date, fi.status,
             fi.carry_from_invoice_id
      FROM fee_invoices fi
      JOIN fee_structures fs ON fs.id = fi.fee_structure_id
      WHERE fi.enrollment_id = :enrollment_id
      ORDER BY fi.due_date ASC;
    `, { replacements: { enrollment_id } });

    const summary = {
      total_invoices : invoices.length,
      total_due      : invoices.reduce((s, i) => s + parseFloat(i.amount_due), 0).toFixed(2),
      total_paid     : invoices.reduce((s, i) => s + parseFloat(i.amount_paid), 0).toFixed(2),
      total_balance  : invoices.reduce((s, i) => s + parseFloat(i.balance), 0).toFixed(2),
      pending_count  : invoices.filter(i => i.status === 'pending').length,
    };

    res.ok({ invoices, summary }, 'Fee details retrieved.');
  } catch (err) { next(err); }
};

exports.recordPayment = async (req, res, next) => {
  try {
    const { invoice_id, amount, payment_date, payment_mode, transaction_ref } = req.body;

    const result = await feeManager.applyPayment(invoice_id, {
      amount,
      paymentDate    : payment_date,
      paymentMode    : payment_mode,
      transactionRef : transaction_ref || null,
      receivedBy     : req.user.id,
    });

    res.ok(result, `Payment of ₹${result.amountApplied} applied. Status: ${result.newStatus}.`, 201);
  } catch (err) { next(err); }
};

exports.carryForward = async (req, res, next) => {
  try {
    const { student_id, from_session_id, to_session_id } = req.body;
    const result = await feeManager.carryForwardFees(student_id, from_session_id, to_session_id);
    res.ok(result, `${result.invoicesCarried} invoice(s) carried forward. Total: ₹${result.totalAmountCarried}.`);
  } catch (err) { next(err); }
};

// GET /api/fees/report - Fee collection report
exports.getReport = async (req, res, next) => {
  try {
    const { session_id, class_id } = req.query;

    if (!session_id) return res.fail('session_id is required.');

    // Get summary stats
    const [[summary]] = await sequelize.query(`
      SELECT
        COUNT(DISTINCT fi.enrollment_id) AS total_students,
        COALESCE(SUM(fi.amount_due), 0) AS total_expected,
        COALESCE(SUM(fi.amount_paid), 0) AS total_collected,
        COALESCE(SUM(fi.amount_due - fi.amount_paid), 0) AS total_pending,
        COUNT(CASE WHEN fi.status = 'paid' THEN 1 END) AS paid_count,
        COUNT(CASE WHEN fi.status = 'partial' THEN 1 END) AS partial_count,
        COUNT(CASE WHEN fi.status = 'pending' THEN 1 END) AS pending_count
      FROM fee_invoices fi
      JOIN enrollments e ON e.id = fi.enrollment_id
      WHERE fi.session_id = :sessionId AND e.status = 'active'
      ${class_id ? 'AND e.class_id = :classId' : ''}
    `, { replacements: { sessionId: session_id, classId: class_id } });

    // Get student-wise data
    const [students] = await sequelize.query(`
      SELECT
        s.id AS student_id,
        s.first_name || ' ' || s.last_name AS student_name,
        s.admission_no,
        c.name AS class_name,
        COALESCE(SUM(fi.amount_due), 0) AS total_due,
        COALESCE(SUM(fi.amount_paid), 0) AS total_paid,
        COALESCE(SUM(fi.amount_due - fi.amount_paid), 0) AS balance
      FROM students s
      JOIN enrollments e ON e.student_id = s.id AND e.session_id = :sessionId AND e.status = 'active'
      LEFT JOIN fee_invoices fi ON fi.enrollment_id = e.id
      JOIN classes c ON c.id = e.class_id
      WHERE s.school_id = :schoolId
      ${class_id ? 'AND e.class_id = :classId' : ''}
      GROUP BY s.id, s.first_name, s.last_name, s.admission_no, c.name
      ORDER BY c.name, s.first_name
    `, { replacements: { sessionId: session_id, schoolId: req.user.school_id, classId: class_id } });

    res.ok({
      summary: {
        total_expected: summary.total_expected,
        total_collected: summary.total_collected,
        total_pending: summary.total_pending,
        paid_count: parseInt(summary.paid_count),
      },
      students,
    });
  } catch (err) { next(err); }
};
