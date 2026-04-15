'use strict';

/**
 * Migration: create_fee_invoices
 *
 * One row per student per fee per billing period.
 * e.g. Priya + Tuition Fee + April 2024 = one invoice row.
 *
 * carry_from_invoice_id links a new invoice to the old unpaid one.
 * When a carry-forward invoice is paid, the original is also closed.
 *
 * Financial accuracy:
 *   net_payable = amount_due + late_fee_amount - concession_amount
 *   status transitions: pending → partial → paid
 *                       pending → waived
 *                       pending → carried_forward (then a new invoice is opened)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('fee_invoices', {
      id: {
        type          : Sequelize.INTEGER,
        autoIncrement : true,
        primaryKey    : true,
        allowNull     : false,
      },
      enrollment_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'enrollments', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
        comment    : 'Ties invoice to a student+session+class combination',
      },
      fee_structure_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'fee_structures', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
        comment    : 'Which fee type generated this invoice',
      },
      amount_due: {
        type      : Sequelize.DECIMAL(10, 2),
        allowNull : false,
        comment   : 'Base amount copied from fee_structure at time of generation',
      },
      amount_paid: {
        type         : Sequelize.DECIMAL(10, 2),
        allowNull    : false,
        defaultValue : 0.00,
        comment      : 'Running total of all payments applied to this invoice',
      },
      due_date: {
        type      : Sequelize.DATEONLY,
        allowNull : false,
        comment   : 'Date by which payment must be made to avoid late fee',
      },
      paid_date: {
        type      : Sequelize.DATEONLY,
        allowNull : true,
        comment   : 'Date payment was completed (status changed to paid)',
      },
      status: {
        type         : Sequelize.ENUM('pending', 'paid', 'partial', 'waived', 'carried_forward'),
        allowNull    : false,
        defaultValue : 'pending',
        comment      : [
          'pending         = not yet paid',
          'paid            = fully paid',
          'partial         = some payment received, balance remaining',
          'waived          = fee forgiven — no payment required',
          'carried_forward = unpaid, moved to next session via carry-forward',
        ].join(' | '),
      },
      carry_from_invoice_id: {
        type       : Sequelize.INTEGER,
        allowNull  : true,
        references : { model: 'fee_invoices', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'SET NULL',
        comment    : 'If this invoice was carried from a previous session, points to original',
      },
      late_fee_amount: {
        type         : Sequelize.DECIMAL(10, 2),
        allowNull    : false,
        defaultValue : 0.00,
        comment      : 'Late fee added by admin when payment is overdue',
      },
      concession_amount: {
        type         : Sequelize.DECIMAL(10, 2),
        allowNull    : false,
        defaultValue : 0.00,
        comment      : 'Discount granted — reduces net_payable',
      },
      concession_reason: {
        type      : Sequelize.TEXT,
        allowNull : true,
        comment   : 'Required when concession_amount > 0',
      },
      created_at: {
        type         : Sequelize.DATE,
        allowNull    : false,
        defaultValue : Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type         : Sequelize.DATE,
        allowNull    : false,
        defaultValue : Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Prevent duplicate invoices for same enrollment + fee + due_date
    await queryInterface.addIndex('fee_invoices', ['enrollment_id', 'fee_structure_id', 'due_date'], {
      name   : 'idx_fee_invoices_enrollment_fee_date',
      unique : true,
    });

    // Fast lookup: all pending invoices for a student
    await queryInterface.addIndex('fee_invoices', ['enrollment_id', 'status'], {
      name: 'idx_fee_invoices_enrollment_status',
    });

    // Carry-forward chain lookup
    await queryInterface.addIndex('fee_invoices', ['carry_from_invoice_id'], {
      name: 'idx_fee_invoices_carry_from',
    });

    // Due date range queries (overdue reports)
    await queryInterface.addIndex('fee_invoices', ['due_date', 'status'], {
      name: 'idx_fee_invoices_due_date_status',
    });

    // DB constraint: concession_reason required when concession > 0
    await queryInterface.sequelize.query(`
      ALTER TABLE fee_invoices
      ADD CONSTRAINT chk_concession_reason
      CHECK (
        concession_amount = 0
        OR (concession_amount > 0 AND concession_reason IS NOT NULL)
      );
    `);

    // DB constraint: amounts cannot be negative
    await queryInterface.sequelize.query(`
      ALTER TABLE fee_invoices
      ADD CONSTRAINT chk_amounts_non_negative
      CHECK (
        amount_due        >= 0 AND
        amount_paid       >= 0 AND
        late_fee_amount   >= 0 AND
        concession_amount >= 0
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('fee_invoices');
  },
};