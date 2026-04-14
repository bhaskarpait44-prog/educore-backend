'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Student = sequelize.define('Student', {
  id            : { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  school_id     : { type: DataTypes.INTEGER, allowNull: false },
  admission_no  : { type: DataTypes.STRING(50), allowNull: false },
  first_name    : { type: DataTypes.STRING(100), allowNull: false },
  last_name     : { type: DataTypes.STRING(100), allowNull: false },
  date_of_birth : { type: DataTypes.DATEONLY, allowNull: false },
  gender        : { type: DataTypes.ENUM('male', 'female', 'other'), allowNull: false },
  is_deleted    : { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, {
  tableName   : 'students',
  underscored : true,
  defaultScope: {
    // Always exclude soft-deleted students unless explicitly requested
    where: { is_deleted: false },
  },
  scopes: {
    withDeleted : {},                          // Student.scope('withDeleted').findAll()
    deletedOnly : { where: { is_deleted: true } },
  },
});

module.exports = Student;