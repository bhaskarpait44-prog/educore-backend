// migrations/20240025-add-all-missing-columns.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // ── CLASSES TABLE ─────────────────────────────────────────────────────────
    const classCols = await queryInterface.describeTable('classes');

    if (!classCols.display_name) {
      await queryInterface.addColumn('classes', 'display_name', {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'e.g. Class 6, Standard 6 — shown on reports',
      });
    }

    if (!classCols.description) {
      await queryInterface.addColumn('classes', 'description', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    if (!classCols.min_age) {
      await queryInterface.addColumn('classes', 'min_age', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Minimum recommended age in years',
      });
    }

    if (!classCols.max_age) {
      await queryInterface.addColumn('classes', 'max_age', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Maximum recommended age in years',
      });
    }

    if (!classCols.is_deleted) {
      await queryInterface.addColumn('classes', 'is_deleted', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    if (!classCols.is_active) {
      await queryInterface.addColumn('classes', 'is_active', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }

    // ── SECTIONS TABLE ────────────────────────────────────────────────────────
    const sectionCols = await queryInterface.describeTable('sections');

    if (!sectionCols.is_deleted) {
      await queryInterface.addColumn('sections', 'is_deleted', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    if (!sectionCols.is_active) {
      await queryInterface.addColumn('sections', 'is_active', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }

    // ── SUBJECTS TABLE ────────────────────────────────────────────────────────
    const subjectCols = await queryInterface.describeTable('subjects');

    if (!subjectCols.is_deleted) {
      await queryInterface.addColumn('subjects', 'is_deleted', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    if (!subjectCols.is_active) {
      await queryInterface.addColumn('subjects', 'is_active', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      });
    }
  },

  async down(queryInterface) {
    // Remove columns
    const tables = ['classes', 'sections', 'subjects'];
    const columns = ['is_deleted', 'is_active', 'display_name', 'description', 'min_age', 'max_age'];

    for (const table of tables) {
      for (const col of columns) {
        await queryInterface.removeColumn(table, col).catch(() => {});
      }
    }
  },
};
