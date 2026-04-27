'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('students');

    if (!table.password_hash) {
      await queryInterface.addColumn('students', 'password_hash', {
        type: Sequelize.STRING(255),
        allowNull: true,
      });
    }

    if (!table.is_active) {
      await queryInterface.addColumn('students', 'is_active', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }

    if (!table.last_login_at) {
      await queryInterface.addColumn('students', 'last_login_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    if (!table.last_password_change) {
      await queryInterface.addColumn('students', 'last_password_change', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    await queryInterface.addIndex('students', ['school_id', 'is_active', 'is_deleted'], {
      name: 'idx_students_school_active_deleted',
    }).catch(() => {});
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('students', 'idx_students_school_active_deleted').catch(() => {});
    await queryInterface.removeColumn('students', 'last_password_change').catch(() => {});
    await queryInterface.removeColumn('students', 'last_login_at').catch(() => {});
    await queryInterface.removeColumn('students', 'is_active').catch(() => {});
    await queryInterface.removeColumn('students', 'password_hash').catch(() => {});
  },
};
