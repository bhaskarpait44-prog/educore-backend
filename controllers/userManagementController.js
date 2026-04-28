'use strict';
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const { Op }   = require('sequelize');
const sequelize = require('../config/database');
const { clearPermissionCache } = require('../middlewares/checkPermission');
const profileVersioning = require('../utils/profileVersioning');
const { normalizeUserRole } = require('../utils/roles');

const ADMIN_ROLES = ['admin'];
const MANAGEABLE_USER_ROLES = ['admin', 'accountant', 'teacher', 'student', 'parent', 'staff', 'librarian', 'receptionist'];
const USER_MANAGEMENT_ALLOWED_ROLES = ['admin', 'accountant'];
const USER_ROLE_ENUM_NAME = 'enum_users_role';

function splitStudentName(name = '') {
  const trimmed = String(name).trim().replace(/\s+/g, ' ');
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(' ');
  const firstName = parts.shift() || '';
  const lastName = parts.join(' ') || '-';
  return { firstName, lastName };
}

async function ensureUserRoleEnumValue(role, transaction) {
  if (!MANAGEABLE_USER_ROLES.includes(role)) return;

  await sequelize.query(`
    DO $$
    BEGIN
      ALTER TYPE "${USER_ROLE_ENUM_NAME}" ADD VALUE IF NOT EXISTS '${role}';
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN NULL;
    END $$;
  `, transaction ? { transaction } : undefined);
}

function resolvePermissionNamesForRole(role, permissionNames = []) {
  const normalized = Array.isArray(permissionNames)
    ? permissionNames.filter(Boolean).map((name) => String(name).trim())
    : [];
  return [...new Set(normalized)];
}

async function ensurePermissionsExist(permissionDefs, transaction) {
  if (!Array.isArray(permissionDefs) || permissionDefs.length === 0) return;

  for (const permission of permissionDefs) {
    await sequelize.query(`
      INSERT INTO permissions (name, display_name, category, description, created_at)
      VALUES (:name, :display_name, :category, :description, NOW())
      ON CONFLICT (name) DO NOTHING;
    `, {
      replacements: permission,
      ...(transaction ? { transaction } : {}),
    });
  }
}

// ── Helper: log audit ─────────────────────────────────────────────────────
const audit = async (tableName, recordId, changes, req) => {
  const rows = (Array.isArray(changes) ? changes : [changes]).map(c => ({
    table_name  : tableName,
    record_id   : recordId,
    field_name  : c.field,
    old_value   : c.oldValue != null ? String(c.oldValue) : null,
    new_value   : c.newValue != null ? String(c.newValue) : null,
    changed_by  : req.user?.id || null,
    reason      : c.reason   || null,
    ip_address  : req.ip     || null,
    device_info : (req.headers['user-agent'] || '').substring(0, 299),
    created_at  : new Date(),
  }));
  try { await sequelize.getQueryInterface().bulkInsert('audit_logs', rows); } catch {}
};

// ── Helper: check caller can manage target ────────────────────────────────
function canManage(caller, targetRole) {
  return normalizeUserRole(caller.role) === 'admin';
}

