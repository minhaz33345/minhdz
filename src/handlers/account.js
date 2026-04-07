const CreditService = require('../services/CreditService');
const UserRepo      = require('../db/repositories/UserRepository');
const SubRepo       = require('../db/repositories/SubscriptionRepository');
const { safeSend }  = require('../utils/sender');
const session       = require('../utils/session');
const config        = require('../config');

async function send(bot, chatId, text) {
  return safeSend(bot, chatId, text);
}

function parseReferrerId(startText = '') {
  const m = String(startText).match(/^\/start\s+(?:ref[_-]?)?([\w]+)$/i);
  return m ? m[1] : null;
}

function bindReferrer(userId, referrerId) {
  if (!referrerId || userId === referrerId) return false;
  const user = UserRepo.findById(userId);
  if (!user || user.referredBy) return false;
  UserRepo.update(userId, { referredBy: referrerId });
  return true;
}

async function resolveBotName(bot) {
  try {
    const me = await bot.getMe();
    return me?.display_name || me?.name || 'Bot theo dõi đơn';
  } catch {
    return 'Bot theo dõi đơn';
  }
}

async function handleStart(bot, msg) {
  const chatId = msg.chat.id;
  CreditService.ensureUser(chatId, { firstName: msg.from.first_name });

  const referrerId = parseReferrerId(msg.text || '');
  const linkedRef  = bindReferrer(chatId, referrerId);

  const name    = msg.from.first_name || 'bạn';
  const bal     = CreditService.getBalance(chatId);
  const isAdmin = msg.from.id === config.zalo.adminId;

  await send(bot, chatId,
    `👋 Xin chào ${name}!\n\n` +
    `🚀 Bot theo dõi đơn vận chuyển — tự thông báo khi có cập nhật.\n\n` +
    `💰 Số dư: ${bal.total} đơn\n\n` +
    `📦 Gõ /add <mã đơn> để bắt đầu\n` +
    `📖 Gõ /help để xem tất cả lệnh.` +
    (linkedRef ? `\n\n🎁 Đã ghi nhận người giới thiệu! Khi bạn nạp đơn thành công, người giới thiệu sẽ được +1 đơn.` : '') +
    (isAdmin ? `\n\n⚙️ Bạn là Admin | /admin` : '')
  );
}

async function handleHelp(bot, msg) {
  const chatId  = msg.chat.id;
  const isAdmin = msg.from.id === config.zalo.adminId;
  const bal     = CreditService.getBalance(chatId);
  const adminSec = isAdmin
    ? `\n\n⚙️ Admin\n` +
      `/admin - Bảng điều khiển\n` +
      `/users - Danh sách user\n` +
      `/ban /unban - Khóa/mở tài khoản\n` +
      `/broadcast - Thông báo tất cả\n` +
      `/logs - Log hệ thống`
    : '';

  await send(bot, chatId,
    `📖 DANH SÁCH LỆNH\n\n` +
    `📦 Theo dõi đơn\n` +
    `/add <mã> [tên] - Thêm & theo dõi tự động\n` +
    `/add - Hướng dẫn nhập mã & phí tra cứu\n` +
    `/list - Danh sách đơn (gõ số để xem, đổi tên, xóa)\n` +
    `/untrack <mã> - Bỏ theo dõi 1 đơn\n` +
    `/clearlist - Xóa toàn bộ danh sách\n\n` +
    `💳 Nạp đơn\n` +
    `/nap - Nạp đơn qua chuyển khoản ngân hàng\n\n` +
    `👥 Giới thiệu\n` +
    `/ref - Lấy link giới thiệu (+1 đơn khi bạn mời nạp thành công)\n\n` +
    `👤 Tài khoản\n` +
    `/me - Thông tin & số dư\n` +
    `/contact - Liên hệ admin${adminSec}\n\n` +
    `💰 Số dư: ${bal.total} đơn`
  );
}

async function handleMe(bot, msg) {
  const chatId = msg.chat.id;
  CreditService.ensureUser(chatId, { firstName: msg.from.first_name });
  const user   = UserRepo.findById(chatId);
  const bal    = CreditService.getBalance(chatId);
  const subs   = SubRepo.findByChatId(chatId);
  const joined = user ? new Date(user.joinedAt).toLocaleDateString('vi-VN') : '—';

  const trialLine = bal.trial > 0
    ? `\n   🎁 Dùng thử: ${bal.trial} đơn` : '';

  await send(bot, chatId,
    `👤 THÔNG TIN TÀI KHOẢN\n\n` +
    `📛 Tên: ${msg.from.first_name || '—'}\n` +
    `🆔 ID: ${chatId}\n` +
    `📅 Tham gia: ${joined}\n` +
    `📋 Đang theo dõi: ${subs.length} đơn\n\n` +
    `💰 SỐ DƯ${trialLine}\n` +
    `   👥 Giới thiệu: ${bal.referral} đơn\n` +
    `   💳 Đã nạp: ${bal.paid} đơn\n` +
    `   📊 Tổng: ${bal.total} đơn\n\n` +
    `Gõ /nap để nạp thêm đơn`
  );
}

async function handleRef(bot, msg) {
  const chatId = msg.chat.id;
  CreditService.ensureUser(chatId, { firstName: msg.from.first_name });

  // Zalo không có username kiểu @, dùng deep link dạng chat ID
  const webhookUrl = config.zalo.webhookUrl || 'https://your-domain.com';
  const link = `${webhookUrl}/ref/${chatId}`;

  await send(bot, chatId,
    `👥 LINK GIỚI THIỆU\n\n` +
    `ID của bạn: ${chatId}\n\n` +
    `Chia sẻ ID này để mời bạn bè. Khi ai đó bắt đầu bot bằng lệnh:\n` +
    `/start ref_${chatId}\n\n` +
    `🎁 Khi user mới nạp đơn thành công lần đầu, bạn được +1 đơn.`
  );
}

async function handleContact(bot, msg) {
  const chatId = msg.chat.id;
  await send(bot, chatId,
    `📞 LIÊN HỆ & HỖ TRỢ\n\n${config.contact}\n\n` +
    `🆔 ID của bạn: ${chatId}\n` +
    `(Cung cấp ID này khi liên hệ admin)`
  );
}

async function handleCancel(bot, msg) {
  session.clear(msg.chat.id);
  await send(bot, msg.chat.id, '❎ Đã hủy thao tác.');
}

module.exports = { handleStart, handleHelp, handleMe, handleRef, handleContact, handleCancel };