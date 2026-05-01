'use strict';

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    // Fetch all seeded classes
    const [classes] = await queryInterface.sequelize.query(
      `SELECT id, name, stream FROM classes WHERE is_deleted = false ORDER BY id ASC;`
    );

    if (!classes.length) {
      console.warn('No classes founds — run class seed first.');
      return;
    }

    const sectionNames = ['A', 'B', 'C'];

    const sections = classes.flatMap((cls) =>
      sectionNames.map((section) => ({
        class_id   : cls.id,
        name       : section,
        capacity   : 40,
        is_active  : true,
        is_deleted : false,
        created_at : now,
        updated_at : now,
      }))
    );

    await queryInterface.bulkInsert('sections', sections);
  },

  async down(queryInterface) {
    // Fetch class ids that were seeded
    const [classes] = await queryInterface.sequelize.query(
      `SELECT id FROM classes WHERE name ~ '^Class [0-9]+$' ORDER BY id ASC;`
    );

    if (!classes.length) return;

    const classIds = classes.map((c) => c.id);

    await queryInterface.bulkDelete('sections', {
      class_id : classIds,
      name     : ['A', 'B', 'C'],
    });
  },
};