// ── GET /api/admin/users ──────────────────────────────────────────────────
exports.list = async (req, res, next) => {
  try {
    const { search, role, status, page = 1, perPage = 20 } = req.query;
    const schoolId = req.user.school_id;
    const offset = (parseInt(page, 10) - 1) * parseInt(perPage, 10);
    const replacements = {
      schoolId,
      role: role || null,
      status: status || null,
      search: `%${search || ''}%`,
      limit: parseInt(perPage, 10),
      offset,
    };

    const baseCte = `
      WITH portal_accounts AS (
        SELECT
          CONCAT('user-', u.id) AS uid,
          u.id AS source_id,
          'user' AS source_type,
          u.name,
          u.email,
          CASE WHEN u.role = 'super_admin' THEN 'admin' ELSE u.role END AS role,
          u.is_active,
          u.last_login_at,
          u.employee_id,
          u.department,
          u.designation,
          u.phone,
          u.profile_photo,
          u.force_password_change,
          u.created_at,
          COUNT(DISTINCT up.id)::int AS permission_count,
          creator.name AS created_by_name
        FROM users u
        LEFT JOIN user_permissions up ON up.user_id = u.id
        LEFT JOIN users creator ON creator.id = u.created_by
        WHERE u.school_id = :schoolId
          AND u.is_deleted = false
          AND u.role IN ('admin', 'super_admin', 'accountant')
        GROUP BY u.id, creator.name
      ),
      filtered_accounts AS (
        SELECT *
        FROM portal_accounts
        WHERE (:role IS NULL OR role = :role)
          AND (
            :status IS NULL
            OR (:status = 'active' AND is_active = true)
            OR (:status = 'inactive' AND is_active = false)
          )
          AND (
            :search = '%%'
            OR name ILIKE :search
            OR COALESCE(email, '') ILIKE :search
            OR COALESCE(employee_id, '') ILIKE :search
          )
      )
    `;

    const [[{ cnt }]] = await sequelize.query(`
      ${baseCte}
      SELECT COUNT(*)::int AS cnt
      FROM filtered_accounts;
    `, { replacements });

    const [users] = await sequelize.query(`
      ${baseCte}
      SELECT *
      FROM filtered_accounts
      ORDER BY created_at DESC
      LIMIT :limit OFFSET :offset;
    `, { replacements });

    const [roleCounts] = await sequelize.query(`
      ${baseCte}
      SELECT role, COUNT(*)::int AS cnt
      FROM filtered_accounts
      GROUP BY role;
    `, { replacements });

    return res.ok({
      users: users.map((user) => ({
        ...user,
        role: normalizeUserRole(user.role),
      })),
      pagination: {
        page: parseInt(page), perPage: parseInt(perPage),
        total: parseInt(cnt),
        totalPages: Math.ceil(parseInt(cnt) / parseInt(perPage)),
      },
      roleCounts: roleCounts.reduce((acc, r) => {
        const role = normalizeUserRole(r.role);
        acc[role] = (acc[role] || 0) + parseInt(r.cnt);
        return acc;
      }, {}),
    });
  } catch (err) { next(err); }
};

