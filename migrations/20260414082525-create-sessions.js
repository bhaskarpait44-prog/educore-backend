'use strict';

/**
 * Migration: create_sessions
 * Academic year containers. All timetables, attendance, exams, fees
 * will reference a session_id. Only one session can be "current"
 * per school at any time — enforced via partial unique index.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sessions', {
      id: {
        type          : Sequelize.INTEGER,
        autoIncrement : true,
        primaryKey    : true,
        allowNull     : false,
      },
      school_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'schools', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',  // Never silently delete a school with sessions
        comment    : 'Tenant key — every session belongs to one school',
      },
      name: {
        type      : Sequelize.STRING(20),
        allowNull : false,
        comment   : 'Human label, e.g. "2024-2025"',
      },
      start_date: {
        type      : Sequelize.DATEONLY,
        allowNull : false,
      },
      end_date: {
        type      : Sequelize.DATEONLY,
        allowNull : false,
      },
      status: {
        type         : Sequelize.ENUM('upcoming', 'active', 'locked', 'closed', 'archived'),
        allowNull    : false,
        defaultValue : 'upcoming',
        comment      : 'upcoming→active→locked→closed→archived lifecycle',
      },
      is_current: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : false,
        comment      : 'Only one session per school can be true — enforced by partial index',
      },
      created_by: {
        type      : Sequelize.INTEGER,
        allowNull : true,
        comment   : 'FK to users.id — added in Step 4 when users table exists',
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

    // Composite index — most queries filter by school + status
    await queryInterface.addIndex('sessions', ['school_id', 'status'], {
      name: 'idx_sessions_school_status',
    });

    // Partial unique index — only ONE is_current=true allowed per school
    // Standard Sequelize addIndex doesn't support WHERE, so use raw SQL
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX idx_sessions_one_current_per_school
      ON sessions (school_id)
      WHERE is_current = true;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS idx_sessions_one_current_per_school;`
    );
    await queryInterface.dropTable('sessions');
  },
};