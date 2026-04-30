'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE classes
      SET stream = 'regular'
      WHERE stream IS NULL;

      ALTER TABLE classes
      DROP CONSTRAINT IF EXISTS chk_classes_stream;

      ALTER TABLE classes
      ADD CONSTRAINT chk_classes_stream
      CHECK (
        stream IS NULL
        OR stream IN ('regular', 'arts', 'commerce', 'science')
      );

      ALTER TABLE enrollments
      DROP CONSTRAINT IF EXISTS chk_enrollments_stream;

      ALTER TABLE enrollments
      ADD CONSTRAINT chk_enrollments_stream
      CHECK (
        stream IS NULL
        OR stream IN ('regular', 'arts', 'commerce', 'science')
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE classes
      SET stream = NULL
      WHERE stream = 'regular';

      UPDATE enrollments
      SET stream = NULL
      WHERE stream = 'regular';

      ALTER TABLE classes
      DROP CONSTRAINT IF EXISTS chk_classes_stream;

      ALTER TABLE classes
      ADD CONSTRAINT chk_classes_stream
      CHECK (
        stream IS NULL
        OR stream IN ('arts', 'commerce', 'science')
      );

      ALTER TABLE enrollments
      DROP CONSTRAINT IF EXISTS chk_enrollments_stream;

      ALTER TABLE enrollments
      ADD CONSTRAINT chk_enrollments_stream
      CHECK (
        stream IS NULL
        OR stream IN ('arts', 'commerce', 'science')
      );
    `);
  },
};
