import { scrape, autoLogin, SessionExpiredError, LoginFailedError } from './scraper.js';
import { HAS_CREDENTIALS } from './config.js';
import { resultKey, isSeen, markSeen } from './store.js';

/**
 * Scrape once, recovering from an expired session by auto-logging in (this
 * account has no 2FA). Returns the parsed results, or null if it couldn't get a
 * session this cycle.
 *
 * @param {object} bot
 * @param {{expiryNotified:boolean, authDisabled:boolean}} flags
 */
async function scrapeWithRecovery(bot, flags) {
  try {
    return (await scrape()).results;
  } catch (err) {
    if (!(err instanceof SessionExpiredError)) {
      console.error('[checker] scrape failed:', err.message);
      return null;
    }
  }

  // Session expired. Auto-login if we have credentials and haven't been disabled
  // by a prior credential failure (avoids hammering → account lockout).
  if (!HAS_CREDENTIALS) {
    if (!flags.expiryNotified) {
      await bot.notifySessionExpired();
      flags.expiryNotified = true;
    }
    return null;
  }
  if (flags.authDisabled) return null;

  try {
    console.log('[checker] session expired — attempting auto-login…');
    await autoLogin();
    flags.expiryNotified = false;
    console.log('[checker] auto-login OK.');
    return (await scrape()).results;
  } catch (err) {
    if (err instanceof LoginFailedError) {
      // Likely bad credentials: stop auto-login for this run so we don't lock the
      // account, and tell the user to fix it.
      flags.authDisabled = true;
      await bot.notifyAuthFailed(err.message);
    } else {
      console.error('[checker] recovery scrape failed:', err.message);
    }
    return null;
  }
}

/**
 * Run one check: scrape (with auto-login recovery), diff against the store, and
 * start a guessing game for each newly posted result.
 */
export async function checkOnce(bot, flags = { expiryNotified: false, authDisabled: false }) {
  const results = await scrapeWithRecovery(bot, flags);
  if (!results) return;

  let newCount = 0;
  for (const result of results) {
    const key = resultKey(result);
    if (isSeen(key)) continue;
    try {
      await bot.startGame(result);
      markSeen(key, result.grade);
      newCount += 1;
    } catch (err) {
      console.error('[checker] failed to dispatch result:', key, err.message);
    }
  }

  console.log(
    `[checker] ${results.length} result(s) scraped, ${newCount} new.` +
      (newCount ? ' Game(s) sent.' : ''),
  );
}
