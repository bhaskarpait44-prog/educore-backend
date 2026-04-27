'use strict';

/**
 * EduCore — Subject Seeds
 * Classes 1–10 : 6 theory subjects each
 * Classes 11–12: 6 subjects — 3 PCB with theory+practical, 3 theory-only
 *
 * Marks convention
 *   theory   : total=100, pass=33   | combined = 100, pass = 33
 *   practical: total=30,  pass=11   (added on top for 'both')
 *   both     : theory 70/23 + prac 30/11 → combined 100/34
 */

// ─── helpers ────────────────────────────────────────────────────────────────

const theory = (overrides = {}) => ({
  subject_type           : 'theory',
  is_core                : true,
  theory_total_marks     : 100,
  theory_passing_marks   : 33,
  practical_total_marks  : null,
  practical_passing_marks: null,
  combined_total_marks   : 100,
  combined_passing_marks : 33,
  ...overrides,
});

const practical = (overrides = {}) => ({
  subject_type           : 'practical',
  is_core                : true,
  theory_total_marks     : null,
  theory_passing_marks   : null,
  practical_total_marks  : 100,
  practical_passing_marks: 33,
  combined_total_marks   : 100,
  combined_passing_marks : 33,
  ...overrides,
});

// theory 70 + practical 30 = combined 100
const both = (overrides = {}) => ({
  subject_type           : 'both',
  is_core                : true,
  theory_total_marks     : 70,
  theory_passing_marks   : 23,
  practical_total_marks  : 30,
  practical_passing_marks: 11,
  combined_total_marks   : 100,
  combined_passing_marks : 34,
  ...overrides,
});

const ts = new Date().toISOString();

// Build a flat subject row
function row(classId, order, name, code, typeBuilder, extra = {}) {
  return {
    class_id    : classId,
    order_number: order,
    name,
    code,
    description : null,
    is_active   : true,
    is_deleted  : false,
    created_by  : null,
    updated_by  : null,
    created_at  : ts,
    updated_at  : ts,
    ...typeBuilder(extra),
  };
}

// ─── subject definitions per class ──────────────────────────────────────────

function buildSubjects(classId) {
  const c = classId; // shorthand for code prefix

  // Class 1–5: primary
  if (c >= 1 && c <= 5) {
    return [
      row(c, 1, 'English',              `ENG-${c}`,  theory),
      row(c, 2, 'Hindi',                `HIN-${c}`,  theory),
      row(c, 3, 'Mathematics',          `MATH-${c}`, theory),
      row(c, 4, 'Environmental Studies',`EVS-${c}`,  theory),
      row(c, 5, 'General Knowledge',    `GK-${c}`,   theory, { is_core: false }),
      row(c, 6, 'Drawing & Art',        `ART-${c}`,  theory, { is_core: false }),
    ];
  }

  // Class 6–8: middle school
  if (c >= 6 && c <= 8) {
    return [
      row(c, 1, 'English',     `ENG-${c}`,  theory),
      row(c, 2, 'Hindi',       `HIN-${c}`,  theory),
      row(c, 3, 'Mathematics', `MATH-${c}`, theory),
      row(c, 4, 'Science',     `SCI-${c}`,  theory),
      row(c, 5, 'Social Studies', `SST-${c}`, theory),
      row(c, 6, 'Sanskrit',    `SKT-${c}`,  theory, { is_core: false }),
    ];
  }

  // Class 9–10: secondary
  if (c >= 9 && c <= 10) {
    return [
      row(c, 1, 'English',     `ENG-${c}`,  theory),
      row(c, 2, 'Hindi',       `HIN-${c}`,  theory),
      row(c, 3, 'Mathematics', `MATH-${c}`, theory),
      row(c, 4, 'Science',     `SCI-${c}`,  theory),
      row(c, 5, 'Social Science', `SST-${c}`, theory),
      row(c, 6, 'Sanskrit',    `SKT-${c}`,  theory, { is_core: false }),
    ];
  }

  // Class 11–12: higher secondary — PCB stream
  // Physics, Chemistry, Biology → theory+practical (both)
  // English, Math, Computer Science → theory only
  if (c >= 11 && c <= 12) {
    return [
      row(c, 1, 'Physics',           `PHY-${c}`,  both),
      row(c, 2, 'Chemistry',         `CHEM-${c}`, both),
      row(c, 3, 'Biology',           `BIO-${c}`,  both),
      row(c, 4, 'English',           `ENG-${c}`,  theory),
      row(c, 5, 'Mathematics',       `MATH-${c}`, theory, { is_core: false }),
      row(c, 6, 'Computer Science',  `CS-${c}`,   theory, { is_core: false }),
    ];
  }

  return [];
}

// ─── seeder ─────────────────────────────────────────────────────────────────

module.exports = {
  async up(queryInterface) {
    const allSubjects = [];

    for (let classId = 1; classId <= 12; classId++) {
      allSubjects.push(...buildSubjects(classId));
    }

    await queryInterface.bulkInsert('subjects', allSubjects, {});
  },

  async down(queryInterface) {
    // Remove only the seeded codes, leaves any manually created subjects intact
    const codes = [];
    for (let c = 1; c <= 12; c++) {
      codes.push(
        `ENG-${c}`, `HIN-${c}`, `MATH-${c}`,
        `EVS-${c}`, `GK-${c}`,  `ART-${c}`,
        `SCI-${c}`, `SST-${c}`, `SKT-${c}`,
        `PHY-${c}`, `CHEM-${c}`,`BIO-${c}`, `CS-${c}`,
      );
    }

    await queryInterface.bulkDelete(
      'subjects',
      { code: codes },
      {},
    );
  },
};