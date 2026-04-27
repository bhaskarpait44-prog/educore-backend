'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('teacher_notice_reads', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      notice_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'teacher_notices', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      read_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('teacher_notice_reads', ['notice_id', 'user_id'], {
      name: 'idx_teacher_notice_reads_notice_user',
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('teacher_notice_reads');
  },
};
