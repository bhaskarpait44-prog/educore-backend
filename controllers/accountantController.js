'use strict';

const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');
const feeManager = require('../utils/feeManager');
const { writeAuditLog } = require('../utils/writeAuditLog');

const PAYMENT_MODE_STORAGE_MAP = {
  cash   : 'cash',
  online : 'online',
  upi    : 'online',
  cheque : 'cheque',
  dd     : 'dd',
};

function parseNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseInteger(value, fallback = null) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pagination(query) {
  const page = Math.max(parseInteger(query.page, 1), 1);
  const perPage = Math.min(Math.max(parseInteger(query.perPage || query.limit, 20), 1), 100);
  return { page, perPage, offset: (page - 1) * perPage };
}

function dateOnly(value = new Date()) {
  return new Date(value).toISOString().split('T')[0];
}

function receiptNumberFromPaymentId(paymentId, paymentDate = new Date()) {
  const year = new Date(paymentDate).getFullYear();
  return `RCP-${year}-${String(paymentId).padStart(5, '0')}`;
}

function paymentReferenceForIndex(baseReference, index) {
  if (!baseReference) return null;
  return index === 0 ? baseReference : `${baseReference}#${index + 1}`;
}

function normalizePaymentMode(mode, reference) {
  const lowered = String(mode || '').trim().toLowerCase();
  if (!PAYMENT_MODE_STORAGE_MAP[lowered]) {
    throw new Error('Invalid payment mode. Use cash, online, cheque, dd, or upi.');
  }

  const storageMode = PAYMENT_MODE_STORAGE_MAP[lowered];
  let transactionRef = reference ? String(reference).trim() : null;

  if (lowered === 'upi' && transactionRef) {
    transactionRef = `UPI:${transactionRef}`;
  }

  return {
    requestedMode : lowered,
    storageMode,
    transactionRef,
  };
}

function deriveDisplayPaymentMode(mode, transactionRef) {
  if (mode === 'online' && typeof transactionRef === 'string' && transactionRef.startsWith('UPI:')) {
    return 'upi';
  }
  return mode;
}

function userHasPermission(req, permissionName) {
  if (!req.userPermissions || req.userPermissions.size === 0) return false;
  return req.userPermissions.has('*') || req.userPermissions.has(permissionName);
}

function buildFilters(filters = [], replacements = {}) {
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  return { where, replacements };
}

async function currentSession(schoolId, transaction = null) {
  const [[session]] = await sequelize.query(`
    SELECT id, name, start_date, end_date
    FROM sessions
    WHERE school_id = :schoolId AND is_current = true
    LIMIT 1;
  `, { replacements: { schoolId }, transaction });
  return session || null;
}

async function fetchReceiptBase(paymentId, schoolId) {
  const [[row]] = await sequelize.query(`
    SELECT
      fp.id AS payment_id,
      fp.invoice_id,
      fp.amount,
      fp.payment_mode,
      fp.payment_date,
      fp.transaction_ref,
      fp.created_at,
      fp.received_by,
      fi.amount_due,
      fi.amount_paid,
      fi.late_fee_amount,
      fi.concession_amount,
      fi.due_date,
      fi.status AS invoice_status,
      fs.name AS fee_name,
      fs.frequency,
      fs.name AS description,
      e.id AS enrollment_id,
      e.roll_number,
      sess.name AS session_name,
      s.id AS student_id,
      s.admission_no,
      CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
      c.name AS class_name,
      sec.name AS section_name,
      sp.photo_path,
      sp.phone,
      sp.email,
      sch.id AS school_id,
      sch.name AS school_name,
      sch.address AS school_address,
      sch.phone AS school_phone,
      u.name AS received_by_name
    FROM fee_payments fp
    JOIN fee_invoices fi ON fi.id = fp.invoice_id
    JOIN fee_structures fs ON fs.id = fi.fee_structure_id
    JOIN enrollments e ON e.id = fi.enrollment_id
    JOIN sessions sess ON sess.id = e.session_id
    JOIN students s ON s.id = e.student_id
    JOIN classes c ON c.id = e.class_id
    JOIN sections sec ON sec.id = e.section_id
    JOIN schools sch ON sch.id = s.school_id
    LEFT JOIN student_profiles sp ON sp.student_id = s.id AND sp.is_current = true
    LEFT JOIN users u ON u.id = fp.received_by
    WHERE fp.id = :paymentId AND s.school_id = :schoolId
    LIMIT 1;
  `, { replacements: { paymentId, schoolId } });

  if (!row) return null;

  const displayMode = deriveDisplayPaymentMode(row.payment_mode, row.transaction_ref);
  return {
    ...row,
    payment_mode_display : displayMode,
    receipt_no           : receiptNumberFromPaymentId(row.payment_id, row.payment_date),
    balance_after        : Math.max(
      0,
      parseNumber(row.amount_due) +
      parseNumber(row.late_fee_amount) -
      parseNumber(row.concession_amount) -
      parseNumber(row.amount_paid)
    ),
  };
}

async function auditFinancialAction(req, tableName, recordId, changes, reason) {
  await writeAuditLog(sequelize, {
    tableName,
    recordId,
    changes,
    changedBy  : req.user.id,
    reason,
    ipAddress  : req.ip || null,
    deviceInfo : req.headers['user-agent'] || null,
  });
}

async function fetchStudentFeeContext(studentId, schoolId) {
  const [[student]] = await sequelize.query(`
    SELECT
      s.id,
      s.admission_no,
      CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
      e.id AS enrollment_id,
      e.roll_number,
      e.session_id,
      sess.name AS session_name,
      c.id AS class_id,
      c.name AS class_name,
      sec.id AS section_id,
      sec.name AS section_name,
      sp.photo_path,
      sp.phone,
      sp.email,
      sp.father_name,
      sp.father_phone,
      sp.mother_name,
      sp.mother_phone
    FROM students s
    JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
    JOIN sessions sess ON sess.id = e.session_id
    JOIN classes c ON c.id = e.class_id
    JOIN sections sec ON sec.id = e.section_id
    LEFT JOIN student_profiles sp ON sp.student_id = s.id AND sp.is_current = true
    WHERE s.id = :studentId AND s.school_id = :schoolId AND s.is_deleted = false
    LIMIT 1;
  `, { replacements: { studentId, schoolId } });

  return student || null;
}

async function fetchStudentInvoices(enrollmentId) {
  const [rows] = await sequelize.query(`
    SELECT
      fi.id,
      fi.enrollment_id,
      fi.fee_structure_id,
      fs.name AS fee_name,
      fs.frequency,
      fi.amount_due,
      fi.amount_paid,
      fi.late_fee_amount,
      fi.concession_amount,
      fi.concession_reason,
      fi.concession_type,
      fi.concession_reference,
      fi.due_date,
      fi.paid_date,
      fi.status,
      fi.carry_from_invoice_id,
      fi.late_fee_applied_at,
      fi.late_fee_applied_by,
      (
        fi.amount_due +
        COALESCE(fi.late_fee_amount, 0) -
        COALESCE(fi.concession_amount, 0) -
        COALESCE(fi.amount_paid, 0)
      ) AS balance
    FROM fee_invoices fi
    JOIN fee_structures fs ON fs.id = fi.fee_structure_id
    WHERE fi.enrollment_id = :enrollmentId
    ORDER BY
      CASE fi.status
        WHEN 'pending' THEN 1
        WHEN 'partial' THEN 2
        WHEN 'paid' THEN 3
        WHEN 'waived' THEN 4
        WHEN 'carried_forward' THEN 5
        ELSE 6
      END,
      fi.due_date ASC;
  `, { replacements: { enrollmentId } });

  return rows.map((row) => ({
    ...row,
    balance : Math.max(0, parseNumber(row.balance)),
  }));
}

async function fetchStudentPayments(enrollmentId) {
  const [rows] = await sequelize.query(`
    SELECT
      fp.id,
      fp.invoice_id,
      fp.amount,
      fp.payment_mode,
      fp.payment_date,
      fp.transaction_ref,
      fp.created_at,
      fs.name AS fee_name
    FROM fee_payments fp
    JOIN fee_invoices fi ON fi.id = fp.invoice_id
    JOIN fee_structures fs ON fs.id = fi.fee_structure_id
    WHERE fi.enrollment_id = :enrollmentId
    ORDER BY fp.created_at DESC;
  `, { replacements: { enrollmentId } });

  return rows.map((row) => ({
    ...row,
    receipt_no            : receiptNumberFromPaymentId(row.id, row.payment_date),
    payment_mode_display  : deriveDisplayPaymentMode(row.payment_mode, row.transaction_ref),
  }));
}

async function buildStudentStatement(student, invoices, payments) {
  const summary = {
    total_fee         : invoices.reduce((sum, item) => sum + parseNumber(item.amount_due), 0),
    total_paid        : invoices.reduce((sum, item) => sum + parseNumber(item.amount_paid), 0),
    total_concession  : invoices.reduce((sum, item) => sum + parseNumber(item.concession_amount), 0),
    total_late_fee    : invoices.reduce((sum, item) => sum + parseNumber(item.late_fee_amount), 0),
    balance           : invoices.reduce((sum, item) => sum + parseNumber(item.balance), 0),
  };

  return {
    student,
    summary,
    invoices,
    payments,
    generated_at : new Date().toISOString(),
  };
}

