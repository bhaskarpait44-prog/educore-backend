'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('fee_invoices', 'late_fee_applied_at', {
      type      : Sequelize.DATE,
      allowNull : true,
      comment   : 'When the current late fee amount was last applied or updated',
    });

    await queryInterface.addColumn('fee_invoices', 'late_fee_applied_by', {
      type       : Sequelize.INTEGER,
      allowNull  : true,
      references : { model: 'users', key: 'id' },
      onUpdate   : 'CASCADE',
      onDelete   : 'SET NULL',
      comment    : 'User who applied the current late fee',
    });

    await queryInterface.addColumn('fee_invoices', 'concession_type', {
      type      : Sequelize.STRING(50),
      allowNull : true,
      comment   : 'percentage, fixed_amount, or full_waiver',
    });

    await queryInterface.addColumn('fee_invoices', 'concession_reference', {
      type      : Sequelize.STRING(150),
      allowNull : true,
      comment   : 'Approval letter, document, or internal reference for concession',
    });

    await queryInterface.addIndex('fee_invoices', ['late_fee_applied_by'], {
      name: 'idx_fee_invoices_late_fee_applied_by',
    });

    await queryInterface.addIndex('fee_invoices', ['concession_type'], {
      name: 'idx_fee_invoices_concession_type',
    });

  },

  async down(queryInterface) {
    await queryInterface.removeIndex('fee_invoices', 'idx_fee_invoices_concession_type');
    await queryInterface.removeIndex('fee_invoices', 'idx_fee_invoices_late_fee_applied_by');
    await queryInterface.removeColumn('fee_invoices', 'concession_reference');
    await queryInterface.removeColumn('fee_invoices', 'concession_type');
    await queryInterface.removeColumn('fee_invoices', 'late_fee_applied_by');
    await queryInterface.removeColumn('fee_invoices', 'late_fee_applied_at');
  },
};
