'use strict';

/**
 * Legacy duplicate migration.
 *
 * The canonical audit_logs table is created by:
 *   20240007-create-audit-logs.js
 *
 * Intentionally a no-op so a clean database only creates audit_logs once.
 */

module.exports = {
  async up() {},
  async down() {},
};
