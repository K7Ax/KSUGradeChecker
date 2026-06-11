import { Bot } from 'grammy';
import { BOT_TOKEN, CHAT_ID } from './config.js';
import { buildGameKeyboard, isLetterGrade } from './grades.js';
import { createGame, getGame, updateGame, endGame, nextGameId } from './store.js';

const ownerId = String(CHAT_ID);

function isOwner(ctx) {
  return String(ctx.chat?.id ?? ctx.from?.id) === ownerId;
}

export function createBot() {
  const bot = new Bot(BOT_TOKEN);

  // Handy for first-time setup: tell the user their chat id.
  bot.command('start', async (ctx) => {
    await ctx.reply(
      `👋 KSU Grade Checker is connected.\nYour chat id is: ${ctx.chat.id}\n` +
        (isOwner(ctx) ? '✅ This matches CHAT_ID — you are all set.' : '⚠️ Put this id in CHAT_ID in your .env.'),
    );
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
      CHAT_ID,
      `🎓 New result posted for *${escapeMd(result.courseName)}*\\!\nGuess your grade 👇`,
      { parse_mode: 'MarkdownV2', reply_markup: buildGameKeyboard(id) },
    );
  }

  async function notify(text) {
    await bot.api.sendMessage(CHAT_ID, text, { parse_mode: 'MarkdownV2' }).catch(async () => {
      // Fallback to plain text if Markdown escaping ever fails.
      await bot.api.sendMessage(CHAT_ID, text.replace(/\\/g, ''));
    });
  }

  async function notifySessionExpired() {
    await bot.api.sendMessage(
      CHAT_ID,
      '🔐 edugate session expired. Run `npm run login` on the PC to reconnect ' +
        '(or set EDUGATE_USERNAME/EDUGATE_PASSWORD in .env for automatic re-login).',
    );
  }

  async function notifyAuthFailed(reason) {
    await bot.api.sendMessage(
      CHAT_ID,
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
