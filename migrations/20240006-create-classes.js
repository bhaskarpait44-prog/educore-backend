// migrations/YYYYMMDD-create-classes.js
'use strict';

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
      },
      name: {
        type      : Sequelize.STRING(100),
        allowNull : false,
        comment   : 'e.g. Grade 6, Grade 7',
      },
      display_name: {
        type      : Sequelize.STRING(100),
        allowNull : true,
        comment   : 'e.g. Class 6, Standard 6 — shown on reports',
      },
      order_number: {
        type      : Sequelize.INTEGER,
        allowNull : false,
        comment   : 'Promotion sequence order — Grade 1 = 1, Grade 2 = 2',
      },
      min_age: {
        type      : Sequelize.INTEGER,
        allowNull : true,
        comment   : 'Minimum recommended age in years',
      },
      max_age: {
        type      : Sequelize.INTEGER,
        allowNull : true,
        comment   : 'Maximum recommended age in years',
      },
      description: {
        type      : Sequelize.TEXT,
        allowNull : true,
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
      created_by: {
        type       : Sequelize.INTEGER,
        allowNull  : true,
        references : { model: 'users', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'SET NULL',
      },
      updated_by: {
        type       : Sequelize.INTEGER,
        allowNull  : true,
        references : { model: 'users', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'SET NULL',
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

    // Unique order per school (no two classes at same position)
    await queryInterface.addIndex('classes', ['school_id', 'order_number'], {
      name   : 'idx_classes_school_order',
      unique : true,
      where  : { is_deleted: false },
    });

    // Fast filter queries
    await queryInterface.addIndex('classes', ['school_id', 'is_active', 'is_deleted'], {
      name: 'idx_classes_school_active',
    });

    // Age range check
    await queryInterface.sequelize.query(`
      ALTER TABLE classes
      ADD CONSTRAINT chk_classes_age_range
      CHECK (max_age IS NULL OR min_age IS NULL OR max_age > min_age);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE classes DROP CONSTRAINT IF EXISTS chk_classes_age_range;`
    );
    await queryInterface.dropTable('classes');
  },
};