// ── POST /api/admin/users ─────────────────────────────────────────────────
exports.create = async (req, res, next) => {
  try {
    const schoolId = req.user.school_id;
    const {
      name, email, phone, role, password, auto_password = false,
      force_password_change = true, employee_id, department,
      designation, joining_date, date_of_birth, gender, address,
      highest_qualification, specialization, university_name, graduation_year, years_of_experience,
      internal_notes, permission_names = [], class_assignments = [],
      admission_no,
    } = req.body;
    const resolvedPermissionNames = resolvePermissionNamesForRole(role, permission_names);

    if (!USER_MANAGEMENT_ALLOWED_ROLES.includes(role)) {
      return res.fail(`Invalid role. Allowed roles: ${USER_MANAGEMENT_ALLOWED_ROLES.join(', ')}`, [], 422);
    }

    if (!canManage(req.user, role)) {
      return res.fail('You cannot create a user with this role.', [], 403);
    }

    const normalizedEmail = String(email || '').trim().toLowerCase();

    // Check email unique
    const [[existing]] = await sequelize.query(
      `SELECT id FROM users WHERE email = :email AND is_deleted = false LIMIT 1;`,
      { replacements: { email: normalizedEmail } }
    );
    if (existing) return res.fail('Email already in use.', [], 409);

    // Generate or hash password
    let rawPassword = password;
    if (auto_password || !password) {
      rawPassword = crypto.randomBytes(8).toString('hex');
    }
    const hash = await bcrypt.hash(rawPassword, 12);

    let user;
    await sequelize.transaction(async (t) => {
      await ensureUserRoleEnumValue(role, t);

      const [[createdUser]] = await sequelize.query(`
        INSERT INTO users
          (school_id, name, email, password_hash, role, phone, employee_id,
           department, designation, joining_date, date_of_birth, gender, address,
           highest_qualification, specialization, university_name, graduation_year, years_of_experience,
           internal_notes, is_active, force_password_change, created_by, created_at, updated_at)
        VALUES
          (:schoolId, :name, :email, :hash, :role, :phone, :employee_id,
           :department, :designation, :joining_date, :date_of_birth, :gender, :address,
           :highest_qualification, :specialization, :university_name, :graduation_year, :years_of_experience,
           :internal_notes, true, :force_pwd, :createdBy, NOW(), NOW())
        RETURNING id, name, email, role, is_active, employee_id;
      `, {
        replacements: {
          schoolId, name, email: normalizedEmail, hash, role,
          phone: phone || null,
          employee_id: employee_id || null,
          department: department || null,
          designation: designation || null,
          joining_date: joining_date || null,
          date_of_birth: date_of_birth || null,
          gender: gender || null,
          address: address || null,
          highest_qualification: highest_qualification || null,
          specialization: specialization || null,
          university_name: university_name || null,
          graduation_year: graduation_year || null,
          years_of_experience: years_of_experience || null,
          internal_notes: internal_notes || null,
          force_pwd: force_password_change,
          createdBy: req.user.id,
        },
        transaction: t,
      });

      user = {
        ...createdUser,
        role: normalizeUserRole(createdUser.role),
      };

      if (resolvedPermissionNames.length > 0) {
        if (!ADMIN_ROLES.includes(req.user.role)) {
          const { loadUserPermissions } = require('../middlewares/checkPermission');
          const callerPerms = await loadUserPermissions(req.user.id);
          const forbidden = resolvedPermissionNames.filter(p => !callerPerms.has(p));
          if (forbidden.length > 0) {
            throw Object.assign(new Error(`Cannot grant permissions you don't have: ${forbidden.join(', ')}`), { status: 403 });
          }
        }

        const [perms] = await sequelize.query(
          `SELECT id, name FROM permissions WHERE name IN (:names);`,
          { replacements: { names: resolvedPermissionNames }, transaction: t }
        );

        if (perms.length > 0) {
          await sequelize.getQueryInterface().bulkInsert('user_permissions',
            perms.map(p => ({
              user_id       : user.id,
              permission_id : p.id,
              granted_by    : req.user.id,
              granted_at    : new Date(),
            })),
            { ignoreDuplicates: true, transaction: t }
          );
        }
      }
    });

    // Audit log
    await audit('users', user.id, [
      { field: 'created', oldValue: null, newValue: `${name} (${role})` },
      { field: 'permissions', oldValue: null, newValue: resolvedPermissionNames.join(',') || 'none' },
    ], req);

    return res.ok(
      {
        user,
        ...(auto_password || !password ? { generated_password: rawPassword } : {}),
        permissions_assigned: resolvedPermissionNames.length,
      },
      'User created successfully.',
      201
    );
  } catch (err) {
    if (
      err?.message?.includes('enum_users_role') ||
      err?.message?.includes('invalid input value for enum')
    ) {
      return res.fail(
        'The database user role list could not be synchronized. Run the latest backend migrations, then try again.',
        [err.message],
        500
      );
    }
    next(err);
  }
};

// ── GET /api/admin/users/:id ───────────────────────────────────────────────
exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[user]] = await sequelize.query(`
      SELECT u.*, creator.name AS created_by_name
      FROM users u
      LEFT JOIN users creator ON creator.id = u.created_by
      WHERE u.id = :id AND u.school_id = :schoolId AND u.is_deleted = false;
    `, { replacements: { id, schoolId: req.user.school_id } });

    if (!user) return res.fail('User not found.', [], 404);

    const [userPerms] = await sequelize.query(`
      SELECT p.name, p.display_name, p.category
      FROM user_permissions up
      JOIN permissions p ON p.id = up.permission_id
      WHERE up.user_id = :userId
      ORDER BY p.category, p.name;
    `, { replacements: { userId: id } });

    return res.ok({
      ...user,
      role: normalizeUserRole(user.role),
      permission_names: userPerms.map(p => p.name),
      permissions: userPerms,
    });
  } catch (err) { next(err); }
};

// ── PATCH /api/admin/users/:id ────────────────────────────────────────────
exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason, ...updateData } = req.body;

    const [[user]] = await sequelize.query(
      `SELECT * FROM users WHERE id = :id AND school_id = :schoolId AND is_deleted = false;`,
      { replacements: { id, schoolId: req.user.school_id } }
    );
    if (!user) return res.fail('User not found.', [], 404);
    if (!canManage(req.user, user.role)) return res.fail('Cannot manage this user.', [], 403);

    const allowed = ['name','phone','department','designation','joining_date','date_of_birth','gender','address','employee_id','highest_qualification','specialization','university_name','graduation_year','years_of_experience','internal_notes','force_password_change'];
    const sets    = Object.keys(updateData).filter(k => allowed.includes(k) && updateData[k] !== undefined);
    if (!sets.length) return res.fail('No valid fields to update.', []);

    const setClauses = sets.map(k => `${k} = :${k}`).join(', ');
    await sequelize.query(
      `UPDATE users SET ${setClauses}, updated_at = NOW() WHERE id = :id;`,
      { replacements: { ...updateData, id } }
    );

    const changes = sets.map(k => ({ field: k, oldValue: user[k], newValue: updateData[k] }));
    await audit('users', id, changes, req);

    return res.ok({}, 'User updated successfully.');
  } catch (err) { next(err); }
};

