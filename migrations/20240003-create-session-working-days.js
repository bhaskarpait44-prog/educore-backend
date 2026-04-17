'use strict';

/**
 * Migration: create_session_working_days
 * One row per session. Defines which days of the week are school days.
 * Used by attendance, timetable, and calendar modules.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('session_working_days', {
      id: {
        type          : Sequelize.INTEGER,
        autoIncrement : true,
        primaryKey    : true,
        allowNull     : false,
      },
      session_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        unique     : true,           // One working-day config per session
        references : { model: 'sessions', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'CASCADE',      // Working days are meaningless without their session
      },
      monday: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : true,
      },
      tuesday: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : true,
      },
      wednesday: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : true,
      },
      thursday: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : true,
      },
      friday: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : true,
      },
      saturday: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : false,
      },
      sunday: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : false,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('session_working_days');
  },
};