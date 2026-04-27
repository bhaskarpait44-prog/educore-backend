// migrations/20240023-add-all-missing-class-columns.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('classes');

    // Add display_name if missing
    if (!columns.display_name) {
      await queryInterface.addColumn('classes', 'display_name', {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'e.g. Class 6, Standard 6 — shown on reports',
      });
    }

    // Add description if missing
    if (!columns.description) {
      await queryInterface.addColumn('classes', 'description', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    // Add min_age if missing
    if (!columns.min_age) {
      await queryInterface.addColumn('classes', 'min_age', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Minimum recommended age in years',
      });
    }

    // Add max_age if missing
    if (!columns.max_age) {
      await queryInterface.addColumn('classes', 'max_age', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Maximum recommended age in years',
      });
    }
  },

  async down(queryInterface) {
    // Remove all optional columns
    await queryInterface.removeColumn('classes', 'display_name').catch(() => {});
    await queryInterface.removeColumn('classes', 'description').catch(() => {});
    await queryInterface.removeColumn('classes', 'min_age').catch(() => {});
    await queryInterface.removeColumn('classes', 'max_age').catch(() => {});
  },
};
