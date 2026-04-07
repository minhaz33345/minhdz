const OrderService  = require('../services/OrderService');
const CreditService = require('../services/CreditService');
const { checkBanned } = require('../middleware/rateLimit');
const { safeSend }  = require('../utils/sender');
const { fmtTime, formatInputGuide } = require('../utils/format');
const session = require('../utils/session');
const config  = require('../config');

async function send(bot, chatId, text) {
  return safeSend(bot, chatId, text);
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
      `⚠️ Hết số dư!\n\n💰 Tổng: 0 đơn\n💳 Liên hệ để nạp thêm: /contact`
    );
  }

  const items = OrderService.parseInput(args.join(' '));
  if (!items.length) return send(bot, msg.chat.id, `❌ Không đọc được mã đơn.\n\n${formatInputGuide()}`);

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
      `🔔 Đang theo dõi [${dCode}] rồi!\n` +
      `📌 Trạng thái: ${result.cached?.status || 'Chưa rõ'}\n\n` +
      `Mở /list để xem chi tiết.`
    );
  }

  if (result.type === 'API_ERROR') {
    return send(bot, chatId,
      `❌ Không thêm được đơn [${displayCode(result.code)}]\n\n${result.error}\n\n` +
      `Kiểm tra lại mã đơn và thử lại.`
    );
  }

  // Trừ credit sau khi thành công
  const cost         = result.creditCost || 1;
  const creditResult = CreditService.consume(chatId, cost);
  const balAfter     = creditResult.ok ? creditResult.balance : CreditService.getBalance(chatId);
  const dCode        = displayCode(result.code);

  if (result.type === 'ADDED_PENDING') {
    return send(bot, chatId,
      `✅ ĐÃ THÊM ĐƠN\n\n` +
      `🔖 Mã: ${dCode}\n` +
      `📦 Tên: ${result.name}\n\n` +
      `⏳ Đang vào hàng chờ xử lý.\n` +
      `Bot sẽ thông báo khi có trạng thái.\n\n` +
      `💰 Đã trừ: ${cost} đơn | Còn lại: ${balAfter.total} đơn`
    );
  }

  const locLine  = result.location ? `\n📍 ${result.location}` : '';
  const timeLine = result.time     ? `\n🕒 ${fmtTime(result.time)}` : '';
  return send(bot, chatId,
    `✅ ĐÃ THÊM & THEO DÕI\n\n` +
    `🔖 Mã: ${dCode}\n` +
    `📦 Tên: ${result.name}\n` +
    `🚚 Hãng: ${result.partner}\n` +
    `📌 Trạng thái: ${result.status || 'Chưa có'}${locLine}${timeLine}\n\n` +
    `💰 Đã trừ: ${cost} đơn | Còn lại: ${balAfter.total} đơn\n` +
    `Bot sẽ tự thông báo khi trạng thái thay đổi.`
  );
}

// ─── /list — Text menu thay vì inline keyboard ─────────────────
async function handleList(bot, msg) {
  const items = OrderService.getTrackedList(msg.chat.id);
  if (!items.length) {
    return send(bot, msg.chat.id,
      `📭 Bạn chưa theo dõi đơn nào.\n\nDùng /add <mã> để thêm đơn.`
    );
  }
  await _sendList(bot, msg.chat.id);
}

async function _sendList(bot, chatId) {
  const items = OrderService.getTrackedList(chatId);
  if (!items.length) {
    return send(bot, chatId, '📭 Danh sách trống. Dùng /add <mã> để thêm đơn.');
  }

  const lines = [`📋 CHỌN ĐƠN ĐỂ XEM TRẠNG THÁI:\n(${items.length} đơn đang theo dõi)\n`];
  items.forEach(({ code, cached }, i) => {
    const dCode = displayCode(code);
    const label = cached?.name && cached.name !== code && cached.name !== dCode
      ? `📦 ${cached.name} — ${dCode}`
      : `📦 ${dCode}`;
    lines.push(`${i + 1}. ${label}`);
  });
  lines.push(`\nGõ số thứ tự (ví dụ: 1) để xem chi tiết\nHoặc /huy để hủy`);

  // Lưu danh sách vào session để xử lý chọn số
  session.set(chatId, { step: 'list_select', listItems: items.map(i => i.code) });
  await send(bot, chatId, lines.join('\n'));
}

