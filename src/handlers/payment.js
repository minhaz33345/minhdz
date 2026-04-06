const config        = require('../config');
const CreditService = require('../services/CreditService');
const { safeSend }  = require('../utils/sender');
const { esc }       = require('../utils/format');

async function send(bot, chatId, text, extra = {}) {
  return safeSend(bot, chatId, text, extra);
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

  await send(bot, chatId,
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
}


async function _sendQr(bot, chatId, amount, credits, content, currentBal) {
  const qrUrl     = makeQrUrl(amount, content);
  const amountFmt = esc(amount.toLocaleString('vi-VN'));

  try {
    await bot.sendPhoto(chatId, qrUrl, {
      caption:
        `💳 *NẠP ${esc(String(credits))} ĐƠN*\n\n` +
        `🏦 ${esc(config.sepay.bankName)} \\| \`${esc(config.sepay.bankAccount)}\`\n` +
        `👤 ${esc(config.sepay.accountName)}\n` +
        `💰 Số tiền: *${amountFmt}đ*\n` +
        `📝 Nội dung: \`${esc(content)}\`\n\n` +
        `⚠️ *Nhập đúng nội dung để bot tự động cộng đơn*`,
      parse_mode: 'MarkdownV2',
    });
  } catch {
    await send(bot, chatId,
      `💳 *NẠP ${esc(String(credits))} ĐƠN*\n\n` +
      `🏦 ${esc(config.sepay.bankName)} \\| \`${esc(config.sepay.bankAccount)}\`\n` +
      `👤 ${esc(config.sepay.accountName)}\n` +
      `💰 Số tiền: *${amountFmt}đ*\n` +
      `📝 Nội dung: \`${esc(content)}\`\n\n` +
      `⚠️ *Nhập đúng nội dung để bot tự động cộng đơn*`
    );
  }

  await send(bot, chatId,
    `⏳ Sau khi chuyển khoản bot sẽ tự cộng *${esc(String(credits))}* đơn trong vài giây\\.\n` +
    `💰 Số dư hiện tại: *${esc(String(currentBal))}* đơn`
  );
}

async function handleNapCallback(bot, chatId, msgId, amount) {
  const credits = calcCredits(amount);
  const content = transferContent(chatId);
  const bal     = CreditService.getBalance(chatId);
  await bot.deleteMessage(chatId, msgId).catch(() => {});
  await _sendQr(bot, chatId, amount, credits, content, bal.total);
}

async function handleNapCustom(bot, chatId, msgId) {
  const { set } = require('../utils/session');
  set(chatId, { step: 'nap_custom_amount' });
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
  await _sendQr(bot, chatId, amount, credits, content, bal.total);
}

module.exports = {
  handleNap, handleNapCallback, handleNapCustom,
  handleNapCustomInput, transferContent, calcCredits,
};