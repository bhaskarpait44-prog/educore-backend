'use strict';

/**
 * server.js
 * Application entry point.
 * - Loads env vars
 * - Authenticates database connection
 * - Starts HTTP server (Express added in Step 2)
 */

require('dotenv').config();
const logger = require('./utils/logger');
const sequelize = require('./config/database');

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Boot sequence — runs on startup.
 * Fails fast if DB is unreachable so the app never starts in a broken state.
 */
async function boot() {
  try {
    logger.info(`Starting EduCore API [${NODE_ENV}]...`);

    // Verify database connection — throws if credentials are wrong or DB is down
    await sequelize.authenticate();
    logger.info(`Database connected → ${process.env.DB_DIALECT}://${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

    // ── Placeholder: Express app wired in Step 2 ────────────────────────
    // const app = require('./app');
    // app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));

    // For now — confirm boot succeeded and exit cleanly
    logger.info('✅ Step 1 complete: DB connection verified. Server boot ready.');
    logger.info('   Next: wire up Express in Build Step 2.');

    // Keep process alive briefly so you can see the log, then exit
    setTimeout(() => process.exit(0), 500);

  } catch (error) {
    logger.error('Failed to connect to database:', error.message);
    logger.error('Check your .env DB_* variables and ensure the database server is running.');
    process.exit(1); // Non-zero = failure (important for CI/Docker healthchecks)
  }
}

boot();