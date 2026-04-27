// migrations/YYYYMMDD-create-fee-reminders.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('fee_reminders', {
      id: {
        type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true,
      },
      school_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'schools', key: 'id' },
      },
      student_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'students', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      sent_by: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      reminder_type: {
        type: Sequelize.ENUM('sms', 'whatsapp', 'email', 'letter'),
        allowNull: false,
      },
      message_content: {
        type: Sequelize.TEXT, allowNull: false,
      },
      amount_due: {
        type: Sequelize.DECIMAL(10, 2), allowNull: true,
        comment: 'Amount outstanding at time of reminder',
      },
      status: {
        type: Sequelize.ENUM('pending', 'sent', 'failed'),
        allowNull: false, defaultValue: 'pending',
      },
      error_message: {
        type: Sequelize.TEXT, allowNull: true,
      },
      sent_at: {
        type: Sequelize.DATE, allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE, allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('fee_reminders', ['student_id', 'created_at'], {
      name: 'idx_fee_reminders_student',
    });
    await queryInterface.addIndex('fee_reminders', ['school_id', 'created_at'], {
      name: 'idx_fee_reminders_school',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('fee_reminders');
  },
};