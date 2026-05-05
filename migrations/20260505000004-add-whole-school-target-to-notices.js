'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add 'whole_school' to target_scope enum
    await queryInterface.sequelize.query(`
      ALTER TYPE enum_teacher_notices_target_scope ADD VALUE IF NOT EXISTS 'whole_school';
    `);
  },

  async down(queryInterface) {
    // Enum values cannot be easily removed in PostgreSQL without recreating the type.
    // Usually we leave it as is for safety.
  },
};