// ── DELETE /api/admin/users/:id — soft delete ─────────────────────────────
exports.remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[user]] = await sequelize.query(
      `SELECT * FROM users WHERE id = :id AND school_id = :schoolId AND is_deleted = false;`,
      { replacements: { id, schoolId: req.user.school_id } }
    );
    if (!user) return res.fail('User not found.', [], 404);
    if (!canManage(req.user, user.role)) return res.fail('Cannot delete this user.', [], 403);
    if (parseInt(id) === req.user.id) return res.fail('Cannot delete your own account.', [], 400);

    await sequelize.query(`
      UPDATE users SET is_deleted = true, is_active = false,
        deleted_by = :by, deleted_at = NOW(), updated_at = NOW()
      WHERE id = :id;
    `, { replacements: { by: req.user.id, id } });

    await audit('users', id, [{ field: 'is_deleted', oldValue: false, newValue: true }], req);

    return res.ok({}, 'User deactivated and deleted.');
  } catch (err) { next(err); }
};

// ── PATCH /api/admin/users/:id/status ────────────────────────────────────
exports.toggleStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[user]] = await sequelize.query(
      `SELECT id, name, role, is_active FROM users WHERE id = :id AND school_id = :schoolId AND is_deleted = false;`,
      { replacements: { id, schoolId: req.user.school_id } }
    );
    if (!user) return res.fail('User not found.', [], 404);
    if (!canManage(req.user, user.role)) return res.fail('Cannot change this user\'s status.', [], 403);
    if (parseInt(id) === req.user.id) return res.fail('Cannot deactivate your own account.', [], 400);

    const newStatus = !user.is_active;
    await sequelize.query(
      `UPDATE users SET is_active = :status, updated_at = NOW() WHERE id = :id;`,
      { replacements: { status: newStatus, id } }
    );

    await audit('users', id, [{ field: 'is_active', oldValue: user.is_active, newValue: newStatus }], req);

    return res.ok({ is_active: newStatus }, `User ${newStatus ? 'activated' : 'deactivated'}.`);
  } catch (err) { next(err); }
};

// ── PATCH /api/admin/users/:id/permissions ────────────────────────────────
exports.updatePermissions = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { permission_names = [] } = req.body;

    const [[user]] = await sequelize.query(
      `SELECT id, role FROM users WHERE id = :id AND school_id = :schoolId AND is_deleted = false;`,
      { replacements: { id, schoolId: req.user.school_id } }
    );
    if (!user) return res.fail('User not found.', [], 404);

    // Cannot grant what you don't have (unless admin)
    if (!ADMIN_ROLES.includes(req.user.role)) {
      const { loadUserPermissions } = require('../middlewares/checkPermission');
      const callerPerms = await loadUserPermissions(req.user.id);
      const forbidden   = permission_names.filter(p => !callerPerms.has(p));
      if (forbidden.length > 0) {
        return res.fail(`Cannot grant permissions you don't have: ${forbidden.join(', ')}`, [], 403);
      }
    }

    await sequelize.transaction(async t => {
      // Remove all existing permissions
      await sequelize.query(
        `DELETE FROM user_permissions WHERE user_id = :userId;`,
        { replacements: { userId: id }, transaction: t }
      );

      if (permission_names.length > 0) {
        const [perms] = await sequelize.query(
          `SELECT id, name FROM permissions WHERE name IN (:names);`,
          { replacements: { names: permission_names }, transaction: t }
        );

        if (perms.length > 0) {
          await sequelize.getQueryInterface().bulkInsert('user_permissions',
            perms.map(p => ({
              user_id: id, permission_id: p.id,
              granted_by: req.user.id, granted_at: new Date(),
            })),
            { ignoreDuplicates: true, transaction: t }
          );
        }
      }
    });

    // Clear permission cache for this user
    clearPermissionCache(parseInt(id));

    await audit('users', id, [{
      field    : 'permissions',
      oldValue : 'previous',
      newValue : permission_names.join(', ') || 'none',
      reason   : `Permissions updated by ${req.user.name}`,
    }], req);

    return res.ok({ permissions_set: permission_names.length }, 'Permissions updated successfully.');
  } catch (err) { next(err); }
};

