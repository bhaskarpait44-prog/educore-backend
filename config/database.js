'use strict';

/**
 * config/database.js
 * Sequelize connection instance — single source of truth for DB config.
 * Reads all values from environment variables via dotenv.
 * Supports both PostgreSQL and MySQL via DB_DIALECT.
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');

// ── Validate required env vars before doing anything ──────────────────────
const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_DIALECT'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  throw new Error(
    `Missing required database environment variables: ${missing.join(', ')}\n` +
    `Check your .env file against .env.example`
  );
}

// ── Build Sequelize instance ───────────────────────────────────────────────
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    dialect: process.env.DB_DIALECT, // 'postgres' or 'mysql'

    // Connection pool — controls concurrent DB connections
    pool: {
      max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
      min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
      acquire: parseInt(process.env.DB_POOL_ACQUIRE, 10) || 30000, // ms to wait before throwing error
      idle: parseInt(process.env.DB_POOL_IDLE, 10) || 10000,       // ms connection can be idle
    },

    // Logging — only show SQL queries in development
    logging: process.env.NODE_ENV === 'development'
      ? (msg) => console.log(`[SQL] ${msg}`)
      : false,

    define: {
      // Use snake_case column names in DB (createdAt → created_at)
      underscored: true,
      // Don't auto-pluralize table names
      freezeTableName: true,
      // Add created_at / updated_at to every model automatically
      timestamps: true,
    },
  }
);

module.exports = sequelize;