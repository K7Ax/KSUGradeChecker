import { assertRuntimeConfig, POLL_MS, CHAT_ID } from './config.js';
import { createBot } from './bot.js';
import { checkOnce } from './checker.js';
import { getOwnerId } from './store.js';

function ownerKnown() {
  return Boolean(CHAT_ID || getOwnerId());
}

async function main() {
  assertRuntimeConfig();

  const flags = { expiryNotified: false, authDisabled: false };
  let timer = null;

  const tick = async () => {
    try {
      await checkOnce(bot, flags);
    } catch (err) {
      console.error('[loop] unexpected error:', err);
    }
  };

  // Start the checking loop (only once). Called either at startup if we already
  // know the owner, or right after the user links the bot via /start.
  const startLoop = () => {
    if (timer) return;
    tick(); // immediate first check
    timer = setInterval(tick, POLL_MS);
    console.log(`[loop] checking edugate every ${Math.round(POLL_MS / 1000)}s.`);
  };

  const bot = createBot({ onPaired: startLoop });
  bot.bot.start({ onStart: (me) => console.log(`[bot] @${me.username} started.`) });

  if (ownerKnown()) {
    startLoop();
  } else {
    console.log('👉 روح تيليجرام، افتح بوتك، وارسل له /start عشان يرتبط فيك — وبعدها بتجيك درجاتك لحالها.');
  }

  const shutdown = async () => {
    console.log('\n[shutdown] stopping…');
    if (timer) clearInterval(timer);
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
