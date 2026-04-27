'use strict';

module.exports = {
  async up(queryInterface) {
    const subjectCols = await queryInterface.describeTable('subjects');

    if (subjectCols.total_marks) {
      await queryInterface.changeColumn('subjects', 'total_marks', {
        type: subjectCols.total_marks.type,
        allowNull: true,
      });
    }

    if (subjectCols.passing_marks) {
      await queryInterface.changeColumn('subjects', 'passing_marks', {
        type: subjectCols.passing_marks.type,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const subjectCols = await queryInterface.describeTable('subjects');

    await queryInterface.sequelize.query(`
      UPDATE subjects
      SET
        total_marks = COALESCE(total_marks, combined_total_marks, theory_total_marks, practical_total_marks, 100),
        passing_marks = COALESCE(passing_marks, combined_passing_marks, theory_passing_marks, practical_passing_marks, 35);
    `);

    if (subjectCols.total_marks) {
      await queryInterface.changeColumn('subjects', 'total_marks', {
        type: subjectCols.total_marks.type,
        allowNull: false,
      });
    }

    if (subjectCols.passing_marks) {
      await queryInterface.changeColumn('subjects', 'passing_marks', {
        type: subjectCols.passing_marks.type,
        allowNull: false,
      });
    }
  },
};
