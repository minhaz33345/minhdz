const OrderService  = require('../services/OrderService');
const CreditService = require('../services/CreditService');
const { checkBanned } = require('../middleware/rateLimit');
const { safeSend, safeEdit } = require('../utils/sender');
const { esc, fmtTime, formatInputGuide } = require('../utils/format');
const session = require('../utils/session');
const config  = require('../config');

async function send(bot, chatId, text, extra = {}) {
  return safeSend(bot, chatId, text, extra);
}

// Bỏ phone suffix khỏi mã đơn để hiển thị
function displayCode(code) {
  return String(code).replace(/-\d{4}$/, '');
}

// ─── /add ─────────────────────────────────────────────────────
async function handleAdd(bot, msg, args) {
  if (!args.length) return send(bot, msg.chat.id, formatInputGuide());
  if (!await checkBanned(bot, msg)) return;

  const bal = CreditService.getBalance(msg.chat.id);
  if (bal.total < 1) {
    return send(bot, msg.chat.id,
      `⚠️ *Hết số dư\\!*\n\n💰 Tổng: *0* đơn\n💳 Liên hệ để nạp thêm: /contact`
    );
  }

  const items = OrderService.parseInput(args.join(' '));
  if (!items.length) return send(bot, msg.chat.id, `❌ Không đọc được mã đơn\\.\n\n${formatInputGuide()}`);

  for (const item of items) {
    await _addOne(bot, msg.chat.id, item);
    if (items.length > 1) await new Promise(r => setTimeout(r, 600));
  }
}

async function _addOne(bot, chatId, item) {
  const result = await OrderService.addAndTrack(chatId, item);

  if (result.type === 'ALREADY_TRACKING') {
    const dCode = displayCode(result.code);
    return send(bot, chatId,
      `🔔 Đang theo dõi \`${esc(dCode)}\` rồi\\!\n` +
      `📌 Trạng thái: *${esc(result.cached?.status || 'Chưa rõ')}*\n\n` +
      `Mở /list để xem chi tiết\\.`
    );
  }

  if (result.type === 'API_ERROR') {
    return send(bot, chatId,
      `❌ *Không thêm được đơn* \`${esc(displayCode(result.code))}\`\n\n${esc(result.error)}\n\n` +
      `_Kiểm tra lại mã đơn và thử lại\\._`
    );
  }

  // Trừ credit sau khi thành công
  const cost         = result.creditCost || 1;
  const creditResult = CreditService.consume(chatId, cost);
  const balAfter     = creditResult.ok ? creditResult.balance : CreditService.getBalance(chatId);
  const dCode        = displayCode(result.code);

  if (result.type === 'ADDED_PENDING') {
    return send(bot, chatId,
      `✅ *ĐÃ THÊM ĐƠN*\n\n` +
      `🔖 Mã: \`${esc(dCode)}\`\n` +
      `📦 Tên: *${esc(result.name)}*\n\n` +
      `⏳ Đang vào hàng chờ xử lý\\.\n` +
      `_Bot sẽ thông báo khi có trạng thái\\._\n\n` +
      `💰 Đã trừ: *${esc(String(cost))}* đơn \\| Còn lại: *${esc(String(balAfter.total))}* đơn`
    );
  }

  const locLine  = result.location ? `\n📍 ${esc(result.location)}` : '';
  const timeLine = result.time     ? `\n🕒 ${esc(fmtTime(result.time))}` : '';
  return send(bot, chatId,
    `✅ *ĐÃ THÊM & THEO DÕI*\n\n` +
    `🔖 Mã: \`${esc(dCode)}\`\n` +
    `📦 Tên: *${esc(result.name)}*\n` +
    `🚚 Hãng: *${esc(result.partner)}*\n` +
    `📌 Trạng thái: *${esc(result.status || 'Chưa có')}*${locLine}${timeLine}\n\n` +
    `💰 Đã trừ: *${esc(String(cost))}* đơn \\| Còn lại: *${esc(String(balAfter.total))}* đơn\n` +
    `_Bot sẽ tự thông báo khi trạng thái thay đổi\\._`
  );
}

// ─── /list — inline keyboard chọn đơn ─────────────────────────
async function handleList(bot, msg) {
  const items = OrderService.getTrackedList(msg.chat.id);
  if (!items.length) {
    return send(bot, msg.chat.id,
      `📭 Bạn chưa theo dõi đơn nào\\.\n\nDùng /add \\<mã\\> để thêm đơn\\.`
    );
  }
  await _sendList(bot, msg.chat.id, null);
}

