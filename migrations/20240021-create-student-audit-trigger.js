'use strict';

/**
 * Legacy duplicate migration.
 *
 * The canonical students audit trigger is created by:
 *   20240008-create-student-audit-trigger.js
 *
 * Kept only to avoid breaking SequelizeMeta in older environments.
 */

module.exports = {
  async up() {},
  async down() {},
};
