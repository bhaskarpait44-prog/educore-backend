'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('fee_invoices');

    if (!columns.late_fee_applied_at) {
      await queryInterface.addColumn('fee_invoices', 'late_fee_applied_at', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    if (!columns.late_fee_applied_by) {
      await queryInterface.addColumn('fee_invoices', 'late_fee_applied_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      });
    }

    if (!columns.concession_type) {
      await queryInterface.addColumn('fee_invoices', 'concession_type', {
        type: Sequelize.STRING(50),
        allowNull: true,
      });
    }

    if (!columns.concession_reference) {
      await queryInterface.addColumn('fee_invoices', 'concession_reference', {
        type: Sequelize.STRING(150),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('fee_invoices', 'concession_reference').catch(() => {});
    await queryInterface.removeColumn('fee_invoices', 'concession_type').catch(() => {});
    await queryInterface.removeColumn('fee_invoices', 'late_fee_applied_by').catch(() => {});
    await queryInterface.removeColumn('fee_invoices', 'late_fee_applied_at').catch(() => {});
  },
};
