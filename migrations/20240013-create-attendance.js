'use strict';

/**
 * Migration: create_attendance
 *
 * One row per student per school day.
 * The UNIQUE constraint on (enrollment_id, date) is the core invariant —
 * you cannot have two attendance records for the same student on the same day.
 *
 * holiday status is used when a day is retroactively declared a holiday.
 * auto method is used when the system marks absent for unmarked students at EOD.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('attendance', {
      id: {
        type          : Sequelize.INTEGER,
        autoIncrement : true,
        primaryKey    : true,
        allowNull     : false,
      },
      enrollment_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'enrollments', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
        comment    : 'FK to enrollments — ties attendance to a specific session + class',
      },
      date: {
        type      : Sequelize.DATEONLY,
        allowNull : false,
        comment   : 'The school day this record covers',
      },
      status: {
        type      : Sequelize.ENUM('present', 'absent', 'late', 'half_day', 'holiday'),
        allowNull : false,
        comment   : [
          'present  = full day present',
          'absent   = did not attend',
          'late     = arrived after roll call, counts as present for %',
          'half_day = attended half the day, counts as 0.5 for %',
          'holiday  = holiday (declared before or retroactively)',
        ].join(' | '),
      },
      method: {
        type      : Sequelize.ENUM('biometric', 'manual', 'auto'),
        allowNull : false,
        comment   : [
          'biometric = marked via fingerprint/face scan',
          'manual    = marked by teacher in UI',
          'auto      = system marked absent at end-of-day for unmarked students',
        ].join(' | '),
      },
      marked_by: {
        type      : Sequelize.INTEGER,
        allowNull : true,
        comment   : 'FK to users.id — NULL when method=auto or method=biometric (self)',
      },
      marked_at: {
        type      : Sequelize.DATE,
        allowNull : false,
        comment   : 'Exact timestamp when record was created or last updated',
      },
      override_reason: {
        type      : Sequelize.STRING(500),
        allowNull : true,
        comment   : 'Required when an admin changes a status after it was originally marked',
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

    // Core invariant: one record per student per day
    await queryInterface.addIndex('attendance', ['enrollment_id', 'date'], {
      name   : 'idx_attendance_enrollment_date',
      unique : true,
    });

    // Query pattern: "show me all attendance for a date" (taking roll call)
    await queryInterface.addIndex('attendance', ['date', 'enrollment_id'], {
      name: 'idx_attendance_date_enrollment',
    });

    // Query pattern: "show me all absences in a date range" (reports)
    await queryInterface.addIndex('attendance', ['enrollment_id', 'status'], {
      name: 'idx_attendance_enrollment_status',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('attendance');
  },
};