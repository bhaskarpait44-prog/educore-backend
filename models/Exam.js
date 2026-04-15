'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Exam = sequelize.define('Exam', {
  id            : { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  session_id    : { type: DataTypes.INTEGER, allowNull: false },
  class_id      : { type: DataTypes.INTEGER, allowNull: false },
  name          : { type: DataTypes.STRING(150), allowNull: false },
  exam_type     : { type: DataTypes.ENUM('term', 'midterm', 'final', 'compartment'), allowNull: false },
  start_date    : { type: DataTypes.DATEONLY, allowNull: false },
  end_date      : { type: DataTypes.DATEONLY, allowNull: false },
  total_marks   : { type: DataTypes.DECIMAL(8, 2), allowNull: false },
  passing_marks : { type: DataTypes.DECIMAL(8, 2), allowNull: false },
  status        : { type: DataTypes.ENUM('upcoming', 'ongoing', 'completed'), allowNull: false, defaultValue: 'upcoming' },
}, { tableName: 'exams', underscored: true });

module.exports = Exam;