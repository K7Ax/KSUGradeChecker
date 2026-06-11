import './ensure-env.js'; // creates .env from .env.example on first run
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const PROFILE_DIR = path.join(DATA_DIR, 'browser-profile');
export const STATE_FILE = path.join(DATA_DIR, 'state.json');
// Saved Playwright storage state (cookies incl. the JSESSIONID session cookie).
export const AUTH_FILE = path.join(DATA_DIR, 'auth.json');

export const LOGIN_URL = 'https://edugate.ksu.edu.sa/ksu/init';
// Authenticated landing page (where login lands you). Used as the scrape entry
// point so we don't bounce off the pre-auth /ksu/init login bootstrap.
export const HOME_URL = 'https://edugate.ksu.edu.sa/ksu/ui/student/homeIndex.faces';

// Consistent desktop UA for both login and scrape so the portal doesn't reject
// the headless session (default headless UA contains "HeadlessChrome").
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Optional direct URL to the results page (discovered after first login).
// If empty, the scraper navigates via the "نتائج المقررات" menu link.
export const RESULTS_URL = process.env.RESULTS_URL?.trim() || '';

export const BOT_TOKEN = process.env.BOT_TOKEN?.trim() || '';
export const CHAT_ID = process.env.CHAT_ID?.trim() || '';
export const POLL_MS = Number(process.env.POLL_MS) || 600_000;

// edugate credentials for unattended auto-login (no 2FA on this account).
export const EDUGATE_USERNAME = process.env.EDUGATE_USERNAME?.trim() || '';
export const EDUGATE_PASSWORD = process.env.EDUGATE_PASSWORD || '';
export const HAS_CREDENTIALS = Boolean(EDUGATE_USERNAME && EDUGATE_PASSWORD);

export function assertRuntimeConfig() {
  // Only BOT_TOKEN is truly required up front. CHAT_ID is auto-linked the first
  // time you send /start to the bot, so users never have to copy it by hand.
  if (!BOT_TOKEN) {
    throw new Error(
      'Missing BOT_TOKEN. Open the ".env" file, paste your bot token from @BotFather, then run: npm start',
    );
  }
}
