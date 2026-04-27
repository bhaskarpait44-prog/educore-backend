'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('exam_results');

    if (!table.theory_marks_obtained) {
      await queryInterface.addColumn('exam_results', 'theory_marks_obtained', {
        type: Sequelize.DECIMAL(6, 2),
        allowNull: true,
        comment: 'Theory component marks when subject_type is theory or both',
      });
    }

    if (!table.practical_marks_obtained) {
      await queryInterface.addColumn('exam_results', 'practical_marks_obtained', {
        type: Sequelize.DECIMAL(6, 2),
        allowNull: true,
        comment: 'Practical component marks when subject_type is practical or both',
      });
    }

    await queryInterface.sequelize.query(`
      ALTER TABLE exam_results
      DROP CONSTRAINT IF EXISTS chk_exam_results_component_marks_non_negative;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE exam_results
      ADD CONSTRAINT chk_exam_results_component_marks_non_negative
      CHECK (
        (theory_marks_obtained IS NULL OR theory_marks_obtained >= 0)
        AND
        (practical_marks_obtained IS NULL OR practical_marks_obtained >= 0)
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE exam_results
      DROP CONSTRAINT IF EXISTS chk_exam_results_component_marks_non_negative;
    `);

    const table = await queryInterface.describeTable('exam_results');

    if (table.practical_marks_obtained) {
      await queryInterface.removeColumn('exam_results', 'practical_marks_obtained');
    }

    if (table.theory_marks_obtained) {
      await queryInterface.removeColumn('exam_results', 'theory_marks_obtained');
    }
  },
};
