'use strict';

/**
 * Migration: create_fee_structures
 *
 * Defines WHAT fees exist for a class in a session.
 * One row = one fee type (e.g. "Tuition Fee", "Transport Fee").
 * Invoices are generated FROM these structures.
 *
 * frequency drives how many invoices get generated per student:
 *   monthly       → 12 invoices (one per month of session)
 *   quarterly     → 4 invoices
 *   annual        → 1 invoice
 *   one_time      → 1 invoice (admission fee, exam fee etc.)
 *
 * due_day = day of month payment is due (e.g. 10 = 10th of each month)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('fee_structures', {
      id: {
        type          : Sequelize.INTEGER,
        autoIncrement : true,
        primaryKey    : true,
        allowNull     : false,
      },
      session_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'sessions', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
        comment    : 'Fee structures are session-specific — amounts can change each year',
      },
      class_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'classes', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
        comment    : 'Different classes can have different fee amounts',
      },
      name: {
        type      : Sequelize.STRING(150),
        allowNull : false,
        comment   : 'e.g. "Tuition Fee", "Transport Fee", "Lab Fee", "Admission Fee"',
      },
      amount: {
        type      : Sequelize.DECIMAL(10, 2),
        allowNull : false,
        comment   : 'Base amount per frequency period. Stored as DECIMAL to avoid float errors.',
      },
      frequency: {
        type      : Sequelize.ENUM('monthly', 'quarterly', 'annual', 'one_time'),
        allowNull : false,
        comment   : 'How often this fee is charged per session',
      },
      due_day: {
        type         : Sequelize.INTEGER,
        allowNull    : false,
        defaultValue : 10,
        comment      : 'Day of month the payment is due (1–28). Capped at 28 to avoid month-end issues.',
      },
      is_active: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : true,
        comment      : 'Inactive structures are excluded from invoice generation',
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

    // Prevent duplicate fee types per class per session
    await queryInterface.addIndex('fee_structures', ['session_id', 'class_id', 'name'], {
      name   : 'idx_fee_structures_session_class_name',
      unique : true,
    });

    await queryInterface.addIndex('fee_structures', ['session_id', 'class_id', 'is_active'], {
      name: 'idx_fee_structures_session_class_active',
    });

    // due_day must be between 1 and 28
    await queryInterface.sequelize.query(`
      ALTER TABLE fee_structures
      ADD CONSTRAINT chk_due_day_range
      CHECK (due_day >= 1 AND due_day <= 28);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('fee_structures');
  },
};