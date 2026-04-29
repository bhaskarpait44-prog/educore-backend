'use strict';

async function ensureUserRoleEnumValue(queryInterface, Sequelize, role) {
  if (queryInterface.sequelize.getDialect() !== 'postgres') return;
  await queryInterface.sequelize.query(`
    DO $$
    BEGIN
      ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS '${role}';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN NULL;
    END $$;
  `);
}

async function tableExists(queryInterface, tableName) {
  try {
    await queryInterface.describeTable(tableName);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await ensureUserRoleEnumValue(queryInterface, Sequelize, 'accountant');

    if (!(await tableExists(queryInterface, 'fee_structures'))) {
      await queryInterface.createTable('fee_structures', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        session_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'sessions', key: 'id' },
          onDelete: 'CASCADE',
        },
        class_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'classes', key: 'id' },
          onDelete: 'CASCADE',
        },
        name: { type: Sequelize.STRING(150), allowNull: false },
        amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        frequency: {
          type: Sequelize.ENUM('monthly', 'quarterly', 'annual', 'one_time'),
          allowNull: false,
        },
        due_day: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 10 },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });

      await queryInterface.addIndex('fee_structures', ['session_id', 'class_id', 'is_active'], {
        name: 'idx_fee_structures_session_class_active',
      });
    }

    if (!(await tableExists(queryInterface, 'fee_invoices'))) {
      await queryInterface.createTable('fee_invoices', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        enrollment_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'enrollments', key: 'id' },
          onDelete: 'CASCADE',
        },
        fee_structure_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'fee_structures', key: 'id' },
          onDelete: 'CASCADE',
        },
        amount_due: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        amount_paid: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        due_date: { type: Sequelize.DATEONLY, allowNull: false },
        paid_date: { type: Sequelize.DATEONLY, allowNull: true },
        status: {
          type: Sequelize.ENUM('pending', 'paid', 'partial', 'waived', 'carried_forward'),
          allowNull: false,
          defaultValue: 'pending',
        },
        carry_from_invoice_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'fee_invoices', key: 'id' },
          onDelete: 'SET NULL',
        },
        late_fee_amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        concession_amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
        concession_reason: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });

      await queryInterface.addIndex('fee_invoices', ['enrollment_id', 'status', 'due_date'], {
        name: 'idx_fee_invoices_enrollment_status_due_date',
      });
      await queryInterface.addIndex('fee_invoices', ['fee_structure_id', 'due_date'], {
        name: 'idx_fee_invoices_structure_due_date',
      });
    }

    if (!(await tableExists(queryInterface, 'fee_payments'))) {
      await queryInterface.createTable('fee_payments', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        invoice_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'fee_invoices', key: 'id' },
          onDelete: 'CASCADE',
        },
        amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        payment_date: { type: Sequelize.DATEONLY, allowNull: false },
        payment_mode: {
          type: Sequelize.ENUM('cash', 'online', 'cheque', 'dd', 'upi'),
          allowNull: false,
        },
        transaction_ref: { type: Sequelize.STRING(200), allowNull: true },
        received_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
        },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });

      await queryInterface.addIndex('fee_payments', ['payment_date', 'payment_mode'], {
        name: 'idx_fee_payments_date_mode',
      });
      await queryInterface.addIndex('fee_payments', ['received_by', 'payment_date'], {
        name: 'idx_fee_payments_received_by_date',
      });
    } else {
      const paymentColumns = await queryInterface.describeTable('fee_payments');
      if (!paymentColumns.payment_mode?.values?.includes?.('upi') && queryInterface.sequelize.getDialect() === 'postgres') {
        await queryInterface.sequelize.query(`
          DO $$
          BEGIN
            ALTER TYPE "enum_fee_payments_payment_mode" ADD VALUE IF NOT EXISTS 'upi';
          EXCEPTION
            WHEN duplicate_object THEN NULL;
            WHEN undefined_object THEN NULL;
          END $$;
        `);
      }
    }

    if (!(await tableExists(queryInterface, 'fee_reminders'))) {
      await queryInterface.createTable('fee_reminders', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        school_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'schools', key: 'id' },
          onDelete: 'CASCADE',
        },
        student_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'students', key: 'id' },
          onDelete: 'CASCADE',
        },
        invoice_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'fee_invoices', key: 'id' },
          onDelete: 'SET NULL',
        },
        reminder_type: { type: Sequelize.STRING(50), allowNull: false },
        contact_channel: { type: Sequelize.STRING(50), allowNull: false, defaultValue: 'manual' },
        message: { type: Sequelize.TEXT, allowNull: true },
        sent_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
        },
        sent_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        status: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'sent' },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      });

      await queryInterface.addIndex('fee_reminders', ['student_id', 'sent_at'], {
        name: 'idx_fee_reminders_student_sent_at',
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('fee_reminders').catch(() => {});
    await queryInterface.dropTable('fee_payments').catch(() => {});
    await queryInterface.dropTable('fee_invoices').catch(() => {});
    await queryInterface.dropTable('fee_structures').catch(() => {});
  },
};
