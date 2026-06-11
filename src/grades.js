import { InlineKeyboard } from 'grammy';

// Canonical KSU letter-grade scale, best → worst.
export const LETTER_GRADES = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F'];

// Map of raw cell text (Arabic or English variants) → canonical letter grade.
// KSU report cards usually show Latin letters already, but we normalize anyway.
const GRADE_ALIASES = {
  'A+': 'A+', 'أ+': 'A+', 'A': 'A', 'أ': 'A',
  'B+': 'B+', 'ب+': 'B+', 'B': 'B', 'ب': 'B',
  'C+': 'C+', 'ج+': 'C+', 'C': 'C', 'ج': 'C',
  'D+': 'D+', 'د+': 'D+', 'D': 'D', 'د': 'D',
  'F': 'F', 'هـ': 'F', 'ه': 'F',
};

// Non-letter statuses that should be reported but NOT turned into a guessing game.
const NON_LETTER = new Set(['عذر', 'مستمر', 'ل', 'غير مكتمل', 'IC', 'IP', 'NP', 'NF', 'W']);

/**
 * Normalize a raw grade cell into a canonical letter grade, a passthrough
 * status string, or null if the cell is empty / not yet graded.
 * Returns { letter } for letter grades or { status } for non-letter statuses.
 */
export function normalizeGrade(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const upper = text.toUpperCase().replace(/\s+/g, '');
  if (GRADE_ALIASES[upper]) return { letter: GRADE_ALIASES[upper] };
  if (GRADE_ALIASES[text]) return { letter: GRADE_ALIASES[text] };

  if (NON_LETTER.has(text) || NON_LETTER.has(upper)) return { status: text };

  // Unknown but non-empty: surface it as a status so we never silently drop a result.
  return { status: text };
}

export function isLetterGrade(value) {
  return LETTER_GRADES.includes(value);
}

/**
 * Build the inline keyboard for a guessing game: grade buttons in a grid plus a
 * final "Show me now!" row. callback_data is `<gameId>:<payload>`.
 */
export function buildGameKeyboard(gameId) {
  const kb = new InlineKeyboard();
  LETTER_GRADES.forEach((g, i) => {
    kb.text(g, `${gameId}:${g}`);
    // 3 buttons per row.
    if ((i + 1) % 3 === 0) kb.row();
  });
  kb.row();
  kb.text('👀 Show me now!', `${gameId}:__SHOW__`);
  return kb;
}