function receiptHtml(receipt, opts = {}) {
  const watermark = opts.duplicate ? '<div style="position:absolute;top:45%;left:20%;font-size:52px;color:rgba(220,38,38,0.2);transform:rotate(-20deg);font-weight:700;">DUPLICATE</div>' : '';
  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${receipt.receipt_no}</title>
    <style>
      @page { size: A5 portrait; margin: 12mm; }
      body { font-family: Arial, sans-serif; color: #1f2937; }
      .receipt { position: relative; border: 1px solid #d1d5db; padding: 20px; }
      .row { display: flex; justify-content: space-between; margin: 6px 0; }
      .muted { color: #6b7280; }
      .header { border-bottom: 2px solid #f59e0b; padding-bottom: 12px; margin-bottom: 12px; }
      .title { font-size: 24px; font-weight: 700; }
      .total { font-size: 20px; font-weight: 700; }
    </style>
  </head>
  <body>
    <div class="receipt">
      ${watermark}
      <div class="header">
        <div class="title">${receipt.school_name}</div>
        <div>${receipt.school_address || ''}</div>
        <div>${receipt.school_phone || ''}</div>
      </div>
      <div class="row"><span>Receipt No</span><strong>${receipt.receipt_no}</strong></div>
      <div class="row"><span>Date</span><strong>${receipt.payment_date}</strong></div>
      <div class="row"><span>Student</span><strong>${receipt.student_name}</strong></div>
      <div class="row"><span>Admission No</span><strong>${receipt.admission_no}</strong></div>
      <div class="row"><span>Class</span><strong>${receipt.class_name} ${receipt.section_name || ''}</strong></div>
      <div class="row"><span>Fee</span><strong>${receipt.fee_name}</strong></div>
      <div class="row"><span>Mode</span><strong>${String(receipt.payment_mode_display || receipt.payment_mode).toUpperCase()}</strong></div>
      <div class="row"><span>Reference</span><strong>${receipt.transaction_ref || '-'}</strong></div>
      <hr />
      <div class="row total"><span>Total Paid</span><span>Rs ${parseNumber(receipt.amount).toFixed(2)}</span></div>
      <div class="row"><span>Balance After</span><strong>Rs ${parseNumber(receipt.balance_after).toFixed(2)}</strong></div>
      <div class="row muted"><span>Received By</span><span>${receipt.received_by_name || ''}</span></div>
      ${opts.duplicate ? `<div class="row muted"><span>Duplicate Generated At</span><span>${new Date().toISOString()}</span></div>` : ''}
    </div>
  </body>
</html>`;
}

async function recordReminder(req, payload, status = 'sent', errorMessage = null, transaction = null) {
  await sequelize.query(`
    INSERT INTO fee_reminders (
      school_id, student_id, sent_by, reminder_type, message_content,
      amount_due, status, error_message, sent_at, created_at
    )
    VALUES (
      :schoolId, :studentId, :sentBy, :reminderType, :messageContent,
      :amountDue, :status, :errorMessage,
      CASE WHEN :status = 'sent' THEN NOW() ELSE NULL END,
      NOW()
    );
  `, {
    replacements: {
      schoolId       : req.user.school_id,
      studentId      : payload.studentId,
      sentBy         : req.user.id,
      reminderType   : payload.type,
      messageContent : payload.message,
      amountDue      : payload.amountDue ?? null,
      status,
      errorMessage,
    },
    transaction,
  });
}

async function schoolSummary(schoolId) {
  const session = await currentSession(schoolId);
  const replacements = { schoolId, sessionId: session?.id || null };

  const [
    [[today]],
    [[yesterday]],
    [[month]],
    [[sessionOverview]],
    [[todayPending]],
  ] = await Promise.all([
    sequelize.query(`
      SELECT
        COALESCE(SUM(fp.amount), 0) AS total,
        COUNT(fp.id) AS transactions,
        COALESCE(SUM(CASE WHEN fp.payment_mode = 'cash' THEN fp.amount ELSE 0 END), 0) AS cash,
        COALESCE(SUM(CASE WHEN fp.payment_mode = 'online' AND fp.transaction_ref LIKE 'UPI:%' THEN fp.amount ELSE 0 END), 0) AS upi,
        COALESCE(SUM(CASE WHEN fp.payment_mode = 'online' AND (fp.transaction_ref IS NULL OR fp.transaction_ref NOT LIKE 'UPI:%') THEN fp.amount ELSE 0 END), 0) AS online,
        COALESCE(SUM(CASE WHEN fp.payment_mode = 'cheque' THEN fp.amount ELSE 0 END), 0) AS cheque,
        COALESCE(SUM(CASE WHEN fp.payment_mode = 'dd' THEN fp.amount ELSE 0 END), 0) AS dd
      FROM fee_payments fp
      JOIN fee_invoices fi ON fi.id = fp.invoice_id
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      WHERE s.school_id = :schoolId
        AND fp.payment_date = CURRENT_DATE;
    `, { replacements }),
    sequelize.query(`
      SELECT COALESCE(SUM(fp.amount), 0) AS total
      FROM fee_payments fp
      JOIN fee_invoices fi ON fi.id = fp.invoice_id
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      WHERE s.school_id = :schoolId
        AND fp.payment_date = CURRENT_DATE - INTERVAL '1 day';
    `, { replacements }),
    sequelize.query(`
      SELECT
        COALESCE(SUM(fp.amount), 0) AS collected,
        COUNT(fp.id) AS transactions,
        COALESCE(MAX(ct.target_amount), 0) AS target_amount
      FROM fee_payments fp
      JOIN fee_invoices fi ON fi.id = fp.invoice_id
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      LEFT JOIN collection_targets ct
        ON ct.school_id = s.school_id
        AND ct.session_id = :sessionId
        AND ct.month = EXTRACT(MONTH FROM CURRENT_DATE)
        AND ct.year = EXTRACT(YEAR FROM CURRENT_DATE)
      WHERE s.school_id = :schoolId
        AND EXTRACT(MONTH FROM fp.payment_date) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(YEAR FROM fp.payment_date) = EXTRACT(YEAR FROM CURRENT_DATE);
    `, { replacements }),
    sequelize.query(`
      SELECT
        COALESCE(SUM(fi.amount_due + COALESCE(fi.late_fee_amount, 0) - COALESCE(fi.concession_amount, 0)), 0) AS expected,
        COALESCE(SUM(fi.amount_paid), 0) AS collected,
        COALESCE(SUM(fi.amount_due + COALESCE(fi.late_fee_amount, 0) - COALESCE(fi.concession_amount, 0) - fi.amount_paid), 0) AS pending
      FROM fee_invoices fi
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      WHERE s.school_id = :schoolId
        AND (:sessionId::int IS NULL OR e.session_id = :sessionId);
    `, { replacements }),
    sequelize.query(`
      SELECT
        COUNT(DISTINCT e.student_id) AS students,
        COALESCE(SUM(fi.amount_due + COALESCE(fi.late_fee_amount, 0) - COALESCE(fi.concession_amount, 0) - fi.amount_paid), 0) AS expected
      FROM fee_invoices fi
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      WHERE s.school_id = :schoolId
        AND fi.status IN ('pending', 'partial')
        AND fi.due_date <= CURRENT_DATE;
    `, { replacements }),
  ]);

  return {
    today,
    yesterday,
    month,
    sessionOverview,
    todayPending,
    session,
  };
}

async function fetchDaysRemainingInMonth() {
  const [rows] = await sequelize.query(`
    SELECT (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date - CURRENT_DATE AS days_remaining;
  `);

  return parseInteger(rows[0]?.days_remaining, 0);
}

async function fetchRecentTransactionsData(schoolId, limit = 10) {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const [rows] = await sequelize.query(`
    SELECT
      fp.id,
      fp.amount,
      fp.payment_date,
      fp.payment_mode,
      fp.transaction_ref,
      fp.created_at,
      CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
      s.id AS student_id,
      c.name AS class_name
    FROM fee_payments fp
    JOIN fee_invoices fi ON fi.id = fp.invoice_id
    JOIN enrollments e ON e.id = fi.enrollment_id
    JOIN students s ON s.id = e.student_id
    JOIN classes c ON c.id = e.class_id
    WHERE s.school_id = :schoolId
    ORDER BY fp.created_at DESC
    LIMIT :limit;
  `, { replacements: { schoolId, limit: safeLimit } });

  return rows.map((row) => ({
    ...row,
    payment_mode_display : deriveDisplayPaymentMode(row.payment_mode, row.transaction_ref),
    receipt_no           : receiptNumberFromPaymentId(row.id, row.payment_date),
  }));
}

async function fetchPendingTasksData(schoolId) {
  const [
    [[dueToday]],
    [[chequesPending]],
    [[overdue]],
    [[carryForwardPending]],
  ] = await Promise.all([
    sequelize.query(`
      SELECT COUNT(DISTINCT e.student_id) AS count
      FROM fee_invoices fi
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      WHERE s.school_id = :schoolId
        AND fi.status IN ('pending', 'partial')
        AND fi.due_date = CURRENT_DATE;
    `, { replacements: { schoolId } }),
    sequelize.query(`
      SELECT COUNT(*) AS count
      FROM cheque_payments cp
      JOIN fee_payments fp ON fp.id = cp.payment_id
      JOIN fee_invoices fi ON fi.id = fp.invoice_id
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      WHERE s.school_id = :schoolId
        AND cp.status = 'pending'
        AND cp.cheque_date <= CURRENT_DATE;
    `, { replacements: { schoolId } }),
    sequelize.query(`
      SELECT COUNT(DISTINCT e.student_id) AS count
      FROM fee_invoices fi
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      WHERE s.school_id = :schoolId
        AND fi.status IN ('pending', 'partial')
        AND fi.due_date < CURRENT_DATE - INTERVAL '30 days';
    `, { replacements: { schoolId } }),
    sequelize.query(`
      SELECT COUNT(*) AS count
      FROM fee_invoices fi
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      JOIN sessions sess ON sess.id = e.session_id
      WHERE s.school_id = :schoolId
        AND sess.end_date < CURRENT_DATE
        AND fi.status IN ('pending', 'partial');
    `, { replacements: { schoolId } }),
  ]);

  return [
    { key: 'due_today', count: parseInteger(dueToday.count, 0), action: '/accountant/collect' },
    { key: 'cheques_clearance', count: parseInteger(chequesPending.count, 0), action: '/accountant/cheques' },
    { key: 'overdue_30_plus', count: parseInteger(overdue.count, 0), action: '/accountant/defaulters' },
    { key: 'carry_forward_pending', count: parseInteger(carryForwardPending.count, 0), action: '/accountant/carry-forward' },
  ];
}

async function fetchWeekTrendData(schoolId) {
  const [rows] = await sequelize.query(`
    SELECT
      fp.payment_date AS date,
      COALESCE(SUM(fp.amount), 0) AS total,
      COUNT(fp.id) AS transactions
    FROM fee_payments fp
    JOIN fee_invoices fi ON fi.id = fp.invoice_id
    JOIN enrollments e ON e.id = fi.enrollment_id
    JOIN students s ON s.id = e.student_id
    WHERE s.school_id = :schoolId
      AND fp.payment_date >= CURRENT_DATE - INTERVAL '6 days'
    GROUP BY fp.payment_date
    ORDER BY fp.payment_date ASC;
  `, { replacements: { schoolId } });

  return rows;
}

async function buildDashboardPayload(req) {
  const summary = await schoolSummary(req.user.school_id);

  const [
    daysRemaining,
    transactions,
    tasks,
    weekTrend,
  ] = await Promise.all([
    fetchDaysRemainingInMonth(),
    fetchRecentTransactionsData(req.user.school_id, parseInteger(req.query.limit, 10) || 10),
    fetchPendingTasksData(req.user.school_id),
    fetchWeekTrendData(req.user.school_id),
  ]);

  const todayTotal = parseNumber(summary.today.total);
  const yesterdayTotal = parseNumber(summary.yesterday.total);
  const monthCollected = parseNumber(summary.month.collected);
  const monthTarget = parseNumber(summary.month.target_amount);
  const lastRefreshedAt = new Date().toISOString();

  return {
    greeting         : `Good morning ${req.user.name}`,
    today            : dateOnly(),
    session          : summary.session?.name || null,
    role             : req.user.role,
    today_collection : {
      total        : todayTotal,
      transactions : parseInteger(summary.today.transactions, 0),
      by_mode      : {
        cash   : parseNumber(summary.today.cash),
        online : parseNumber(summary.today.online),
        upi    : parseNumber(summary.today.upi),
        cheque : parseNumber(summary.today.cheque),
        dd     : parseNumber(summary.today.dd),
      },
      difference_vs_yesterday : todayTotal - yesterdayTotal,
    },
    pending_collection_today : {
      students        : parseInteger(summary.todayPending.students, 0),
      expected_amount : parseNumber(summary.todayPending.expected),
    },
    month_so_far : {
      collected     : monthCollected,
      transactions  : parseInteger(summary.month.transactions, 0),
      target_amount : monthTarget,
    },
    session_overview : {
      expected  : parseNumber(summary.sessionOverview.expected),
      collected : parseNumber(summary.sessionOverview.collected),
      pending   : parseNumber(summary.sessionOverview.pending),
    },
    auto_refresh_seconds : 60,
    today_stats : {
      collection    : summary.today,
      pending_today : summary.todayPending,
      month         : {
        ...summary.month,
        progress_percent : monthTarget > 0 ? Number(((monthCollected / monthTarget) * 100).toFixed(2)) : null,
        days_remaining   : daysRemaining,
      },
      session           : summary.sessionOverview,
      last_refreshed_at : lastRefreshedAt,
    },
    transactions : {
      items                : transactions,
      auto_refresh_seconds : 30,
    },
    pending_tasks : {
      tasks,
    },
    week_trend : {
      items: weekTrend,
    },
    last_refreshed_at : lastRefreshedAt,
  };
}

exports.dashboard = async (req, res, next) => {
  try {
    return res.ok(await buildDashboardPayload(req));
  } catch (err) {
    next(err);
  }
};

exports.todayStats = async (req, res, next) => {
  try {
    const payload = await buildDashboardPayload(req);
    return res.ok(payload.today_stats);
  } catch (err) {
    next(err);
  }
};

exports.recentTransactions = async (req, res, next) => {
  try {
    return res.ok({
      items                : await fetchRecentTransactionsData(req.user.school_id, parseInteger(req.query.limit, 10) || 10),
      auto_refresh_seconds : 30,
    });
  } catch (err) {
    next(err);
  }
};

exports.pendingTasks = async (req, res, next) => {
  try {
    return res.ok({
      tasks: await fetchPendingTasksData(req.user.school_id),
    });
  } catch (err) {
    next(err);
  }
};

exports.weekTrend = async (req, res, next) => {
  try {
    return res.ok({ items: await fetchWeekTrendData(req.user.school_id) });
  } catch (err) {
    next(err);
  }
};

exports.searchStudents = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.ok({ items: [] });

    const [rows] = await sequelize.query(`
      SELECT
        s.id,
        s.admission_no,
        CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
        c.name AS class_name,
        sec.name AS section_name,
        sp.photo_path,
        COALESCE(SUM(fi.amount_due + COALESCE(fi.late_fee_amount, 0) - COALESCE(fi.concession_amount, 0) - fi.amount_paid), 0) AS pending_amount
      FROM students s
      JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
      JOIN classes c ON c.id = e.class_id
      JOIN sections sec ON sec.id = e.section_id
      LEFT JOIN student_profiles sp ON sp.student_id = s.id AND sp.is_current = true
      LEFT JOIN fee_invoices fi ON fi.enrollment_id = e.id AND fi.status IN ('pending', 'partial')
      WHERE s.school_id = :schoolId
        AND s.is_deleted = false
        AND (
          s.admission_no ILIKE :q OR
          s.first_name ILIKE :q OR
          s.last_name ILIKE :q OR
          CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) ILIKE :q
        )
      GROUP BY s.id, c.name, sec.name, sp.photo_path
      ORDER BY pending_amount DESC, student_name ASC
      LIMIT 20;
    `, { replacements: { schoolId: req.user.school_id, q: `%${q}%` } });

    return res.ok({ items: rows });
  } catch (err) {
    next(err);
  }
};

exports.studentPendingInvoices = async (req, res, next) => {
  try {
    const student = await fetchStudentFeeContext(req.params.id, req.user.school_id);
    if (!student) return res.fail('Student not found.', [], 404);

    const invoices = await fetchStudentInvoices(student.enrollment_id);
    const pending = invoices.filter((item) => ['pending', 'partial'].includes(item.status));
    const carried = pending.filter((item) => item.carry_from_invoice_id);

    return res.ok({
      student,
      invoices        : pending,
      carried_forward : carried,
      total_pending   : pending.reduce((sum, item) => sum + parseNumber(item.balance), 0),
    });
  } catch (err) {
    next(err);
  }
};

exports.collect = async (req, res, next) => {
  try {
    const {
      student_id,
      invoice_ids = [],
      amount,
      payment_mode,
      reference,
      payment_date,
      remarks,
      cheque_number,
      cheque_date,
      bank_name,
      micr_code,
      dd_number,
      dd_date,
      branch,
      transaction_id,
      upi_reference_number,
      upi_id,
      transfer_date,
    } = req.body;

    if (!student_id || !Array.isArray(invoice_ids) || invoice_ids.length === 0 || !amount || !payment_mode) {
      return res.fail('student_id, invoice_ids, amount, and payment_mode are required.', [], 422);
    }

    const student = await fetchStudentFeeContext(student_id, req.user.school_id);
    if (!student) return res.fail('Student not found.', [], 404);

    const normalized = normalizePaymentMode(
      payment_mode,
      reference || transaction_id || upi_reference_number || cheque_number || dd_number || null
    );

    const [invoiceOwnership] = await sequelize.query(`
      SELECT fi.id
      FROM fee_invoices fi
      JOIN enrollments e ON e.id = fi.enrollment_id
      WHERE e.student_id = :studentId
        AND fi.id IN (:invoiceIds);
    `, {
      replacements: {
        studentId  : parseInteger(student_id),
        invoiceIds : invoice_ids.map((id) => parseInteger(id)).filter(Boolean),
      },
    });

    if (invoiceOwnership.length !== invoice_ids.length) {
      return res.fail('One or more invoices do not belong to the selected student.', [], 422);
    }

    const paymentResults = [];
    let remaining = parseNumber(amount);

    for (const [index, rawInvoiceId] of invoice_ids.entries()) {
      if (remaining <= 0) break;
      const paymentResult = await feeManager.applyPayment(parseInteger(rawInvoiceId), {
        amount         : remaining,
        paymentDate    : payment_date || dateOnly(),
        paymentMode    : normalized.storageMode,
        transactionRef : paymentReferenceForIndex(normalized.transactionRef, index),
        receivedBy     : req.user.id,
      });
      remaining -= parseNumber(paymentResult.amountApplied);
      paymentResults.push(paymentResult);
    }

    if (paymentResults.length === 0) {
      return res.fail('No payment could be applied to the selected invoices.', [], 422);
    }

    if (normalized.storageMode === 'cheque') {
      for (const paymentResult of paymentResults) {
        await sequelize.query(`
          INSERT INTO cheque_payments (
            payment_id, cheque_number, bank_name, branch_name, cheque_date, received_date,
            clearance_date, status, bounce_reason, bounce_date, bounce_charge, cleared_by,
            created_at, updated_at
          )
          VALUES (
            :paymentId, :chequeNumber, :bankName, :branchName, :chequeDate, :receivedDate,
            NULL, 'pending', NULL, NULL, 0, NULL, NOW(), NOW()
          );
        `, {
          replacements: {
            paymentId     : paymentResult.paymentId,
            chequeNumber  : cheque_number,
            bankName      : bank_name,
            branchName    : branch || null,
            chequeDate    : cheque_date || payment_date || dateOnly(),
            receivedDate  : payment_date || dateOnly(),
          },
        });
      }
    }

    const primaryPayment = paymentResults[0];

    await auditFinancialAction(req, 'fee_payments', primaryPayment.paymentId, [
      { field: 'amount', oldValue: null, newValue: primaryPayment.amountApplied },
      { field: 'payment_mode', oldValue: null, newValue: normalized.requestedMode },
      { field: 'remarks', oldValue: null, newValue: remarks || null },
      { field: 'reference', oldValue: null, newValue: normalized.transactionRef || null },
      { field: 'upi_id', oldValue: null, newValue: upi_id || null },
      { field: 'micr_code', oldValue: null, newValue: micr_code || null },
      { field: 'transfer_date', oldValue: null, newValue: transfer_date || dd_date || null },
    ], 'Fee collection recorded');

    const receipt = await fetchReceiptBase(primaryPayment.paymentId, req.user.school_id);

    return res.ok({
      payment        : primaryPayment,
      payments       : paymentResults,
      receipt,
      student,
      invoice_ids    : invoice_ids.map((id) => parseInteger(id)).filter(Boolean),
      requested_mode : normalized.requestedMode,
    }, 'Payment recorded successfully.', 201);
  } catch (err) {
    next(err);
  }
};

exports.receipt = async (req, res, next) => {
  try {
    const receipt = await fetchReceiptBase(parseInteger(req.params.id), req.user.school_id);
    if (!receipt) return res.fail('Receipt not found.', [], 404);
    return res.ok(receipt);
  } catch (err) {
    next(err);
  }
};

exports.receiptPdf = async (req, res, next) => {
  try {
    const receipt = await fetchReceiptBase(parseInteger(req.params.id), req.user.school_id);
    if (!receipt) return res.fail('Receipt not found.', [], 404);
    return res.ok({
      filename : `${receipt.receipt_no}.html`,
      html     : receiptHtml(receipt),
    });
  } catch (err) {
    next(err);
  }
};

exports.students = async (req, res, next) => {
  try {
    const { page, perPage, offset } = pagination(req.query);
    const filters = ['s.school_id = :schoolId', 's.is_deleted = false', 'e.status = \'active\''];
    const replacements = { schoolId: req.user.school_id, limit: perPage, offset };

    if (req.query.class_id) {
      filters.push('e.class_id = :classId');
      replacements.classId = parseInteger(req.query.class_id);
    }
    if (req.query.section_id) {
      filters.push('e.section_id = :sectionId');
      replacements.sectionId = parseInteger(req.query.section_id);
    }
    if (req.query.session_id) {
      filters.push('e.session_id = :sessionId');
      replacements.sessionId = parseInteger(req.query.session_id);
    }
    if (req.query.search) {
      filters.push(`(
        s.admission_no ILIKE :search OR
        s.first_name ILIKE :search OR
        s.last_name ILIKE :search OR
        CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) ILIKE :search
      )`);
      replacements.search = `%${String(req.query.search).trim()}%`;
    }

    const [rows] = await sequelize.query(`
      SELECT
        s.id,
        s.admission_no,
        CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
        c.name AS class_name,
        sec.name AS section_name,
        sp.photo_path,
        COALESCE(SUM(fi.amount_due + COALESCE(fi.late_fee_amount, 0) - COALESCE(fi.concession_amount, 0)), 0) AS total_due,
        COALESCE(SUM(fi.amount_paid), 0) AS paid,
        COALESCE(SUM(fi.amount_due + COALESCE(fi.late_fee_amount, 0) - COALESCE(fi.concession_amount, 0) - fi.amount_paid), 0) AS balance,
        MAX(fp.payment_date) AS last_payment,
        CASE
          WHEN BOOL_OR(fi.status = 'waived') THEN 'waived'
          WHEN COALESCE(SUM(fi.amount_due + COALESCE(fi.late_fee_amount, 0) - COALESCE(fi.concession_amount, 0) - fi.amount_paid), 0) <= 0 THEN 'fully_paid'
          WHEN BOOL_OR(fi.due_date < CURRENT_DATE AND fi.status IN ('pending', 'partial')) THEN 'overdue'
          WHEN BOOL_OR(fi.status = 'partial') THEN 'partial'
          ELSE 'pending'
        END AS status
      FROM students s
      JOIN enrollments e ON e.student_id = s.id
      JOIN classes c ON c.id = e.class_id
      JOIN sections sec ON sec.id = e.section_id
      LEFT JOIN student_profiles sp ON sp.student_id = s.id AND sp.is_current = true
      LEFT JOIN fee_invoices fi ON fi.enrollment_id = e.id
      LEFT JOIN fee_payments fp ON fp.invoice_id = fi.id
      ${buildFilters(filters, replacements).where}
      GROUP BY s.id, c.name, sec.name, sp.photo_path
      ORDER BY student_name ASC
      LIMIT :limit OFFSET :offset;
    `, { replacements });

    return res.ok({ page, perPage, items: rows });
  } catch (err) {
    next(err);
  }
};

exports.studentFees = async (req, res, next) => {
  try {
    const student = await fetchStudentFeeContext(req.params.id, req.user.school_id);
    if (!student) return res.fail('Student not found.', [], 404);

    const invoices = await fetchStudentInvoices(student.enrollment_id);
    const payments = await fetchStudentPayments(student.enrollment_id);
    const statement = await buildStudentStatement(student, invoices, payments);

    const response = {
      student,
      summary : statement.summary,
      invoices,
      payments,
    };

    if (userHasPermission(req, 'students.view')) {
      response.contact = {
        phone        : student.phone,
        email        : student.email,
        father_name  : student.father_name,
        father_phone : student.father_phone,
        mother_name  : student.mother_name,
        mother_phone : student.mother_phone,
      };
    }

    return res.ok(response);
  } catch (err) {
    next(err);
  }
};

exports.studentInvoices = async (req, res, next) => {
  try {
    const student = await fetchStudentFeeContext(req.params.id, req.user.school_id);
    if (!student) return res.fail('Student not found.', [], 404);
    const invoices = await fetchStudentInvoices(student.enrollment_id);
    return res.ok({ items: invoices });
  } catch (err) {
    next(err);
  }
};

exports.studentPayments = async (req, res, next) => {
  try {
    const student = await fetchStudentFeeContext(req.params.id, req.user.school_id);
    if (!student) return res.fail('Student not found.', [], 404);
    const payments = await fetchStudentPayments(student.enrollment_id);
    return res.ok({ items: payments });
  } catch (err) {
    next(err);
  }
};

exports.studentStatementPdf = async (req, res, next) => {
  try {
    const student = await fetchStudentFeeContext(req.params.id, req.user.school_id);
    if (!student) return res.fail('Student not found.', [], 404);
    const invoices = await fetchStudentInvoices(student.enrollment_id);
    const payments = await fetchStudentPayments(student.enrollment_id);
    const statement = await buildStudentStatement(student, invoices, payments);
    return res.ok({
      filename : `statement-${student.admission_no}.json`,
      statement,
    });
  } catch (err) {
    next(err);
  }
};

exports.feeStructure = async (req, res, next) => {
  try {
    const filters = ['c.school_id = :schoolId'];
    const replacements = { schoolId: req.user.school_id };

    if (req.query.session_id) {
      filters.push('fs.session_id = :sessionId');
      replacements.sessionId = parseInteger(req.query.session_id);
    }
    if (req.query.class_id) {
      filters.push('fs.class_id = :classId');
      replacements.classId = parseInteger(req.query.class_id);
    }

    const [rows] = await sequelize.query(`
      SELECT
        fs.*,
        c.name AS class_name,
        sess.name AS session_name
      FROM fee_structures fs
      JOIN classes c ON c.id = fs.class_id
      JOIN sessions sess ON sess.id = fs.session_id
      ${buildFilters(filters, replacements).where}
      ORDER BY c.order_number ASC, fs.name ASC;
    `, { replacements });

    return res.ok({ items: rows });
  } catch (err) {
    next(err);
  }
};

exports.updateFeeStructure = async (req, res, next) => {
  try {
    const { amount, frequency, due_day, is_active, name } = req.body;
    const updates = [];
    const replacements = {
      id       : parseInteger(req.params.id),
      schoolId : req.user.school_id,
    };

    if (name !== undefined) {
      updates.push('name = :name');
      replacements.name = String(name).trim();
    }
    if (amount !== undefined) {
      updates.push('amount = :amount');
      replacements.amount = parseNumber(amount);
    }
    if (frequency !== undefined) {
      updates.push('frequency = :frequency');
      replacements.frequency = frequency;
    }
    if (due_day !== undefined) {
      updates.push('due_day = :dueDay');
      replacements.dueDay = parseInteger(due_day);
    }
    if (is_active !== undefined) {
      updates.push('is_active = :isActive');
      replacements.isActive = Boolean(is_active);
    }

    if (updates.length === 0) return res.fail('No updatable fields provided.', [], 422);

    const [[row]] = await sequelize.query(`
      UPDATE fee_structures fs
      SET ${updates.join(', ')}, updated_at = NOW()
      FROM classes c
      WHERE fs.id = :id
        AND c.id = fs.class_id
        AND c.school_id = :schoolId
      RETURNING fs.*;
    `, { replacements });

    if (!row) return res.fail('Fee structure not found.', [], 404);
    return res.ok(row, 'Fee structure updated.');
  } catch (err) {
    next(err);
  }
};

exports.createFeeStructure = async (req, res, next) => {
  try {
    const sessionId = parseInteger(req.body.session_id) || (await currentSession(req.user.school_id))?.id;
    if (!sessionId) return res.fail('session_id is required.', [], 422);

    const [[row]] = await sequelize.query(`
      INSERT INTO fee_structures (
        session_id, class_id, name, amount, frequency, due_day, is_active, created_at, updated_at
      )
      SELECT
        :sessionId, :classId, :name, :amount, :frequency, :dueDay, :isActive, NOW(), NOW()
      WHERE EXISTS (
        SELECT 1 FROM classes WHERE id = :classId AND school_id = :schoolId AND is_deleted = false
      )
      RETURNING *;
    `, {
      replacements: {
        sessionId,
        classId   : parseInteger(req.body.class_id),
        name      : String(req.body.name || '').trim(),
        amount    : parseNumber(req.body.amount),
        frequency : req.body.frequency,
        dueDay    : parseInteger(req.body.due_day, 10),
        isActive  : req.body.is_active !== false,
        schoolId  : req.user.school_id,
      },
    });

    if (!row) return res.fail('Unable to create fee structure for the given class.', [], 404);
    return res.ok(row, 'Fee structure created.', 201);
  } catch (err) {
    next(err);
  }
};

exports.generateInvoices = async (req, res, next) => {
  try {
    const sessionId = parseInteger(req.body.session_id) || (await currentSession(req.user.school_id))?.id;
    if (!sessionId) return res.fail('session_id is required.', [], 422);
    const result = await feeManager.generateInvoices(sessionId);
    return res.ok(result, 'Invoices generated successfully.');
  } catch (err) {
    next(err);
  }
};

exports.copyFeeStructureFromSession = async (req, res, next) => {
  try {
    const { source_session_id, target_session_id, class_id } = req.body;
    if (!source_session_id || !target_session_id) {
      return res.fail('source_session_id and target_session_id are required.', [], 422);
    }

    await sequelize.transaction(async (transaction) => {
      await sequelize.query(`
        DELETE FROM fee_structures
        WHERE session_id = :targetSessionId
          AND (:classId::int IS NULL OR class_id = :classId);
      `, {
        replacements: {
          targetSessionId : parseInteger(target_session_id),
          classId         : parseInteger(class_id, null),
        },
        transaction,
      });

      await sequelize.query(`
        INSERT INTO fee_structures (
          session_id, class_id, name, amount, frequency, due_day, is_active, created_at, updated_at
        )
        SELECT
          :targetSessionId, class_id, name, amount, frequency, due_day, is_active, NOW(), NOW()
        FROM fee_structures
        WHERE session_id = :sourceSessionId
          AND (:classId::int IS NULL OR class_id = :classId);
      `, {
        replacements: {
          sourceSessionId : parseInteger(source_session_id),
          targetSessionId : parseInteger(target_session_id),
          classId         : parseInteger(class_id, null),
        },
        transaction,
      });
    });

    return res.ok({}, 'Fee structure copied successfully.');
  } catch (err) {
    next(err);
  }
};

exports.invoices = async (req, res, next) => {
  try {
    const { page, perPage, offset } = pagination(req.query);
    const filters = ['s.school_id = :schoolId'];
    const replacements = { schoolId: req.user.school_id, limit: perPage, offset };

    if (req.query.session_id) {
      filters.push('e.session_id = :sessionId');
      replacements.sessionId = parseInteger(req.query.session_id);
    }
    if (req.query.class_id) {
      filters.push('e.class_id = :classId');
      replacements.classId = parseInteger(req.query.class_id);
    }
    if (req.query.section_id) {
      filters.push('e.section_id = :sectionId');
      replacements.sectionId = parseInteger(req.query.section_id);
    }
    if (req.query.status) {
      filters.push('fi.status = :status');
      replacements.status = req.query.status;
    }
    if (req.query.fee_type) {
      filters.push('fs.name ILIKE :feeType');
      replacements.feeType = `%${String(req.query.fee_type).trim()}%`;
    }

    const [rows] = await sequelize.query(`
      SELECT
        fi.id,
        s.id AS student_id,
        s.admission_no,
        CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
        c.name AS class_name,
        sec.name AS section_name,
        fs.name AS fee_type,
        fi.due_date,
        fi.amount_due,
        fi.amount_paid AS paid,
        (
          fi.amount_due + COALESCE(fi.late_fee_amount, 0) -
          COALESCE(fi.concession_amount, 0) - fi.amount_paid
        ) AS balance,
        fi.status
      FROM fee_invoices fi
      JOIN fee_structures fs ON fs.id = fi.fee_structure_id
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      JOIN classes c ON c.id = e.class_id
      JOIN sections sec ON sec.id = e.section_id
      ${buildFilters(filters, replacements).where}
      ORDER BY fi.due_date ASC, fi.id DESC
      LIMIT :limit OFFSET :offset;
    `, { replacements });

    return res.ok({ page, perPage, items: rows });
  } catch (err) {
    next(err);
  }
};

exports.overdueInvoices = async (req, res, next) => {
  req.query.status = req.query.status || 'pending';
  try {
    const [rows] = await sequelize.query(`
      SELECT
        fi.id,
        s.id AS student_id,
        s.admission_no,
        CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
        c.name AS class_name,
        sec.name AS section_name,
        fs.name AS fee_type,
        fi.due_date,
        CURRENT_DATE - fi.due_date AS days_overdue,
        fi.amount_due,
        fi.amount_paid,
        (
          fi.amount_due + COALESCE(fi.late_fee_amount, 0) -
          COALESCE(fi.concession_amount, 0) - fi.amount_paid
        ) AS balance
      FROM fee_invoices fi
      JOIN fee_structures fs ON fs.id = fi.fee_structure_id
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      JOIN classes c ON c.id = e.class_id
      JOIN sections sec ON sec.id = e.section_id
      WHERE s.school_id = :schoolId
        AND fi.status IN ('pending', 'partial')
        AND fi.due_date < CURRENT_DATE
      ORDER BY days_overdue DESC, balance DESC;
    `, { replacements: { schoolId: req.user.school_id } });

    return res.ok({ items: rows });
  } catch (err) {
    next(err);
  }
};

exports.dueTodayInvoices = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        fi.id,
        s.id AS student_id,
        s.admission_no,
        CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
        c.name AS class_name,
        sec.name AS section_name,
        fs.name AS fee_type,
        fi.due_date,
        fi.amount_due,
        fi.amount_paid,
        (
          fi.amount_due + COALESCE(fi.late_fee_amount, 0) -
          COALESCE(fi.concession_amount, 0) - fi.amount_paid
        ) AS balance
      FROM fee_invoices fi
      JOIN fee_structures fs ON fs.id = fi.fee_structure_id
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      JOIN classes c ON c.id = e.class_id
      JOIN sections sec ON sec.id = e.section_id
      WHERE s.school_id = :schoolId
        AND fi.status IN ('pending', 'partial')
        AND fi.due_date <= CURRENT_DATE
      ORDER BY fi.due_date ASC, balance DESC;
    `, { replacements: { schoolId: req.user.school_id } });

    return res.ok({ items: rows });
  } catch (err) {
    next(err);
  }
};

exports.receipts = async (req, res, next) => {
  try {
    const { page, perPage, offset } = pagination(req.query);
    const filters = ['s.school_id = :schoolId'];
    const replacements = { schoolId: req.user.school_id, limit: perPage, offset };

    if (req.query.search) {
      filters.push(`(
        fp.transaction_ref ILIKE :search OR
        CONCAT('RCP-', EXTRACT(YEAR FROM fp.payment_date)::text, '-', LPAD(fp.id::text, 5, '0')) ILIKE :search OR
        CAST(fp.id AS TEXT) ILIKE :search OR
        s.admission_no ILIKE :search OR
        CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) ILIKE :search
      )`);
      replacements.search = `%${String(req.query.search).trim()}%`;
    }
    if (req.query.from) {
      filters.push('fp.payment_date >= :fromDate');
      replacements.fromDate = req.query.from;
    }
    if (req.query.to) {
      filters.push('fp.payment_date <= :toDate');
      replacements.toDate = req.query.to;
    }
    if (req.query.payment_mode) {
      const normalized = normalizePaymentMode(req.query.payment_mode, null);
      filters.push('fp.payment_mode = :paymentMode');
      replacements.paymentMode = normalized.storageMode;
    }

    const [rows] = await sequelize.query(`
      SELECT
        fp.id,
        fp.payment_date AS date,
        fp.created_at,
        fp.amount,
        fp.payment_mode,
        fp.transaction_ref,
        CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
        c.name AS class_name,
        u.name AS generated_by
      FROM fee_payments fp
      JOIN fee_invoices fi ON fi.id = fp.invoice_id
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      JOIN classes c ON c.id = e.class_id
      LEFT JOIN users u ON u.id = fp.received_by
      ${buildFilters(filters, replacements).where}
      ORDER BY fp.created_at DESC
      LIMIT :limit OFFSET :offset;
    `, { replacements });

    return res.ok({
      page,
      perPage,
      items: rows.map((row) => ({
        ...row,
        receipt_no           : receiptNumberFromPaymentId(row.id, row.date),
        payment_mode_display : deriveDisplayPaymentMode(row.payment_mode, row.transaction_ref),
      })),
    });
  } catch (err) {
    next(err);
  }
};

exports.receiptDetail = exports.receipt;
exports.receiptDetailPdf = exports.receiptPdf;

exports.duplicateReceipt = async (req, res, next) => {
  try {
    const receipt = await fetchReceiptBase(parseInteger(req.params.id), req.user.school_id);
    if (!receipt) return res.fail('Receipt not found.', [], 404);

    await auditFinancialAction(req, 'fee_payments', receipt.payment_id, {
      field    : 'duplicate_receipt',
      oldValue : null,
      newValue : new Date().toISOString(),
    }, 'Duplicate receipt generated');

    return res.ok({
      ...receipt,
      is_duplicate : true,
      filename     : `${receipt.receipt_no}-duplicate.html`,
      html         : receiptHtml(receipt, { duplicate: true }),
    });
  } catch (err) {
    next(err);
  }
};

exports.emailReceipt = async (req, res, next) => {
  try {
    const receipt = await fetchReceiptBase(parseInteger(req.params.id), req.user.school_id);
    if (!receipt) return res.fail('Receipt not found.', [], 404);
    if (!receipt.email) return res.fail('Parent email is not available.', [], 422);

    await auditFinancialAction(req, 'fee_payments', receipt.payment_id, {
      field    : 'receipt_emailed',
      oldValue : null,
      newValue : receipt.email,
    }, 'Receipt email queued');

    return res.ok({ queued: true, email: receipt.email, receipt_no: receipt.receipt_no }, 'Receipt email queued.');
  } catch (err) {
    next(err);
  }
};

exports.whatsappReceipt = async (req, res, next) => {
  try {
    const receipt = await fetchReceiptBase(parseInteger(req.params.id), req.user.school_id);
    if (!receipt) return res.fail('Receipt not found.', [], 404);
    const phone = receipt.phone;
    if (!phone) return res.fail('Parent phone number is not available.', [], 422);

    await auditFinancialAction(req, 'fee_payments', receipt.payment_id, {
      field    : 'receipt_whatsapp',
      oldValue : null,
      newValue : phone,
    }, 'Receipt WhatsApp queued');

    return res.ok({ queued: true, phone, receipt_no: receipt.receipt_no }, 'Receipt WhatsApp queued.');
  } catch (err) {
    next(err);
  }
};

exports.defaulters = async (req, res, next) => {
  try {
    const days = parseInteger(req.query.days, 30);
    const filters = [
      's.school_id = :schoolId',
      's.is_deleted = false',
      'fi.status IN (\'pending\', \'partial\')',
    ];
    const replacements = { schoolId: req.user.school_id, days };

    if (days <= 0) {
      filters.push('fi.due_date <= CURRENT_DATE');
    } else {
      filters.push('fi.due_date < CURRENT_DATE - (:days::int * INTERVAL \'1 day\')');
    }

    if (req.query.class_id) {
      filters.push('e.class_id = :classId');
      replacements.classId = parseInteger(req.query.class_id);
    }
    if (req.query.section_id) {
      filters.push('e.section_id = :sectionId');
      replacements.sectionId = parseInteger(req.query.section_id);
    }

    const [rows] = await sequelize.query(`
      SELECT
        s.id,
        CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
        s.admission_no,
        c.name AS class_name,
        sec.name AS section_name,
        sp.photo_path,
        COALESCE(sp.phone, sp.father_phone, sp.mother_phone) AS parent_phone,
        MIN(fi.due_date) AS overdue_since,
        MAX(fp.payment_date) AS last_payment,
        SUM(fi.amount_due + COALESCE(fi.late_fee_amount, 0) - COALESCE(fi.concession_amount, 0) - fi.amount_paid) AS total_due,
        EXTRACT(DAY FROM CURRENT_DATE - MIN(fi.due_date))::int AS days_overdue
      FROM students s
      JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
      JOIN classes c ON c.id = e.class_id
      JOIN sections sec ON sec.id = e.section_id
      LEFT JOIN student_profiles sp ON sp.student_id = s.id AND sp.is_current = true
      JOIN fee_invoices fi ON fi.enrollment_id = e.id
      LEFT JOIN fee_payments fp ON fp.invoice_id = fi.id
      ${buildFilters(filters, replacements).where}
      GROUP BY s.id, c.name, sec.name, sp.photo_path, sp.phone, sp.father_phone, sp.mother_phone
      ORDER BY total_due DESC, days_overdue DESC;
    `, { replacements });

    return res.ok({ items: rows, days_threshold: days });
  } catch (err) {
    next(err);
  }
};

exports.remind = async (req, res, next) => {
  try {
    const { student_ids = [], type, message } = req.body;
    if (!student_ids.length || !type) {
      return res.fail('student_ids and type are required.', [], 422);
    }

    const results = [];
    for (const studentId of student_ids) {
      const [[due]] = await sequelize.query(`
        SELECT COALESCE(SUM(fi.amount_due + COALESCE(fi.late_fee_amount, 0) - COALESCE(fi.concession_amount, 0) - fi.amount_paid), 0) AS amount_due
        FROM fee_invoices fi
        JOIN enrollments e ON e.id = fi.enrollment_id
        JOIN students s ON s.id = e.student_id
        WHERE s.id = :studentId
          AND s.school_id = :schoolId
          AND fi.status IN ('pending', 'partial');
      `, { replacements: { studentId: parseInteger(studentId), schoolId: req.user.school_id } });

      const amountDue = parseNumber(due.amount_due);
      const reminderMessage = message || `Pending school fee amount is Rs ${amountDue.toFixed(2)}. Please clear dues at the earliest.`;
      await recordReminder(req, {
        studentId : parseInteger(studentId),
        type,
        message   : reminderMessage,
        amountDue,
      });
      results.push({ student_id: parseInteger(studentId), status: 'sent', amount_due: amountDue });
    }

    return res.ok({
      sent    : results.length,
      failed  : 0,
      results,
    }, 'Reminder(s) queued.');
  } catch (err) {
    next(err);
  }
};

exports.remindBulk = exports.remind;

exports.concessions = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        fi.id AS invoice_id,
        CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
        c.name AS class_name,
        fs.name AS fee_type,
        fi.amount_due AS original_amount,
        fi.concession_amount,
        (
          fi.amount_due + COALESCE(fi.late_fee_amount, 0) - COALESCE(fi.concession_amount, 0)
        ) AS final_amount,
        fi.concession_reason AS reason,
        fi.concession_type,
        fi.concession_reference
      FROM fee_invoices fi
      JOIN fee_structures fs ON fs.id = fi.fee_structure_id
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      JOIN classes c ON c.id = e.class_id
      WHERE s.school_id = :schoolId
        AND COALESCE(fi.concession_amount, 0) > 0
      ORDER BY fi.updated_at DESC;
    `, { replacements: { schoolId: req.user.school_id } });

    return res.ok({ items: rows });
  } catch (err) {
    next(err);
  }
};

exports.applyConcession = async (req, res, next) => {
  try {
    const {
      invoice_id,
      concession_type,
      concession_value,
      reason,
      approval_reference,
      remarks,
    } = req.body;

    if (!invoice_id || !concession_type || concession_value === undefined || !reason) {
      return res.fail('invoice_id, concession_type, concession_value, and reason are required.', [], 422);
    }

    await sequelize.transaction(async (transaction) => {
      const [[invoice]] = await sequelize.query(`
        SELECT
          fi.*,
          s.school_id
        FROM fee_invoices fi
        JOIN enrollments e ON e.id = fi.enrollment_id
        JOIN students s ON s.id = e.student_id
        WHERE fi.id = :invoiceId AND s.school_id = :schoolId
        FOR UPDATE;
      `, {
        replacements: { invoiceId: parseInteger(invoice_id), schoolId: req.user.school_id },
        transaction,
      });

      if (!invoice) throw new Error('Invoice not found.');

      let concessionAmount = 0;
      const amountDue = parseNumber(invoice.amount_due);

      if (concession_type === 'percentage') concessionAmount = amountDue * (parseNumber(concession_value) / 100);
      else if (concession_type === 'fixed_amount') concessionAmount = parseNumber(concession_value);
      else if (concession_type === 'full_waiver') concessionAmount = amountDue;
      else throw new Error('Invalid concession_type.');

      concessionAmount = Math.min(amountDue, concessionAmount);
      const netBalance = amountDue + parseNumber(invoice.late_fee_amount) - concessionAmount - parseNumber(invoice.amount_paid);
      const nextStatus = netBalance <= 0 ? 'waived' : (parseNumber(invoice.amount_paid) > 0 ? 'partial' : 'pending');

      await sequelize.query(`
        UPDATE fee_invoices
        SET
          concession_amount = :concessionAmount,
          concession_reason = :concessionReason,
          concession_type = :concessionType,
          concession_reference = :concessionReference,
          status = :status,
          updated_at = NOW()
        WHERE id = :invoiceId;
      `, {
        replacements: {
          concessionAmount  : concessionAmount.toFixed(2),
          concessionReason  : remarks ? `${reason} | ${remarks}` : reason,
          concessionType    : concession_type,
          concessionReference: approval_reference || null,
          status            : nextStatus,
          invoiceId         : parseInteger(invoice_id),
        },
        transaction,
      });

      await auditFinancialAction(req, 'fee_invoices', parseInteger(invoice_id), [
        { field: 'concession_amount', oldValue: invoice.concession_amount, newValue: concessionAmount.toFixed(2) },
        { field: 'concession_reason', oldValue: invoice.concession_reason, newValue: reason },
        { field: 'concession_reference', oldValue: invoice.concession_reference, newValue: approval_reference || null },
      ], 'Concession applied');
    });

    return res.ok({}, 'Concession applied successfully.');
  } catch (err) {
    next(err);
  }
};

exports.concessionReport = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        fi.concession_type,
        c.name AS class_name,
        COUNT(fi.id) AS invoices,
        COALESCE(SUM(fi.concession_amount), 0) AS total_concession
      FROM fee_invoices fi
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      JOIN classes c ON c.id = e.class_id
      WHERE s.school_id = :schoolId
        AND COALESCE(fi.concession_amount, 0) > 0
      GROUP BY fi.concession_type, c.name
      ORDER BY total_concession DESC;
    `, { replacements: { schoolId: req.user.school_id } });

    return res.ok({ items: rows });
  } catch (err) {
    next(err);
  }
};

