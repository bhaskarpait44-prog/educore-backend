'use strict';

/**
 * Migration: create_classes
 * Defines grade levels within a school.
 * order_number drives promotion sequence (Grade 1=1, Grade 2=2, etc.)
 * min_age/max_age are advisory — used for admission validation warnings.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('classes', {
      id: {
        type          : Sequelize.INTEGER,
        autoIncrement : true,
        primaryKey    : true,
        allowNull     : false,
      },
      school_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'schools', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
        comment    : 'Tenant key — classes belong to one school',
      },
      name: {
        type      : Sequelize.STRING(50),
        allowNull : false,
        comment   : 'Display name e.g. "Grade 1", "Class X", "LKG"',
      },
      order_number: {
        type      : Sequelize.INTEGER,
        allowNull : false,
        comment   : 'Defines promotion sequence. Grade 1=1, Grade 2=2. Lower = younger.',
      },
      min_age: {
        type      : Sequelize.INTEGER,
        allowNull : true,
        comment   : 'Minimum recommended age in years for admission to this class',
      },
      max_age: {
        type      : Sequelize.INTEGER,
        allowNull : true,
        comment   : 'Maximum recommended age in years for this class',
      },
      is_active: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : true,
        comment      : 'Inactive classes cannot receive new enrollments',
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

    // Class name must be unique within a school
    await queryInterface.addIndex('classes', ['school_id', 'name'], {
      name   : 'idx_classes_school_name',
      unique : true,
    });

    // Order must be unique within a school (no two classes at same position)
    await queryInterface.addIndex('classes', ['school_id', 'order_number'], {
      name   : 'idx_classes_school_order',
      unique : true,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('classes');
  },
};