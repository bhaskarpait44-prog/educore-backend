'use strict';

const PERMISSIONS = [
  // ── Fees ────────────────────────────────────────────────────────────────
  { name:'fees.view',    display_name:'View Fee Records',       category:'fees',       description:'View fee structures, invoices, and payment history' },
  { name:'fees.collect', display_name:'Collect Payments',       category:'fees',       description:'Record fee payments from students and parents' },
  { name:'fees.edit',    display_name:'Edit Fee Structure',     category:'fees',       description:'Modify fee components and amounts' },
  { name:'fees.waive',   display_name:'Waive or Concede Fees', category:'fees',       description:'Grant fee waivers, concessions, or scholarships' },
  { name:'fees.report',  display_name:'Generate Fee Reports',   category:'fees',       description:'Access and export fee collection reports' },
  { name:'fees.refund',  display_name:'Process Refunds',        category:'fees',       description:'Issue refunds and reverse payments' },

  // ── Students ──────────────────────────────────────────────────────────
  { name:'students.view',     display_name:'View Students',       category:'students', description:'View student profiles and details' },
  { name:'students.create',   display_name:'Admit Students',      category:'students', description:'Create new student admissions' },
  { name:'students.edit',     display_name:'Edit Student Data',   category:'students', description:'Modify student profiles and identity information' },
  { name:'students.delete',   display_name:'Delete Students',     category:'students', description:'Soft-delete student records' },
  { name:'students.promote',  display_name:'Promote Students',    category:'students', description:'Promote or detain students at year end' },
  { name:'students.transfer', display_name:'Transfer Students',   category:'students', description:'Transfer students between sections or schools' },

  // ── Attendance ────────────────────────────────────────────────────────
  { name:'attendance.view',   display_name:'View Attendance',     category:'attendance', description:'View attendance records and reports' },
  { name:'attendance.mark',   display_name:'Mark Attendance',     category:'attendance', description:'Take daily class attendance' },
  { name:'attendance.edit',   display_name:'Edit Attendance',     category:'attendance', description:'Override and correct attendance records' },
  { name:'attendance.report', display_name:'Attendance Reports',  category:'attendance', description:'Generate attendance analysis reports' },

  // ── Results ───────────────────────────────────────────────────────────
  { name:'results.view',     display_name:'View Results',          category:'results', description:'View exam results and marks' },
  { name:'results.enter',    display_name:'Enter Marks',           category:'results', description:'Enter exam marks for students' },
  { name:'results.edit',     display_name:'Edit Marks',            category:'results', description:'Modify entered exam marks' },
  { name:'results.override', display_name:'Override Results',      category:'results', description:'Override calculated results with reason' },
  { name:'results.publish',  display_name:'Publish Results',       category:'results', description:'Make results visible to students and parents' },

  // ── Classes ───────────────────────────────────────────────────────────
  { name:'classes.view',   display_name:'View Classes',            category:'classes', description:'View class, section, and subject structure' },
  { name:'classes.create', display_name:'Create Classes',          category:'classes', description:'Create new classes and sections' },
  { name:'classes.edit',   display_name:'Edit Classes',            category:'classes', description:'Modify class details and subjects' },
  { name:'classes.delete', display_name:'Delete Classes',          category:'classes', description:'Remove classes and sections' },

  // ── Reports ───────────────────────────────────────────────────────────
  { name:'reports.fees',       display_name:'Fee Reports',         category:'reports', description:'Access fee collection and pending reports' },
  { name:'reports.attendance', display_name:'Attendance Reports',  category:'reports', description:'Access attendance summary and analysis' },
  { name:'reports.results',    display_name:'Result Reports',      category:'reports', description:'Access academic result reports and marksheets' },
  { name:'reports.export',     display_name:'Export Reports',      category:'reports', description:'Download reports as PDF or Excel' },

  // ── Users ─────────────────────────────────────────────────────────────
  { name:'users.view',        display_name:'View Users',           category:'users', description:'View user list and profiles' },
  { name:'users.create',      display_name:'Create Users',         category:'users', description:'Create new user accounts' },
  { name:'users.edit',        display_name:'Edit Users',           category:'users', description:'Modify user account details' },
  { name:'users.delete',      display_name:'Delete Users',         category:'users', description:'Deactivate and delete user accounts' },
  { name:'users.permissions', display_name:'Edit Permissions',     category:'users', description:'Assign and revoke user permissions' },

  // ── Audit ─────────────────────────────────────────────────────────────
  { name:'audit.view',   display_name:'View Audit Logs',           category:'audit', description:'View all system audit trail entries' },
  { name:'audit.export', display_name:'Export Audit Logs',         category:'audit', description:'Download audit log as CSV or PDF' },

  // ── Notices ───────────────────────────────────────────────────────────
  { name:'notices.view',       display_name:'View Notices',        category:'notices', description:'View notice board and announcements' },
  { name:'notices.post',       display_name:'Post Notices',        category:'notices', description:'Create and publish notices' },
  { name:'notices.all_classes',display_name:'Post to All Classes', category:'notices', description:'Send notices school-wide, not just own class' },
  { name:'notices.edit',       display_name:'Edit Notices',        category:'notices', description:'Edit published notices' },
  { name:'notices.delete',     display_name:'Delete Notices',      category:'notices', description:'Delete notice board entries' },
];

