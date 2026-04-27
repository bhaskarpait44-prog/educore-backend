'use strict';

/**
 * Legacy duplicate migration.
 *
 * The canonical student_biometrics table is created by:
 *   20240006-create-student-biometrics.js
 *
 * Intentionally left as a no-op for fresh installs.
 */

module.exports = {
  async up() {},
  async down() {},
};
