'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('fee_refunds', {
      id: {
        type          : Sequelize.INTEGER,
        autoIncrement : true,
        primaryKey    : true,
        allowNull     : false,
      },
      student_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'students', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
      },
      payment_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'fee_payments', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
      },
      invoice_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'fee_invoices', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
      },
      amount: {
        type      : Sequelize.DECIMAL(10, 2),
        allowNull : false,
      },
      reason: {
        type      : Sequelize.TEXT,
        allowNull : false,
      },
      refund_method: {
        type      : Sequelize.ENUM('cash', 'online', 'adjustment'),
        allowNull : false,
      },
      reference_number: {
        type      : Sequelize.STRING(150),
        allowNull : true,
      },
      status: {
        type         : Sequelize.ENUM('pending', 'processed', 'cancelled'),
        allowNull    : false,
        defaultValue : 'pending',
      },
      processed_by: {
        type       : Sequelize.INTEGER,
        allowNull  : true,
        references : { model: 'users', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'SET NULL',
      },
      processed_at: {
        type      : Sequelize.DATE,
        allowNull : true,
      },
      created_at: {
        type         : Sequelize.DATE,
        allowNull    : false,
        defaultValue : Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('fee_refunds', ['student_id', 'created_at'], {
      name: 'idx_fee_refunds_student_created',
    });

    await queryInterface.addIndex('fee_refunds', ['payment_id'], {
      name: 'idx_fee_refunds_payment',
    });

    await queryInterface.addIndex('fee_refunds', ['invoice_id', 'status'], {
      name: 'idx_fee_refunds_invoice_status',
    });

    await queryInterface.addIndex('fee_refunds', ['status', 'created_at'], {
      name: 'idx_fee_refunds_status_created',
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE fee_refunds
      ADD CONSTRAINT chk_fee_refunds_amount_positive
      CHECK (amount > 0);
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE fee_refunds
      ADD CONSTRAINT chk_fee_refunds_processed_state
      CHECK (
        (status = 'pending' AND processed_at IS NULL)
        OR
        (status = 'processed' AND processed_at IS NOT NULL AND processed_by IS NOT NULL)
        OR
        (status = 'cancelled')
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('fee_refunds');
  },
};