exports.dailyReport = async (req, res, next) => {
  try {
    const reportDate = req.query.date || dateOnly();
    const [rows] = await sequelize.query(`
      SELECT
        fp.id,
        fp.payment_date,
        fp.created_at,
        fp.amount,
        fp.payment_mode,
        fp.transaction_ref,
        fs.name AS fee_type,
        CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
        c.name AS class_name
      FROM fee_payments fp
      JOIN fee_invoices fi ON fi.id = fp.invoice_id
      JOIN fee_structures fs ON fs.id = fi.fee_structure_id
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      JOIN classes c ON c.id = e.class_id
      WHERE s.school_id = :schoolId
        AND fp.payment_date = :reportDate
      ORDER BY fp.created_at DESC;
    `, { replacements: { schoolId: req.user.school_id, reportDate } });

    const summary = rows.reduce((acc, row) => {
      const mode = deriveDisplayPaymentMode(row.payment_mode, row.transaction_ref);
      acc.total_collection += parseNumber(row.amount);
      acc.total_transactions += 1;
      acc.by_mode[mode] = (acc.by_mode[mode] || 0) + parseNumber(row.amount);
      return acc;
    }, {
      total_collection : 0,
      total_transactions : 0,
      by_mode : { cash: 0, online: 0, cheque: 0, dd: 0, upi: 0 },
    });

    return res.ok({ date: reportDate, summary, items: rows });
  } catch (err) {
    next(err);
  }
};

