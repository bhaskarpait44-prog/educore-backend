'use strict';

const sequelize          = require('../config/database');
const School             = require('./School');
const Session            = require('./Session');
const SessionWorkingDay  = require('./SessionWorkingDay');
const SessionHoliday     = require('./SessionHoliday');
const Class              = require('./Class');
const Section            = require('./Section');
const Subject            = require('./Subject');
const Exam               = require('./Exam');
const ExamSubject        = require('./ExamSubject');
const Student            = require('./Student');
const StudentBiometric   = require('./StudentBiometric');
const StudentProfile     = require('./StudentProfile');
const StudentSubject     = require('./StudentSubject');
const AuditLog           = require('./AuditLog');

// ── Associations ────────────────────────────────────────────────────────────

School.hasMany(Session,  { foreignKey: 'school_id', as: 'sessions' });
Session.belongsTo(School, { foreignKey: 'school_id', as: 'school' });

Session.hasOne(SessionWorkingDay,  { foreignKey: 'session_id', as: 'workingDays' });
SessionWorkingDay.belongsTo(Session, { foreignKey: 'session_id', as: 'session' });

Session.hasMany(SessionHoliday,  { foreignKey: 'session_id', as: 'holidays' });
SessionHoliday.belongsTo(Session, { foreignKey: 'session_id', as: 'session' });

School.hasMany(Class, { foreignKey: 'school_id', as: 'classes' });
Class.belongsTo(School, { foreignKey: 'school_id', as: 'school' });

Class.hasMany(Section, { foreignKey: 'class_id', as: 'sections' });
Section.belongsTo(Class, { foreignKey: 'class_id', as: 'class' });

Class.hasMany(Subject, { foreignKey: 'class_id', as: 'subjects' });
Subject.belongsTo(Class, { foreignKey: 'class_id', as: 'class' });

Class.hasMany(Exam, { foreignKey: 'class_id', as: 'exams' });
Exam.belongsTo(Class, { foreignKey: 'class_id', as: 'class' });

Exam.hasMany(ExamSubject, { foreignKey: 'exam_id', as: 'examSubjects' });
ExamSubject.belongsTo(Exam, { foreignKey: 'exam_id', as: 'exam' });
Subject.hasMany(ExamSubject, { foreignKey: 'subject_id', as: 'examSubjects' });
ExamSubject.belongsTo(Subject, { foreignKey: 'subject_id', as: 'subject' });

School.hasMany(Student,  { foreignKey: 'school_id', as: 'students' });
Student.belongsTo(School, { foreignKey: 'school_id', as: 'school' });

Student.hasOne(StudentBiometric,  { foreignKey: 'student_id', as: 'biometrics' });
StudentBiometric.belongsTo(Student, { foreignKey: 'student_id', as: 'student' });

Student.hasMany(StudentSubject, { foreignKey: 'student_id', as: 'subjects' });
StudentSubject.belongsTo(Student, { foreignKey: 'student_id', as: 'student' });
StudentSubject.belongsTo(Subject, { foreignKey: 'subject_id', as: 'subject' });

// AuditLog has no Sequelize association — queried by table_name + record_id directly

const db = {
  sequelize,
  Sequelize : sequelize.constructor,
  School,
  Session,
  SessionWorkingDay,
  SessionHoliday,
  Class,
  Section,
  Subject,
  Exam,
  ExamSubject,
  Student,
  StudentBiometric,
  StudentSubject,
  AuditLog,
};

module.exports = db;
