'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Section = sequelize.define('Section', {
  id        : { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  class_id  : { type: DataTypes.INTEGER, allowNull: false },
  name      : { type: DataTypes.STRING(10), allowNull: false },
  capacity  : { type: DataTypes.INTEGER, allowNull: false, defaultValue: 40 },
  is_active : { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName   : 'sections',
  underscored : true,
  defaultScope: { where: { is_active: true } },
  scopes      : { all: {} },
});

module.exports = Section;