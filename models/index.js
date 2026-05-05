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
const ExamResult         = require('./ExamResult');
const Student            = require('./Student');
const StudentBiometric   = require('./StudentBiometric');
const StudentProfile     = require('./StudentProfile');
const StudentSubject     = require('./StudentSubject');
const Enrollment         = require('./Enrollment');
const User               = require('./User');
const Attendance         = require('./Attendance');
const FeeStructure       = require('./FeeStructure');
const FeeInvoice         = require('./FeeInvoice');
const FeePayment         = require('./FeePayment');
const AuditLog           = require('./AuditLog');
const StudentResult      = require('./StudentResult');
const StudyMaterial      = require('./StudyMaterial');
const MaterialView       = require('./MaterialView');
const NoticePin          = require('./NoticePin');
const StudentAchievement = require('./StudentAchievement');
const StudentDocument    = require('./StudentDocument');
const GradingScale       = require('./GradingScale');
const MarkHistory      = require('./MarkHistory');

// ── Associations ────────────────────────────────────────────────────────────

// Schools
School.hasMany(Session,  { foreignKey: 'school_id', as: 'sessions' });
Session.belongsTo(School, { foreignKey: 'school_id', as: 'school' });

School.hasMany(Class, { foreignKey: 'school_id', as: 'classes' });
Class.belongsTo(School, { foreignKey: 'school_id', as: 'school' });

School.hasMany(Student,  { foreignKey: 'school_id', as: 'students' });
Student.belongsTo(School, { foreignKey: 'school_id', as: 'school' });

School.hasMany(User, { foreignKey: 'school_id', as: 'users' });
User.belongsTo(School, { foreignKey: 'school_id', as: 'school' });

School.hasMany(GradingScale, { foreignKey: 'school_id', as: 'gradingScales' });
GradingScale.belongsTo(School, { foreignKey: 'school_id', as: 'school' });

// Sessions
// ... (rest of sessions)
Session.hasOne(SessionWorkingDay,  { foreignKey: 'session_id', as: 'workingDays' });
SessionWorkingDay.belongsTo(Session, { foreignKey: 'session_id', as: 'session' });

Session.hasMany(SessionHoliday,  { foreignKey: 'session_id', as: 'holidays' });
SessionHoliday.belongsTo(Session, { foreignKey: 'session_id', as: 'session' });

Session.hasMany(Enrollment, { foreignKey: 'session_id', as: 'enrollments' });
Enrollment.belongsTo(Session, { foreignKey: 'session_id', as: 'session' });

Session.hasMany(FeeStructure, { foreignKey: 'session_id', as: 'feeStructures' });
FeeStructure.belongsTo(Session, { foreignKey: 'session_id', as: 'session' });

// Classes & Sections
Class.hasMany(Section, { foreignKey: 'class_id', as: 'sections' });
Section.belongsTo(Class, { foreignKey: 'class_id', as: 'class' });

Class.hasMany(Subject, { foreignKey: 'class_id', as: 'subjects' });
Subject.belongsTo(Class, { foreignKey: 'class_id', as: 'class' });

Class.hasMany(Exam, { foreignKey: 'class_id', as: 'exams' });
Exam.belongsTo(Class, { foreignKey: 'class_id', as: 'class' });

Class.hasMany(Enrollment, { foreignKey: 'class_id', as: 'enrollments' });
Enrollment.belongsTo(Class, { foreignKey: 'class_id', as: 'class' });

Section.hasMany(Enrollment, { foreignKey: 'section_id', as: 'enrollments' });
Enrollment.belongsTo(Section, { foreignKey: 'section_id', as: 'section' });

Section.belongsTo(User, { foreignKey: 'class_teacher_id', as: 'classTeacher' });
User.hasMany(Section, { foreignKey: 'class_teacher_id', as: 'sectionsTaught' });

// Exams
Exam.hasMany(ExamSubject, { foreignKey: 'exam_id', as: 'examSubjects' });
ExamSubject.belongsTo(Exam, { foreignKey: 'exam_id', as: 'exam' });

