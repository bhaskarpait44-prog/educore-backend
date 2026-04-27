'use strict';

require('dotenv').config();

const common = {
  dialect: 'postgres',
  define: {
    underscored: true,
    freezeTableName: true,
    timestamps: true,
  },
};

module.exports = {
  development: {
    ...common,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
  },

  test: {
    ...common,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME + '_test',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
  },

  production: process.env.DATABASE_URL
    ? {
        ...common,
        use_env_variable: 'DATABASE_URL',
        logging: false,
        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        },
      }
    : {
        // fallback (rare case)
        ...common,
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT, 10) || 5432,
        logging: false,
      },
};