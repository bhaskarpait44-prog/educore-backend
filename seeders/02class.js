'use strict';

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    const [schools] = await queryInterface.sequelize.query(
      `SELECT id FROM schools WHERE id IS NOT NULL ORDER BY id ASC LIMIT 1;`
    );

    if (!schools.length) {
      console.warn('No schools found — skipping classes seed.');
      return;
    }

    const schoolId = schools[0].id;

    const baseClasses = Array.from({ length: 10 }, (_, i) => ({
      school_id    : schoolId,
      name         : `Class ${i + 1}`,
      display_name : `Class ${i + 1}`,
      order_number : i + 1,
      stream       : 'regular',
      min_age      : 5 + i,
      max_age      : 7 + i,
      is_active    : true,
      is_deleted   : false,
      created_at   : now,
      updated_at   : now,
    }));

    const streams = ['arts', 'commerce', 'science'];

    const seniorClasses = [11, 12].flatMap((grade) =>
      streams.map((stream) => ({
        school_id    : schoolId,
        name         : `Class ${grade}`,
        display_name : `Class ${grade} (${stream.charAt(0).toUpperCase() + stream.slice(1)})`,
        order_number : grade,
        stream,
        min_age      : grade === 11 ? 15 : 16,
        max_age      : grade === 11 ? 17 : 18,
        is_active    : true,
        is_deleted   : false,
        created_at   : now,
        updated_at   : now,
      }))
    );

    await queryInterface.bulkInsert('classes', [...baseClasses, ...seniorClasses]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('classes', {
      name: Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`),
    });
  },
};