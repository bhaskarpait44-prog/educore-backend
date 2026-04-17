'use strict';

/**
 * Migration: create_session_holidays
 * Individual holiday dates within a session.
 * Used by attendance (skip marking) and calendar display.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('session_holidays', {
      id: {
        type          : Sequelize.INTEGER,
        autoIncrement : true,
        primaryKey    : true,
        allowNull     : false,
      },
      session_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'sessions', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'CASCADE',
      },
      holiday_date: {
        type      : Sequelize.DATEONLY,
        allowNull : false,
      },
      name: {
        type      : Sequelize.STRING(150),
        allowNull : false,
        comment   : 'e.g. "Republic Day", "Diwali", "School Annual Day"',
      },
      type: {
        type      : Sequelize.ENUM('national', 'regional', 'school'),
        allowNull : false,
        comment   : 'national=gazetted, regional=state-level, school=institution-specific',
      },
      added_by: {
        type      : Sequelize.INTEGER,
        allowNull : true,
        comment   : 'FK to users.id — linked in Step 4',
      },
      created_at: {
        type         : Sequelize.DATE,
        allowNull    : false,
        defaultValue : Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Prevent duplicate holiday entries for the same date in the same session
    await queryInterface.addIndex('sessions', ['school_id'], {
      name: 'idx_sessions_school_id',
    });

    await queryInterface.addIndex('session_holidays', ['session_id', 'holiday_date'], {
      name   : 'idx_holidays_session_date',
      unique : true,   // Can't add the same date twice to a session
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('session_holidays');
  },
};