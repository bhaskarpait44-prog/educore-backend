'use strict';

/**
 * Migration: create_student_results
 *
 * Aggregate result per student per session.
 * One row per enrollment — computed from all exam_results.
 * This is the "final report card" row.
 *
 * compartment_subjects stores JSON array of subject ids that need re-exam.
 * promotion happens here — is_promoted=true means eligible for next class.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('student_results', {
      id: {
        type          : Sequelize.INTEGER,
        autoIncrement : true,
        primaryKey    : true,
        allowNull     : false,
      },
      enrollment_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        unique     : true,              // One final result per enrollment
        references : { model: 'enrollments', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
      },
      session_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'sessions', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
      },
      total_marks: {
        type      : Sequelize.DECIMAL(8, 2),
        allowNull : false,
        comment   : 'Sum of all subject total_marks across all exams',
      },
      marks_obtained: {
        type      : Sequelize.DECIMAL(8, 2),
        allowNull : false,
        comment   : 'Sum of all marks_obtained across all exams',
      },
      percentage: {
        type      : Sequelize.DECIMAL(5, 2),
        allowNull : false,
        comment   : '(marks_obtained / total_marks) × 100',
      },
      grade: {
        type      : Sequelize.STRING(5),
        allowNull : false,
        comment   : 'Overall letter grade for the session',
      },
      result: {
        type      : Sequelize.ENUM('pass', 'fail', 'compartment', 'detained'),
        allowNull : false,
        comment   : [
          'pass        = all core subjects passed, attendance >= 75%',
          'fail        = more than 2 core subjects failed OR attendance < 75%',
          'compartment = 1-2 core subjects failed, eligible for re-exam',
          'detained    = admin override — student held back regardless of marks',
        ].join(' | '),
      },
      compartment_subjects: {
        type         : Sequelize.JSON,
        allowNull    : true,
        defaultValue : null,
        comment      : 'Array of subject_ids where student needs compartment exam. NULL if not compartment.',
      },
      is_promoted: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : false,
        comment      : 'True = eligible for next class enrollment in next session',
      },
      promotion_override_by: {
        type      : Sequelize.INTEGER,
        allowNull : true,
        comment   : 'FK to users.id — admin who manually changed promotion decision',
      },
      promotion_override_reason: {
        type      : Sequelize.TEXT,
        allowNull : true,
        comment   : 'Required when promotion_override_by is set',
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

    await queryInterface.addIndex('student_results', ['session_id', 'result'], {
      name: 'idx_student_results_session_result',
    });

    await queryInterface.addIndex('student_results', ['session_id', 'is_promoted'], {
      name: 'idx_student_results_session_promoted',
    });

    // promotion override consistency
    await queryInterface.sequelize.query(`
      ALTER TABLE student_results
      ADD CONSTRAINT chk_promotion_override_reason
      CHECK (
        promotion_override_by IS NULL
        OR (promotion_override_by IS NOT NULL AND promotion_override_reason IS NOT NULL)
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('student_results');
  },
};