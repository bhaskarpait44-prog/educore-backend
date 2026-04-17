'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.INTEGER, autoIncrement: true,
        primaryKey: true, allowNull: false,
      },
      school_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'schools', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      name:         { type: Sequelize.STRING(150), allowNull: false },
      email:        { type: Sequelize.STRING(150), allowNull: false },
      password_hash:{ type: Sequelize.STRING(255), allowNull: false },
      role: {
        type: Sequelize.ENUM('admin', 'teacher', 'accountant', 'staff'),
        allowNull: false,
      },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      last_login_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });

    await queryInterface.addIndex('users', ['email'],            { name: 'idx_users_email', unique: true });
    await queryInterface.addIndex('users', ['school_id', 'role'],{ name: 'idx_users_school_role' });
  },

  async down(queryInterface) { await queryInterface.dropTable('users'); },
};