import { chromium } from 'playwright';
import fs from 'node:fs';
import { PROFILE_DIR, DATA_DIR, LOGIN_URL, USER_AGENT } from './config.js';
import { saveAuthState } from './scraper.js';

/**
 * Manual interactive login — an optional fallback to the automatic credential
 * login in scraper.js (`autoLogin`). Opens a real (headed) browser so you can
 * sign in yourself. Once you reach the post-login dashboard, the full storage
 * state (incl. the session cookie) is saved to AUTH_FILE and reused by the
 * headless checker. Useful if you'd rather not store your password in .env.
 */
async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  console.log('Opening edugate login… sign in to continue.');
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1366, height: 900 },
    userAgent: USER_AGENT,
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 120_000 });

  console.log('Waiting for you to finish logging in (up to 5 minutes)…');
  try {
    // Poll until the browser is on an authenticated student page. We require BOTH
    // a student URL and the absence of a "دخول" (login) link, so a transient
    // redirect through homeIndex.faces can't be mistaken for success.
    const start = Date.now();
    let authed = false;
    while (Date.now() - start < 300_000) {
      if (await isAuthenticated(page)) {
        authed = true;
        break;
      }
      await page.waitForTimeout(2000);
    }
    if (!authed) {
      console.error('⌛ Timed out waiting for a completed login. Re-run `npm run login`.');
      return;
    }

    // Settle, then capture the FULL storage state — this includes the JSESSIONID
    // session cookie that the persistent profile would otherwise drop on close.
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    await saveAuthState(context);
    console.log(`✅ Login confirmed (now at ${page.url()}).`);
    console.log('   Session saved.');
    console.log('   TIP: navigate to "نتائج المقررات" now and copy its URL into');
    console.log('   RESULTS_URL in your .env for a faster, more reliable scrape.');
    console.log('   You can now run: npm start');
  } finally {
    await context.close();
  }
}

/**
 * True only when the page is a logged-in student page: a student URL, not the
 * guest home / login / IAM, and with no visible "دخول" (login) link.
 */
async function isAuthenticated(page) {
  const url = page.url();
  const onStudentArea = /\/ui\/student\//i.test(url);
  const onUnauthPage =
    /\/ksu\/(init|login)/i.test(url) ||
    /iam\.ksu\.edu\.sa/i.test(url) ||
    /\/ui\/home\.faces/i.test(url) ||
    /\/ui\/guest\//i.test(url);
  if (!onStudentArea || onUnauthPage) return false;
  const loginLinks = await page.getByText('دخول', { exact: false }).count().catch(() => 0);
  return loginLinks === 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
