'use strict';

/**
 * Migration: create_students
 * Core student identity table. No academic data here —
 * enrollments, classes, fees etc. live in their own tables.
 * Soft-delete via is_deleted — never hard delete a student record.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('students', {
      id: {
        type          : Sequelize.INTEGER,
        autoIncrement : true,
        primaryKey    : true,
        allowNull     : false,
      },
      school_id: {
        type       : Sequelize.INTEGER,
        allowNull  : false,
        references : { model: 'schools', key: 'id' },
        onUpdate   : 'CASCADE',
        onDelete   : 'RESTRICT',
        comment    : 'Tenant key — every student belongs to one school',
      },
      admission_no: {
        type      : Sequelize.STRING(50),
        allowNull : false,
        comment   : 'School-assigned unique admission number',
      },
      first_name: {
        type      : Sequelize.STRING(100),
        allowNull : false,
      },
      last_name: {
        type      : Sequelize.STRING(100),
        allowNull : false,
      },
      date_of_birth: {
        type      : Sequelize.DATEONLY,
        allowNull : false,
      },
      gender: {
        type      : Sequelize.ENUM('male', 'female', 'other'),
        allowNull : false,
      },
      is_deleted: {
        type         : Sequelize.BOOLEAN,
        allowNull    : false,
        defaultValue : false,
        comment      : 'Soft delete — never physically remove student records',
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

    // admission_no must be unique within a school (not globally)
    await queryInterface.addIndex('students', ['school_id', 'admission_no'], {
      name   : 'idx_students_school_admission_no',
      unique : true,
    });

    // Frequent filter — exclude soft-deleted in every query
    await queryInterface.addIndex('students', ['school_id', 'is_deleted'], {
      name: 'idx_students_school_deleted',
    });

    // Name search index
    await queryInterface.addIndex('students', ['first_name', 'last_name'], {
      name: 'idx_students_name',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('students');
  },
};