// ── POST /api/admin/users/:id/reset-password ──────────────────────────────
exports.resetPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { new_password, force_change = true } = req.body;

    const [[user]] = await sequelize.query(
      `SELECT id, email, role FROM users WHERE id = :id AND school_id = :schoolId AND is_deleted = false;`,
      { replacements: { id, schoolId: req.user.school_id } }
    );
    if (!user) return res.fail('User not found.', [], 404);
    if (!canManage(req.user, user.role)) return res.fail('Cannot reset this user\'s password.', [], 403);

    const raw  = new_password || crypto.randomBytes(8).toString('hex');
    const hash = await bcrypt.hash(raw, 12);

    await sequelize.query(`
      UPDATE users SET password_hash = :hash, force_password_change = :force,
        last_password_change = NOW(), updated_at = NOW()
      WHERE id = :id;
    `, { replacements: { hash, force: force_change, id } });

    await audit('users', id, [{ field: 'password_reset', oldValue: null, newValue: 'reset by admin' }], req);

    return res.ok(
      { ...(new_password ? {} : { generated_password: raw }), email: user.email },
      'Password reset successfully.'
    );
  } catch (err) { next(err); }
};

// ── GET /api/admin/users/:id/audit ────────────────────────────────────────
exports.getUserAudit = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [logs] = await sequelize.query(`
      SELECT al.*, u.name AS changed_by_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.changed_by
      WHERE al.record_id = :id AND al.table_name = 'users'
      ORDER BY al.created_at DESC
      LIMIT :limit OFFSET :offset;
    `, { replacements: { id, limit: parseInt(limit), offset } });

    return res.ok({ logs, userId: id });
  } catch (err) { next(err); }
};

// ── GET /import/template ──────────────────────────────────────────────────
exports.downloadImportTemplate = async (req, res, next) => {
  // Return JSON schema for the template (frontend generates Excel)
  return res.ok({
    columns: [
      { key: 'first_name',   label: 'First Name *',   example: 'Priya'                },
      { key: 'last_name',    label: 'Last Name *',    example: 'Sharma'               },
      { key: 'email',        label: 'Email *',        example: 'priya@school.edu.in'  },
      { key: 'role',         label: 'Role *',         example: 'teacher'              },
      { key: 'phone',        label: 'Phone',          example: '9876543210'           },
      { key: 'employee_id',  label: 'Employee ID',    example: 'TCH-001'              },
      { key: 'department',   label: 'Department',     example: 'Science'              },
      { key: 'designation',  label: 'Designation',    example: 'Senior Teacher'       },
    ],
    valid_roles: ['admin', 'accountant'],
    notes: [
      'All fields marked * are required.',
      'Email must be unique across the system.',
      'Passwords will be auto-generated and emailed.',
    ],
  });
};

