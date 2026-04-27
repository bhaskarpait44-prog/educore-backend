'use strict';

const router = require('express').Router();
const { requirePermission, requireAnyPermission } = require('../middlewares/checkPermission');
const ctrl = require('../controllers/accountantController');

router.get('/dashboard', requirePermission('fees.view'), ctrl.dashboard);
router.get('/dashboard/today-stats', requirePermission('fees.view'), ctrl.todayStats);
router.get('/dashboard/recent-transactions', requirePermission('fees.view'), ctrl.recentTransactions);
router.get('/dashboard/pending-tasks', requirePermission('fees.view'), ctrl.pendingTasks);
router.get('/dashboard/week-trend', requirePermission('fees.view'), ctrl.weekTrend);

router.get('/students/search', requireAnyPermission(['fees.view', 'fees.collect']), ctrl.searchStudents);
router.get('/students/:id/pending-invoices', requireAnyPermission(['fees.view', 'fees.collect']), ctrl.studentPendingInvoices);
router.post('/collect', requirePermission('fees.collect'), ctrl.collect);
router.get('/receipt/:id', requirePermission('fees.view'), ctrl.receipt);
router.get('/receipt/:id/pdf', requirePermission('fees.view'), ctrl.receiptPdf);

router.get('/students', requirePermission('fees.view'), ctrl.students);
router.get('/students/:id/fees', requirePermission('fees.view'), ctrl.studentFees);
router.get('/students/:id/invoices', requirePermission('fees.view'), ctrl.studentInvoices);
router.get('/students/:id/payments', requirePermission('fees.view'), ctrl.studentPayments);
router.get('/students/:id/statement/pdf', requirePermission('fees.view'), ctrl.studentStatementPdf);

router.get('/fee-structure', requirePermission('fees.view'), ctrl.feeStructure);
router.patch('/fee-structure/:id', requirePermission('fees.edit'), ctrl.updateFeeStructure);
router.post('/fee-structure', requirePermission('fees.edit'), ctrl.createFeeStructure);
router.post('/fee-structure/generate-invoices', requirePermission('fees.edit'), ctrl.generateInvoices);
router.post('/fee-structure/copy-from-session', requirePermission('fees.edit'), ctrl.copyFeeStructureFromSession);

router.get('/invoices', requirePermission('fees.view'), ctrl.invoices);
router.get('/invoices/overdue', requirePermission('fees.view'), ctrl.overdueInvoices);
router.get('/invoices/due-today', requirePermission('fees.view'), ctrl.dueTodayInvoices);

router.get('/receipts', requirePermission('fees.view'), ctrl.receipts);
router.get('/receipts/:id', requirePermission('fees.view'), ctrl.receiptDetail);
router.get('/receipts/:id/pdf', requirePermission('fees.view'), ctrl.receiptDetailPdf);
router.post('/receipts/:id/duplicate', requirePermission('fees.view'), ctrl.duplicateReceipt);
router.post('/receipts/:id/email', requirePermission('fees.view'), ctrl.emailReceipt);
router.post('/receipts/:id/whatsapp', requirePermission('fees.view'), ctrl.whatsappReceipt);

router.get('/defaulters', requirePermission('fees.view'), ctrl.defaulters);
router.post('/defaulters/remind', requirePermission('fees.collect'), ctrl.remind);
router.post('/defaulters/remind-bulk', requirePermission('fees.collect'), ctrl.remindBulk);

router.get('/concessions', requirePermission('fees.waive'), ctrl.concessions);
router.post('/concessions/apply', requirePermission('fees.waive'), ctrl.applyConcession);
router.get('/concessions/report', requirePermission('fees.waive'), ctrl.concessionReport);

router.get('/reports/daily', requirePermission('fees.report'), ctrl.dailyReport);
router.get('/reports/monthly', requirePermission('fees.report'), ctrl.monthlyReport);
router.get('/reports/classwise', requirePermission('fees.report'), ctrl.classwiseReport);
router.get('/reports/session', requirePermission('fees.report'), ctrl.sessionReport);
router.get('/reports/defaulters', requirePermission('fees.report'), ctrl.defaulterReport);
router.get('/reports/concessions', requirePermission('fees.report'), ctrl.reportConcessions);
router.post('/reports/custom', requirePermission('fees.report'), requirePermission('reports.export'), ctrl.customReport);

router.get('/carry-forward/eligible', requirePermission('fees.edit'), ctrl.carryForwardEligible);
router.post('/carry-forward/single', requirePermission('fees.edit'), ctrl.carryForwardSingle);
router.post('/carry-forward/bulk', requirePermission('fees.edit'), ctrl.carryForwardBulk);

router.get('/refunds', requirePermission('fees.refund'), ctrl.refunds);
router.post('/refunds/process', requirePermission('fees.refund'), ctrl.processRefund);
router.get('/refunds/report', requirePermission('fees.refund'), ctrl.refundReport);

router.get('/cheques', requirePermission('fees.collect'), ctrl.cheques);
router.get('/cheques/pending', requirePermission('fees.collect'), ctrl.pendingCheques);
router.post('/cheques/:id/clear', requirePermission('fees.collect'), ctrl.clearCheque);
router.post('/cheques/:id/bounce', requirePermission('fees.collect'), ctrl.bounceCheque);

router.get('/profile', requireAnyPermission(['fees.view', 'fees.collect', 'fees.edit', 'fees.report', 'fees.refund', 'fees.waive']), ctrl.profile);
router.get('/profile/activity', requireAnyPermission(['fees.view', 'fees.collect', 'fees.edit', 'fees.report', 'fees.refund', 'fees.waive']), ctrl.profileActivity);
router.post('/profile/change-password', requireAnyPermission(['fees.view', 'fees.collect', 'fees.edit', 'fees.report', 'fees.refund', 'fees.waive']), ctrl.changePassword);

module.exports = router;
