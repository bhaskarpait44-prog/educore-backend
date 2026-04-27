'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('fee_carry_forwards', {
      id: {
        type          : Sequelize.INTEGER,
        autoIncrement : true,
        primaryKey    : true,
        allowNull     : false,
      },
      old_session_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'sessions', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
      },
      new_session_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'sessions', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
      },
      student_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'students', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
      },
      old_invoice_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'fee_invoices', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
      },
      new_invoice_id: {
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
      carried_by: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'users', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
      },
      carried_at: {
        type         : Sequelize.DATE,
        allowNull    : false,
        defaultValue : Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      notes: {
        type      : Sequelize.TEXT,
        allowNull : true,
      },
    });

    await queryInterface.addIndex('fee_carry_forwards', ['student_id', 'old_session_id', 'new_session_id'], {
      name: 'idx_fee_carry_forwards_student_sessions',
    });

    await queryInterface.addIndex('fee_carry_forwards', ['old_invoice_id'], {
      name   : 'idx_fee_carry_forwards_old_invoice',
      unique : true,
    });

    await queryInterface.addIndex('fee_carry_forwards', ['new_invoice_id'], {
      name   : 'idx_fee_carry_forwards_new_invoice',
      unique : true,
    });

    await queryInterface.addIndex('fee_carry_forwards', ['new_session_id', 'carried_at'], {
      name: 'idx_fee_carry_forwards_new_session_carried_at',
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE fee_carry_forwards
      ADD CONSTRAINT chk_fee_carry_forwards_amount_positive
      CHECK (amount > 0);
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE fee_carry_forwards
      ADD CONSTRAINT chk_fee_carry_forwards_sessions_differ
      CHECK (old_session_id <> new_session_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('fee_carry_forwards');
  },
};
