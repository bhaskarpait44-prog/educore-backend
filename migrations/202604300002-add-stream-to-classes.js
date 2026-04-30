'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('classes');

    if (!columns.stream) {
      await queryInterface.addColumn('classes', 'stream', {
        type      : Sequelize.STRING(20),
        allowNull : true,
        comment   : 'Optional stream for senior classes: arts, commerce, or science.',
      });
    }

    await queryInterface.sequelize.query(`
      ALTER TABLE classes
      DROP CONSTRAINT IF EXISTS chk_classes_stream;

      ALTER TABLE classes
      ADD CONSTRAINT chk_classes_stream
      CHECK (
        stream IS NULL
        OR stream IN ('arts', 'commerce', 'science')
      );

      DROP INDEX IF EXISTS idx_classes_school_name;
      DROP INDEX IF EXISTS idx_classes_school_order;
      DROP INDEX IF EXISTS idx_classes_school_name_no_stream;
      DROP INDEX IF EXISTS idx_classes_school_name_stream;
      DROP INDEX IF EXISTS idx_classes_school_order_no_stream;
      DROP INDEX IF EXISTS idx_classes_school_order_stream;

      CREATE UNIQUE INDEX idx_classes_school_name_no_stream
      ON classes (school_id, name)
      WHERE is_deleted = false AND stream IS NULL;

      CREATE UNIQUE INDEX idx_classes_school_name_stream
      ON classes (school_id, name, stream)
      WHERE is_deleted = false AND stream IS NOT NULL;

      CREATE UNIQUE INDEX idx_classes_school_order_no_stream
      ON classes (school_id, order_number)
      WHERE is_deleted = false AND stream IS NULL;

      CREATE UNIQUE INDEX idx_classes_school_order_stream
      ON classes (school_id, order_number, stream)
      WHERE is_deleted = false AND stream IS NOT NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE classes
      DROP CONSTRAINT IF EXISTS chk_classes_stream;

      DROP INDEX IF EXISTS idx_classes_school_name_no_stream;
      DROP INDEX IF EXISTS idx_classes_school_name_stream;
      DROP INDEX IF EXISTS idx_classes_school_order_no_stream;
      DROP INDEX IF EXISTS idx_classes_school_order_stream;

      CREATE UNIQUE INDEX idx_classes_school_name
      ON classes (school_id, name)
      WHERE is_deleted = false;

      CREATE UNIQUE INDEX idx_classes_school_order
      ON classes (school_id, order_number)
      WHERE is_deleted = false;
    `);

    await queryInterface.removeColumn('classes', 'stream').catch(() => {});
  },
};