exports.monthlyReport = async (req, res, next) => {
  try {
    const month = parseInteger(req.query.month, new Date().getMonth() + 1);
    const year = parseInteger(req.query.year, new Date().getFullYear());

    const [dayWise] = await sequelize.query(`
      SELECT
        fp.payment_date AS date,
        COALESCE(SUM(fp.amount), 0) AS collection,
        COUNT(fp.id) AS transactions
      FROM fee_payments fp
      JOIN fee_invoices fi ON fi.id = fp.invoice_id
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      WHERE s.school_id = :schoolId
        AND EXTRACT(MONTH FROM fp.payment_date) = :month
        AND EXTRACT(YEAR FROM fp.payment_date) = :year
      GROUP BY fp.payment_date
      ORDER BY fp.payment_date ASC;
    `, { replacements: { schoolId: req.user.school_id, month, year } });

    return res.ok({
      month,
      year,
      day_wise : dayWise,
      total_collected : dayWise.reduce((sum, item) => sum + parseNumber(item.collection), 0),
    });
  } catch (err) {
    next(err);
  }
};

exports.classwiseReport = async (req, res, next) => {
  try {
    const filters = ['s.school_id = :schoolId'];
    const replacements = { schoolId: req.user.school_id };
    if (req.query.session_id) {
      filters.push('e.session_id = :sessionId');
      replacements.sessionId = parseInteger(req.query.session_id);
    }
    if (req.query.class_id) {
      filters.push('e.class_id = :classId');
      replacements.classId = parseInteger(req.query.class_id);
    }

    const [rows] = await sequelize.query(`
      SELECT
        c.id AS class_id,
        c.name AS class_name,
        COUNT(DISTINCT s.id) AS students,
        COALESCE(SUM(fi.amount_due + COALESCE(fi.late_fee_amount, 0) - COALESCE(fi.concession_amount, 0)), 0) AS expected,
        COALESCE(SUM(fi.amount_paid), 0) AS collected,
        COALESCE(SUM(fi.amount_due + COALESCE(fi.late_fee_amount, 0) - COALESCE(fi.concession_amount, 0) - fi.amount_paid), 0) AS pending
      FROM students s
      JOIN enrollments e ON e.student_id = s.id
      JOIN classes c ON c.id = e.class_id
      LEFT JOIN fee_invoices fi ON fi.enrollment_id = e.id
      ${buildFilters(filters, replacements).where}
      GROUP BY c.id, c.name
      ORDER BY c.name ASC;
    `, { replacements });

    return res.ok({ items: rows });
  } catch (err) {
    next(err);
  }
};