async function _sendList(bot, chatId, msgId) {
  const items = OrderService.getTrackedList(chatId);
  if (!items.length) {
    const text = '📭 Danh sách trống\\. Dùng /add \\<mã\\> để thêm đơn\\.';
    if (msgId) return safeEdit(bot, chatId, msgId, text);
    return send(bot, chatId, text);
  }

  const keyboard = items.map(({ code, cached }) => {
    const dCode = displayCode(code);
    const label = cached?.name && cached.name !== code && cached.name !== dCode
      ? `📦 ${cached.name} — ${dCode}`
      : `📦 ${dCode}`;
    return [{ text: label.substring(0, 60), callback_data: `od:${code}` }];
  });
  keyboard.push([{ text: '🔄 Làm mới', callback_data: 'list_refresh' }]);

  const text = `📋 *CHỌN ĐƠN ĐỂ XEM TRẠNG THÁI:*\n_${esc(String(items.length))} đơn đang theo dõi_`;
  if (msgId) {
    return safeEdit(bot, chatId, msgId, text, { reply_markup: { inline_keyboard: keyboard } });
  }
  return send(bot, chatId, text, { reply_markup: { inline_keyboard: keyboard } });
}

// Xem chi tiết 1 đơn + nút Đổi tên / Xóa
async function handleOrderDetailCallback(bot, chatId, msgId, code) {
  const OrderCacheRepo = require('../db/repositories/OrderCacheRepository');
  const expressApi     = require('../api/expressApi');
  const cached         = OrderCacheRepo.findByCode(code);
  const dCode          = displayCode(code);

  let text;
  try {
    const order   = await expressApi.getOrderDetail(code);
    const history = order.tracking_history || [];
    const latest  = OrderService.extractLatest(order);

    const lines = [
      `📋 *${esc(cached?.name || dCode)}*`,
      `🔖 Mã: \`${esc(dCode)}\``,
      `🚚 Hãng: *${esc(order.partner || '—')}*`,
      `📌 Trạng thái: *${esc(latest.status || '—')}*`,
    ];
    if (latest.location) lines.push(`📍 ${esc(latest.location)}`);
    if (latest.time)     lines.push(`🕒 ${esc(fmtTime(latest.time))}`);
    if (history.length > 0) {
      lines.push(`\n📜 *Lịch sử gần đây:*`);
      history.slice(-4).reverse().forEach(h => {
        lines.push(`  • *${esc(h.status)}*\n    _${esc(fmtTime(h.time))}_`);
      });
    }
    text = lines.join('\n');
  } catch {
    text = `📋 *${esc(cached?.name || dCode)}*\n🔖 \`${esc(dCode)}\`\n📌 *${esc(cached?.status || 'Chưa rõ')}*\n\n_\\(Cache — API tạm không phản hồi\\)_`;
  }

  await safeEdit(bot, chatId, msgId, text, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔄 Làm mới',  callback_data: `od:${code}` },
          { text: '◀️ Quay lại', callback_data: 'list_back' },
        ],
        [
          { text: '✏️ Đổi tên', callback_data: `rename_ask:${code}` },
          { text: '🗑️ Xóa đơn', callback_data: `del_ask:${code}` },
        ],
      ]
    }
  });
}

// ─── RENAME flow ──────────────────────────────────────────────
async function handleRenameAsk(bot, chatId, msgId, code) {
  const dCode = displayCode(code);
  session.set(chatId, { step: 'rename_waiting', code, msgId });
  await safeEdit(bot, chatId, msgId,
    `✏️ *Đổi tên đơn* \`${esc(dCode)}\`\n\nGõ tên mới vào chat\\:`,
    { reply_markup: { inline_keyboard: [[{ text: '❌ Hủy', callback_data: `od:${code}` }]] } }
  );
}

async function handleRenameInput(bot, chatId, text) {
  const sess = session.get(chatId);
  if (sess.step !== 'rename_waiting') return false;
  session.clear(chatId);
  const { code, msgId } = sess;
  await OrderService.renameOrder(chatId, code, text.trim());
  await send(bot, chatId, `✅ Đã đổi tên \`${esc(displayCode(code))}\` thành *${esc(text.trim())}*`);
  // Refresh detail view
  if (msgId) await handleOrderDetailCallback(bot, chatId, msgId, code);
  return true;
}

