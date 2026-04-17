'use strict';

/**
 * Migration: create_sections
 * Divisions within a class (A, B, C etc.)
 * A section belongs to exactly one class.
 * capacity is advisory — enforced in app layer, not DB constraint.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sections', {
      id: {
        type          : Sequelize.INTEGER,
        autoIncrement : true,
        primaryKey    : true,
        allowNull     : false,
      },
      class_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'classes', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
        comment    : 'Parent class — section cannot exist without a class',
      },
      name: {
        type      : Sequelize.STRING(10),
        allowNull : false,
        comment   : 'Section label e.g. "A", "B", "Rose", "Blue"',
      },
      capacity: {
        type         : Sequelize.INTEGER,
        allowNull    : false,
        defaultValue : 40,
        comment      : 'Maximum number of students. Soft limit — enforced in app layer.',
      },
      is_active: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : true,
      },
      created_at: {
        type         : Sequelize.DATE,
        allowNull    : false,
        defaultValue : Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type         : Sequelize.DATE,
        allowNull    : false,
        defaultValue : Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Section name must be unique within a class (can't have two "A" sections in Grade 1)
    await queryInterface.addIndex('sections', ['class_id', 'name'], {
      name   : 'idx_sections_class_name',
      unique : true,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sections');
  },
};