'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const classCols = await queryInterface.describeTable('classes');

    if (!classCols.created_by) {
      await queryInterface.addColumn('classes', 'created_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }

    if (!classCols.updated_by) {
      await queryInterface.addColumn('classes', 'updated_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
  },

  async down(queryInterface) {
    const classCols = await queryInterface.describeTable('classes');

    for (const column of ['created_by', 'updated_by']) {
      if (classCols[column]) {
        await queryInterface.removeColumn('classes', column).catch(() => {});
      }
    }
  },
};
