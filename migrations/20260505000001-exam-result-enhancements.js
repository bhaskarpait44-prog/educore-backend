'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // 1. Create grading_scales table
      await queryInterface.createTable('grading_scales', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        school_id: { type: Sequelize.INTEGER, allowNull: false },
        name: { type: Sequelize.STRING(100), allowNull: false },
        is_default: { type: Sequelize.BOOLEAN, defaultValue: false },
        definition: { type: Sequelize.JSONB, allowNull: false }, // Array of { min: 90, grade: 'A+', point: 4.0, remark: 'Excellent' }
        created_by: { type: Sequelize.INTEGER, allowNull: true },
        updated_by: { type: Sequelize.INTEGER, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false }
      }, { transaction });

      // 2. Create mark_histories table
      await queryInterface.createTable('mark_histories', {
        id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
        exam_id: { type: Sequelize.INTEGER, allowNull: false },
        enrollment_id: { type: Sequelize.INTEGER, allowNull: false },
        subject_id: { type: Sequelize.INTEGER, allowNull: false },
        old_marks_obtained: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
        new_marks_obtained: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
        old_theory_marks: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
        new_theory_marks: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
        old_practical_marks: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
        new_practical_marks: { type: Sequelize.DECIMAL(6, 2), allowNull: true },
        old_is_absent: { type: Sequelize.BOOLEAN, allowNull: true },
        new_is_absent: { type: Sequelize.BOOLEAN, allowNull: true },
        changed_by: { type: Sequelize.INTEGER, allowNull: false },
        change_reason: { type: Sequelize.TEXT, allowNull: true },
        change_type: { type: Sequelize.ENUM('entry', 'override', 'grace'), defaultValue: 'entry' },
        created_at: { type: Sequelize.DATE, allowNull: false },
        updated_at: { type: Sequelize.DATE, allowNull: false }
      }, { transaction });

      // 3. Update exams table
      await queryInterface.addColumn('exams', 'weightage', {
        type: Sequelize.DECIMAL(5, 2),
        defaultValue: 100.00,
        allowNull: false
      }, { transaction });

      await queryInterface.addColumn('exams', 'publish_controls', {
        type: Sequelize.JSONB,
        defaultValue: {},
        allowNull: false
      }, { transaction });

      // 4. Update student_results table to support locking
      await queryInterface.addColumn('student_results', 'is_locked', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      }, { transaction });

      await queryInterface.addColumn('student_results', 'locked_at', {
        type: Sequelize.DATE,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('student_results', 'locked_by', {
        type: Sequelize.INTEGER,
        allowNull: true
      }, { transaction });

      await queryInterface.addColumn('student_results', 'grace_marks_info', {
        type: Sequelize.JSONB,
        allowNull: true
      }, { transaction });
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn('student_results', 'grace_marks_info', { transaction });
      await queryInterface.removeColumn('student_results', 'locked_by', { transaction });
      await queryInterface.removeColumn('student_results', 'locked_at', { transaction });
      await queryInterface.removeColumn('student_results', 'is_locked', { transaction });
      await queryInterface.removeColumn('exams', 'publish_controls', { transaction });
      await queryInterface.removeColumn('exams', 'weightage', { transaction });
      await queryInterface.dropTable('mark_histories', { transaction });
      await queryInterface.dropTable('grading_scales', { transaction });
      // Note: We might need to drop the ENUM type for change_type if it was created globally, 
      // but in some DBs it's tied to the table. For PostgreSQL, it's often global.
      // await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_mark_histories_change_type";', { transaction });
    });
  }
};
