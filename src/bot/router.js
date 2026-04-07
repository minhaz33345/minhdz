const account       = require('../handlers/account');
const admin         = require('../handlers/admin');
const orders        = require('../handlers/orders');
const payment       = require('../handlers/payment');
const session       = require('../utils/session');
const CreditService = require('../services/CreditService');
const config        = require('../config');

function isAdminUser(msg) {
  return msg.from && msg.from.id === config.zalo.adminId;
}

function parse(text = '') {
  const m = text.match(/^\/(\w+)\s*([\s\S]*)?$/);
  if (!m) return null;
  return { cmd: m[1].toLowerCase(), args: (m[2] || '').trim().split(/\s+/).filter(Boolean) };
}

/**
 * Chuyển đổi webhook payload thành msg object tương tự Telegram
 */
function buildMsg(body) {
  if (!body) return null;
  // Payload có thể là của Telegram gốc (body.message),
  // Hoặc Zalo wrapper (body.result?.message)
  const message = body.result?.message || body.message;
  
  if (!message) {
    if (body.event_name && (body.sender || body.from)) {
       // Raw Zalo webhook mapping (if platform sends raw Zalo payload)
       const senderId = body.sender?.id || body.from?.id;
       let text = body.message?.text || '';
       if (body.event_name === 'user_submit_info') {
         text = body.info?.action_args || body.info?.action || '';
       }
       return {
         text: text,
         chat: { id: senderId },
         from: { id: senderId, first_name: 'Bạn', username: null },
         event_name: body.event_name
       };
    }
    return null;
  }

  return {
    text:      message.text || '',
    chat:      { id: message.chat?.id || message.from?.id },
    from: {
      id:         message.from?.id,
      first_name: message.from?.display_name || message.from?.first_name || 'Bạn',
      username:   message.from?.username || null,
    },
    event_name: body.result?.event_name || body.event_name || '',
  };
}

async function handleMessage(bot, body) {
  console.log('--- RAW WEBHOOK BODY ---');
  console.log(JSON.stringify(body, null, 2));
  
  const msg = buildMsg(body);
  if (!msg) return;

  const chatId = msg.chat.id;
  if (!chatId) return;

  // Chỉ xử lý tin nhắn text
  if (msg.event_name === 'message.unsupported.received') return;
  if (!msg.text) return;

  // ── Đảm bảo user tồn tại ──────────────────────────────────
  CreditService.ensureUser(chatId, { firstName: msg.from?.first_name });

  // ── Auto-log để admin lấy ZALO_ADMIN_ID ───────────────────
  if (!config.zalo.adminId || config.zalo.adminId === 'YOUR_ZALO_ADMIN_ID_HERE') {
    console.log(`⭐ [SETUP] Người dùng nhắn tin — Zalo ID: ${chatId} | Tên: ${msg.from?.first_name}`);
    console.log(`   → Copy ID này vào .env: ZALO_ADMIN_ID=${chatId}`);
  }

  // ── Kiểm tra bảo trì ──────────────────────────────────────
  if (config.bot.maintenance && !isAdminUser(msg)) {
    return bot.sendMessage(chatId, '🛠️ Bot đang bảo trì. Vui lòng quay lại sau nhé.');
  }

  const parsed = parse(msg.text);

  // ── Không phải lệnh → xử lý session step ─────────────────
  if (!parsed) {
    const sess = session.get(chatId);
    if (sess.step === 'rename_waiting')   return orders.handleRenameInput(bot, chatId, msg.text);
    if (sess.step === 'nap_custom_amount') { session.clear(chatId); return payment.handleNapCustomInput(bot, chatId, msg.text); }
    if (sess.step === 'list_select')      return orders.handleListSelect(bot, chatId, msg.text);
    if (sess.step === 'nap_select')       return payment.handleNapSelect(bot, chatId, msg.text);
    if (sess.step === 'order_action')     return orders.handleOrderAction(bot, chatId, msg.text);
    if (sess.step === 'delete_confirm')   return orders.handleDeleteTextConfirm(bot, chatId, msg.text);
    if (sess.step === 'clearlist_confirm') return orders.handleClearListConfirm(bot, chatId, msg.text);
    return;
  }

  // ── Dispatch lệnh ─────────────────────────────────────────
  const { cmd, args } = parsed;
  try {
    switch (cmd) {
      // Thông tin
      case 'myid':       return bot.sendMessage(chatId,
        `🆔 Zalo ID của bạn:\n${chatId}\n\nSao chép ID này để thiết lập ZALO_ADMIN_ID trong .env`
      );

      // Account
      case 'start':      return account.handleStart(bot, msg);
      case 'help':       return account.handleHelp(bot, msg);
      case 'me':         return account.handleMe(bot, msg);
      case 'contact':    return account.handleContact(bot, msg);
      case 'ref':        return account.handleRef(bot, msg);
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
      case 'botoff':     return admin.handleBotOff(bot, msg);
      case 'boton':      return admin.handleBotOn(bot, msg);
      case 'maintenance':return admin.handleMaintenanceStatus(bot, msg);

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
    bot.sendMessage(chatId, '❌ Có lỗi xảy ra, vui lòng thử lại.');
  }
}

module.exports = { handleMessage };