Exam.hasMany(ExamResult, { foreignKey: 'exam_id', as: 'results' });
ExamResult.belongsTo(Exam, { foreignKey: 'exam_id', as: 'exam' });

Exam.hasMany(MarkHistory, { foreignKey: 'exam_id', as: 'markHistories' });
MarkHistory.belongsTo(Exam, { foreignKey: 'exam_id', as: 'exam' });

// Subjects
Subject.hasMany(ExamSubject, { foreignKey: 'subject_id', as: 'examSubjects' });
ExamSubject.belongsTo(Subject, { foreignKey: 'subject_id', as: 'subject' });

Subject.hasMany(ExamResult, { foreignKey: 'subject_id', as: 'examResults' });
ExamResult.belongsTo(Subject, { foreignKey: 'subject_id', as: 'subject' });

Subject.hasMany(MarkHistory, { foreignKey: 'subject_id', as: 'markHistories' });
MarkHistory.belongsTo(Subject, { foreignKey: 'subject_id', as: 'subject' });

// Students & Enrollments
Student.hasMany(Enrollment, { foreignKey: 'student_id', as: 'enrollments' });
Enrollment.belongsTo(Student, { foreignKey: 'student_id', as: 'student' });

Student.hasOne(StudentProfile, { foreignKey: 'student_id', as: 'profile' });
StudentProfile.belongsTo(Student, { foreignKey: 'student_id', as: 'student' });

Student.hasOne(StudentBiometric,  { foreignKey: 'student_id', as: 'biometrics' });
StudentBiometric.belongsTo(Student, { foreignKey: 'student_id', as: 'student' });

Student.hasMany(StudentSubject, { foreignKey: 'student_id', as: 'studentSubjects' });
StudentSubject.belongsTo(Student, { foreignKey: 'student_id', as: 'student' });

Enrollment.hasMany(Attendance, { foreignKey: 'enrollment_id', as: 'attendanceRecords' });
Attendance.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });

Enrollment.hasMany(FeeInvoice, { foreignKey: 'enrollment_id', as: 'invoices' });
FeeInvoice.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });

Enrollment.hasMany(ExamResult, { foreignKey: 'enrollment_id', as: 'examResults' });
ExamResult.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });

Enrollment.hasMany(MarkHistory, { foreignKey: 'enrollment_id', as: 'markHistories' });
MarkHistory.belongsTo(Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });

// Fees
FeeStructure.hasMany(FeeInvoice, { foreignKey: 'fee_structure_id', as: 'invoices' });
FeeInvoice.belongsTo(FeeStructure, { foreignKey: 'fee_structure_id', as: 'feeStructure' });

FeeInvoice.hasMany(FeePayment, { foreignKey: 'invoice_id', as: 'payments' });
FeePayment.belongsTo(FeeInvoice, { foreignKey: 'invoice_id', as: 'invoice' });

FeePayment.belongsTo(User, { foreignKey: 'received_by', as: 'receivedBy' });

// Achievements & Documents
Student.hasMany(StudentAchievement, { foreignKey: 'student_id', as: 'achievements' });
StudentAchievement.belongsTo(Student, { foreignKey: 'student_id' });

Student.hasMany(StudentDocument, { foreignKey: 'student_id', as: 'documents' });
StudentDocument.belongsTo(Student, { foreignKey: 'student_id' });
StudentDocument.belongsTo(User, { foreignKey: 'uploaded_by', as: 'uploader' });

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
  ExamResult,
  Student,
  StudentBiometric,
  StudentProfile,
  StudentSubject,
  Enrollment,
  User,
  Attendance,
  FeeStructure,
  FeeInvoice,
  FeePayment,
  AuditLog,
  StudentResult,
  StudyMaterial,
  MaterialView,
  NoticePin,
  StudentAchievement,
  StudentDocument,
  GradingScale,
  MarkHistory,
};

module.exports = db;
