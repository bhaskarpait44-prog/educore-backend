// migrations/YYYYMMDD-update-users-add-columns.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = [
      { name: 'phone',          def: { type: Sequelize.STRING(20), allowNull: true, after: 'email' } },
      { name: 'profile_photo',  def: { type: Sequelize.STRING(500), allowNull: true } },
      { name: 'date_of_birth',  def: { type: Sequelize.DATEONLY, allowNull: true } },
      { name: 'gender',         def: { type: Sequelize.ENUM('male', 'female', 'other'), allowNull: true } },
      { name: 'address',        def: { type: Sequelize.TEXT, allowNull: true } },
      { name: 'employee_id',    def: { type: Sequelize.STRING(50), allowNull: true } },
      { name: 'department',     def: { type: Sequelize.STRING(100), allowNull: true } },
      { name: 'designation',    def: { type: Sequelize.STRING(100), allowNull: true } },
      { name: 'joining_date',   def: { type: Sequelize.DATEONLY, allowNull: true } },
      { name: 'force_password_change', def: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true } },
      { name: 'last_password_change',  def: { type: Sequelize.DATE, allowNull: true } },
      { name: 'internal_notes', def: { type: Sequelize.TEXT, allowNull: true } },
      { name: 'is_deleted',     def: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false } },
      { name: 'deleted_by',     def: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } } },
      { name: 'deleted_at',     def: { type: Sequelize.DATE, allowNull: true } },
      { name: 'created_by',     def: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' } } },
    ];

    for (const col of columns) {
      try {
        await queryInterface.addColumn('users', col.name, col.def);
      } catch (err) {
        if (!err.message.includes('already exists')) throw err;
      }
    }

    // Update role enum to include all roles
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'super_admin';
        ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'accountant';
        ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'student';
        ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'parent';
        ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'librarian';
        ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'receptionist';
      EXCEPTION WHEN others THEN NULL;
      END $$;
    `);

    try {
      await queryInterface.addIndex('users', ['school_id', 'is_deleted', 'is_active'], {
        name: 'idx_users_school_active',
      });
    } catch (err) {
      if (!err.message.includes('already exists')) throw err;
    }
    try {
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX idx_users_email ON users (email) WHERE is_deleted = false;
      `);
    } catch (err) {
      if (!err.message.includes('already exists')) throw err;
    }
  },

  async down(queryInterface) {
    const cols = [
      'phone','profile_photo','date_of_birth','gender','address',
      'employee_id','department','designation','joining_date',
      'force_password_change','last_password_change','internal_notes',
      'is_deleted','deleted_by','deleted_at','created_by',
    ];
    for (const col of cols) {
      await queryInterface.removeColumn('users', col).catch(() => {});
    }
  },
};