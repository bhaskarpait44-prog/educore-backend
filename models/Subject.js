'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Subject = sequelize.define('Subject', {
  id            : { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  class_id      : { type: DataTypes.INTEGER, allowNull: false },
  name          : { type: DataTypes.STRING(100), allowNull: false },
  code          : { type: DataTypes.STRING(20), allowNull: true },
  total_marks   : { type: DataTypes.DECIMAL(6, 2), allowNull: false },
  passing_marks : { type: DataTypes.DECIMAL(6, 2), allowNull: false },
  is_core       : { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  order_number  : { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  is_active     : { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName    : 'subjects',
  underscored  : true,
  defaultScope : { where: { is_active: true }, order: [['order_number', 'ASC']] },
  scopes       : { all: {} },
});

module.exports = Subject;