const config        = require('../config');
const CreditService = require('../services/CreditService');
const { safeSend }  = require('../utils/sender');
const { esc }       = require('../utils/format');
const session       = require('../utils/session');

async function send(bot, chatId, text, extra = {}) {
  return safeSend(bot, chatId, text, extra);
}

function _addNapMessage(chatId, msgId) {
  if (!msgId) return;
  const s = session.get(chatId);
  const ids = Array.isArray(s.napMessageIds) ? s.napMessageIds : [];
  if (!ids.includes(msgId)) session.set(chatId, { napMessageIds: [...ids, msgId] });
}

function _removeNapMessage(chatId, msgId) {
  const s = session.get(chatId);
  const ids = Array.isArray(s.napMessageIds) ? s.napMessageIds : [];
  session.set(chatId, { napMessageIds: ids.filter(id => id !== msgId) });
}

// Tính số đơn từ số tiền dựa theo bảng giá
function calcCredits(amount) {
  // Tìm gói khớp chính xác trước
  const pkg = config.packages.find(p => p.amount === amount);
  if (pkg) return pkg.credits;
  // Tính tỷ lệ theo gói nhỏ nhất (20k = 10 đơn → 2000đ/đơn)
  return Math.floor(amount / 2000);
}

// Nội dung CK không dấu cách
function transferContent(chatId) {
  return `NAP${chatId}`;
}

// Tạo QR URL SePay
function makeQrUrl(amount, content) {
  const p = new URLSearchParams({
    bank:     config.sepay.bankName,
    acc:      config.sepay.bankAccount,
    template: 'compact2',
    amount:   String(amount),
    des:      content,
  });
  return `https://qr.sepay.vn/img?${p.toString()}`;
}

// /nap — hiện bảng giá
async function handleNap(bot, msg, args) {
  const chatId  = msg.chat.id;
  const bal     = CreditService.getBalance(chatId);
  const content = transferContent(chatId);

  // /nap <số tiền> — gửi QR thẳng
  if (args[0] && /^\d+$/.test(args[0])) {
    const amount  = parseInt(args[0]);
    const credits = calcCredits(amount);
    if (credits <= 0) return send(bot, chatId, `❌ Số tiền tối thiểu *20\\.000đ*\\.`);
    return _sendQr(bot, chatId, amount, credits, content, bal.total);
  }

  // Bảng giá inline keyboard
  const keyboard = config.packages.map(p => ([{
    text:          `${(p.amount/1000).toFixed(0)}k → ${p.credits} đơn`,
    callback_data: `nap_amount:${p.amount}`,
  }]));
  keyboard.push([{ text: '✏️ Nhập số tiền khác', callback_data: 'nap_custom' }]);

  const priceMsg = await send(bot, chatId,
    `💳 *NẠP ĐƠN*\n\n` +
    `💰 Số dư hiện tại: *${esc(String(bal.total))}* đơn\n\n` +
    `📦 *BẢNG GIÁ*\n` +
    `• 20\\.000đ → 10 đơn\n` +
    `• 50\\.000đ → 30 đơn\n` +
    `• 100\\.000đ → 70 đơn\n` +
    `• 200\\.000đ → 160 đơn\n\n` +
    `Chọn mệnh giá:`,
    { reply_markup: { inline_keyboard: keyboard } }
  );
  _addNapMessage(chatId, priceMsg?.message_id);
}


async function _sendQr(bot, chatId, amount, credits, content, currentBal) {
  const qrUrl     = makeQrUrl(amount, content);
  const amountFmt = esc(amount.toLocaleString('vi-VN'));

  try {
    const photoMsg = await bot.sendPhoto(chatId, qrUrl, {
      caption:
        `💳 *NẠP ${esc(String(credits))} ĐƠN*\n\n` +
        `🏦 ${esc(config.sepay.bankName)} \\| \`${esc(config.sepay.bankAccount)}\`\n` +
        `👤 ${esc(config.sepay.accountName)}\n` +
        `💰 Số tiền: *${amountFmt}đ*\n` +
        `📝 Nội dung: \`${esc(content)}\`\n\n` +
        `⚠️ *Nhập đúng nội dung để bot tự động cộng đơn*`,
      parse_mode: 'MarkdownV2',
    });
    _addNapMessage(chatId, photoMsg?.message_id);
  } catch {
    const textMsg = await send(bot, chatId,
      `💳 *NẠP ${esc(String(credits))} ĐƠN*\n\n` +
      `🏦 ${esc(config.sepay.bankName)} \\| \`${esc(config.sepay.bankAccount)}\`\n` +
      `👤 ${esc(config.sepay.accountName)}\n` +
      `💰 Số tiền: *${amountFmt}đ*\n` +
      `📝 Nội dung: \`${esc(content)}\`\n\n` +
      `⚠️ *Nhập đúng nội dung để bot tự động cộng đơn*`
    );
    _addNapMessage(chatId, textMsg?.message_id);
  }

  const waitingMsg = await send(bot, chatId,
    `⏳ Sau khi chuyển khoản bot sẽ tự cộng *${esc(String(credits))}* đơn trong vài giây\\.\n` +
    `💰 Số dư hiện tại: *${esc(String(currentBal))}* đơn`,
    {
      reply_markup: {
        inline_keyboard: [[{ text: '❌ Huỷ nạp đơn', callback_data: 'nap_cancel_pay' }]],
      },
    }
  );
  _addNapMessage(chatId, waitingMsg?.message_id);
}