// Xử lý khi user gõ số để chọn đơn từ /list
async function handleListSelect(bot, chatId, text) {
  const sess  = session.get(chatId);
  const items = sess.listItems || [];
  const idx   = parseInt(text.trim()) - 1;
  if (isNaN(idx) || idx < 0 || idx >= items.length) {
    return send(bot, chatId, `❌ Số không hợp lệ. Gõ số từ 1 đến ${items.length}, hoặc /huy để hủy.`);
  }
  const code = items[idx];
  session.set(chatId, { step: 'order_action', selectedCode: code });
  await handleOrderDetail(bot, chatId, code);
}

// Xem chi tiết 1 đơn + text menu thao tác
async function handleOrderDetail(bot, chatId, code) {
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
      `📋 ${cached?.name || dCode}`,
      `🔖 Mã: ${dCode}`,
      `🚚 Hãng: ${order.partner || '—'}`,
      `📌 Trạng thái: ${latest.status || '—'}`,
    ];
    if (latest.location) lines.push(`📍 ${latest.location}`);
    if (latest.time)     lines.push(`🕒 ${fmtTime(latest.time)}`);
    if (history.length > 0) {
      lines.push(`\n📜 Lịch sử gần đây:`);
      history.slice(-4).reverse().forEach(h => {
        lines.push(`  • ${h.status}\n    ${fmtTime(h.time)}`);
      });
    }
    text = lines.join('\n');
  } catch {
    text = `📋 ${cached?.name || dCode}\n🔖 ${dCode}\n📌 ${cached?.status || 'Chưa rõ'}\n\n(Cache — API tạm không phản hồi)`;
  }

  text += `\n\n---\nThao tác:\n1. 🔄 Làm mới\n2. ✏️ Đổi tên\n3. 🗑️ Xóa đơn\n4. ◀️ Quay lại danh sách\n\nGõ số thứ tự hoặc /huy để hủy`;
  await send(bot, chatId, text);
}

// Xử lý thao tác trên đơn (gõ 1/2/3/4)
async function handleOrderAction(bot, chatId, text) {
  const sess = session.get(chatId);
  const code = sess.selectedCode;
  if (!code) {
    session.clear(chatId);
    return send(bot, chatId, '❌ Phiên làm việc hết hạn. Gõ /list để thử lại.');
  }

  const choice = text.trim();
  switch (choice) {
    case '1': // Làm mới
      await handleOrderDetail(bot, chatId, code);
      break;
    case '2': // Đổi tên
      await handleRenameAsk(bot, chatId, code);
      break;
    case '3': // Xóa đơn
      await handleDeleteAsk(bot, chatId, code);
      break;
    case '4': // Quay lại danh sách
      session.clear(chatId);
      await _sendList(bot, chatId);
      break;
    default:
      await send(bot, chatId, '❌ Gõ 1, 2, 3 hoặc 4. Hoặc /huy để hủy.');
  }
}

// ─── RENAME flow ──────────────────────────────────────────────
async function handleRenameAsk(bot, chatId, code) {
  const dCode = displayCode(code);
  session.set(chatId, { step: 'rename_waiting', code });
  await send(bot, chatId,
    `✏️ Đổi tên đơn [${dCode}]\n\nGõ tên mới vào chat:\n(Hoặc /huy để hủy)`
  );
}

async function handleRenameInput(bot, chatId, text) {
  const sess = session.get(chatId);
  if (sess.step !== 'rename_waiting') return false;
  const { code } = sess;
  session.clear(chatId);
  await OrderService.renameOrder(chatId, code, text.trim());
  await send(bot, chatId, `✅ Đã đổi tên [${displayCode(code)}] thành "${text.trim()}"`);
  await handleOrderDetail(bot, chatId, code);
  return true;
}

// ─── DELETE flow ──────────────────────────────────────────────
async function handleDeleteAsk(bot, chatId, code) {
  const dCode = displayCode(code);
  session.set(chatId, { step: 'delete_confirm', code });
  await send(bot, chatId,
    `⚠️ Xác nhận xóa đơn?\n\n🔖 Mã: ${dCode}\nBot sẽ ngừng theo dõi và xóa khỏi API.\n\nGõ "xoa" để xác nhận, hoặc /huy để hủy`
  );
}

