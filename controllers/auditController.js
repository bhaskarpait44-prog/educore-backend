'use strict';

const sequelize = require('../config/database');

exports.getHistory = async (req, res, next) => {
  try {
    const { table, record_id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const [logs] = await sequelize.query(`
      SELECT al.id, al.field_name, al.old_value, al.new_value,
             al.reason, al.ip_address, al.device_info, al.created_at,
             u.name AS changed_by_name, u.email AS changed_by_email
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.changed_by
      WHERE al.table_name = :table AND al.record_id = :record_id
      ORDER BY al.created_at DESC
      LIMIT :limit OFFSET :offset;
    `, { replacements: { table, record_id, limit: parseInt(limit), offset: parseInt(offset) } });

    res.ok({ table, record_id, total: logs.length, logs }, `${logs.length} audit log(s) retrieved.`);
  } catch (err) { next(err); }
};

exports.getByAdmin = async (req, res, next) => {
  try {
    const { admin_id } = req.params;
    const { from, to, limit = 100 } = req.query;

    let dateFilter = '';
    if (from && to) dateFilter = `AND al.created_at BETWEEN '${from}' AND '${to}'`;

    const [logs] = await sequelize.query(`
      SELECT al.id, al.table_name, al.record_id, al.field_name,
             al.old_value, al.new_value, al.reason, al.ip_address, al.created_at
      FROM audit_logs al
      WHERE al.changed_by = :admin_id ${dateFilter}
      ORDER BY al.created_at DESC
      LIMIT :limit;
    `, { replacements: { admin_id, limit: parseInt(limit) } });

    res.ok({ admin_id, total: logs.length, logs }, `${logs.length} change(s) by this admin.`);
  } catch (err) { next(err); }
};