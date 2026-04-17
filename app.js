'use strict';

require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const respond    = require('./middlewares/respond');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// ── Security & parsing ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(respond);   // Attach res.ok / res.fail to every response

// ── Auth route (no JWT needed) ────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));

// ── Protected API groups ──────────────────────────────────────────────────────
const { authenticate } = require('./middlewares/auth');

app.use('/api/sessions',    authenticate, require('./routes/sessions'));
app.use('/api/students',    authenticate, require('./routes/students'));
app.use('/api/enrollments', authenticate, require('./routes/enrollments'));
app.use('/api/attendance',  authenticate, require('./routes/attendance'));
app.use('/api/fees',        authenticate, require('./routes/fees'));
app.use('/api/exams',       authenticate, require('./routes/exams'));
app.use('/api/results',     authenticate, require('./routes/results'));
app.use('/api/audit',       authenticate, require('./routes/audit'));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.ok({ status: 'ok', timestamp: new Date() }));

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => res.fail(`Route ${req.method} ${req.path} not found.`, [], 404));

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;