'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = [
      { name: 'highest_qualification', def: { type: Sequelize.STRING(150), allowNull: true } },
      { name: 'specialization', def: { type: Sequelize.STRING(150), allowNull: true } },
      { name: 'university_name', def: { type: Sequelize.STRING(200), allowNull: true } },
      { name: 'graduation_year', def: { type: Sequelize.INTEGER, allowNull: true } },
      { name: 'years_of_experience', def: { type: Sequelize.DECIMAL(4, 1), allowNull: true } },
    ];

    for (const col of columns) {
      try {
        await queryInterface.addColumn('users', col.name, col.def);
      } catch (err) {
        if (!err.message.includes('already exists')) throw err;
      }
    }
  },

  async down(queryInterface) {
    const columns = [
      'highest_qualification',
      'specialization',
      'university_name',
      'graduation_year',
      'years_of_experience',
    ];

    for (const col of columns) {
      await queryInterface.removeColumn('users', col).catch(() => {});
    }
  },
};
