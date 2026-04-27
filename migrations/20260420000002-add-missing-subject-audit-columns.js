'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const subjectCols = await queryInterface.describeTable('subjects');

    if (!subjectCols.created_by) {
      await queryInterface.addColumn('subjects', 'created_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }

    if (!subjectCols.updated_by) {
      await queryInterface.addColumn('subjects', 'updated_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }

    if (!subjectCols.created_at) {
      await queryInterface.addColumn('subjects', 'created_at', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      });
    }

    if (!subjectCols.updated_at) {
      await queryInterface.addColumn('subjects', 'updated_at', {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      });
    }
  },

  async down(queryInterface) {
    const subjectCols = await queryInterface.describeTable('subjects');
    const columns = ['created_by', 'updated_by', 'created_at', 'updated_at'];

    for (const column of columns) {
      if (subjectCols[column]) {
        await queryInterface.removeColumn('subjects', column).catch(() => {});
      }
    }
  },
};
