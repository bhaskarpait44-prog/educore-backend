'use strict';

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    // ── Fetch school ────────────────────────────────────────────────────
    const [[school]] = await queryInterface.sequelize.query(
      `SELECT id FROM schools ORDER BY id ASC LIMIT 1;`
    );
    if (!school) { console.warn('No school found.'); return; }

    // ── Insert session ──────────────────────────────────────────────────
    await queryInterface.bulkInsert('sessions', [{
      school_id  : school.id,
      name       : '2026-2027',
      start_date : '2026-04-01',
      end_date   : '2027-03-31',
      status     : 'active',
      is_current : true,
      created_by : null,
      created_at : now,
      updated_at : now,
    }]);

    const [[session]] = await queryInterface.sequelize.query(
      `SELECT id FROM sessions WHERE school_id = ${school.id} AND name = '2026-2027' LIMIT 1;`
    );
    const sessionId = session.id;

    // ── Insert working days (Mon–Sat) ───────────────────────────────────
    await queryInterface.bulkInsert('session_working_days', [{
      session_id : sessionId,
      monday     : true,
      tuesday    : true,
      wednesday  : true,
      thursday   : true,
      friday     : true,
      saturday   : true,
      sunday     : false,
    }]);

    // ── Insert holidays ─────────────────────────────────────────────────
    const holidays = [
      // ── National holidays ───────────────────────────────────────────
      { date: '2026-08-15', name: 'Independence Day',          type: 'national'  },
      { date: '2026-10-02', name: 'Gandhi Jayanti',            type: 'national'  },
      { date: '2027-01-26', name: 'Republic Day',              type: 'national'  },

      // ── Regional / state holidays (Assam) ───────────────────────────
      { date: '2026-04-14', name: 'Bohag Bihu (Rongali Bihu)', type: 'regional'  },
      { date: '2026-04-15', name: 'Bohag Bihu Holiday',        type: 'regional'  },
      { date: '2026-05-01', name: 'May Day (Labour Day)',       type: 'regional'  },
      { date: '2026-10-15', name: 'Kangali Bihu (Kati Bihu)',  type: 'regional'  },
      { date: '2027-01-15', name: 'Bhogali Bihu (Magh Bihu)', type: 'regional'  },

      // ── Major Indian festivals ───────────────────────────────────────
      { date: '2026-04-10', name: 'Good Friday',               type: 'national'  },
      { date: '2026-04-30', name: 'Buddha Purnima',            type: 'national'  },
      { date: '2026-08-27', name: 'Janmashtami',               type: 'national'  },
      { date: '2026-09-17', name: 'Eid ul-Adha',               type: 'national'  },
      { date: '2026-10-20', name: 'Dussehra (Vijayadashami)',  type: 'national'  },
      { date: '2026-10-28', name: 'Diwali (Lakshmi Puja)',     type: 'national'  },
      { date: '2026-10-29', name: 'Diwali Holiday',            type: 'national'  },
      { date: '2026-11-05', name: 'Guru Nanak Jayanti',        type: 'national'  },
      { date: '2026-12-25', name: 'Christmas Day',             type: 'national'  },
      { date: '2027-03-19', name: 'Holi',                      type: 'national'  },
      { date: '2027-03-30', name: 'Id-ul-Fitr (Eid)',          type: 'national'  },

      // ── School-specific ─────────────────────────────────────────────
      { date: '2026-11-14', name: 'Children\'s Day',           type: 'school'    },
      { date: '2026-12-24', name: 'Christmas Eve (School)',     type: 'school'    },
      { date: '2026-12-26', name: 'Winter Break Begins',        type: 'school'    },
      { date: '2026-12-27', name: 'Winter Break',               type: 'school'    },
      { date: '2026-12-28', name: 'Winter Break',               type: 'school'    },
      { date: '2026-12-29', name: 'Winter Break',               type: 'school'    },
      { date: '2026-12-30', name: 'Winter Break',               type: 'school'    },
      { date: '2026-12-31', name: 'New Year\'s Eve (School)',   type: 'school'    },
      { date: '2027-01-01', name: 'New Year\'s Day',            type: 'school'    },
      { date: '2027-01-02', name: 'Winter Break Ends',          type: 'school'    },
      { date: '2027-03-27', name: 'Annual Prize Distribution',  type: 'school'    },
      { date: '2027-03-28', name: 'School Closing Day',         type: 'school'    },
    ];

    const holidayRows = holidays.map((h) => ({
      session_id   : sessionId,
      holiday_date : h.date,
      name         : h.name,
      type         : h.type,
      added_by     : null,
      created_at   : now,
    }));

    await queryInterface.bulkInsert('session_holidays', holidayRows);

    console.log(`\n[seed-session] Session 2026-2027 created (id=${sessionId})`);
    console.log(`  School id   : ${school.id}`);
    console.log(`  Working days: Mon–Sat`);
    console.log(`  Holidays    : ${holidayRows.length}`);
    console.log(`    National  : ${holidayRows.filter((h) => h.type === 'national').length}`);
    console.log(`    Regional  : ${holidayRows.filter((h) => h.type === 'regional').length}`);
    console.log(`    School    : ${holidayRows.filter((h) => h.type === 'school').length}\n`);
  },

  async down(queryInterface) {
    const [[school]] = await queryInterface.sequelize.query(
      `SELECT id FROM schools ORDER BY id ASC LIMIT 1;`
    );
    if (!school) return;

    const [[session]] = await queryInterface.sequelize.query(
      `SELECT id FROM sessions WHERE school_id = ${school.id} AND name = '2026-2027' LIMIT 1;`
    );
    if (!session) return;

    await queryInterface.bulkDelete('session_holidays',    { session_id: session.id });
    await queryInterface.bulkDelete('session_working_days',{ session_id: session.id });
    await queryInterface.bulkDelete('sessions',            { id: session.id });

    console.log('[seed-session] Session 2026-2027 removed.');
  },
};