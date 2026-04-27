// migrations/YYYYMMDD-create-sections.js
'use strict';

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
      },
      name: {
        type      : Sequelize.STRING(10),
        allowNull : false,
        comment   : 'e.g. A, B, C, Rose, Blue',
      },
      capacity: {
        type         : Sequelize.INTEGER,
        allowNull    : false,
        defaultValue : 40,
        comment      : 'Maximum students allowed — enforced on enrollment',
      },
      is_active: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : true,
      },
      is_deleted: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : false,
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

    // Section name unique within a class
    await queryInterface.addIndex('sections', ['class_id', 'name'], {
      name   : 'idx_sections_class_name',
      unique : true,
      where  : { is_deleted: false },
    });

    await queryInterface.addIndex('sections', ['class_id', 'is_deleted'], {
      name: 'idx_sections_class',
    });

    // Capacity must be positive
    await queryInterface.sequelize.query(`
      ALTER TABLE sections
      ADD CONSTRAINT chk_sections_capacity_positive
      CHECK (capacity >= 1);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE sections DROP CONSTRAINT IF EXISTS chk_sections_capacity_positive;`
    );
    await queryInterface.dropTable('sections');
  },
};
