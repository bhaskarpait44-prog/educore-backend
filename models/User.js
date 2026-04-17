'use strict';

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id            : { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  school_id     : { type: DataTypes.INTEGER, allowNull: false },
  name          : { type: DataTypes.STRING(150), allowNull: false },
  email         : { type: DataTypes.STRING(150), allowNull: false },
  password_hash : { type: DataTypes.STRING(255), allowNull: false },
  role          : { type: DataTypes.ENUM('admin', 'teacher', 'accountant', 'staff'), allowNull: false },
  is_active     : { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  last_login_at : { type: DataTypes.DATE, allowNull: true },
}, {
  tableName   : 'users',
  underscored : true,
  defaultScope: {
    attributes: { exclude: ['password_hash'] },  // Never leak hash by default
  },
  scopes: {
    withPassword: { attributes: {} },             // Only for auth
  },
});

module.exports = User;