'use strict';

/**
 * Migration: create_student_biometrics
 * Stores biometric enrollment data per student.
 * One row per student (enforced by UNIQUE on student_id).
 * face_embedding stored as JSON (vector array from face-api / deepface).
 * fingerprint_1/2 stored as BYTEA (binary blob).
 *
 * SECURITY NOTE: This table should have restricted DB-level permissions.
 * Only the biometric service role should have SELECT/INSERT/UPDATE.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('student_biometrics', {
      id: {
        type          : Sequelize.INTEGER,
        autoIncrement : true,
        primaryKey    : true,
        allowNull     : false,
      },
      student_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        unique     : true,          // One biometric record per student
        references : { model: 'students', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'CASCADE',     // If student hard-deleted (admin action), biometrics go too
      },
      face_embedding: {
        type      : Sequelize.JSON,
        allowNull : true,
        comment   : 'Float array from face recognition model (e.g. 128-dim FaceNet vector)',
      },
      fingerprint_1: {
        type      : Sequelize.BLOB,
        allowNull : true,
        comment   : 'Raw fingerprint template bytes — right index finger by convention',
      },
      fingerprint_2: {
        type      : Sequelize.BLOB,
        allowNull : true,
        comment   : 'Raw fingerprint template bytes — left index finger by convention',
      },
      enrolled_at: {
        type      : Sequelize.DATE,
        allowNull : true,
        comment   : 'When biometrics were first enrolled',
      },
      last_updated: {
        type      : Sequelize.DATE,
        allowNull : true,
        comment   : 'When biometrics were last re-enrolled or updated',
      },
      is_active: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : true,
        comment      : 'Set false to disable biometric login without deleting data',
      },
    }, {
      // No timestamps — we manage enrolled_at / last_updated manually
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('student_biometrics');
  },
};