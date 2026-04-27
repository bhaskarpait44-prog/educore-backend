'use strict';

/**
 * Legacy duplicate migration.
 *
 * The canonical sessions table is created by:
 *   20240002-create-sessions.js
 *
 * This file is intentionally a no-op on fresh databases.
 */

module.exports = {
  async up() {},
  async down() {},
};