exports.sessionReport = async (req, res, next) => {
  try {
    const sessionId = parseInteger(req.query.session_id) || (await currentSession(req.user.school_id))?.id;
    if (!sessionId) return res.fail('session_id is required.', [], 422);

    const [[overview]] = await sequelize.query(`
      SELECT
        COUNT(DISTINCT e.student_id) AS total_enrollment,
        COALESCE(SUM(fi.amount_due + COALESCE(fi.late_fee_amount, 0)), 0) AS expected,
        COALESCE(SUM(fi.amount_paid), 0) AS collected,
        COALESCE(SUM(fi.amount_due + COALESCE(fi.late_fee_amount, 0) - COALESCE(fi.concession_amount, 0) - fi.amount_paid), 0) AS pending,
        COALESCE(SUM(fi.concession_amount), 0) AS concessions
      FROM enrollments e
      LEFT JOIN fee_invoices fi ON fi.enrollment_id = e.id
      JOIN students s ON s.id = e.student_id
      WHERE e.session_id = :sessionId AND s.school_id = :schoolId;
    `, { replacements: { sessionId, schoolId: req.user.school_id } });

    return res.ok({ session_id: sessionId, overview });
  } catch (err) {
    next(err);
  }
};

exports.defaulterReport = exports.defaulters;
exports.reportConcessions = exports.concessionReport;

