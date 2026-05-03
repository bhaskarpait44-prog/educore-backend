'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TYPE enum_teacher_notices_category ADD VALUE IF NOT EXISTS 'fee';
    `);
  },

  async down() {},
};
