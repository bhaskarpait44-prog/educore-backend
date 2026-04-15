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
const Attendance         = require('./Attendance');
const FeeStructure       = require('./FeeStructure');
const FeeInvoice         = require('./FeeInvoice');
const FeePayment         = require('./FeePayment');
const Subject            = require('./Subject');
const Exam               = require('./Exam');
const ExamResult         = require('./ExamResult');
const StudentResult      = require('./StudentResult');

// ── All previous associations (Steps 2-7) ──────────────────────────────────
School.hasMany(Session,               { foreignKey: 'school_id',  as: 'sessions' });
Session.belongsTo(School,             { foreignKey: 'school_id',  as: 'school' });
Session.hasOne(SessionWorkingDay,     { foreignKey: 'session_id', as: 'workingDays' });
SessionWorkingDay.belongsTo(Session,  { foreignKey: 'session_id', as: 'session' });
Session.hasMany(SessionHoliday,       { foreignKey: 'session_id', as: 'holidays' });
SessionHoliday.belongsTo(Session,     { foreignKey: 'session_id', as: 'session' });
School.hasMany(Student,               { foreignKey: 'school_id',  as: 'students' });
Student.belongsTo(School,             { foreignKey: 'school_id',  as: 'school' });
Student.hasOne(StudentBiometric,      { foreignKey: 'student_id', as: 'biometrics' });
StudentBiometric.belongsTo(Student,   { foreignKey: 'student_id', as: 'student' });
Student.hasMany(StudentProfile,       { foreignKey: 'student_id', as: 'profileVersions' });
StudentProfile.belongsTo(Student,     { foreignKey: 'student_id', as: 'student' });
School.hasMany(Class,                 { foreignKey: 'school_id',  as: 'classes' });
Class.belongsTo(School,               { foreignKey: 'school_id',  as: 'school' });
Class.hasMany(Section,                { foreignKey: 'class_id',   as: 'sections' });
Section.belongsTo(Class,              { foreignKey: 'class_id',   as: 'class' });
Student.hasMany(Enrollment,           { foreignKey: 'student_id', as: 'enrollments' });
Enrollment.belongsTo(Student,         { foreignKey: 'student_id', as: 'student' });
Session.hasMany(Enrollment,           { foreignKey: 'session_id', as: 'enrollments' });
Enrollment.belongsTo(Session,         { foreignKey: 'session_id', as: 'session' });
Class.hasMany(Enrollment,             { foreignKey: 'class_id',   as: 'enrollments' });
Enrollment.belongsTo(Class,           { foreignKey: 'class_id',   as: 'class' });
Section.hasMany(Enrollment,           { foreignKey: 'section_id', as: 'enrollments' });
Enrollment.belongsTo(Section,         { foreignKey: 'section_id', as: 'section' });
Enrollment.belongsTo(Enrollment,      { foreignKey: 'previous_enrollment_id', as: 'previousEnrollment' });
Enrollment.hasOne(Enrollment,         { foreignKey: 'previous_enrollment_id', as: 'nextEnrollment' });
Enrollment.hasMany(Attendance,        { foreignKey: 'enrollment_id', as: 'attendance' });
Attendance.belongsTo(Enrollment,      { foreignKey: 'enrollment_id', as: 'enrollment' });
Session.hasMany(FeeStructure,         { foreignKey: 'session_id', as: 'feeStructures' });
FeeStructure.belongsTo(Session,       { foreignKey: 'session_id', as: 'session' });
Class.hasMany(FeeStructure,           { foreignKey: 'class_id',   as: 'feeStructures' });
FeeStructure.belongsTo(Class,         { foreignKey: 'class_id',   as: 'class' });
Enrollment.hasMany(FeeInvoice,        { foreignKey: 'enrollment_id', as: 'invoices' });
FeeInvoice.belongsTo(Enrollment,      { foreignKey: 'enrollment_id', as: 'enrollment' });
FeeStructure.hasMany(FeeInvoice,      { foreignKey: 'fee_structure_id', as: 'invoices' });
FeeInvoice.belongsTo(FeeStructure,    { foreignKey: 'fee_structure_id', as: 'feeStructure' });
FeeInvoice.belongsTo(FeeInvoice,      { foreignKey: 'carry_from_invoice_id', as: 'carriedFromInvoice' });
FeeInvoice.hasOne(FeeInvoice,         { foreignKey: 'carry_from_invoice_id', as: 'carriedToInvoice' });
FeeInvoice.hasMany(FeePayment,        { foreignKey: 'invoice_id', as: 'payments' });
FeePayment.belongsTo(FeeInvoice,      { foreignKey: 'invoice_id', as: 'invoice' });

// ── Step 8: Exam associations ───────────────────────────────────────────────

// Subject ↔ Class
Class.hasMany(Subject,         { foreignKey: 'class_id', as: 'subjects' });
Subject.belongsTo(Class,       { foreignKey: 'class_id', as: 'class' });

// Exam ↔ Session + Class
Session.hasMany(Exam,          { foreignKey: 'session_id', as: 'exams' });
Exam.belongsTo(Session,        { foreignKey: 'session_id', as: 'session' });
Class.hasMany(Exam,            { foreignKey: 'class_id',   as: 'exams' });
Exam.belongsTo(Class,          { foreignKey: 'class_id',   as: 'class' });

// ExamResult ↔ Exam, Enrollment, Subject
Exam.hasMany(ExamResult,       { foreignKey: 'exam_id',       as: 'results' });
ExamResult.belongsTo(Exam,     { foreignKey: 'exam_id',       as: 'exam' });
Enrollment.hasMany(ExamResult, { foreignKey: 'enrollment_id', as: 'examResults' });
ExamResult.belongsTo(Enrollment,{ foreignKey: 'enrollment_id',as: 'enrollment' });
Subject.hasMany(ExamResult,    { foreignKey: 'subject_id',    as: 'results' });
ExamResult.belongsTo(Subject,  { foreignKey: 'subject_id',    as: 'subject' });

// StudentResult ↔ Enrollment, Session
Enrollment.hasOne(StudentResult,  { foreignKey: 'enrollment_id', as: 'finalResult' });
StudentResult.belongsTo(Enrollment,{ foreignKey: 'enrollment_id',as: 'enrollment' });
Session.hasMany(StudentResult,    { foreignKey: 'session_id',    as: 'studentResults' });
StudentResult.belongsTo(Session,  { foreignKey: 'session_id',    as: 'session' });

const db = {
  sequelize,
  Sequelize : sequelize.constructor,
  School, Session, SessionWorkingDay, SessionHoliday,
  Student, StudentBiometric, StudentProfile, AuditLog,
  Class, Section, Enrollment, Attendance,
  FeeStructure, FeeInvoice, FeePayment,
  Subject, Exam, ExamResult, StudentResult,
};

module.exports = db;