// ── POST /import/preview ──────────────────────────────────────────────────
exports.previewImport = async (req, res, next) => {
  try {
    const { rows = [] } = req.body; // Array of row objects from parsed Excel
    const schoolId = req.user.school_id;

    const results = [];
    const emails  = new Set();

    for (let i = 0; i < rows.length; i++) {
      const row    = rows[i];
      const rowNum = i + 2; // Row 1 is header
      const errors = [];

      if (!row.first_name?.trim()) errors.push('First name is required');
      if (!row.last_name?.trim())  errors.push('Last name is required');
      if (!row.email?.trim())      errors.push('Email is required');
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push('Invalid email format');
      else {
        // Check for duplicates within the file
        if (emails.has(row.email.toLowerCase())) {
          errors.push('Duplicate email in file');
        } else {
          emails.add(row.email.toLowerCase());
          // Check against database
          const [[ex]] = await sequelize.query(
            `SELECT id FROM users WHERE email = :email AND is_deleted = false LIMIT 1;`,
            { replacements: { email: row.email.trim().toLowerCase() } }
          );
          if (ex) errors.push('Email already exists in system');
        }
      }

      const validRoles = ['admin', 'accountant'];
      if (!row.role?.trim()) errors.push('Role is required');
      else if (!validRoles.includes(row.role.trim().toLowerCase())) {
        errors.push(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
      }

      results.push({
        row_number : rowNum,
        data       : row,
        errors,
        is_valid   : errors.length === 0,
      });
    }

    const validCount   = results.filter(r => r.is_valid).length;
    const invalidCount = results.filter(r => !r.is_valid).length;

    return res.ok({
      results,
      summary: { total: rows.length, valid: validCount, invalid: invalidCount },
    });
  } catch (err) { next(err); }
};

// ── POST /import/confirm ──────────────────────────────────────────────────
exports.confirmImport = async (req, res, next) => {
  try {
    const { rows = [] } = req.body; // Only valid rows from preview
    const schoolId = req.user.school_id;

    // Create import log
    const [[log]] = await sequelize.query(`
      INSERT INTO bulk_import_logs
        (school_id, import_type, total_rows, success_count, failed_count, status, imported_by, created_at, updated_at)
      VALUES (:schoolId, 'users', :total, 0, 0, 'processing', :by, NOW(), NOW())
      RETURNING id;
    `, { replacements: { schoolId, total: rows.length, by: req.user.id } });

    const jobId = log.id;

    // Process async (fire and forget with status tracking)
    setImmediate(async () => {
      let success = 0; const errors = [];

      for (const row of rows) {
        try {
          const normalizedRole = row.role.trim().toLowerCase();
          const resolvedPermissionNames = resolvePermissionNamesForRole(normalizedRole);
          const raw  = crypto.randomBytes(8).toString('hex');
          const hash = await bcrypt.hash(raw, 12);
          const name = `${row.first_name.trim()} ${row.last_name.trim()}`;

          await ensureUserRoleEnumValue(normalizedRole);
          const [[createdUser]] = await sequelize.query(`
            INSERT INTO users
              (school_id, name, email, password_hash, role, phone, employee_id,
               department, designation, is_active, force_password_change,
               created_by, created_at, updated_at)
            VALUES
              (:schoolId, :name, :email, :hash, :role, :phone, :emp_id,
               :dept, :desig, true, true, :by, NOW(), NOW());
            RETURNING id;
          `, {
            replacements: {
              schoolId, name, email: row.email.trim().toLowerCase(),
              hash, role: normalizedRole,
              phone: row.phone || null, emp_id: row.employee_id || null,
              dept: row.department || null, desig: row.designation || null,
              by: req.user.id,
            },
          });

          if (resolvedPermissionNames.length > 0) {
            const [perms] = await sequelize.query(
              `SELECT id FROM permissions WHERE name IN (:names);`,
              { replacements: { names: resolvedPermissionNames } }
            );

            if (perms.length > 0) {
              await sequelize.getQueryInterface().bulkInsert('user_permissions',
                perms.map((permission) => ({
                  user_id: createdUser.id,
                  permission_id: permission.id,
                  granted_by: req.user.id,
                  granted_at: new Date(),
                })),
                { ignoreDuplicates: true }
              );
            }
          }

          success++;
        } catch (e) {
          errors.push({ email: row.email, error: e.message });
        }
      }

      await sequelize.query(`
        UPDATE bulk_import_logs SET
          success_count = :success,
          failed_count  = :failed,
          error_details = :errors,
          status        = 'completed',
          updated_at    = NOW()
        WHERE id = :id;
      `, {
        replacements: {
          success, failed: rows.length - success,
          errors: JSON.stringify(errors), id: jobId,
        },
      });
    });

    return res.ok({ job_id: jobId, message: 'Import started.' });
  } catch (err) { next(err); }
};

// ── GET /import/:jobId/status ─────────────────────────────────────────────
exports.importStatus = async (req, res, next) => {
  try {
    const { jobId } = req.params;

    const [[log]] = await sequelize.query(
      `SELECT * FROM bulk_import_logs WHERE id = :id AND school_id = :schoolId;`,
      { replacements: { id: jobId, schoolId: req.user.school_id } }
    );

    if (!log) return res.fail('Import job not found.', [], 404);

    return res.ok(log);
  } catch (err) { next(err); }
};
