import fs from 'node:fs';
import { chromium } from 'playwright';
import {
  AUTH_FILE,
  HOME_URL,
  LOGIN_URL,
  RESULTS_URL,
  USER_AGENT,
  EDUGATE_USERNAME,
  EDUGATE_PASSWORD,
  HAS_CREDENTIALS,
} from './config.js';
import { normalizeGrade, LETTER_GRADES } from './grades.js';

export class SessionExpiredError extends Error {
  constructor(message = 'edugate session expired — run `npm run login`') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

// Cap the browser launch so a stuck launch fails fast instead of leaking a
// half-spawned Chrome for the full 180s default (which previously snowballed
// into resource starvation as orphans piled up).
const LAUNCH_TIMEOUT_MS = 60_000;

/**
 * Load and validate the saved Playwright storage state. A missing, empty, or
 * unparseable auth.json is treated as an expired session so the caller's
 * auto-login recovery kicks in instead of dead-looping on a generic error.
 * (An interrupted storageState write can truncate the file to 0 bytes.)
 * @returns {object} parsed storage-state object.
 * @throws {SessionExpiredError} when no usable session is on disk.
 */
function loadAuthState() {
  let raw;
  try {
    raw = fs.readFileSync(AUTH_FILE, 'utf8');
  } catch {
    throw new SessionExpiredError('no saved session — run `npm run login`');
  }
  if (!raw.trim()) {
    throw new SessionExpiredError('saved session is empty — re-authenticating');
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new SessionExpiredError('saved session is corrupt — re-authenticating');
  }
}

/**
 * Persist the context's storage state atomically: write to a temp file then
 * rename over AUTH_FILE. rename is atomic on the same volume, so a crash or kill
 * mid-write can never leave a truncated (0-byte) auth.json behind.
 */
export async function saveAuthState(context) {
  const state = await context.storageState();
  const tmp = `${AUTH_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, AUTH_FILE);
}

const RESULTS_LINK_TEXT = 'نتائج المقررات';
// The grades grid; ":" must be escaped for a CSS id selector.
const RESULTS_TABLE_SELECTOR = '#myForm\\:courseTable';

// Unauthenticated edugate bounces you to the login bootstrap, the IAM SSO, or
// the GUEST home page (/ui/home.faces — distinct from the student
// /ui/student/homeIndex.faces). Any of these means the session is dead.
function looksLikeLogin(url) {
  return (
    /\/ksu\/(init|login)/i.test(url) ||
    /iam\.ksu\.edu\.sa/i.test(url) ||
    /\/ui\/home\.faces/i.test(url)
  );
}

/**
 * Thrown when auto-login fails (e.g. bad credentials). Distinct from a merely
 * expired session so the caller can stop retrying to avoid account lockout.
 */
export class LoginFailedError extends Error {
  constructor(message = 'auto-login failed — check EDUGATE_USERNAME / EDUGATE_PASSWORD') {
    super(message);
    this.name = 'LoginFailedError';
  }
}

/**
 * Unattended login with stored credentials (this account has no 2FA/captcha).
 * Fills #username/#password, clicks #loginButton, waits for the student area,
 * and saves the fresh session to AUTH_FILE.
 * @returns {Promise<boolean>} true on success.
 * @throws {LoginFailedError} on bad credentials / failure to reach student area.
 */
export async function autoLogin({ headless = true } = {}) {
  if (!HAS_CREDENTIALS) {
    throw new LoginFailedError('no credentials set (EDUGATE_USERNAME / EDUGATE_PASSWORD)');
  }
  const browser = await chromium.launch({ headless, timeout: LAUNCH_TIMEOUT_MS });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent: USER_AGENT,
  });
  try {
    const page = await context.newPage();
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.fill('#username', EDUGATE_USERNAME);
    await page.fill('#password', EDUGATE_PASSWORD);
    await page.click('#loginButton');

    // Poll until we land on an authenticated student page.
    const start = Date.now();
    while (Date.now() - start < 45_000) {
      await page.waitForTimeout(1000);
      const url = page.url();
      if (/\/ui\/student\//i.test(url) && !looksLikeLogin(url)) {
        await saveAuthState(context);
        return true;
      }
    }
    throw new LoginFailedError('did not reach the student area (wrong credentials or portal changed)');
  } finally {
    await browser.close();
  }
}

/**
 * Open the persistent (already-authenticated) context headlessly, navigate to
 * the course-results page, parse it, and return results.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.headless=true]
 * @param {boolean} [opts.dumpHtml=false] - return raw table HTML for debugging.
 * @returns {Promise<{results: Array, rawTables?: string[]}>}
 */
export async function scrape({ headless = true, dumpHtml = false } = {}) {
  // Throws SessionExpiredError if auth.json is missing, empty, or corrupt — so
  // checker.js recovers via auto-login instead of dead-looping on a raw error.
  const storageState = loadAuthState();

  const browser = await chromium.launch({ headless, timeout: LAUNCH_TIMEOUT_MS });
  const context = await browser.newContext({
    storageState,
    viewport: { width: 1366, height: 900 },
    userAgent: USER_AGENT,
  });
  try {
    const page = await context.newPage();

    // Navigate to results: prefer a known direct URL, else go to the portal and
    // click the "نتائج المقررات" menu link.
    if (RESULTS_URL) {
      await page.goto(RESULTS_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    } else {
      await page.goto(HOME_URL, { waitUntil: 'networkidle', timeout: 60_000 });
      if (looksLikeLogin(page.url())) throw new SessionExpiredError();
      const link = page.getByText(RESULTS_LINK_TEXT, { exact: false }).first();
      // Log the link's href so you can paste it into RESULTS_URL for reliability.
      const href = await link.getAttribute('href').catch(() => null);
      if (href) console.log('[scraper] results link →', href);
      await link.click({ timeout: 30_000 });
      await page.waitForLoadState('networkidle', { timeout: 60_000 });
    }

    if (looksLikeLogin(page.url())) throw new SessionExpiredError();

    // Refresh the saved session so any rotated cookies / extended expiry persist.
    await saveAuthState(context).catch(() => {});

    const term = detectTerm(await page.content());

    // Primary path: the KSU results grid has a stable id "myForm:courseTable"
    // with columns [رمز المقرر, اسم المقرر, التقدير] = [code, name, grade].
    const courseRows = await page
      .$$eval(`${RESULTS_TABLE_SELECTOR} tbody tr`, (trs) =>
        trs.map((tr) =>
          Array.from(tr.querySelectorAll('td')).map((td) =>
            (td.textContent || '').replace(/\s+/g, ' ').trim(),
          ),
        ),
      )
      .catch(() => []);

    let results = parseCourseRows(courseRows, term);

    // Fallback: if the grid id ever changes, scan every table heuristically.
    if (results.length === 0 && courseRows.length === 0) {
      const tables = await page.$$eval('table', (els) =>
        els.map((t) =>
          Array.from(t.querySelectorAll('tr')).map((tr) =>
            Array.from(tr.querySelectorAll('th,td')).map((c) =>
              (c.textContent || '').replace(/\s+/g, ' ').trim(),
            ),
          ),
        ),
      );
      results = parseResults(tables, term);
    }

    if (dumpHtml) {
      const rawTables = await page
        .$$eval(RESULTS_TABLE_SELECTOR, (els) => els.map((t) => t.outerHTML))
        .catch(() => []);
      return { results, rawTables };
    }
    return { results };
  } finally {
    await browser.close();
  }
}

const GRADE_TOKENS = new Set([
  ...LETTER_GRADES,
  'أ+', 'أ', 'ب+', 'ب', 'ج+', 'ج', 'د+', 'د', 'هـ', 'ه',
]);

/**
 * Parse rows from the KSU results grid (#myForm:courseTable).
 * Each row is [courseCode, courseName, gradeText]. Rows with an empty grade
 * cell are NOT yet posted, so they are skipped — they'll surface as "new" once a
 * grade appears.
 */
export function parseCourseRows(rows, term) {
  const out = [];
  for (const cells of rows) {
    if (cells.length < 3) continue;
    const courseCode = cells[0]?.trim();
    const courseName = cells[1]?.trim() || courseCode;
    const normalized = normalizeGrade(cells[2]);
    if (!courseCode || !normalized) continue; // no grade yet → skip
    out.push({
      term,
      courseCode,
      courseName,
      grade: normalized.letter ?? normalized.status,
      isLetter: Boolean(normalized.letter),
    });
  }
  return out;
}

// Detect the academic term/semester from a heading like "الفصل الأول 1446/1447".
function detectTerm(html) {
  const m = html.match(/14\d{2}\s*\/\s*14\d{2}/) || html.match(/20\d{2}\s*\/\s*20\d{2}/);
  return m ? m[0].replace(/\s+/g, '') : 'current';
}

// Course-code-like cell, e.g. "CSC 113", "ريض 244", "0901244".
function findCourseCode(cells) {
  return (
    cells.find((c) => /[A-Za-z؀-ۿ]{2,4}\s?-?\s?\d{2,4}/.test(c)) ||
    cells.find((c) => /^\d{4,7}$/.test(c)) ||
    ''
  );
}

/**
 * Heuristically extract course results from parsed tables.
 * A result row is one that contains a recognizable grade token; the longest
 * text cell is taken as the course name and a code-like cell as the course code.
 */
export function parseResults(tables, term) {
  const out = [];
  const seenKeys = new Set();

  for (const rows of tables) {
    for (const cells of rows) {
      if (cells.length < 2) continue;

      // The grade is the cell whose normalized form is a known token.
      let gradeCell = null;
      for (const c of cells) {
        const compact = c.toUpperCase().replace(/\s+/g, '');
        if (GRADE_TOKENS.has(compact) || GRADE_TOKENS.has(c)) {
          gradeCell = c;
          break;
        }
      }
      if (!gradeCell) continue;

      const normalized = normalizeGrade(gradeCell);
      if (!normalized) continue;

      const courseCode = findCourseCode(cells) || cells[0];
      const courseName =
        cells
          .filter((c) => c !== gradeCell && c !== courseCode)
          .sort((a, b) => b.length - a.length)[0] || courseCode;

      const key = `${term}|${courseCode}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      out.push({
        term,
        courseCode,
        courseName,
        grade: normalized.letter ?? normalized.status,
        isLetter: Boolean(normalized.letter),
      });
    }
  }
  return out;
}
