'use strict';

const bcrypt = require('bcryptjs');

module.exports = {
  async up(queryInterface) {
    const [schools] = await queryInterface.sequelize.query(`SELECT id FROM schools LIMIT 1;`);
    const hash = await bcrypt.hash('Admin@1234', 12);

    await queryInterface.bulkInsert('users', [{
      school_id     : schools[0].id,
      name          : 'System Admin',
      email         : 'admin@greenwoodacademy.edu.in',
      password_hash : hash,
      role          : 'admin',
      is_active     : true,
      created_at    : new Date(),
      updated_at    : new Date(),
    }]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', { email: 'admin@greenwoodacademy.edu.in' }, {});
  },
};