'use strict';

/**
 * Seed: fee_structures + fee_invoices + fee_payments
 *
 * Fee structure per class tier:
 *   Primary   (1–5)  : Tuition, Activity, Library
 *   Middle    (6–8)  : Tuition, Activity, Library, Lab
 *   Secondary (9–10) : Tuition, Activity, Library, Lab, Exam
 *   Senior    (11–12): Tuition, Activity, Library, Lab, Exam + stream surcharge
 *
 * Invoices generated for April 2026 (monthly fees).
 * ~70% students have paid, ~20% partial, ~10% pending.
 */

// ── Fee definitions per class tier ─────────────────────────────────────────
const FEE_TIERS = {
  primary: [
    { name: 'Tuition Fee',   amount: 1200, frequency: 'monthly',  due_day: 10 },
    { name: 'Activity Fee',  amount:  300, frequency: 'quarterly', due_day: 10 },
    { name: 'Library Fee',   amount:  200, frequency: 'annual',    due_day: 10 },
  ],
  middle: [
    { name: 'Tuition Fee',   amount: 1800, frequency: 'monthly',  due_day: 10 },
    { name: 'Activity Fee',  amount:  400, frequency: 'quarterly', due_day: 10 },
    { name: 'Library Fee',   amount:  200, frequency: 'annual',    due_day: 10 },
    { name: 'Lab Fee',       amount:  500, frequency: 'quarterly', due_day: 10 },
  ],
  secondary: [
    { name: 'Tuition Fee',   amount: 2400, frequency: 'monthly',  due_day: 10 },
    { name: 'Activity Fee',  amount:  400, frequency: 'quarterly', due_day: 10 },
    { name: 'Library Fee',   amount:  300, frequency: 'annual',    due_day: 10 },
    { name: 'Lab Fee',       amount:  600, frequency: 'quarterly', due_day: 10 },
    { name: 'Exam Fee',      amount:  800, frequency: 'annual',    due_day: 10 },
  ],
  arts: [
    { name: 'Tuition Fee',        amount: 3000, frequency: 'monthly',  due_day: 10 },
    { name: 'Activity Fee',       amount:  500, frequency: 'quarterly', due_day: 10 },
    { name: 'Library Fee',        amount:  400, frequency: 'annual',    due_day: 10 },
    { name: 'Lab Fee',            amount:  400, frequency: 'quarterly', due_day: 10 },
    { name: 'Exam Fee',           amount: 1000, frequency: 'annual',    due_day: 10 },
    { name: 'Arts Surcharge',     amount:  300, frequency: 'annual',    due_day: 10 },
  ],
  commerce: [
    { name: 'Tuition Fee',        amount: 3000, frequency: 'monthly',  due_day: 10 },
    { name: 'Activity Fee',       amount:  500, frequency: 'quarterly', due_day: 10 },
    { name: 'Library Fee',        amount:  400, frequency: 'annual',    due_day: 10 },
    { name: 'Lab Fee',            amount:  400, frequency: 'quarterly', due_day: 10 },
    { name: 'Exam Fee',           amount: 1000, frequency: 'annual',    due_day: 10 },
    { name: 'Commerce Surcharge', amount:  500, frequency: 'annual',    due_day: 10 },
  ],
  science: [
    { name: 'Tuition Fee',        amount: 3500, frequency: 'monthly',  due_day: 10 },
    { name: 'Activity Fee',       amount:  500, frequency: 'quarterly', due_day: 10 },
    { name: 'Library Fee',        amount:  400, frequency: 'annual',    due_day: 10 },
    { name: 'Lab Fee',            amount:  800, frequency: 'quarterly', due_day: 10 },
    { name: 'Exam Fee',           amount: 1200, frequency: 'annual',    due_day: 10 },
    { name: 'Science Surcharge',  amount:  800, frequency: 'annual',    due_day: 10 },
  ],
};

function getTier(order_number, stream) {
  if (order_number <= 5)  return 'primary';
  if (order_number <= 8)  return 'middle';
  if (order_number <= 10) return 'secondary';
  return stream || 'arts'; // 11–12: stream name matches tier key
}

// Seeded deterministic random
function seededRand(seed) {
  let s = seed >>> 0 || 1;
  return function () {
    s = Math.imul(s ^ (s >>> 17), 0xb5a4bcae);
    s ^= s << 7;
    s = Math.imul(s ^ (s >>> 13), 0x45d9f3b);
    s ^= s >> 16;
    return (s >>> 0) / 0xffffffff;
  };
}

