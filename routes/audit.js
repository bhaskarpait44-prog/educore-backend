'use strict';

const router = require('express').Router();
const { requireAdmin } = require('../middlewares/auth');
const ctrl   = require('../controllers/auditController');

router.get('/:table/:record_id', requireAdmin, ctrl.getHistory);
router.get('/admin/:admin_id',   requireAdmin, ctrl.getByAdmin);

module.exports = router;