'use strict';

const sequelize          = require('../config/database');
const School             = require('./School');
const Session            = require('./Session');
const SessionWorkingDay  = require('./SessionWorkingDay');
const SessionHoliday     = require('./SessionHoliday');
const Student            = require('./Student');
const StudentBiometric   = require('./StudentBiometric');
const AuditLog           = require('./AuditLog');

// ── Associations ────────────────────────────────────────────────────────────

School.hasMany(Session,  { foreignKey: 'school_id', as: 'sessions' });
Session.belongsTo(School, { foreignKey: 'school_id', as: 'school' });

Session.hasOne(SessionWorkingDay,  { foreignKey: 'session_id', as: 'workingDays' });
SessionWorkingDay.belongsTo(Session, { foreignKey: 'session_id', as: 'session' });

Session.hasMany(SessionHoliday,  { foreignKey: 'session_id', as: 'holidays' });
SessionHoliday.belongsTo(Session, { foreignKey: 'session_id', as: 'session' });

School.hasMany(Student,  { foreignKey: 'school_id', as: 'students' });
Student.belongsTo(School, { foreignKey: 'school_id', as: 'school' });

Student.hasOne(StudentBiometric,  { foreignKey: 'student_id', as: 'biometrics' });
StudentBiometric.belongsTo(Student, { foreignKey: 'student_id', as: 'student' });

// AuditLog has no Sequelize association — queried by table_name + record_id directly

const db = {
  sequelize,
  Sequelize : sequelize.constructor,
  School,
  Session,
  SessionWorkingDay,
  SessionHoliday,
  Student,
  StudentBiometric,
  AuditLog,
};

module.exports = db;