module.exports = {
  async up(queryInterface) {
    const now     = new Date();
    const APR_DUE = '2026-04-10'; // April invoice due date

    // ── Reference data ──────────────────────────────────────────────────
    const [[school]] = await queryInterface.sequelize.query(
      `SELECT id FROM schools ORDER BY id ASC LIMIT 1;`
    );
    if (!school) { console.warn('No school found.'); return; }

    const [[session]] = await queryInterface.sequelize.query(
      `SELECT id FROM sessions WHERE school_id = ${school.id} ORDER BY id DESC LIMIT 1;`
    );
    if (!session) { console.warn('No session found.'); return; }
    const sessionId = session.id;

    const [classes] = await queryInterface.sequelize.query(`
      SELECT id, order_number, stream, name
      FROM   classes
      WHERE  is_deleted = false
      ORDER  BY order_number ASC, stream ASC;
    `);

    // HOD as accountant stand-in for received_by
    const [[hod]] = await queryInterface.sequelize.query(
      `SELECT id FROM users WHERE email = 'geeta.mishra@school.edu' LIMIT 1;`
    );
    const accountantId = hod ? hod.id : null;

    // Enrollments per class
    const [allEnrollments] = await queryInterface.sequelize.query(`
      SELECT e.id AS enrollment_id, e.class_id
      FROM   enrollments e
      WHERE  e.session_id = ${sessionId} AND e.status = 'active'
      ORDER  BY e.class_id ASC, e.id ASC;
    `);

    const enrollmentsByClass = {};
    allEnrollments.forEach((e) => {
      if (!enrollmentsByClass[e.class_id]) enrollmentsByClass[e.class_id] = [];
      enrollmentsByClass[e.class_id].push(e);
    });

    // ── Insert fee_structures ───────────────────────────────────────────
    const structureRows = [];
    for (const cls of classes) {
      const tier = getTier(cls.order_number, cls.stream);
      const fees = FEE_TIERS[tier] || FEE_TIERS.primary;
      for (const fee of fees) {
        structureRows.push({
          session_id : sessionId,
          class_id   : cls.id,
          name       : fee.name,
          amount     : fee.amount,
          frequency  : fee.frequency,
          due_day    : fee.due_day,
          is_active  : true,
          created_at : now,
          updated_at : now,
        });
      }
    }

    await queryInterface.bulkInsert('fee_structures', structureRows);
    console.log(`\n[seed-fees] Inserted ${structureRows.length} fee_structure rows.`);

    // Fetch inserted structures with their IDs
    const [insertedStructures] = await queryInterface.sequelize.query(`
      SELECT id, session_id, class_id, name, amount, frequency
      FROM   fee_structures
      WHERE  session_id = ${sessionId}
      ORDER  BY class_id ASC, id ASC;
    `);

    // Map class_id → structures
    const structuresByClass = {};
    insertedStructures.forEach((s) => {
      if (!structuresByClass[s.class_id]) structuresByClass[s.class_id] = [];
      structuresByClass[s.class_id].push(s);
    });

    // ── Insert fee_invoices ─────────────────────────────────────────────
    // Generate April invoice for monthly + quarterly + annual structures
    // (all fees are due at session start)
    const BATCH     = 500;
    let invoiceRows = [];
    let totalInvoices = 0;

    for (const cls of classes) {
      const structures  = structuresByClass[cls.id] || [];
      const enrollments = enrollmentsByClass[cls.id] || [];

      for (const enr of enrollments) {
        for (const str of structures) {
          invoiceRows.push({
            enrollment_id        : enr.enrollment_id,
            fee_structure_id     : str.id,
            amount_due           : str.amount,
            amount_paid          : 0,        // updated below via payments
            due_date             : APR_DUE,
            paid_date            : null,
            status               : 'pending',
            carry_from_invoice_id: null,
            late_fee_amount      : 0,
            concession_amount    : 0,
            concession_reason    : null,
            created_at           : now,
            updated_at           : now,
          });
        }
      }

      // Flush batch
      if (invoiceRows.length >= BATCH) {
        await queryInterface.bulkInsert('fee_invoices', invoiceRows);
        totalInvoices += invoiceRows.length;
        process.stdout.write(`\r  Invoices inserted: ${totalInvoices}`);
        invoiceRows = [];
      }
    }
    if (invoiceRows.length) {
      await queryInterface.bulkInsert('fee_invoices', invoiceRows);
      totalInvoices += invoiceRows.length;
    }
    console.log(`\n[seed-fees] Inserted ${totalInvoices} fee_invoice rows.`);

    // Fetch inserted invoices
    const [insertedInvoices] = await queryInterface.sequelize.query(`
      SELECT fi.id, fi.enrollment_id, fi.fee_structure_id, fi.amount_due
      FROM   fee_invoices fi
      JOIN   fee_structures fs ON fs.id = fi.fee_structure_id
      WHERE  fs.session_id = ${sessionId}
      ORDER  BY fi.enrollment_id ASC, fi.id ASC;
    `);

    // ── Insert fee_payments + update invoices ───────────────────────────
    // Per enrollment: 70% paid, 20% partial, 10% pending
    // Group invoices by enrollment
    const invoicesByEnrollment = {};
    insertedInvoices.forEach((inv) => {
      if (!invoicesByEnrollment[inv.enrollment_id]) invoicesByEnrollment[inv.enrollment_id] = [];
      invoicesByEnrollment[inv.enrollment_id].push(inv);
    });

    const paymentRows    = [];
    const invoiceUpdates = []; // { id, amount_paid, status, paid_date }

    for (const [enrollmentId, invoices] of Object.entries(invoicesByEnrollment)) {
      const rand       = seededRand(parseInt(enrollmentId) * 1337);
      const r          = rand();
      const payStatus  = r < 0.70 ? 'paid' : r < 0.90 ? 'partial' : 'pending';

      for (const inv of invoices) {
        const amtDue = parseFloat(inv.amount_due);
        let amtPaid  = 0;
        let paidDate = null;
        let invStatus = 'pending';

        if (payStatus === 'paid') {
          amtPaid   = amtDue;
          paidDate  = '2026-04-08';
          invStatus = 'paid';
          paymentRows.push({
            invoice_id      : inv.id,
            amount          : amtDue,
            payment_date    : paidDate,
            payment_mode    : ['cash','upi','online','cheque'][Math.floor(rand() * 4)],
            transaction_ref : payStatus === 'paid' ? `TXN${inv.id}${enrollmentId}` : null,
            received_by     : accountantId,
            created_at      : now,
          });
        } else if (payStatus === 'partial') {
          amtPaid   = Math.round(amtDue * 0.5 * 100) / 100;
          paidDate  = null;
          invStatus = 'partial';
          paymentRows.push({
            invoice_id      : inv.id,
            amount          : amtPaid,
            payment_date    : '2026-04-08',
            payment_mode    : ['cash','upi'][Math.floor(rand() * 2)],
            transaction_ref : null,
            received_by     : accountantId,
            created_at      : now,
          });
        }

        invoiceUpdates.push({
          id         : inv.id,
          amount_paid: amtPaid,
          status     : invStatus,
          paid_date  : paidDate,
        });
      }
    }

    // Bulk insert payments
    for (let i = 0; i < paymentRows.length; i += BATCH) {
      await queryInterface.bulkInsert('fee_payments', paymentRows.slice(i, i + BATCH));
    }
    console.log(`[seed-fees] Inserted ${paymentRows.length} fee_payment rows.`);

    // Update invoices with paid amounts + status
    // Use a single query per status group for efficiency
    const paidIds    = invoiceUpdates.filter((u) => u.status === 'paid').map((u) => u.id);
    const partialIds = invoiceUpdates.filter((u) => u.status === 'partial');

    if (paidIds.length) {
      await queryInterface.sequelize.query(`
        UPDATE fee_invoices
        SET    amount_paid = amount_due,
               status      = 'paid',
               paid_date   = '2026-04-08',
               updated_at  = NOW()
        WHERE  id IN (${paidIds.join(',')});
      `);
    }

    // Partial: each has different amount_paid so update in chunks
    for (let i = 0; i < partialIds.length; i += BATCH) {
      const chunk = partialIds.slice(i, i + BATCH);
      for (const u of chunk) {
        await queryInterface.sequelize.query(`
          UPDATE fee_invoices
          SET    amount_paid = ${u.amount_paid},
                 status      = 'partial',
                 updated_at  = NOW()
          WHERE  id = ${u.id};
        `);
      }
      process.stdout.write(`\r  Invoices updated: ${Math.min(i + BATCH, partialIds.length)}/${partialIds.length}`);
    }

    console.log(`\n\n[seed-fees] Summary:`);
    console.log(`  Fee structures : ${structureRows.length}`);
    console.log(`  Fee invoices   : ${totalInvoices}`);
    console.log(`  Fee payments   : ${paymentRows.length}`);
    console.log(`  Paid           : ${paidIds.length} invoices`);
    console.log(`  Partial        : ${partialIds.length} invoices`);
    console.log(`  Pending        : ${invoiceUpdates.filter((u) => u.status === 'pending').length} invoices\n`);
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

    await queryInterface.sequelize.query(`
      DELETE FROM fee_payments
      WHERE invoice_id IN (
        SELECT fi.id FROM fee_invoices fi
        JOIN   fee_structures fs ON fs.id = fi.fee_structure_id
        WHERE  fs.session_id = ${session.id}
      );
    `);

    await queryInterface.sequelize.query(`
      DELETE FROM fee_invoices
      WHERE fee_structure_id IN (
        SELECT id FROM fee_structures WHERE session_id = ${session.id}
      );
    `);

    await queryInterface.bulkDelete('fee_structures', { session_id: session.id });
    console.log('[seed-fees] Fee structures, invoices and payments removed.');
  },
};