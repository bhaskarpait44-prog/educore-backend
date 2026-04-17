'use strict';

require('dotenv').config();
const logger   = require('./utils/logger');
const sequelize = require('./config/database');
const app      = require('./app');

const PORT = process.env.PORT || 5000;

async function boot() {
  try {
    await sequelize.authenticate();
    logger.info('Database connected.');

    app.listen(PORT, () => {
      logger.info(`EduCore API running → http://localhost:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
    });
  } catch (err) {
    logger.error('Boot failed:', err.message);
    process.exit(1);
  }
}

boot();