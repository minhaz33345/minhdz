const account   = require('../handlers/account');
const admin     = require('../handlers/admin');
const orders    = require('../handlers/orders');
const payment   = require('../handlers/payment');
const callbacks = require('./callbacks');
const session   = require('../utils/session');
const CreditService = require('../services/CreditService');

function parse(text = '') {
  const m = text.match(/^\/(\w+)(?:@\S+)?\s*([\s\S]*)?$/);
  if (!m) return null;
  return { cmd: m[1].toLowerCase(), args: (m[2] || '').trim().split(/\s+/).filter(Boolean) };
}

function register(bot) {
  bot.on('message', async (msg) => {
    if (!msg.text) return;

    CreditService.ensureUser(msg.chat.id, {
      username:  msg.from?.username,
      firstName: msg.from?.first_name,
    });

    const parsed = parse(msg.text);

    if (!parsed) {
      const sess = session.get(msg.chat.id);
      if (sess.step === 'rename_waiting') {
        return orders.handleRenameInput(bot, msg.chat.id, msg.text);
      }
      if (sess.step === 'nap_custom_amount') {
        session.clear(msg.chat.id);
        return payment.handleNapCustomInput(bot, msg.chat.id, msg.text);
      }
      return;
    }

    const { cmd, args } = parsed;
    try {
      switch (cmd) {
        // Account
        case 'start':      return account.handleStart(bot, msg);
        case 'help':       return account.handleHelp(bot, msg);
        case 'me':         return account.handleMe(bot, msg);
        case 'contact':    return account.handleContact(bot, msg);
        case 'cancel':
        case 'huy':        return account.handleCancel(bot, msg);

        // Admin
        case 'setkey':     return admin.handleSetKey(bot, msg, args);
        case 'admin':      return admin.handleAdmin(bot, msg);
        case 'users':      return admin.handleUsers(bot, msg);
        case 'ban':        return admin.handleBan(bot, msg, args);
        case 'unban':      return admin.handleUnban(bot, msg, args);
        case 'addcredits': return admin.handleAddCredits(bot, msg, args);
        case 'broadcast':  return admin.handleBroadcast(bot, msg, args);
        case 'logs':       return admin.handleLogs(bot, msg);
        case 'balance':    return admin.handleBalance(bot, msg);

        // Orders
        case 'add':        return orders.handleAdd(bot, msg, args);
        case 'list':       return orders.handleList(bot, msg);
        case 'untrack':    return orders.handleUntrack(bot, msg, args);
        case 'clearlist':  return orders.handleClearList(bot, msg);
        case 'trackall':   return orders.handleTrackAll(bot, msg);

        // Payment
        case 'nap':        return payment.handleNap(bot, msg, args);
      }
    } catch (err) {
      console.error(`[/${cmd}] ${err.message}`);
      bot.sendMessage(msg.chat.id, '❌ Có lỗi xảy ra, vui lòng thử lại\\.', { parse_mode: 'MarkdownV2' });
    }
  });

  bot.on('callback_query', async (q) => {
    try { await callbacks.handle(bot, q); }
    catch (err) { console.error(`[Callback] ${err.message}`); }
  });

  bot.on('polling_error', (err) => console.error('Polling error:', err.code, err.message));
}

module.exports = { register };