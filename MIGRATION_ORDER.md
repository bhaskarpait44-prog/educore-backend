# Backend Migration Order

This backend now supports a clean database reset using the normal Sequelize CLI
ordering by filename.

## Commands

Run from `backend/`:

```powershell
npm run db:migrate
npm run db:seed:all
```

## Canonical migration flow

Sequelize applies migrations in lexical filename order. The intended canonical
schema chain is:

1. `20240001-create-schools.js`
2. `20240002-create-sessions.js`
3. `20240003-create-session-working-days.js`
4. `20240004-create-session-holidays.js`
5. `20240005-create-students.js`
6. `20240005-create-users.js`
7. `20240006-create-classes.js`
8. `20240006-create-student-biometrics.js`
9. `20240007-create-audit-logs.js`
10. `20240007-create-sections.js`
11. `20240008-create-student-audit-trigger.js`
12. `20240008-create-subjects.js`
13. `20240009-create-student-profiles.js`
14. `20240011-create-enrollments.js`
15. `20240012-create-attendance.js`
16. `20240013-create-exams.js`
17. `20240014-create-exam-results.js`
18. `20240015-create-student-results.js`
19. `20240016-create-fee-structures.js`
20. `20240017-create-fee-invoices.js`
21. `20240018-create-fee-payments.js`
22. `20240022-add-class-display-name.js`
23. `20240023-add-all-missing-class-columns.js`
24. `20240024-add-is-deleted-to-sections-subjects.js`
25. `20240025-add-all-missing-columns.js`
26. `20260420000001-add-missing-subject-columns.js`
27. `20260420000002-add-missing-subject-audit-columns.js`
28. `20260420000003-add-missing-class-audit-columns.js`
29. `20260420000004-make-class-unique-indexes-ignore-deleted.js`
30. `20260420000005-make-subject-unique-indexes-ignore-deleted.js`
31. `20260420000006-make-legacy-subject-marks-nullable.js`
32. `2026042101-add-columns-to-users.js`
33. `2026042102-create-permissions.js`
34. `2026042103-create-user-permissions.js`
35. `2026042104-create-permission-templates.js`
36. `2026042105-create-bulk-import-logs.js`
37. `2026042106-create-fee-reminders.js`
38. `2026042107-create-student-remarks.js`
39. `2026042108-create-homework.js`
40. `2026042109-create-homework-submissions.js`
41. `2026042110-create-teacher-leaves.js`
42. `20260421110000-add-theory-practical-to-exam-results.js`
43. `2026042111-create-leave-balances.js`
44. `2026042112-create-timetable-slots.js`
45. `2026042113-create-teacher-assignments.js`
46. `2026042114-create-teacher-notices.js`
47. `2026042115-create-teacher-notice-reads.js`
48. `2026042116-create-profile-correction-requests.js`
49. `2026042117-add-education-fields-to-users.js`
50. `2026042118-create-student-achievements.js`
51. `2026042119-create-study-materials.js`
52. `2026042120-create-material-views.js`
53. `2026042121-create-notice-pins.js`
54. `2026042122-add-auth-columns-to-students.js`
55. `2026042123-create-student-notice-reads.js`
56. `2026042124-create-student-correction-requests.js`
57. `20260422000001-create-student-subjects.js`
58. `20260422000002-create-cheque-payments.js`
59. `20260422000003-create-fee-refunds.js`
60. `20260422000004-create-fee-carry-forwards.js`
61. `20260422000005-create-collection-targets.js`
62. `20260422000006-add-accountant-columns-to-fee-invoices.js`
63. `20260423000001-ensure-user-role-enum-values.js`
64. `20260426000100-create-chat-conversations-and-messages.js`

## Legacy duplicate migrations

The following migration files are intentionally kept as no-op historical
markers so older environments with them in `SequelizeMeta` remain compatible:

- `20240009-create-students.js`
- `20240010-create-student-profiles.js`
- `20240019-create-student-biometrics.js`
- `20240020-create-audit-logs.js`
- `20240021-create-student-audit-trigger.js`
- `20260414082522-create-schools.js`
- `20260414082525-create-sessions.js`
- `20260414082529-create-session-working-days.js`
- `20260414082533-create-session-holidays.js`

## Canonical seed flow

These are the main demo seeders for a fresh DB:

1. `20240001-demo-school-and-sessions.js`
2. `20240002-admin-user.js`
3. `20240002-demo-students.js`
4. `20240003-demo-student-profiles.js`
5. `20240005-demo-classes-sections-enrollments.js`
6. `20240006-demo-attendance.js`
7. `20240007-demo-fee-structures.js`
8. `20240008-demo-exams-results.js`
9. `20240009-demo-permissions.js`

The following seeders are intentionally retained as no-op historical markers:

- `20240003-demo-students.js`
- `20240004-demo-student-profiles.js`
- `20260414082632-demo-school-and-sessions.js`
