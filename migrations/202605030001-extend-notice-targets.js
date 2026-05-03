'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TYPE enum_teacher_notices_target_scope ADD VALUE IF NOT EXISTS 'all_students';
      ALTER TYPE enum_teacher_notices_target_scope ADD VALUE IF NOT EXISTS 'specific_student';
      ALTER TYPE enum_teacher_notices_target_scope ADD VALUE IF NOT EXISTS 'specific_teacher';
    `);

    await queryInterface.addColumn('teacher_notices', 'target_student_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'students', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });

    await queryInterface.addColumn('teacher_notices', 'target_teacher_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });

    await queryInterface.addIndex('teacher_notices', ['target_student_id', 'is_active'], {
      name: 'idx_teacher_notices_target_student',
    });

    await queryInterface.addIndex('teacher_notices', ['target_teacher_id', 'is_active'], {
      name: 'idx_teacher_notices_target_teacher',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('teacher_notices', 'idx_teacher_notices_target_teacher');
    await queryInterface.removeIndex('teacher_notices', 'idx_teacher_notices_target_student');
    await queryInterface.removeColumn('teacher_notices', 'target_teacher_id');
    await queryInterface.removeColumn('teacher_notices', 'target_student_id');
  },
};
