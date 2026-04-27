'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('cheque_payments', {
      id: {
        type          : Sequelize.INTEGER,
        autoIncrement : true,
        primaryKey    : true,
        allowNull     : false,
      },
      payment_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'fee_payments', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
      },
      cheque_number: {
        type      : Sequelize.STRING(100),
        allowNull : false,
      },
      bank_name: {
        type      : Sequelize.STRING(150),
        allowNull : false,
      },
      branch_name: {
        type      : Sequelize.STRING(150),
        allowNull : true,
      },
      cheque_date: {
        type      : Sequelize.DATEONLY,
        allowNull : false,
      },
      received_date: {
        type      : Sequelize.DATEONLY,
        allowNull : false,
      },
      clearance_date: {
        type      : Sequelize.DATEONLY,
        allowNull : true,
      },
      status: {
        type         : Sequelize.ENUM('pending', 'cleared', 'bounced'),
        allowNull    : false,
        defaultValue : 'pending',
      },
      bounce_reason: {
        type      : Sequelize.TEXT,
        allowNull : true,
      },
      bounce_date: {
        type      : Sequelize.DATEONLY,
        allowNull : true,
      },
      bounce_charge: {
        type         : Sequelize.DECIMAL(10, 2),
        allowNull    : false,
        defaultValue : 0.00,
      },
      cleared_by: {
        type       : Sequelize.INTEGER,
        allowNull  : true,
        references : { model: 'users', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'SET NULL',
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

    await queryInterface.addIndex('cheque_payments', ['payment_id'], {
      name   : 'idx_cheque_payments_payment',
      unique : true,
    });

    await queryInterface.addIndex('cheque_payments', ['status', 'received_date'], {
      name: 'idx_cheque_payments_status_received',
    });

    await queryInterface.addIndex('cheque_payments', ['clearance_date', 'status'], {
      name: 'idx_cheque_payments_clearance_status',
    });

    await queryInterface.addIndex('cheque_payments', ['cheque_number', 'bank_name'], {
      name: 'idx_cheque_payments_cheque_bank',
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE cheque_payments
      ADD CONSTRAINT chk_cheque_payments_amounts
      CHECK (bounce_charge >= 0);
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE cheque_payments
      ADD CONSTRAINT chk_cheque_payments_clearance_state
      CHECK (
        (status = 'pending' AND clearance_date IS NULL AND bounce_date IS NULL AND bounce_reason IS NULL)
        OR
        (status = 'cleared' AND clearance_date IS NOT NULL AND bounce_date IS NULL)
        OR
        (status = 'bounced' AND bounce_date IS NOT NULL AND bounce_reason IS NOT NULL)
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('cheque_payments');
  },
};
