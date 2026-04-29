'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

require('./models');

const respond = require('./middlewares/respond');
const errorHandler = require('./middlewares/errorHandler');
const { authenticate, requireRole } = require('./middlewares/auth');
const {
  requirePermission,
  attachUserPermissions,
} = require('./middlewares/checkPermission');

const app = express();

const corsOrigins = (() => {
  const raw = process.env.CORS_ORIGIN;
  if (!raw || raw.trim() === '*') return true;

  const allowed = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Include common local dev origins by default.
  ['http://localhost:3000', 'http://localhost:5173'].forEach((origin) => {
    if (!allowed.includes(origin)) allowed.push(origin);
  });

  return function originValidator(origin, callback) {
    if (!origin || allowed.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  };
})();

app.use(helmet());
app.use(cors({ origin: corsOrigins }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(respond);

app.use('/api/auth', require('./routes/auth'));

app.use('/api', authenticate, attachUserPermissions);

app.use('/api/students', require('./routes/students'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/classes', require('./routes/classes'));
app.use('/api/sections', require('./routes/sections'));
app.use('/api/enrollments', require('./routes/enrollments'));
app.use('/api/student-subjects', require('./routes/studentSubjects'));

app.use('/api/attendance',
  requirePermission('attendance.view'),
  require('./routes/attendance')
);

app.use('/api/fees',
  requirePermission('fees.view'),
  require('./routes/fees')
);

app.use('/api/accountant',
  requireRole('admin', 'accountant'),
  require('./routes/accountant')
);

app.use('/api/exams',
  requirePermission('exams.view'),
  require('./routes/exams')
);

app.use('/api/results',
  requirePermission('results.view'),
  require('./routes/results')
);

app.use('/api/admin/users',
  requirePermission('users.view'),
  require('./routes/userManagement')
);

app.use('/api/admin/teacher-control',
  requirePermission('users.view'),
  require('./routes/adminTeacherControl')
);

app.use('/api/teacher', require('./routes/teacher'));
app.use('/api/student', require('./routes/student'));

app.use('/api/audit',
  requirePermission('audit.view'),
  require('./routes/audit')
);

app.get('/health', (req, res) =>
  res.ok({ status: 'ok', timestamp: new Date() })
);

app.use((req, res) =>
  res.fail(`Route ${req.method} ${req.path} not found.`, [], 404)
);

app.use(errorHandler);

module.exports = app;