async function handleNapCallback(bot, chatId, msgId, amount) {
  const credits = calcCredits(amount);
  const content = transferContent(chatId);
  const bal     = CreditService.getBalance(chatId);
  await bot.deleteMessage(chatId, msgId).catch(() => {});
  _removeNapMessage(chatId, msgId);
  await _sendQr(bot, chatId, amount, credits, content, bal.total);
}

async function handleNapCustom(bot, chatId, msgId) {
  session.set(chatId, { step: 'nap_custom_amount', napCustomPromptId: msgId });
  _addNapMessage(chatId, msgId);
  await bot.editMessageText(
    `✏️ *Nhập số tiền muốn nạp* \\(VNĐ\\):\n\nTối thiểu *20\\.000đ*`,
    { chat_id: chatId, message_id: msgId, parse_mode: 'MarkdownV2',
      reply_markup: { inline_keyboard: [[{ text: '❌ Hủy', callback_data: 'nap_cancel' }]] } }
  ).catch(() => {});
}

async function handleNapCustomInput(bot, chatId, text) {
  const amount  = parseInt(text.replace(/[.,\s]/g, ''));
  if (isNaN(amount) || amount < 20000) {
    await safeSend(bot, chatId, `❌ Tối thiểu *20\\.000đ*\\.`);
    return;
  }
  const credits = calcCredits(amount);
  const content = transferContent(chatId);
  const bal     = CreditService.getBalance(chatId);
  const s = session.get(chatId);
  if (s.napCustomPromptId) {
    await bot.deleteMessage(chatId, s.napCustomPromptId).catch(() => {});
    _removeNapMessage(chatId, s.napCustomPromptId);
  }
  session.unset(chatId, ['step', 'napCustomPromptId']);
  await _sendQr(bot, chatId, amount, credits, content, bal.total);
}

async function handleNapCancelAsk(bot, chatId, msgId) {
  await bot.editMessageText(
    `⚠️ *Xác nhận huỷ nạp đơn\\?*\n\n` +
    `Toàn bộ tin nhắn nạp đơn hiện tại sẽ bị xoá\\.`,
    {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Xác nhận huỷ', callback_data: 'nap_cancel_confirm' },
          { text: '↩️ Quay lại', callback_data: 'nap_cancel_abort' },
        ]],
      },
    }
  ).catch(() => {});
}

async function handleNapCancelConfirm(bot, chatId, msgId) {
  await clearNapFlow(bot, chatId, msgId);
  await safeSend(bot, chatId, `✅ Huỷ nạp đơn thành công\\.`);
}

async function handleNapCancelAbort(bot, chatId, msgId) {
  await bot.editMessageText(
    `⏳ Sau khi chuyển khoản bot sẽ tự cộng đơn trong vài giây\\.\n` +
    `Nếu muốn dừng, bấm nút bên dưới\\.`,
    {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'MarkdownV2',
      reply_markup: {
        inline_keyboard: [[{ text: '❌ Huỷ nạp đơn', callback_data: 'nap_cancel_pay' }]],
      },
    }
  ).catch(() => {});
}

async function clearNapFlow(bot, chatId, extraMsgId = null) {
  const s = session.get(chatId);
  const ids = Array.isArray(s.napMessageIds) ? s.napMessageIds : [];
  const toDelete = Array.from(new Set([...ids, extraMsgId].filter(Boolean)));
  for (const id of toDelete) {
    await bot.deleteMessage(chatId, id).catch(() => {});
  }
  session.unset(chatId, ['step', 'napCustomPromptId', 'napMessageIds']);
}

module.exports = {
  handleNap, handleNapCallback, handleNapCustom,
  handleNapCustomInput, handleNapCancelAsk, handleNapCancelConfirm, handleNapCancelAbort,
  clearNapFlow, transferContent, calcCredits,
};