// ─── DELETE flow ──────────────────────────────────────────────
async function handleDeleteAsk(bot, chatId, msgId, code) {
  const dCode = displayCode(code);
  await safeEdit(bot, chatId, msgId,
    `⚠️ *Xác nhận xóa đơn?*\n\n🔖 Mã: \`${esc(dCode)}\`\n_Bot sẽ ngừng theo dõi và xóa khỏi API\\._`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Xóa',     callback_data: `del_confirm:${code}` },
          { text: '❌ Hủy',    callback_data: `od:${code}` },
        ]]
      }
    }
  );
}

async function handleDeleteConfirm(bot, chatId, msgId, code) {
  await OrderService.deleteOrder(chatId, code);
  await safeEdit(bot, chatId, msgId,
    `🗑️ Đã xóa & bỏ theo dõi \`${displayCode(code)}\`\\.`
  );
  // Show updated list after short delay
  await new Promise(r => setTimeout(r, 800));
  await _sendList(bot, chatId, null);
}

// ─── /untrack ─────────────────────────────────────────────────
async function handleUntrack(bot, msg, args) {
  const code = args[0];
  if (!code) return send(bot, msg.chat.id, '❌ Cú pháp: `/untrack <mã_đơn>`');
  OrderService.untrack(msg.chat.id, code);
  await send(bot, msg.chat.id, `🔕 Đã bỏ theo dõi đơn \`${esc(displayCode(code))}\`\\.`);
}

// ─── /clearlist ───────────────────────────────────────────────
async function handleClearList(bot, msg) {
  const SubRepo = require('../db/repositories/SubscriptionRepository');
  const codes   = SubRepo.findByChatId(msg.chat.id);
  if (!codes.length) return send(bot, msg.chat.id, '📭 Danh sách theo dõi của bạn đang trống\\.');
  await send(bot, msg.chat.id,
    `⚠️ *Xóa toàn bộ ${esc(String(codes.length))} đơn đang theo dõi?*\n\nThao tác này không thể hoàn tác\\.`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: `✅ Xóa hết ${codes.length} đơn`, callback_data: 'clearlist_confirm' },
          { text: '❌ Hủy', callback_data: 'clearlist_cancel' },
        ]]
      }
    }
  );
}

// ─── /trackall — admin only ────────────────────────────────────
async function handleTrackAll(bot, msg) {
  if (msg.from.id !== config.telegram.adminId) {
    return send(bot, msg.chat.id,
      `🚫 Lệnh này chỉ dành cho admin\\.\n\nDùng /add \\<mã đơn\\> để theo dõi đơn của bạn\\.`
    );
  }
  const load = await send(bot, msg.chat.id, '⏳ Đang tải danh sách đơn\\.\\.\\.');
  try {
    const count = await OrderService.subscribeAll(msg.chat.id);
    await bot.deleteMessage(msg.chat.id, load.message_id).catch(() => {});
    if (!count) return send(bot, msg.chat.id, '📭 Không có đơn nào trên hệ thống\\.');
    return send(bot, msg.chat.id, `✅ Đã thêm theo dõi *${esc(String(count))}* đơn\\!\n_Xem danh sách: /list_`);
  } catch (err) {
    await bot.deleteMessage(msg.chat.id, load.message_id).catch(() => {});
    return send(bot, msg.chat.id, `❌ ${esc(err.message)}`);
  }
}

async function handleTrackForce(bot, chatId, code) {
  const SubRepo = require('../db/repositories/SubscriptionRepository');
  const LogRepo = require('../db/repositories/LogRepository');
  SubRepo.add(chatId, code);
  LogRepo.append(chatId, 'add_force', code);
  await send(bot, chatId,
    `🔔 Đã thêm theo dõi \`${esc(displayCode(code))}\`\\!\n_Bot sẽ thông báo khi có trạng thái\\._`
  );
}

module.exports = {
  handleAdd, handleList, _sendList,
  handleOrderDetailCallback,
  handleRenameAsk, handleRenameInput,
  handleDeleteAsk, handleDeleteConfirm,
  handleUntrack, handleClearList, handleTrackAll, handleTrackForce,
  displayCode,
};