exports.customReport = async (req, res, next) => {
  try {
    const include = Array.isArray(req.body.include) ? req.body.include : [];
    const [rows] = await sequelize.query(`
      SELECT
        s.id AS student_id,
        s.admission_no,
        CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
        c.name AS class_name,
        sec.name AS section_name,
        COALESCE(SUM(fi.amount_due + COALESCE(fi.late_fee_amount, 0) - COALESCE(fi.concession_amount, 0)), 0) AS expected,
        COALESCE(SUM(fi.amount_paid), 0) AS paid,
        COALESCE(SUM(fi.amount_due + COALESCE(fi.late_fee_amount, 0) - COALESCE(fi.concession_amount, 0) - fi.amount_paid), 0) AS balance,
        sp.phone,
        sp.email
      FROM students s
      JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
      JOIN classes c ON c.id = e.class_id
      JOIN sections sec ON sec.id = e.section_id
      LEFT JOIN fee_invoices fi ON fi.enrollment_id = e.id
      LEFT JOIN student_profiles sp ON sp.student_id = s.id AND sp.is_current = true
      WHERE s.school_id = :schoolId AND s.is_deleted = false
      GROUP BY s.id, c.name, sec.name, sp.phone, sp.email
      ORDER BY student_name ASC;
    `, { replacements: { schoolId: req.user.school_id } });

    return res.ok({ include, items: rows });
  } catch (err) {
    next(err);
  }
};

