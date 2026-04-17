'use strict';

/**
 * Migration: create_fee_payments
 *
 * Immutable ledger of every payment transaction.
 * Never update or delete — if a payment is wrong, reverse it with a new entry.
 * Multiple payments can apply to one invoice (partial → partial → paid).
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('fee_payments', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      invoice_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'fee_invoices', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        comment: 'Which invoice this payment is applied to',
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Amount paid in this transaction',
      },
      payment_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        comment: 'Date payment was received (may differ from created_at)',
      },
      payment_mode: {
        type: Sequelize.ENUM('cash', 'online', 'cheque', 'dd'),
        allowNull: false,
        comment: 'cash=counter, online=UPI/NEFT, cheque=bank cheque, dd=demand draft',
      },
      transaction_ref: {
        type: Sequelize.STRING(200),
        allowNull: true,
        comment: 'UPI transaction ID, cheque number, DD number etc.',
      },
      received_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'FK to users.id — accountant or admin who recorded the payment',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('fee_payments', ['invoice_id'], {
      name: 'idx_fee_payments_invoice',
    });

    await queryInterface.addIndex('fee_payments', ['payment_date'], {
      name: 'idx_fee_payments_date',
    });

    // transaction_ref should be unique when provided
    // await queryInterface.addIndex('fee_payments', ['transaction_ref'], {
    //   name   : 'idx_fee_payments_transaction_ref',
    //   unique : true,
    //   where  : 'transaction_ref IS NOT NULL',   // Partial index — NULLs not compared
    // });

    const { Op } = Sequelize;

    await queryInterface.addIndex('fee_payments', ['transaction_ref'], {
      name: 'idx_fee_payments_transaction_ref',
      unique: true,
      where: {
        transaction_ref: {
          [Op.ne]: null,
        },
      },
    });

    // Amount must be positive
    await queryInterface.sequelize.query(`
      ALTER TABLE fee_payments
      ADD CONSTRAINT chk_payment_amount_positive
      CHECK (amount > 0);
    `);

    // Immutability trigger — payments are a financial ledger, never edit or delete
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION fn_fee_payments_immutable()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION
          'fee_payments is an immutable ledger. Operation % is not permitted on id=%.',
          TG_OP, OLD.id
          USING ERRCODE = 'restrict_violation';
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryInterface.sequelize.query(`
      CREATE TRIGGER trg_fee_payments_immutable
      BEFORE UPDATE OR DELETE ON fee_payments
      FOR EACH ROW EXECUTE FUNCTION fn_fee_payments_immutable();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP TRIGGER IF EXISTS trg_fee_payments_immutable ON fee_payments;`
    );
    await queryInterface.sequelize.query(
      `DROP FUNCTION IF EXISTS fn_fee_payments_immutable;`
    );
    await queryInterface.dropTable('fee_payments');
  },
};