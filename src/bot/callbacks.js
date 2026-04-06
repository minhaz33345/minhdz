const { safeEdit } = require('../utils/sender');
const orderHandler = require('../handlers/orders');
const payment      = require('../handlers/payment');
const OrderService = require('../services/OrderService');
const session      = require('../utils/session');

async function handle(bot, q) {
  const chatId = q.message.chat.id;
  const msgId  = q.message.message_id;
  await bot.answerCallbackQuery(q.id);

  try {
    const d = q.data;

    // ── Order detail
    if (d.startsWith('od:')) {
      const code = d.slice(3);
      await orderHandler.handleOrderDetailCallback(bot, chatId, msgId, code);

    // ── List navigation
    } else if (d === 'list_back' || d === 'list_refresh') {
      await orderHandler._sendList(bot, chatId, msgId);

    // ── Rename
    } else if (d.startsWith('rename_ask:')) {
      const code = d.slice(11);
      await orderHandler.handleRenameAsk(bot, chatId, msgId, code);

    // ── Delete ask
    } else if (d.startsWith('del_ask:')) {
      const code = d.slice(8);
      await orderHandler.handleDeleteAsk(bot, chatId, msgId, code);

    // ── Delete confirm
    } else if (d.startsWith('del_confirm:')) {
      const code = d.slice(12);
      await orderHandler.handleDeleteConfirm(bot, chatId, msgId, code);

    // ── Track force (khi API lỗi khi add)
    } else if (d.startsWith('track_force:')) {
      const code = d.slice(12);
      await safeEdit(bot, chatId, msgId, `🔔 Đang thêm theo dõi\\.\\.\\.`);
      await orderHandler.handleTrackForce(bot, chatId, code);

    } else if (d === 'track_cancel') {
      await safeEdit(bot, chatId, msgId, '❎ Đã bỏ qua\\.');

    // ── Clearlist
    } else if (d === 'clearlist_confirm') {
      const SubRepo = require('../db/repositories/SubscriptionRepository');
      const LogRepo = require('../db/repositories/LogRepository');
      const codes   = SubRepo.findByChatId(chatId);
      codes.forEach(code => SubRepo.remove(chatId, code));
      LogRepo.append(chatId, 'clearlist', `removed:${codes.length}`);
      await safeEdit(bot, chatId, msgId, `🗑️ Đã xóa *${codes.length}* đơn khỏi danh sách\\.`);

    } else if (d.startsWith('nap_amount:')) {
      const amount = parseInt(d.split(':')[1]);
      await payment.handleNapCallback(bot, chatId, msgId, amount);

    } else if (d === 'nap_custom') {
      await payment.handleNapCustom(bot, chatId, msgId);

    } else if (d === 'nap_cancel') {
      const { clear } = require('../utils/session');
      clear(chatId);
      await safeEdit(bot, chatId, msgId, '❎ Đã hủy nạp đơn\.');

    } else if (d === 'clearlist_cancel') {
      await safeEdit(bot, chatId, msgId, '❎ Đã hủy\\.');
    }

  } catch (err) {
    console.error(`[Callback] ${q.data}: ${err.message}`);
  }
}

module.exports = { handle };