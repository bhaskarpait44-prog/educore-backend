'use strict';

/**
 * Migration: create_enrollments
 *
 * Central fact table for WHERE a student is in WHICH class/section
 * during WHICH session. One row per student per session.
 *
 * History is preserved by never deleting rows:
 *   - Active enrollment: left_date IS NULL, status = 'active'
 *   - Closed enrollment: left_date IS SET, status = 'inactive', leaving_type IS SET
 *
 * previous_enrollment_id creates a linked list of a student's full academic history:
 *   Enrollment(Grade1,2022) ← Enrollment(Grade2,2023) ← Enrollment(Grade3,2024)
 *
 * Promotion flow:
 *   1. Close current enrollment (left_date=session_end, leaving_type='promoted')
 *   2. Create next enrollment (joining_type='promoted', previous_enrollment_id=old.id)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('enrollments', {
      id: {
        type          : Sequelize.INTEGER,
        autoIncrement : true,
        primaryKey    : true,
        allowNull     : false,
      },
      student_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'students', key: 'id' },
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
      class_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'classes', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
      },
      section_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'sections', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
      },
      roll_number: {
        type      : Sequelize.STRING(20),
        allowNull : true,
        comment   : 'Class roll number assigned for this session',
      },
      joined_date: {
        type      : Sequelize.DATEONLY,
        allowNull : false,
        comment   : 'Actual date student physically joined this class/section',
      },
      joining_type: {
        type      : Sequelize.ENUM('fresh', 'promoted', 'failed', 'transfer_in', 'rejoined'),
        allowNull : false,
        comment   : [
          'fresh      = first-time admission to school',
          'promoted   = passed from previous class',
          'failed     = repeating same class after failing',
          'transfer_in = joined from another school',
          'rejoined   = re-admitted after leaving',
        ].join(' | '),
      },
      left_date: {
        type      : Sequelize.DATEONLY,
        allowNull : true,
        comment   : 'NULL = still enrolled. Set when enrollment is closed.',
      },
      leaving_type: {
        type      : Sequelize.ENUM('promoted', 'failed', 'transfer_out', 'withdrawn', 'graduated', 'expelled'),
        allowNull : true,
        comment   : 'NULL while still active. Required when left_date is set.',
      },
      previous_enrollment_id: {
        type       : Sequelize.INTEGER,
        allowNull  : true,
        references : { model: 'enrollments', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'SET NULL',
        comment    : 'FK to self — points to last session enrollment. Builds history chain.',
      },
      status: {
        type         : Sequelize.ENUM('active', 'inactive'),
        allowNull    : false,
        defaultValue : 'active',
        comment      : 'Denormalized shortcut: active = left_date IS NULL',
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

    // A student can only have ONE enrollment per session
    await queryInterface.addIndex('enrollments', ['student_id', 'session_id'], {
      name   : 'idx_enrollments_student_session',
      unique : true,
    });

    // Frequent filter: who is in this class/section this session?
    await queryInterface.addIndex('enrollments', ['session_id', 'class_id', 'section_id', 'status'], {
      name: 'idx_enrollments_session_class_section',
    });

    // Roll number unique within session + section
    await queryInterface.addIndex('enrollments', ['session_id', 'section_id', 'roll_number'], {
      name   : 'idx_enrollments_roll_number',
      unique : true,
    });

    // Fast history traversal via previous_enrollment_id chain
    await queryInterface.addIndex('enrollments', ['previous_enrollment_id'], {
      name: 'idx_enrollments_previous',
    });

    // ── DB constraint: left_date requires leaving_type and vice versa ─────
    await queryInterface.sequelize.query(`
      ALTER TABLE enrollments
      ADD CONSTRAINT chk_enrollment_leaving_consistency
      CHECK (
        (left_date IS NULL AND leaving_type IS NULL)
        OR
        (left_date IS NOT NULL AND leaving_type IS NOT NULL)
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('enrollments');
  },
};