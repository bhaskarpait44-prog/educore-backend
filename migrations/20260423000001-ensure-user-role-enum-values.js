'use strict';

const ROLE_VALUES = [
  'super_admin',
  'admin',
  'teacher',
  'accountant',
  'staff',
  'student',
  'parent',
  'librarian',
  'receptionist',
];

module.exports = {
  async up(queryInterface) {
    for (const role of ROLE_VALUES) {
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS '${role}';
        EXCEPTION WHEN duplicate_object THEN NULL;
        WHEN undefined_object THEN NULL;
        END $$;
      `);
    }
  },

  async down() {
    // Postgres enum values are intentionally left in place.
  },
};