exports.carryForwardEligible = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        s.id AS student_id,
        CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
        c.name AS class_name,
        COUNT(fi.id) AS invoices_count,
        COALESCE(SUM(fi.amount_due + COALESCE(fi.late_fee_amount, 0) - COALESCE(fi.concession_amount, 0) - fi.amount_paid), 0) AS total_pending
      FROM students s
      JOIN enrollments e ON e.student_id = s.id
      JOIN sessions sess ON sess.id = e.session_id
      JOIN classes c ON c.id = e.class_id
      JOIN fee_invoices fi ON fi.enrollment_id = e.id
      WHERE s.school_id = :schoolId
        AND sess.end_date < CURRENT_DATE
        AND fi.status IN ('pending', 'partial')
      GROUP BY s.id, c.name
      ORDER BY total_pending DESC;
    `, { replacements: { schoolId: req.user.school_id } });

    return res.ok({ items: rows });
  } catch (err) {
    next(err);
  }
};

exports.carryForwardSingle = async (req, res, next) => {
  try {
    const result = await feeManager.carryForwardFees(
      parseInteger(req.body.student_id),
      parseInteger(req.body.old_session_id),
      parseInteger(req.body.new_session_id)
    );

    for (const detail of result.details) {
      await sequelize.query(`
        INSERT INTO fee_carry_forwards (
          old_session_id, new_session_id, student_id, old_invoice_id, new_invoice_id,
          amount, carried_by, carried_at, notes
        )
        VALUES (
          :oldSessionId, :newSessionId, :studentId, :oldInvoiceId,
          (
            SELECT id FROM fee_invoices
            WHERE carry_from_invoice_id = :oldInvoiceId
            ORDER BY id DESC
            LIMIT 1
          ),
          :amount, :carriedBy, NOW(), :notes
        );
      `, {
        replacements: {
          oldSessionId : parseInteger(req.body.old_session_id),
          newSessionId : parseInteger(req.body.new_session_id),
          studentId    : parseInteger(req.body.student_id),
          oldInvoiceId : detail.originalInvoiceId,
          amount       : parseNumber(detail.balanceCarried),
          carriedBy    : req.user.id,
          notes        : req.body.notes || null,
        },
      });
    }

    return res.ok(result, 'Carry forward completed.');
  } catch (err) {
    next(err);
  }
};

exports.carryForwardBulk = async (req, res, next) => {
  try {
    const studentIds = Array.isArray(req.body.student_ids) ? req.body.student_ids : [];
    if (!studentIds.length) return res.fail('student_ids is required.', [], 422);

    const results = [];
    for (const studentId of studentIds) {
      const result = await feeManager.carryForwardFees(
        parseInteger(studentId),
        parseInteger(req.body.old_session_id),
        parseInteger(req.body.new_session_id)
      );
      results.push(result);
    }

    return res.ok({ items: results }, 'Bulk carry forward completed.');
  } catch (err) {
    next(err);
  }
};

exports.refunds = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        fr.id,
        fr.amount,
        fr.reason,
        fr.refund_method,
        fr.reference_number,
        fr.status,
        fr.processed_at,
        CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name,
        u.name AS processed_by_name
      FROM fee_refunds fr
      JOIN students s ON s.id = fr.student_id
      LEFT JOIN users u ON u.id = fr.processed_by
      WHERE s.school_id = :schoolId
      ORDER BY fr.created_at DESC;
    `, { replacements: { schoolId: req.user.school_id } });

    return res.ok({ items: rows });
  } catch (err) {
    next(err);
  }
};

