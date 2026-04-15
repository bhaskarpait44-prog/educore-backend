'use strict';

/**
 * Migration: create_subjects
 *
 * Defines what subjects exist per class.
 * is_core is the critical flag — failing a core subject triggers compartment.
 * order_number controls display order on report cards.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('subjects', {
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
        comment    : 'Subject belongs to one class — different classes can share names',
      },
      name: {
        type      : Sequelize.STRING(100),
        allowNull : false,
        comment   : 'e.g. "Mathematics", "English Language", "Environmental Science"',
      },
      code: {
        type      : Sequelize.STRING(20),
        allowNull : true,
        comment   : 'Short code used in reports e.g. "MATH", "ENG", "SCI"',
      },
      total_marks: {
        type      : Sequelize.DECIMAL(6, 2),
        allowNull : false,
        comment   : 'Maximum marks this subject is out of',
      },
      passing_marks: {
        type      : Sequelize.DECIMAL(6, 2),
        allowNull : false,
        comment   : 'Minimum marks required to pass this subject',
      },
      is_core: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : true,
        comment      : 'Core=true: failing triggers compartment. Core=false: optional/co-curricular.',
      },
      order_number: {
        type         : Sequelize.INTEGER,
        allowNull    : false,
        defaultValue : 1,
        comment      : 'Display order on report card — lower number appears first',
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

    // Subject name unique within a class
    await queryInterface.addIndex('subjects', ['class_id', 'name'], {
      name   : 'idx_subjects_class_name',
      unique : true,
    });

    // Code unique within a class when provided
    await queryInterface.addIndex('subjects', ['class_id', 'code'], {
      name   : 'idx_subjects_class_code',
      unique : true,
      where  : 'code IS NOT NULL',
    });

    await queryInterface.addIndex('subjects', ['class_id', 'is_core'], {
      name: 'idx_subjects_class_core',
    });

    // Passing marks must not exceed total marks
    await queryInterface.sequelize.query(`
      ALTER TABLE subjects
      ADD CONSTRAINT chk_subjects_passing_lte_total
      CHECK (passing_marks <= total_marks);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('subjects');
  },
};