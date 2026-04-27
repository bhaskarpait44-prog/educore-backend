// migrations/20240022-add-class-display-name.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add display_name column if it doesn't exist
    const columns = await queryInterface.describeTable('classes');
    if (!columns.display_name) {
      await queryInterface.addColumn('classes', 'display_name', {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'e.g. Class 6, Standard 6 — shown on reports',
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('classes', 'display_name');
  },
};
