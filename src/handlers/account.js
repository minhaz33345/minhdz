const CreditService = require('../services/CreditService');
const UserRepo      = require('../db/repositories/UserRepository');
const SubRepo       = require('../db/repositories/SubscriptionRepository');
const { safeSend }  = require('../utils/sender');
const { esc }       = require('../utils/format');
const session       = require('../utils/session');
const config        = require('../config');

let cachedBotUsername = null;

async function send(bot, chatId, text, extra = {}) {
  return safeSend(bot, chatId, text, extra);
}

function parseReferrerId(startText = '') {
  const m = String(startText).match(/^\/?start(?:@\S+)?\s+(?:ref[_-]?)?(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
}

function bindReferrer(userId, referrerId) {
  if (!referrerId || !Number.isInteger(referrerId)) return false;
  if (userId === referrerId) return false;

  const user = UserRepo.findById(userId);
  if (!user) return false;
  if (user.referredBy) return false; // đã gắn trước đó thì không đổi

  UserRepo.update(userId, { referredBy: referrerId });
  return true;
}

async function resolveBotUsername(bot) {
  if (cachedBotUsername) return cachedBotUsername;
  try {
    const me = await bot.getMe();
    cachedBotUsername = me?.username || null;
  } catch {
    cachedBotUsername = null;
  }
  return cachedBotUsername;
}

async function handleStart(bot, msg) {
  CreditService.ensureUser(msg.chat.id, { username: msg.from.username, firstName: msg.from.first_name });

  const referrerId = parseReferrerId(msg.text || '');
  const linkedRef  = bindReferrer(msg.chat.id, referrerId);

  const name    = esc(msg.from.first_name || 'bạn');
  const bal     = CreditService.getBalance(msg.chat.id);
  const isAdmin = msg.from.id === config.telegram.adminId;

  await send(bot, msg.chat.id,
    `👋 Xin chào *${name}*\\!\n\n` +
    `🚀 Bot theo dõi đơn vận chuyển — tự thông báo khi có cập nhật\\.\n\n` +
    `💰 Số dư: *${esc(String(bal.total))}* đơn\n\n` +
    `📦 Gõ /add \\<mã đơn\\> để bắt đầu\n` +
    `📖 Gõ /help để xem tất cả lệnh\\.` +
    (linkedRef ? `\n\n🎁 Đã ghi nhận người giới thiệu\\! Khi bạn nạp đơn thành công, người giới thiệu sẽ được \\+1 đơn\\.` : '') +
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
    `👥 *Giới thiệu*\n` +
    `/ref \\- Lấy link giới thiệu \\(+1 đơn khi bạn mời nạp thành công\\)\n\n` +
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

async function handleRef(bot, msg) {
  CreditService.ensureUser(msg.chat.id, { username: msg.from.username, firstName: msg.from.first_name });
  const username = await resolveBotUsername(bot);
  if (!username) {
    return send(bot, msg.chat.id, '❌ Chưa lấy được username bot\\. Thử lại sau nhé\\.');
  }

  const link = `https://t.me/${username}?start=ref_${msg.chat.id}`;
  await send(bot, msg.chat.id,
    `👥 *LINK GIỚI THIỆU*\n\n` +
    `${esc(link)}\n\n` +
    `🎁 Khi user mới vào từ link này và *nạp đơn thành công lần đầu*, bạn được *\\+1 đơn*\\.`
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

module.exports = { handleStart, handleHelp, handleMe, handleRef, handleContact, handleCancel };