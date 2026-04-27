'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('collection_targets', {
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
      session_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'sessions', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
      },
      month: {
        type      : Sequelize.INTEGER,
        allowNull : false,
      },
      year: {
        type      : Sequelize.INTEGER,
        allowNull : false,
      },
      target_amount: {
        type      : Sequelize.DECIMAL(12, 2),
        allowNull : false,
      },
      set_by: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'users', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
      },
      created_at: {
        type         : Sequelize.DATE,
        allowNull    : false,
        defaultValue : Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('collection_targets', ['school_id', 'session_id', 'month', 'year'], {
      name   : 'idx_collection_targets_school_session_month_year',
      unique : true,
    });

    await queryInterface.addIndex('collection_targets', ['session_id', 'year', 'month'], {
      name: 'idx_collection_targets_session_period',
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE collection_targets
      ADD CONSTRAINT chk_collection_targets_month
      CHECK (month BETWEEN 1 AND 12);
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE collection_targets
      ADD CONSTRAINT chk_collection_targets_target_amount
      CHECK (target_amount > 0);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('collection_targets');
  },
};
