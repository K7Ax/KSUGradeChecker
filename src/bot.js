import { Bot } from 'grammy';
import { BOT_TOKEN, CHAT_ID } from './config.js';
import { buildGameKeyboard, isLetterGrade } from './grades.js';
import {
  createGame,
  getGame,
  updateGame,
  endGame,
  nextGameId,
  getOwnerId,
  setOwnerId,
} from './store.js';

// The owner chat id comes from CHAT_ID in .env if set, otherwise from the value
// auto-linked the first time someone sends /start. Resolved live (not cached) so
// pairing takes effect immediately.
function resolveOwner() {
  return CHAT_ID || getOwnerId();
}

function isOwner(ctx) {
  const owner = resolveOwner();
  return Boolean(owner) && String(ctx.chat?.id ?? ctx.from?.id) === String(owner);
}

/**
 * @param {object} [opts]
 * @param {() => void} [opts.onPaired] - called once the bot links to a chat, so
 *   the caller can kick off the checking loop.
 */
export function createBot({ onPaired } = {}) {
  const bot = new Bot(BOT_TOKEN);

  // /start links the bot to you (first time) or confirms you're connected.
  bot.command('start', async (ctx) => {
    const owner = resolveOwner();

    if (!owner) {
      // Not linked yet → the first person to /start becomes the owner.
      setOwnerId(ctx.chat.id);
      await ctx.reply('✅ تم الربط! من الحين بتوصلك درجاتك هني على طول 🎉');
      onPaired?.();
      return;
    }

    if (isOwner(ctx)) {
      await ctx.reply('✅ انت مربوط زين. أول ما تطلع درجة جديدة بكلّمك 👌');
    } else {
      await ctx.reply('🔒 هذا البوت مربوط بشخص ثاني.');
    }
  });

  bot.command('ping', async (ctx) => {
    if (isOwner(ctx)) await ctx.reply('pong ✅ (checker is running)');
  });

  bot.on('callback_query:data', async (ctx) => {
    if (!isOwner(ctx)) return ctx.answerCallbackQuery();

    const data = ctx.callbackQuery.data;
    const sep = data.indexOf(':');
    const gameId = data.slice(0, sep);
    const choice = data.slice(sep + 1);
    const game = getGame(gameId);

    if (!game) {
      await ctx.answerCallbackQuery({ text: 'This game has ended.', show_alert: false });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
      return;
    }

    // Reveal button.
    if (choice === '__SHOW__') {
      endGame(gameId);
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(
        `👀 Your grade in *${escapeMd(game.courseName)}* is *${escapeMd(game.actualGrade)}*`,
        { parse_mode: 'MarkdownV2' },
      ).catch(() => {});
      return;
    }

    // Correct guess.
    if (choice === game.actualGrade) {
      const tries = (game.attempts ?? 0) + 1;
      endGame(gameId);
      await ctx.answerCallbackQuery({ text: '🎉 Correct!' });
      await ctx.editMessageText(
        `🎉 Correct\\! You scored *${escapeMd(game.actualGrade)}* in ` +
          `*${escapeMd(game.courseName)}* \\(in ${tries} ${tries === 1 ? 'try' : 'tries'}\\)`,
        { parse_mode: 'MarkdownV2' },
      ).catch(() => {});
      return;
    }

    // Wrong guess — let them retry, keyboard stays.
    updateGame(gameId, { attempts: (game.attempts ?? 0) + 1 });
    await ctx.answerCallbackQuery({ text: `❌ Not ${choice} — try again!`, show_alert: false });
  });

  bot.catch((err) => console.error('[bot] error:', err.error ?? err));

  /** Send a new-grade guessing game (letter grades) or a plain reveal (statuses). */
  async function startGame(result) {
    const target = resolveOwner();
    if (!target) {
      console.warn('[bot] no linked chat yet — send /start to the bot to link it.');
      return;
    }

    if (!isLetterGrade(result.grade)) {
      await notify(
        `🎓 New result for *${escapeMd(result.courseName)}*: *${escapeMd(result.grade)}*`,
      );
      return;
    }
    const id = nextGameId();
    createGame({
      id,
      courseName: result.courseName,
      courseCode: result.courseCode,
      term: result.term,
      actualGrade: result.grade,
      attempts: 0,
    });
    await bot.api.sendMessage(
      target,
      `🎓 New result posted for *${escapeMd(result.courseName)}*\\!\nGuess your grade 👇`,
      { parse_mode: 'MarkdownV2', reply_markup: buildGameKeyboard(id) },
    );
  }

  async function notify(text) {
    const target = resolveOwner();
    if (!target) return;
    await bot.api.sendMessage(target, text, { parse_mode: 'MarkdownV2' }).catch(async () => {
      // Fallback to plain text if Markdown escaping ever fails.
      await bot.api.sendMessage(target, text.replace(/\\/g, ''));
    });
  }

  async function notifySessionExpired() {
    const target = resolveOwner();
    if (!target) return;
    await bot.api.sendMessage(
      target,
      '🔐 edugate session expired. Set EDUGATE_USERNAME/EDUGATE_PASSWORD in .env for ' +
        'automatic re-login, or run `npm run login` on the PC to reconnect.',
    );
  }

  async function notifyAuthFailed(reason) {
    const target = resolveOwner();
    if (!target) return;
    await bot.api.sendMessage(
      target,
      `⚠️ Automatic re-login failed: ${reason}\n` +
        'Auto-login is paused to protect your account. Fix EDUGATE_PASSWORD in .env ' +
        'and restart, or run `npm run login`.',
    );
  }

  return { bot, startGame, notify, notifySessionExpired, notifyAuthFailed };
}

// Escape text for Telegram MarkdownV2.
function escapeMd(s) {
  return String(s).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}
