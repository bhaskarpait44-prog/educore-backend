'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_classes_school_name;
      DROP INDEX IF EXISTS idx_classes_school_order;

      CREATE UNIQUE INDEX idx_classes_school_name
      ON classes (school_id, name)
      WHERE is_deleted = false;

      CREATE UNIQUE INDEX idx_classes_school_order
      ON classes (school_id, order_number)
      WHERE is_deleted = false;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_classes_school_name;
      DROP INDEX IF EXISTS idx_classes_school_order;

      CREATE UNIQUE INDEX idx_classes_school_name
      ON classes (school_id, name);

      CREATE UNIQUE INDEX idx_classes_school_order
      ON classes (school_id, order_number);
    `);
  },
};
