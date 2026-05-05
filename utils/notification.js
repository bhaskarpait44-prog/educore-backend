'use strict';

const sequelize = require('../config/database');

async function sendNotification({ userId = null, studentId = null, title, content, type = 'notice', data = {} }) {
  try {
    // 1. Save to database
    const [[notification]] = await sequelize.query(`
      INSERT INTO notifications (user_id, student_id, title, content, type, data, is_read, created_at, updated_at)
      VALUES (:userId, :studentId, :title, :content, :type, :data, false, NOW(), NOW())
      RETURNING id;
    `, {
      replacements: {
        userId,
        studentId,
        title,
        content,
        type,
        data: JSON.stringify(data),
      },
    });

    // 2. Fetch push tokens
    const [tokens] = await sequelize.query(`
      SELECT token FROM push_tokens
      WHERE (:userId::int IS NULL OR user_id = :userId)
        AND (:studentId::int IS NULL OR student_id = :studentId);
    `, {
      replacements: { userId, studentId },
    });

    if (tokens.length > 0) {
      console.log(`[Push Notification] Sending to ${tokens.length} devices: ${title} - ${content}`);
      // In a real app, integrate with FCM/OneSignal here
    }

    // 3. Mark as sent in DB
    await sequelize.query(`
      UPDATE notifications SET sent_at = NOW() WHERE id = :id;
    `, { replacements: { id: notification.id } });

    return notification.id;
  } catch (error) {
    console.error('[Notification Error]', error);
    return null;
  }
}

async function notifyClass(classId, sectionId, title, content, type = 'notice', data = {}) {
  const [students] = await sequelize.query(`
    SELECT student_id FROM enrollments
    WHERE class_id = :classId
      AND (:sectionId::int IS NULL OR section_id = :sectionId)
      AND status = 'active';
  `, { replacements: { classId, sectionId: sectionId || null } });

  const promises = students.map((s) => sendNotification({ studentId: s.student_id, title, content, type, data }));
  return Promise.all(promises);
}

async function notifyAllStudents(schoolId, title, content, type = 'notice', data = {}) {
  const [students] = await sequelize.query(`
    SELECT id FROM students
    WHERE school_id = :schoolId AND is_deleted = false;
  `, { replacements: { schoolId } });

  const promises = students.map((s) => sendNotification({ studentId: s.id, title, content, type, data }));
  return Promise.all(promises);
}

async function notifyAllTeachers(schoolId, title, content, type = 'notice', data = {}) {
  const [teachers] = await sequelize.query(`
    SELECT id FROM users
    WHERE school_id = :schoolId AND role = 'teacher' AND is_active = true;
  `, { replacements: { schoolId } });

  const promises = teachers.map((t) => sendNotification({ userId: t.id, title, content, type, data }));
  return Promise.all(promises);
}

async function notifySubject(subjectId, title, content, type = 'notice', data = {}) {
  // Finds students enrolled in this subject in the current/active session
  const [students] = await sequelize.query(`
    SELECT student_id FROM student_subjects
    WHERE subject_id = :subjectId AND is_active = true;
  `, { replacements: { subjectId } });

  const promises = students.map((s) => sendNotification({ studentId: s.student_id, title, content, type, data }));
  return Promise.all(promises);
}

module.exports = {
  sendNotification,
  notifyClass,
  notifyAllStudents,
  notifyAllTeachers,
  notifySubject,
};
