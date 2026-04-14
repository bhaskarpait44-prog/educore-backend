'use strict';

const sequelize          = require('../config/database');
const School             = require('./School');
const Session            = require('./Session');
const SessionWorkingDay  = require('./SessionWorkingDay');
const SessionHoliday     = require('./SessionHoliday');
const Student            = require('./Student');
const StudentBiometric   = require('./StudentBiometric');
const StudentProfile     = require('./StudentProfile');
const AuditLog           = require('./AuditLog');
const Class              = require('./Class');
const Section            = require('./Section');
const Enrollment         = require('./Enrollment');

// ── Associations ─────────────────────────────────────────────────────────────

School.hasMany(Session,   { foreignKey: 'school_id', as: 'sessions' });
Session.belongsTo(School, { foreignKey: 'school_id', as: 'school' });

Session.hasOne(SessionWorkingDay,    { foreignKey: 'session_id', as: 'workingDays' });
SessionWorkingDay.belongsTo(Session, { foreignKey: 'session_id', as: 'session' });

Session.hasMany(SessionHoliday,    { foreignKey: 'session_id', as: 'holidays' });
SessionHoliday.belongsTo(Session,  { foreignKey: 'session_id', as: 'session' });

School.hasMany(Student,   { foreignKey: 'school_id', as: 'students' });
Student.belongsTo(School, { foreignKey: 'school_id', as: 'school' });

Student.hasOne(StudentBiometric,    { foreignKey: 'student_id', as: 'biometrics' });
StudentBiometric.belongsTo(Student, { foreignKey: 'student_id', as: 'student' });

Student.hasMany(StudentProfile,    { foreignKey: 'student_id', as: 'profileVersions' });
StudentProfile.belongsTo(Student,  { foreignKey: 'student_id', as: 'student' });

// Class ↔ School
School.hasMany(Class,   { foreignKey: 'school_id', as: 'classes' });
Class.belongsTo(School, { foreignKey: 'school_id', as: 'school' });

// Section ↔ Class
Class.hasMany(Section,    { foreignKey: 'class_id', as: 'sections' });
Section.belongsTo(Class,  { foreignKey: 'class_id', as: 'class' });

// Enrollment ↔ Student, Session, Class, Section
Student.hasMany(Enrollment,    { foreignKey: 'student_id', as: 'enrollments' });
Enrollment.belongsTo(Student,  { foreignKey: 'student_id', as: 'student' });

Session.hasMany(Enrollment,    { foreignKey: 'session_id', as: 'enrollments' });
Enrollment.belongsTo(Session,  { foreignKey: 'session_id', as: 'session' });

Class.hasMany(Enrollment,     { foreignKey: 'class_id', as: 'enrollments' });
Enrollment.belongsTo(Class,   { foreignKey: 'class_id', as: 'class' });

Section.hasMany(Enrollment,   { foreignKey: 'section_id', as: 'enrollments' });
Enrollment.belongsTo(Section, { foreignKey: 'section_id', as: 'section' });

// Self-referencing: enrollment history chain
Enrollment.belongsTo(Enrollment, { foreignKey: 'previous_enrollment_id', as: 'previousEnrollment' });
Enrollment.hasOne(Enrollment,    { foreignKey: 'previous_enrollment_id', as: 'nextEnrollment' });

const db = {
  sequelize,
  Sequelize : sequelize.constructor,
  School, Session, SessionWorkingDay, SessionHoliday,
  Student, StudentBiometric, StudentProfile, AuditLog,
  Class, Section, Enrollment,
};

module.exports = db;