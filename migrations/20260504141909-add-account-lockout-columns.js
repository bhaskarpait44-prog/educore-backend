'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = ['users', 'students'];

    for (const table of tables) {
      const tableInfo = await queryInterface.describeTable(table);

      if (!tableInfo.failed_login_attempts) {
        await queryInterface.addColumn(table, 'failed_login_attempts', {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        });
      }

      if (!tableInfo.locked_until) {
        await queryInterface.addColumn(table, 'locked_until', {
          type: Sequelize.DATE,
          allowNull: true,
        });
      }

      // Also adding columns for forgot password while we are at it
      if (!tableInfo.reset_password_token) {
        await queryInterface.addColumn(table, 'reset_password_token', {
          type: Sequelize.STRING(255),
          allowNull: true,
        });
      }

      if (!tableInfo.reset_password_expires) {
        await queryInterface.addColumn(table, 'reset_password_expires', {
          type: Sequelize.DATE,
          allowNull: true,
        });
      }
    }
  },

  async down(queryInterface) {
    const tables = ['users', 'students'];
    const columns = ['failed_login_attempts', 'locked_until', 'reset_password_token', 'reset_password_expires'];

    for (const table of tables) {
      for (const column of columns) {
        await queryInterface.removeColumn(table, column).catch(() => {});
      }
    }
  },
};
