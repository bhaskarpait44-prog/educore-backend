'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_subjects_class_code;
      DROP INDEX IF EXISTS idx_subjects_class_name;

      CREATE UNIQUE INDEX idx_subjects_class_code
      ON subjects (class_id, code)
      WHERE is_deleted = false AND code IS NOT NULL;

      CREATE UNIQUE INDEX idx_subjects_class_name
      ON subjects (class_id, name)
      WHERE is_deleted = false;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS idx_subjects_class_code;
      DROP INDEX IF EXISTS idx_subjects_class_name;

      CREATE UNIQUE INDEX idx_subjects_class_code
      ON subjects (class_id, code)
      WHERE code IS NOT NULL;

      CREATE UNIQUE INDEX idx_subjects_class_name
      ON subjects (class_id, name);
    `);
  },
};
