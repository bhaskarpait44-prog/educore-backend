'use strict';

/**
 * config/sequelize-config.js
 * Sequelize CLI reads this file for migration/seed commands.
 * Must export a plain config object — NOT a Sequelize instance.
 * Reads the same .env variables used by database.js.
 */

require('dotenv').config();

module.exports = {
  development: {
    username : process.env.DB_USER,
    password : process.env.DB_PASSWORD,
    database : process.env.DB_NAME,
    host     : process.env.DB_HOST,
    port     : parseInt(process.env.DB_PORT, 10) || 5432,
    dialect  : process.env.DB_DIALECT || 'postgres',
    define: {
      underscored     : true,  // snake_case columns in DB
      freezeTableName : true,  // no auto-pluralization
      timestamps      : true,
    },
  },
  test: {
    username : process.env.DB_USER,
    password : process.env.DB_PASSWORD,
    database : process.env.DB_NAME + '_test',
    host     : process.env.DB_HOST,
    port     : parseInt(process.env.DB_PORT, 10) || 5432,
    dialect  : process.env.DB_DIALECT || 'postgres',
  },
  production: {
    username : process.env.DB_USER,
    password : process.env.DB_PASSWORD,
    database : process.env.DB_NAME,
    host     : process.env.DB_HOST,
    port     : parseInt(process.env.DB_PORT, 10) || 5432,
    dialect  : process.env.DB_DIALECT || 'postgres',
    logging  : false,
  },
};