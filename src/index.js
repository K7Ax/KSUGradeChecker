import { assertRuntimeConfig, POLL_MS } from './config.js';
import { createBot } from './bot.js';
import { checkOnce } from './checker.js';

async function main() {
  assertRuntimeConfig();

  const bot = createBot();
  const flags = { expiryNotified: false, authDisabled: false };

  // Start the Telegram bot (long polling) without blocking the loop below.
  bot.bot.start({ onStart: (me) => console.log(`[bot] @${me.username} started.`) });

  const tick = async () => {
    try {
      await checkOnce(bot, flags);
    } catch (err) {
      console.error('[loop] unexpected error:', err);
    }
  };

  await tick(); // immediate first check
  const timer = setInterval(tick, POLL_MS);
  console.log(`[loop] checking edugate every ${Math.round(POLL_MS / 1000)}s.`);

  const shutdown = async () => {
    console.log('\n[shutdown] stopping…');
    clearInterval(timer);
    await bot.bot.stop();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
