'use strict';

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    const [sessions] = await queryInterface.sequelize.query(
      `SELECT id, name FROM sessions ORDER BY id ASC;`
    );
    const session2024 = sessions.find(s => s.name === '2024-2025').id;

    const [classes] = await queryInterface.sequelize.query(
      `SELECT id, name, order_number FROM classes ORDER BY order_number ASC;`
    );
    const grade1 = classes.find(c => c.order_number === 1).id;
    const grade2 = classes.find(c => c.order_number === 2).id;
    const grade3 = classes.find(c => c.order_number === 3).id;

    // Fee structures for 3 classes in session 2024-2025
    await queryInterface.bulkInsert('fee_structures', [

      // ── Grade 1 ──────────────────────────────────────────────────────────
      { session_id: session2024, class_id: grade1, name: 'Tuition Fee',   amount: '1200.00', frequency: 'monthly',  due_day: 10, is_active: true, created_at: now, updated_at: now },
      { session_id: session2024, class_id: grade1, name: 'Transport Fee', amount:  '800.00', frequency: 'monthly',  due_day: 10, is_active: true, created_at: now, updated_at: now },
      { session_id: session2024, class_id: grade1, name: 'Annual Fund',   amount: '2000.00', frequency: 'annual',   due_day: 10, is_active: true, created_at: now, updated_at: now },
      { session_id: session2024, class_id: grade1, name: 'Exam Fee',      amount:  '500.00', frequency: 'one_time', due_day: 10, is_active: true, created_at: now, updated_at: now },

      // ── Grade 2 ──────────────────────────────────────────────────────────
      { session_id: session2024, class_id: grade2, name: 'Tuition Fee',   amount: '1400.00', frequency: 'monthly',  due_day: 10, is_active: true, created_at: now, updated_at: now },
      { session_id: session2024, class_id: grade2, name: 'Transport Fee', amount:  '800.00', frequency: 'monthly',  due_day: 10, is_active: true, created_at: now, updated_at: now },
      { session_id: session2024, class_id: grade2, name: 'Lab Fee',       amount: '1500.00', frequency: 'quarterly',due_day: 10, is_active: true, created_at: now, updated_at: now },
      { session_id: session2024, class_id: grade2, name: 'Annual Fund',   amount: '2000.00', frequency: 'annual',   due_day: 10, is_active: true, created_at: now, updated_at: now },

      // ── Grade 3 ──────────────────────────────────────────────────────────
      { session_id: session2024, class_id: grade3, name: 'Tuition Fee',   amount: '1600.00', frequency: 'monthly',  due_day: 10, is_active: true, created_at: now, updated_at: now },
      { session_id: session2024, class_id: grade3, name: 'Transport Fee', amount:  '800.00', frequency: 'monthly',  due_day: 10, is_active: true, created_at: now, updated_at: now },
      { session_id: session2024, class_id: grade3, name: 'Lab Fee',       amount: '1500.00', frequency: 'quarterly',due_day: 10, is_active: true, created_at: now, updated_at: now },
      { session_id: session2024, class_id: grade3, name: 'Annual Fund',   amount: '2500.00', frequency: 'annual',   due_day: 10, is_active: true, created_at: now, updated_at: now },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('fee_structures', null, {});
  },
};