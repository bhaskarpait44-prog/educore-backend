'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('enrollments', 'stream', {
      type      : Sequelize.STRING(20),
      allowNull : true,
      comment   : 'Optional academic stream such as arts, commerce, or science.',
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE enrollments
      ADD CONSTRAINT chk_enrollments_stream
      CHECK (
        stream IS NULL
        OR stream IN ('arts', 'commerce', 'science')
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE enrollments
      DROP CONSTRAINT IF EXISTS chk_enrollments_stream;
    `);

    await queryInterface.removeColumn('enrollments', 'stream');
  },
};
