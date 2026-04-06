const CreditService = require('../services/CreditService');
const UserRepo      = require('../db/repositories/UserRepository');
const SubRepo       = require('../db/repositories/SubscriptionRepository');
const { safeSend }  = require('../utils/sender');
const { esc }       = require('../utils/format');
const session       = require('../utils/session');
const config        = require('../config');

async function send(bot, chatId, text, extra = {}) {
  return safeSend(bot, chatId, text, extra);
}

async function handleStart(bot, msg) {
  CreditService.ensureUser(msg.chat.id, { username: msg.from.username, firstName: msg.from.first_name });
  const name    = esc(msg.from.first_name || 'bạn');
  const bal     = CreditService.getBalance(msg.chat.id);
  const isAdmin = msg.from.id === config.telegram.adminId;
  await send(bot, msg.chat.id,
    `👋 Xin chào *${name}*\\!\n\n` +
    `🚀 Bot theo dõi đơn vận chuyển — tự thông báo khi có cập nhật\\.\n\n` +
    `💰 Số dư: *${esc(String(bal.total))}* đơn\n\n` +
    `📦 Gõ /add \\<mã đơn\\> để bắt đầu\n` +
    `📖 Gõ /help để xem tất cả lệnh\\.` +
    (isAdmin ? `\n\n⚙️ *Bạn là Admin* \\| /admin` : '')
  );
}

async function handleHelp(bot, msg) {
  const isAdmin = msg.from.id === config.telegram.adminId;
  const bal     = CreditService.getBalance(msg.chat.id);
  const adminSec = isAdmin
    ? `\n\n⚙️ *Admin*\n` +
      `/admin \\- Bảng điều khiển\n` +
      `/users \\- Danh sách user\n` +
      `/ban /unban \\- Khóa/mở tài khoản\n` +
      `/broadcast \\- Thông báo tất cả\n` +
      `/logs \\- Log hệ thống`
    : '';

  await send(bot, msg.chat.id,
    `📖 *DANH SÁCH LỆNH*\n\n` +
    `📦 *Theo dõi đơn*\n` +
    `/add \\<mã\\> \\[tên\\] \\- Thêm & theo dõi tự động\n` +
    `/add \\- Hướng dẫn nhập mã & phí tra cứu\n` +
    `/list \\- Danh sách đơn \\(bấm để xem, đổi tên, xóa\\)\n` +
    `/untrack \\<mã\\> \\- Bỏ theo dõi 1 đơn\n` +
    `/clearlist \\- Xóa toàn bộ danh sách\n\n` +
    `💳 *Nạp đơn*\n` +
    `/nap \\- Nạp đơn qua chuyển khoản ngân hàng\n\n` +
    `👤 *Tài khoản*\n` +
    `/me \\- Thông tin & số dư\n` +
    `/contact \\- Liên hệ admin${adminSec}\n\n` +
    `💰 Số dư: *${esc(String(bal.total))}* đơn`
  );
}

async function handleMe(bot, msg) {
  CreditService.ensureUser(msg.chat.id, { username: msg.from.username, firstName: msg.from.first_name });
  const user   = UserRepo.findById(msg.chat.id);
  const bal    = CreditService.getBalance(msg.chat.id);
  const subs   = SubRepo.findByChatId(msg.chat.id);
  const joined = user ? new Date(user.joinedAt).toLocaleDateString('vi-VN') : '—';

  const trialLine = bal.trial > 0
    ? `\n   🎁 Dùng thử: *${esc(String(bal.trial))}* đơn` : '';

  await send(bot, msg.chat.id,
    `👤 *THÔNG TIN TÀI KHOẢN*\n\n` +
    `📛 Tên: *${esc(msg.from.first_name || '—')}*\n` +
    `🆔 ID: \`${esc(String(msg.chat.id))}\`\n` +
    `📅 Tham gia: ${esc(joined)}\n` +
    `📋 Đang theo dõi: *${esc(String(subs.length))}* đơn\n\n` +
    `💰 *SỐ DƯ*${trialLine}\n` +
    `   👥 Giới thiệu: *${esc(String(bal.referral))}* đơn\n` +
    `   💳 Đã nạp: *${esc(String(bal.paid))}* đơn\n` +
    `   📊 Tổng: *${esc(String(bal.total))}* đơn\n\n` +
    `_Gõ /nap để nạp thêm đơn_`
  );
}

async function handleContact(bot, msg) {
  await send(bot, msg.chat.id,
    `📞 *LIÊN HỆ & HỖ TRỢ*\n\n${esc(config.contact)}\n\n` +
    `🆔 ID của bạn: \`${esc(String(msg.chat.id))}\`\n` +
    `_\\(Cung cấp ID này khi liên hệ admin\\)_`
  );
}

async function handleCancel(bot, msg) {
  session.clear(msg.chat.id);
  await send(bot, msg.chat.id, '❎ Đã hủy thao tác\\.');
}

module.exports = { handleStart, handleHelp, handleMe, handleContact, handleCancel };