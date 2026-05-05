'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TYPE enum_teacher_notices_target_scope ADD VALUE IF NOT EXISTS 'specific_subject';
      ALTER TYPE enum_teacher_notices_target_scope ADD VALUE IF NOT EXISTS 'whole_class';
    `);

    await queryInterface.addColumn('teacher_notices', 'subject_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'subjects', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });

    await queryInterface.addIndex('teacher_notices', ['subject_id', 'is_active'], {
      name: 'idx_teacher_notices_subject',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('teacher_notices', 'idx_teacher_notices_subject');
    await queryInterface.removeColumn('teacher_notices', 'subject_id');
    // Note: ENUM values cannot be easily removed in Postgres without recreating the type
  },
};
