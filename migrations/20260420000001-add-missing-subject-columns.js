// migrations/20260420000001-add-missing-subject-columns.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const subjectCols = await queryInterface.describeTable('subjects');

    // Add subject_type ENUM if missing
    if (!subjectCols.subject_type) {
      // Create ENUM type for PostgreSQL
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE subject_type_enum AS ENUM ('theory', 'practical', 'both');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `);

      await queryInterface.addColumn('subjects', 'subject_type', {
        type: Sequelize.ENUM('theory', 'practical', 'both'),
        allowNull: false,
        defaultValue: 'theory',
      });
    }

    // Add theory marks columns
    if (!subjectCols.theory_total_marks) {
      await queryInterface.addColumn('subjects', 'theory_total_marks', {
        type: Sequelize.DECIMAL(6, 2),
        allowNull: true,
      });
    }

    if (!subjectCols.theory_passing_marks) {
      await queryInterface.addColumn('subjects', 'theory_passing_marks', {
        type: Sequelize.DECIMAL(6, 2),
        allowNull: true,
      });
    }

    // Add practical marks columns
    if (!subjectCols.practical_total_marks) {
      await queryInterface.addColumn('subjects', 'practical_total_marks', {
        type: Sequelize.DECIMAL(6, 2),
        allowNull: true,
      });
    }

    if (!subjectCols.practical_passing_marks) {
      await queryInterface.addColumn('subjects', 'practical_passing_marks', {
        type: Sequelize.DECIMAL(6, 2),
        allowNull: true,
      });
    }

    // Add combined marks columns
    if (!subjectCols.combined_total_marks) {
      await queryInterface.addColumn('subjects', 'combined_total_marks', {
        type: Sequelize.DECIMAL(6, 2),
        allowNull: false,
        defaultValue: 100,
      });
    }

    if (!subjectCols.combined_passing_marks) {
      await queryInterface.addColumn('subjects', 'combined_passing_marks', {
        type: Sequelize.DECIMAL(6, 2),
        allowNull: false,
        defaultValue: 35,
      });
    }

    // Migrate old data: if total_marks exists, convert to combined_total_marks
    if (subjectCols.total_marks && subjectCols.passing_marks) {
      await queryInterface.sequelize.query(`
        UPDATE subjects
        SET
          subject_type = 'theory',
          theory_total_marks = total_marks,
          theory_passing_marks = passing_marks,
          combined_total_marks = total_marks,
          combined_passing_marks = passing_marks
        WHERE subject_type IS NULL OR combined_total_marks IS NULL;
      `);
    }

    // Add description if missing
    if (!subjectCols.description) {
      await queryInterface.addColumn('subjects', 'description', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const subjectCols = await queryInterface.describeTable('subjects');

    const columnsToRemove = [
      'subject_type',
      'theory_total_marks',
      'theory_passing_marks',
      'practical_total_marks',
      'practical_passing_marks',
      'combined_total_marks',
      'combined_passing_marks',
      'description',
    ];

    for (const col of columnsToRemove) {
      if (subjectCols[col]) {
        await queryInterface.removeColumn('subjects', col).catch(() => {});
      }
    }
  },
};