// ── Permission template presets ───────────────────────────────────────────
const SYSTEM_TEMPLATES = [
  {
    name            : 'Full Accountant',
    target_role     : 'accountant',
    is_system       : true,
    permission_names: [
      'fees.view','fees.collect','fees.report',
      'students.view','reports.fees',
    ],
  },
  {
    name            : 'Senior Accountant',
    target_role     : 'accountant',
    is_system       : true,
    permission_names: [
      'fees.view','fees.collect','fees.edit','fees.waive','fees.report','fees.refund',
      'students.view','reports.fees','reports.export','audit.view',
    ],
  },
  {
    name            : 'Class Teacher',
    target_role     : 'teacher',
    is_system       : true,
    permission_names: [
      'students.view',
      'attendance.view','attendance.mark','attendance.edit',
      'results.view','results.enter',
      'notices.view','notices.post',
      'classes.view',
    ],
  },
  {
    name            : 'Subject Teacher',
    target_role     : 'teacher',
    is_system       : true,
    permission_names: [
      'students.view',
      'attendance.view','attendance.mark',
      'results.view','results.enter',
      'notices.view',
      'classes.view',
    ],
  },
  {
    name            : 'Admin Assistant',
    target_role     : 'admin',
    is_system       : true,
    permission_names: [
      'students.view','students.create','students.edit',
      'classes.view',
      'attendance.view',
      'notices.view','notices.post',
      'users.view',
    ],
  },
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    // ── Insert permissions ────────────────────────────────────────────────
    await queryInterface.bulkInsert(
      'permissions',
      PERMISSIONS.map(p => ({ ...p, created_at: now })),
      { ignoreDuplicates: true }
    );

    // ── Get first school id for system templates ───────────────────────────
    const [[school]] = await queryInterface.sequelize.query(
      `SELECT id FROM schools WHERE is_active = true ORDER BY id ASC LIMIT 1;`
    );
    if (!school) {
      console.warn('⚠️  No school found — skipping permission template seed');
      return;
    }

    await queryInterface.bulkInsert(
      'permission_templates',
      SYSTEM_TEMPLATES.map(t => ({
        school_id        : school.id,
        name             : t.name,
        target_role      : t.target_role,
        permission_names : JSON.stringify(t.permission_names),
        is_system        : t.is_system,
        created_by       : null,
        created_at       : now,
        updated_at       : now,
      })),
      { ignoreDuplicates: true }
    );

    console.log(`✅ Seeded ${PERMISSIONS.length} permissions and ${SYSTEM_TEMPLATES.length} system templates`);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('permission_templates', { is_system: true });
    await queryInterface.bulkDelete('permissions', null);
  },
};