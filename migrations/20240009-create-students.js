'use strict';

/**
 * Legacy duplicate migration.
 *
 * The canonical students table is created by:
 *   20240005-create-students.js
 *
 * This file is kept only to preserve historical migration history for
 * environments that may already have it recorded in SequelizeMeta.
 * On a fresh database it intentionally does nothing.
 */

module.exports = {
  async up() {},
  async down() {},
};
