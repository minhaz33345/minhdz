const config        = require('../config');
const CreditService = require('../services/CreditService');
const { safeSend }  = require('../utils/sender');
const session       = require('../utils/session');

async function send(bot, chatId, text) {
  return safeSend(bot, chatId, text);
}

// Tính số đơn từ số tiền dựa theo bảng giá
function calcCredits(amount) {
  const pkg = config.packages.find(p => p.amount === amount);
  if (pkg) return pkg.credits;
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

// /nap — hiện bảng giá dạng text menu
async function handleNap(bot, msg, args) {
  const chatId  = msg.chat.id;
  const bal     = CreditService.getBalance(chatId);
  const content = transferContent(chatId);

  // /nap <số tiền> — gửi QR thẳng
  if (args[0] && /^\d+$/.test(args[0])) {
    const amount  = parseInt(args[0]);
    const credits = calcCredits(amount);
    if (credits <= 0) return send(bot, chatId, `❌ Số tiền tối thiểu 20.000đ.`);
    return _sendQr(bot, chatId, amount, credits, content, bal.total);
  }

  // Bảng giá text menu
  const lines = [
    `💳 NẠP ĐƠN\n`,
    `💰 Số dư hiện tại: ${bal.total} đơn\n`,
    `📦 BẢNG GIÁ`,
    ...config.packages.map((p, i) => `${i + 1}. ${(p.amount/1000).toFixed(0)}k → ${p.credits} đơn`),
    `${config.packages.length + 1}. Nhập số tiền khác`,
    `\nGõ số thứ tự để chọn, hoặc /huy để hủy`,
  ];

  session.set(chatId, { step: 'nap_select' });
  await send(bot, chatId, lines.join('\n'));
}

// Xử lý chọn gói nạp từ text menu
async function handleNapSelect(bot, chatId, text) {
  const choice = parseInt(text.trim());
  const bal    = CreditService.getBalance(chatId);

  if (isNaN(choice) || choice < 1 || choice > config.packages.length + 1) {
    return send(bot, chatId, `❌ Gõ số từ 1 đến ${config.packages.length + 1}, hoặc /huy để hủy.`);
  }

  if (choice === config.packages.length + 1) {
    // Nhập số tiền tùy chỉnh
    session.set(chatId, { step: 'nap_custom_amount' });
    return send(bot, chatId, `✏️ Nhập số tiền muốn nạp (VNĐ):\n\nTối thiểu 20.000đ\n(Hoặc /huy để hủy)`);
  }

  const pkg     = config.packages[choice - 1];
  const content = transferContent(chatId);
  session.clear(chatId);
  await _sendQr(bot, chatId, pkg.amount, pkg.credits, content, bal.total);
}

async function _sendQr(bot, chatId, amount, credits, content, currentBal) {
  const qrUrl     = makeQrUrl(amount, content);
  const amountFmt = amount.toLocaleString('vi-VN');

  // Gửi ảnh QR kèm caption
  await bot.sendPhoto(chatId, qrUrl,
    `💳 NẠP ${credits} ĐƠN\n\n` +
    `🏦 ${config.sepay.bankName} | ${config.sepay.bankAccount}\n` +
    `👤 ${config.sepay.accountName}\n` +
    `💰 Số tiền: ${amountFmt}đ\n` +
    `📝 Nội dung: ${content}\n\n` +
    `⚠️ Nhập đúng nội dung để bot tự động cộng đơn`
  );

  await send(bot, chatId,
    `⏳ Sau khi chuyển khoản bot sẽ tự cộng ${credits} đơn trong vài giây.\n` +
    `💰 Số dư hiện tại: ${currentBal} đơn\n\n` +
    `Gõ /huy nếu muốn hủy thao tác.`
  );
}

async function handleNapCustomInput(bot, chatId, text) {
  const amount  = parseInt(text.replace(/[.,\s]/g, ''));
  if (isNaN(amount) || amount < 20000) {
    return send(bot, chatId, `❌ Tối thiểu 20.000đ.`);
  }
  const credits = calcCredits(amount);
  const content = transferContent(chatId);
  const bal     = CreditService.getBalance(chatId);
  session.clear(chatId);
  await _sendQr(bot, chatId, amount, credits, content, bal.total);
}

// clearNapFlow — Zalo không có delete message, chỉ clear session
async function clearNapFlow(bot, chatId) {
  session.unset(chatId, ['step', 'napMessageIds']);
}

module.exports = {
  handleNap, handleNapSelect,
  handleNapCustomInput,
  clearNapFlow, transferContent, calcCredits,
};