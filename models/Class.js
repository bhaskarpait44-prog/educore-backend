'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Class = sequelize.define('Class', {
  id           : { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  school_id    : { type: DataTypes.INTEGER, allowNull: false },
  name         : { type: DataTypes.STRING(50), allowNull: false },
  order_number : { type: DataTypes.INTEGER, allowNull: false },
  min_age      : { type: DataTypes.INTEGER, allowNull: true },
  max_age      : { type: DataTypes.INTEGER, allowNull: true },
  is_active    : { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName   : 'classes',
  underscored : true,
  defaultScope: { where: { is_active: true } },
  scopes      : { all: {} },
});

module.exports = Class;