async function handleDeleteTextConfirm(bot, chatId, text) {
  const sess = session.get(chatId);
  if (sess.step !== 'delete_confirm') return;
  if (text.trim().toLowerCase() !== 'xoa') {
    return send(bot, chatId, '❌ Gõ "xoa" để xác nhận xóa, hoặc /huy để hủy.');
  }
  const code = sess.code;
  session.clear(chatId);
  await OrderService.deleteOrder(chatId, code);
  await send(bot, chatId, `🗑️ Đã xóa & bỏ theo dõi [${displayCode(code)}].`);
  await new Promise(r => setTimeout(r, 500));
  await _sendList(bot, chatId);
}

// ─── /untrack ─────────────────────────────────────────────────
async function handleUntrack(bot, msg, args) {
  const code = args[0];
  if (!code) return send(bot, msg.chat.id, '❌ Cú pháp: /untrack <mã_đơn>');
  OrderService.untrack(msg.chat.id, code);
  await send(bot, msg.chat.id, `🔕 Đã bỏ theo dõi đơn [${displayCode(code)}].`);
}

// ─── /clearlist ───────────────────────────────────────────────
async function handleClearList(bot, msg) {
  const SubRepo = require('../db/repositories/SubscriptionRepository');
  const codes   = SubRepo.findByChatId(msg.chat.id);
  if (!codes.length) return send(bot, msg.chat.id, '📭 Danh sách theo dõi của bạn đang trống.');
  session.set(msg.chat.id, { step: 'clearlist_confirm', count: codes.length });
  await send(bot, msg.chat.id,
    `⚠️ Xóa toàn bộ ${codes.length} đơn đang theo dõi?\n\nThao tác này không thể hoàn tác.\n\nGõ "xoa het" để xác nhận, hoặc /huy để hủy`
  );
}

async function handleClearListConfirm(bot, chatId, text) {
  const sess = session.get(chatId);
  if (sess.step !== 'clearlist_confirm') return;
  if (text.trim().toLowerCase() !== 'xoa het') {
    return send(bot, chatId, '❌ Gõ "xoa het" để xác nhận, hoặc /huy để hủy.');
  }
  const SubRepo = require('../db/repositories/SubscriptionRepository');
  const LogRepo = require('../db/repositories/LogRepository');
  const codes   = SubRepo.findByChatId(chatId);
  codes.forEach(code => SubRepo.remove(chatId, code));
  LogRepo.append(chatId, 'clearlist', `removed:${codes.length}`);
  session.clear(chatId);
  await send(bot, chatId, `🗑️ Đã xóa ${codes.length} đơn khỏi danh sách.`);
}

// ─── /trackall — admin only ────────────────────────────────────
async function handleTrackAll(bot, msg) {
  if (msg.from.id !== config.zalo.adminId) {
    return send(bot, msg.chat.id,
      `🚫 Lệnh này chỉ dành cho admin.\n\nDùng /add <mã đơn> để theo dõi đơn của bạn.`
    );
  }
  await send(bot, msg.chat.id, '⏳ Đang tải danh sách đơn...');
  try {
    const count = await OrderService.subscribeAll(msg.chat.id);
    if (!count) return send(bot, msg.chat.id, '📭 Không có đơn nào trên hệ thống.');
    return send(bot, msg.chat.id, `✅ Đã thêm theo dõi ${count} đơn!\nXem danh sách: /list`);
  } catch (err) {
    return send(bot, msg.chat.id, `❌ ${err.message}`);
  }
}

async function handleTrackForce(bot, chatId, code) {
  const SubRepo = require('../db/repositories/SubscriptionRepository');
  const LogRepo = require('../db/repositories/LogRepository');
  SubRepo.add(chatId, code);
  LogRepo.append(chatId, 'add_force', code);
  await send(bot, chatId,
    `🔔 Đã thêm theo dõi [${displayCode(code)}]!\nBot sẽ thông báo khi có trạng thái.`
  );
}

module.exports = {
  handleAdd, handleList, _sendList,
  handleListSelect,
  handleOrderDetail,
  handleOrderAction,
  handleRenameAsk, handleRenameInput,
  handleDeleteAsk, handleDeleteTextConfirm,
  handleUntrack, handleClearList, handleClearListConfirm,
  handleTrackAll, handleTrackForce,
  displayCode,
};