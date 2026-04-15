'use strict';

/**
 * Migration: create_exam_results
 *
 * One row per student per subject per exam.
 * grade and is_pass are stored (not computed at query time) because:
 *   1. Grade boundaries can change — we store what was calculated AT THAT TIME
 *   2. Audit trail needs before/after values
 *   3. Faster report generation — no recalculation needed
 *
 * override_by/override_reason track admin corrections after results are entered.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('exam_results', {
      id: {
        type          : Sequelize.INTEGER,
        autoIncrement : true,
        primaryKey    : true,
        allowNull     : false,
      },
      exam_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'exams', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
      },
      enrollment_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'enrollments', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
      },
      subject_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'subjects', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
      },
      marks_obtained: {
        type      : Sequelize.DECIMAL(6, 2),
        allowNull : true,
        comment   : 'NULL when is_absent=true',
      },
      is_absent: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : false,
        comment      : 'Absent students get 0 effective marks and is_pass=false',
      },
      grade: {
        type      : Sequelize.STRING(5),
        allowNull : true,
        comment   : 'Stored letter grade at time of calculation (A+, A, B, C, D, F)',
      },
      is_pass: {
        type      : Sequelize.BOOLEAN,
        allowNull : true,
        comment   : 'Stored pass/fail at time of calculation',
      },
      entered_by: {
        type      : Sequelize.INTEGER,
        allowNull : true,
        comment   : 'FK to users.id — teacher/admin who entered marks',
      },
      override_by: {
        type      : Sequelize.INTEGER,
        allowNull : true,
        comment   : 'FK to users.id — admin who last overrode this result',
      },
      override_reason: {
        type      : Sequelize.TEXT,
        allowNull : true,
        comment   : 'Required when override_by is set',
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

    // One result per student per subject per exam
    await queryInterface.addIndex('exam_results', ['exam_id', 'enrollment_id', 'subject_id'], {
      name   : 'idx_exam_results_exam_enrollment_subject',
      unique : true,
    });

    // Fast lookup: all results for one student's exam
    await queryInterface.addIndex('exam_results', ['enrollment_id', 'exam_id'], {
      name: 'idx_exam_results_enrollment_exam',
    });

    // marks_obtained must be NULL if absent, or non-negative if present
    await queryInterface.sequelize.query(`
      ALTER TABLE exam_results
      ADD CONSTRAINT chk_marks_absent_consistency
      CHECK (
        (is_absent = true  AND marks_obtained IS NULL)
        OR
        (is_absent = false AND marks_obtained >= 0)
      );
    `);

    // override_reason required when override_by is set
    await queryInterface.sequelize.query(`
      ALTER TABLE exam_results
      ADD CONSTRAINT chk_override_reason_required
      CHECK (
        override_by IS NULL
        OR (override_by IS NOT NULL AND override_reason IS NOT NULL)
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('exam_results');
  },
};