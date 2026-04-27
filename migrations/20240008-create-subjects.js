// migrations/YYYYMMDD-create-subjects.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Create ENUM type for PostgreSQL
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE subject_type_enum AS ENUM ('theory', 'practical', 'both');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryInterface.createTable('subjects', {
      id: {
        type          : Sequelize.INTEGER,
        autoIncrement : true,
        primaryKey    : true,
        allowNull     : false,
      },
      class_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'classes', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
      },
      name: {
        type      : Sequelize.STRING(150),
        allowNull : false,
        comment   : 'e.g. Mathematics, Science, English',
      },
      code: {
        type      : Sequelize.STRING(30),
        allowNull : false,
        comment   : 'e.g. MATH-6 — must be unique per class',
      },
      subject_type: {
        type         : Sequelize.ENUM('theory', 'practical', 'both'),
        allowNull    : false,
        defaultValue : 'theory',
      },
      is_core: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : true,
        comment      : 'true = failing this subject triggers compartment/fail',
      },
      // ── Theory marks ─────────────────────────────────────────────────
      theory_total_marks: {
        type      : Sequelize.DECIMAL(6, 2),
        allowNull : true,
        comment   : 'NULL when subject_type = practical',
      },
      theory_passing_marks: {
        type      : Sequelize.DECIMAL(6, 2),
        allowNull : true,
        comment   : 'NULL when subject_type = practical',
      },
      // ── Practical marks ───────────────────────────────────────────────
      practical_total_marks: {
        type      : Sequelize.DECIMAL(6, 2),
        allowNull : true,
        comment   : 'NULL when subject_type = theory',
      },
      practical_passing_marks: {
        type      : Sequelize.DECIMAL(6, 2),
        allowNull : true,
        comment   : 'NULL when subject_type = theory',
      },
      // ── Combined (computed, stored for performance) ───────────────────
      combined_total_marks: {
        type      : Sequelize.DECIMAL(6, 2),
        allowNull : false,
        comment   : 'theory_total + practical_total (or just one if single type)',
      },
      combined_passing_marks: {
        type      : Sequelize.DECIMAL(6, 2),
        allowNull : false,
        comment   : 'theory_passing + practical_passing',
      },
      order_number: {
        type         : Sequelize.INTEGER,
        allowNull    : false,
        defaultValue : 1,
        comment      : 'Display order on mark sheets and report cards',
      },
      description: {
        type      : Sequelize.TEXT,
        allowNull : true,
      },
      is_active: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : true,
      },
      is_deleted: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : false,
      },
      created_by: {
        type       : Sequelize.INTEGER,
        allowNull  : true,
        references : { model: 'users', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'SET NULL',
      },
      updated_by: {
        type       : Sequelize.INTEGER,
        allowNull  : true,
        references : { model: 'users', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'SET NULL',
      },
      created_at: {
        type         : Sequelize.DATE,
        allowNull    : false,
        defaultValue : Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type         : Sequelize.DATE,
        allowNull    : false,
        defaultValue : Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Subject code unique within a class
    await queryInterface.addIndex('subjects', ['class_id', 'code'], {
      name   : 'idx_subjects_class_code',
      unique : true,
      where  : { is_deleted: false },
    });

    await queryInterface.addIndex('subjects', ['class_id', 'order_number'], {
      name: 'idx_subjects_class_order',
    });

    await queryInterface.addIndex('subjects', ['class_id', 'is_deleted'], {
      name: 'idx_subjects_class',
    });

    // DB-level consistency checks
    await queryInterface.sequelize.query(`
      ALTER TABLE subjects
      ADD CONSTRAINT chk_subjects_theory_marks
      CHECK (
        -- Theory marks required for theory/both, null for practical
        (subject_type = 'practical') OR
        (theory_total_marks IS NOT NULL AND theory_passing_marks IS NOT NULL
         AND theory_passing_marks <= theory_total_marks)
      );

      ALTER TABLE subjects
      ADD CONSTRAINT chk_subjects_practical_marks
      CHECK (
        -- Practical marks required for practical/both, null for theory
        (subject_type = 'theory') OR
        (practical_total_marks IS NOT NULL AND practical_passing_marks IS NOT NULL
         AND practical_passing_marks <= practical_total_marks)
      );

      ALTER TABLE subjects
      ADD CONSTRAINT chk_subjects_combined_positive
      CHECK (
        combined_total_marks > 0 AND
        combined_passing_marks > 0 AND
        combined_passing_marks <= combined_total_marks
      );
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE subjects DROP CONSTRAINT IF EXISTS chk_subjects_theory_marks;
      ALTER TABLE subjects DROP CONSTRAINT IF EXISTS chk_subjects_practical_marks;
      ALTER TABLE subjects DROP CONSTRAINT IF EXISTS chk_subjects_combined_positive;
    `);
    await queryInterface.dropTable('subjects');
    await queryInterface.sequelize.query(
      `DROP TYPE IF EXISTS subject_type_enum;`
    );
  },
};
