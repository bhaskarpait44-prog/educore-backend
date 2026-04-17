'use strict';

const sequelize  = require('../config/database');
const feeManager = require('../utils/feeManager');

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
      RETURNING id, session_id, class_id, name, amount, frequency, due_day;
    `, { replacements: { session_id: session.id, class_id, name, amount, frequency, due_day } });

    res.ok(structure, 'Fee structure created.', 201);
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