exports.processRefund = async (req, res, next) => {
  try {
    const {
      student_id,
      payment_id,
      invoice_id,
      amount,
      reason,
      refund_method,
      reference_number,
    } = req.body;

    if (!student_id || !payment_id || !invoice_id || !amount || !reason || !refund_method) {
      return res.fail('student_id, payment_id, invoice_id, amount, reason, and refund_method are required.', [], 422);
    }

    const [[row]] = await sequelize.query(`
      INSERT INTO fee_refunds (
        student_id, payment_id, invoice_id, amount, reason, refund_method,
        reference_number, status, processed_by, processed_at, created_at
      )
      VALUES (
        :studentId, :paymentId, :invoiceId, :amount, :reason, :refundMethod,
        :referenceNumber, 'processed', :processedBy, NOW(), NOW()
      )
      RETURNING *;
    `, {
      replacements: {
        studentId       : parseInteger(student_id),
        paymentId       : parseInteger(payment_id),
        invoiceId       : parseInteger(invoice_id),
        amount          : parseNumber(amount),
        reason          : reason.trim(),
        refundMethod    : refund_method,
        referenceNumber : reference_number || null,
        processedBy     : req.user.id,
      },
    });

    await auditFinancialAction(req, 'fee_refunds', row.id, [
      { field: 'amount', oldValue: null, newValue: row.amount },
      { field: 'reason', oldValue: null, newValue: row.reason },
      { field: 'refund_method', oldValue: null, newValue: row.refund_method },
    ], 'Refund processed');

    return res.ok(row, 'Refund processed successfully.', 201);
  } catch (err) {
    next(err);
  }
};

exports.refundReport = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        refund_method,
        COUNT(*) AS refunds_count,
        COALESCE(SUM(amount), 0) AS total_amount
      FROM fee_refunds fr
      JOIN students s ON s.id = fr.student_id
      WHERE s.school_id = :schoolId
      GROUP BY refund_method
      ORDER BY total_amount DESC;
    `, { replacements: { schoolId: req.user.school_id } });

    return res.ok({ items: rows });
  } catch (err) {
    next(err);
  }
};

exports.cheques = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        cp.id,
        cp.cheque_number,
        cp.bank_name,
        cp.branch_name,
        cp.cheque_date,
        cp.received_date,
        cp.clearance_date,
        cp.status,
        cp.bounce_reason,
        cp.bounce_date,
        cp.bounce_charge,
        fp.amount,
        CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name
      FROM cheque_payments cp
      JOIN fee_payments fp ON fp.id = cp.payment_id
      JOIN fee_invoices fi ON fi.id = fp.invoice_id
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      WHERE s.school_id = :schoolId
      ORDER BY cp.received_date DESC, cp.id DESC;
    `, { replacements: { schoolId: req.user.school_id } });

    return res.ok({ items: rows });
  } catch (err) {
    next(err);
  }
};

exports.pendingCheques = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        cp.*,
        fp.amount,
        CONCAT(s.first_name, ' ', COALESCE(s.last_name, '')) AS student_name
      FROM cheque_payments cp
      JOIN fee_payments fp ON fp.id = cp.payment_id
      JOIN fee_invoices fi ON fi.id = fp.invoice_id
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      WHERE s.school_id = :schoolId
        AND cp.status = 'pending'
      ORDER BY cp.received_date ASC;
    `, { replacements: { schoolId: req.user.school_id } });

    return res.ok({ items: rows });
  } catch (err) {
    next(err);
  }
};

exports.clearCheque = async (req, res, next) => {
  try {
    const [[row]] = await sequelize.query(`
      UPDATE cheque_payments cp
      SET status = 'cleared',
          clearance_date = :clearanceDate,
          cleared_by = :clearedBy,
          updated_at = NOW()
      FROM fee_payments fp
      JOIN fee_invoices fi ON fi.id = fp.invoice_id
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      WHERE cp.id = :id
        AND cp.payment_id = fp.id
        AND s.school_id = :schoolId
      RETURNING cp.*;
    `, {
      replacements: {
        id            : parseInteger(req.params.id),
        clearanceDate : req.body.clearance_date || dateOnly(),
        clearedBy     : req.user.id,
        schoolId      : req.user.school_id,
      },
    });

    if (!row) return res.fail('Cheque not found.', [], 404);
    return res.ok(row, 'Cheque marked as cleared.');
  } catch (err) {
    next(err);
  }
};

exports.bounceCheque = async (req, res, next) => {
  try {
    const [[row]] = await sequelize.query(`
      UPDATE cheque_payments cp
      SET status = 'bounced',
          bounce_reason = :bounceReason,
          bounce_date = :bounceDate,
          bounce_charge = :bounceCharge,
          updated_at = NOW()
      FROM fee_payments fp
      JOIN fee_invoices fi ON fi.id = fp.invoice_id
      JOIN enrollments e ON e.id = fi.enrollment_id
      JOIN students s ON s.id = e.student_id
      WHERE cp.id = :id
        AND cp.payment_id = fp.id
        AND s.school_id = :schoolId
      RETURNING cp.*, fp.invoice_id;
    `, {
      replacements: {
        id           : parseInteger(req.params.id),
        bounceReason : req.body.bounce_reason || 'Cheque bounced',
        bounceDate   : req.body.bounce_date || dateOnly(),
        bounceCharge : parseNumber(req.body.bounce_charge, 0),
        schoolId     : req.user.school_id,
      },
    });

    if (!row) return res.fail('Cheque not found.', [], 404);

    await sequelize.query(`
      UPDATE fee_invoices
      SET status = 'pending', updated_at = NOW()
      WHERE id = :invoiceId AND status IN ('paid', 'partial');
    `, { replacements: { invoiceId: row.invoice_id } });

    return res.ok(row, 'Cheque marked as bounced.');
  } catch (err) {
    next(err);
  }
};

exports.profile = async (req, res, next) => {
  try {
    const [[row]] = await sequelize.query(`
      SELECT
        id, name, email, role, school_id, is_active,
        phone, employee_id, designation, department, joining_date,
        profile_photo, last_login_at
      FROM users
      WHERE id = :userId AND school_id = :schoolId
      LIMIT 1;
    `, { replacements: { userId: req.user.id, schoolId: req.user.school_id } });

    if (!row) return res.fail('Profile not found.', [], 404);

    return res.ok({
      ...row,
      permissions : Array.from(req.userPermissions || []),
    });
  } catch (err) {
    next(err);
  }
};

exports.profileActivity = async (req, res, next) => {
  try {
    const [[today]] = await sequelize.query(`
      SELECT
        COUNT(*) AS transactions,
        COUNT(*) AS receipts_generated,
        COALESCE(SUM(amount), 0) AS amount_collected
      FROM fee_payments
      WHERE received_by = :userId
        AND payment_date = CURRENT_DATE;
    `, { replacements: { userId: req.user.id } });

    const [[month]] = await sequelize.query(`
      SELECT
        COUNT(*) AS transactions,
        COUNT(*) AS receipts_generated,
        COUNT(DISTINCT payment_date) AS active_days,
        COALESCE(SUM(amount), 0) AS amount_collected
      FROM fee_payments
      WHERE received_by = :userId
        AND EXTRACT(MONTH FROM payment_date) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(YEAR FROM payment_date) = EXTRACT(YEAR FROM CURRENT_DATE);
    `, { replacements: { userId: req.user.id } });

    const [[concessions]] = await sequelize.query(`
      SELECT COUNT(*) AS concessions_applied
      FROM audit_logs
      WHERE table_name = 'fee_invoices'
        AND field_name = 'concession_amount'
        AND changed_by = :userId
        AND DATE(created_at) = CURRENT_DATE;
    `, { replacements: { userId: req.user.id } });

    const [[monthConcessions]] = await sequelize.query(`
      SELECT COUNT(*) AS concessions_applied
      FROM audit_logs
      WHERE table_name = 'fee_invoices'
        AND field_name = 'concession_amount'
        AND changed_by = :userId
        AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE);
    `, { replacements: { userId: req.user.id } });

    const [[bestDay]] = await sequelize.query(`
      SELECT
        payment_date,
        COUNT(*) AS transactions,
        COALESCE(SUM(amount), 0) AS amount_collected
      FROM fee_payments
      WHERE received_by = :userId
        AND EXTRACT(MONTH FROM payment_date) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(YEAR FROM payment_date) = EXTRACT(YEAR FROM CURRENT_DATE)
      GROUP BY payment_date
      ORDER BY amount_collected DESC, payment_date ASC
      LIMIT 1;
    `, { replacements: { userId: req.user.id } });

    const monthAmount = parseNumber(month.amount_collected);
    const elapsedMonthDays = Math.max(parseInteger(new Date().getDate(), 1), 1);

    return res.ok({
      today : {
        transactions       : parseInteger(today.transactions, 0),
        receipts_generated : parseInteger(today.receipts_generated, 0),
        amount_collected   : parseNumber(today.amount_collected),
        concessions_applied: parseInteger(concessions.concessions_applied, 0),
      },
      month : {
        transactions         : parseInteger(month.transactions, 0),
        receipts_generated   : parseInteger(month.receipts_generated, 0),
        amount_collected     : monthAmount,
        active_days          : parseInteger(month.active_days, 0),
        average_daily_amount : monthAmount / elapsedMonthDays,
        concessions_applied  : parseInteger(monthConcessions.concessions_applied, 0),
        most_collected_day   : bestDay ? {
          date             : bestDay.payment_date,
          transactions     : parseInteger(bestDay.transactions, 0),
          amount_collected : parseNumber(bestDay.amount_collected),
        } : null,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password || String(new_password).length < 8) {
      return res.fail('current_password and new_password (min 8 chars) are required.', [], 422);
    }

    const [[user]] = await sequelize.query(`
      SELECT id, password_hash
      FROM users
      WHERE id = :userId AND school_id = :schoolId
      LIMIT 1;
    `, { replacements: { userId: req.user.id, schoolId: req.user.school_id } });

    if (!user) return res.fail('User not found.', [], 404);

    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.fail('Current password is incorrect.', [], 401);

    const hash = await bcrypt.hash(new_password, 12);
    await sequelize.query(`
      UPDATE users
      SET password_hash = :hash,
          force_password_change = false,
          last_password_change = NOW(),
          updated_at = NOW()
      WHERE id = :userId;
    `, { replacements: { hash, userId: req.user.id } });

    await auditFinancialAction(req, 'users', req.user.id, {
      field    : 'password_change',
      oldValue : null,
      newValue : 'changed',
    }, 'Accountant changed own password');

    return res.ok({}, 'Password changed successfully.');
  } catch (err) {
    next(err);
  }
};
