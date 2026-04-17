'use strict';

/**
 * Migration: create_audit_logs
 *
 * IMMUTABILITY RULES (enforced at DB level):
 *   - No UPDATE privilege granted on this table
 *   - No DELETE privilege granted on this table
 *   - Postgres trigger blocks any UPDATE/DELETE attempt
 *
 * Every sensitive field change (students, users, fees etc.) writes one row here.
 * One row = one field change. If 3 fields change in one save, 3 rows are written.
 * This makes diffing and rollback queries trivially simple.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('audit_logs', {
      id: {
        type          : Sequelize.BIGINT,   // BIGINT — this table grows fast
        autoIncrement : true,
        primaryKey    : true,
        allowNull     : false,
      },
      table_name: {
        type      : Sequelize.STRING(100),
        allowNull : false,
        comment   : 'Which table was changed (e.g. "students")',
      },
      record_id: {
        type      : Sequelize.INTEGER,
        allowNull : false,
        comment   : 'PK of the changed row in table_name',
      },
      field_name: {
        type      : Sequelize.STRING(100),
        allowNull : false,
        comment   : 'Which column was changed',
      },
      old_value: {
        type      : Sequelize.TEXT,
        allowNull : true,
        comment   : 'Serialized previous value (null for INSERT)',
      },
      new_value: {
        type      : Sequelize.TEXT,
        allowNull : true,
        comment   : 'Serialized new value (null for DELETE)',
      },
      changed_by: {
        type      : Sequelize.INTEGER,
        allowNull : true,             // Null = system/seed action
        comment   : 'FK to users.id — linked in Step 4',
      },
      reason: {
        type      : Sequelize.STRING(500),
        allowNull : true,
        comment   : 'Why the change was made — min 10 chars enforced in app layer',
      },
      ip_address: {
        type      : Sequelize.STRING(45),   // 45 chars covers IPv6
        allowNull : true,
      },
      device_info: {
        type      : Sequelize.STRING(300),
        allowNull : true,
        comment   : 'User-Agent or device identifier from request headers',
      },
      created_at: {
        type         : Sequelize.DATE,
        allowNull    : false,
        defaultValue : Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Primary query pattern: "show me all changes to record X in table Y"
    await queryInterface.addIndex('audit_logs', ['table_name', 'record_id'], {
      name: 'idx_audit_table_record',
    });

    // Secondary: "show me everything user Z changed"
    await queryInterface.addIndex('audit_logs', ['changed_by', 'created_at'], {
      name: 'idx_audit_user_time',
    });

    // ── Immutability trigger (PostgreSQL) ──────────────────────────────────
    // Blocks any UPDATE or DELETE on audit_logs at the database level.
    // This cannot be bypassed by application code — only a superuser can drop it.
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION fn_audit_logs_immutable()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION
          'audit_logs is immutable. UPDATE and DELETE are not permitted. (operation: %, id: %)',
          TG_OP, OLD.id
          USING ERRCODE = 'restrict_violation';
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryInterface.sequelize.query(`
      CREATE TRIGGER trg_audit_logs_immutable
      BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION fn_audit_logs_immutable();
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;`
    );
    await queryInterface.sequelize.query(
      `DROP FUNCTION IF EXISTS fn_audit_logs_immutable;`
    );
    await queryInterface.dropTable('audit_logs');
  },
};