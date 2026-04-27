// migrations/20240024-add-is-deleted-to-sections-subjects.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const sectionCols = await queryInterface.describeTable('sections');
    if (!sectionCols.is_deleted) {
      await queryInterface.addColumn('sections', 'is_deleted', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    const subjectCols = await queryInterface.describeTable('subjects');
    if (!subjectCols.is_deleted) {
      await queryInterface.addColumn('subjects', 'is_deleted', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('sections', 'is_deleted').catch(() => {});
    await queryInterface.removeColumn('subjects', 'is_deleted').catch(() => {});
  },
};
