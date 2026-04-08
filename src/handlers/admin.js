const UserRepo      = require('../db/repositories/UserRepository');
const SubRepo       = require('../db/repositories/SubscriptionRepository');
const LogRepo       = require('../db/repositories/LogRepository');
const CreditService = require('../services/CreditService');
const expressApi    = require('../api/expressApi');
const { safeSend }  = require('../utils/sender');
const { esc }       = require('../utils/format');
const config        = require('../config');

function isAdmin(msg) { return msg.from && msg.from.id === config.telegram.adminId; }

async function send(bot, chatId, text, extra = {}) {
  return safeSend(bot, chatId, text, extra);
}

function guard(bot, msg) {
  if (!isAdmin(msg)) {
    send(bot, msg.chat.id, '🚫 Chỉ admin mới dùng được lệnh này\\.');
    return false;
  }
  return true;
}

async function handleSetKey(bot, msg, args) {
  if (!guard(bot, msg)) return;
  if (!args[0]) return send(bot, msg.chat.id, '❌ `/setkey YOUR_API_KEY`');
  process.env.EXPRESS_API_KEY = args[0];
  config.express.apiKey = args[0];
  LogRepo.append(msg.chat.id, 'setkey', 'updated');
  await send(bot, msg.chat.id, `✅ API key cập nhật\\! \`${esc(args[0].slice(0, 8))}\\.\\.\\.\``);
}

async function handleAdmin(bot, msg) {
  if (!guard(bot, msg)) return;
  await send(bot, msg.chat.id,
    `⚙️ *ADMIN*\n\n` +
    `👥 Users: *${esc(String(UserRepo.count()))}*\n` +
    `🔔 Subscriptions: *${esc(String(SubRepo.findAll().length))}*\n\n` +
    `🛠️ Maintenance: *${config.bot.maintenance ? 'ON' : 'OFF'}*\n\n` +
    `/users /ban /unban\n` +
    `/addcredits \\<id\\> \\<số\\> \\- Nạp đơn\n` +
    `/broadcast \\- Thông báo tất cả\n` +
    `/logs \\- Log gần đây\n` +
    `/balance \\- Số dư API\n` +
    `/setkey \\- Cập nhật API key\n` +
    `/botoff \\- Bật bảo trì\n` +
    `/boton \\- Tắt bảo trì\n` +
    `/maintenance \\- Xem trạng thái`
  );
}

async function handleUsers(bot, msg) {
  if (!guard(bot, msg)) return;
  const users = UserRepo.findAll();
  if (!users.length) return send(bot, msg.chat.id, '📭 Chưa có user nào\\.');
  const lines = [`👥 *USER* \\(${esc(String(users.length))}\\)\n`];
  users.slice(-30).forEach((u, i) => {
    const name   = esc(u.firstName || u.username || 'Unknown');
    const banned = u.banned ? ' 🚫' : '';
    const total  = Math.round(((u.freeCredits || 0) + (u.referralCredits || 0) + (u.paidCredits || 0)) * 100) / 100;
    lines.push(`*${i + 1}\\.* ${name}${banned} \\| \`${esc(String(u.chatId))}\` \\| 💰${esc(String(total))}`);
  });
  await send(bot, msg.chat.id, lines.join('\n'));
}

async function handleBan(bot, msg, args) {
  if (!guard(bot, msg)) return;
  const id = parseInt(args[0]);
  if (!id) return send(bot, msg.chat.id, '❌ `/ban <chatId>`');
  UserRepo.update(id, { banned: true });
  LogRepo.append(msg.chat.id, 'ban', String(id));
  await send(bot, msg.chat.id, `🚫 Đã khóa \`${esc(String(id))}\`\\.`);
  try { await safeSend(bot, id, '🚫 Tài khoản bị khóa\\. Liên hệ admin\\.'); } catch {}
}

async function handleUnban(bot, msg, args) {
  if (!guard(bot, msg)) return;
  const id = parseInt(args[0]);
  if (!id) return send(bot, msg.chat.id, '❌ `/unban <chatId>`');
  UserRepo.update(id, { banned: false });
  LogRepo.append(msg.chat.id, 'unban', String(id));
  await send(bot, msg.chat.id, `✅ Đã mở khóa \`${esc(String(id))}\`\\.`);
  try { await safeSend(bot, id, '✅ Tài khoản đã được mở khóa\\!'); } catch {}
}

async function handleAddCredits(bot, msg, args) {
  if (!guard(bot, msg)) return;
  const id = parseInt(args[0]), amount = parseFloat(args[1]);
  if (!id || !amount || amount <= 0) return send(bot, msg.chat.id, '❌ `/addcredits <chatId> <số>`');
  CreditService.ensureUser(id);
  CreditService.addPaid(id, amount);
  const bal = CreditService.getBalance(id);
  await send(bot, msg.chat.id, `✅ Nạp *${esc(String(amount))}* đơn cho \`${esc(String(id))}\`\\. Tổng: *${esc(String(bal.total))}*`);
  try {
    await safeSend(bot, id,
      `💳 Admin đã nạp *${esc(String(amount))}* đơn\\!\n💰 Tổng: *${esc(String(bal.total))}* đơn`
    );
  } catch {}
}

async function handleBroadcast(bot, msg, args) {
  if (!guard(bot, msg)) return;
  const text = args.join(' ');
  if (!text) return send(bot, msg.chat.id, '❌ `/broadcast <nội dung>`');
  const users = UserRepo.findAll().filter(u => !u.banned);
  const load  = await send(bot, msg.chat.id, `📢 Đang gửi *${esc(String(users.length))}* user\\.\\.\\.`);
  let ok = 0, fail = 0;
  for (const u of users) {
    try { await safeSend(bot, u.chatId, `📢 *THÔNG BÁO*\n\n${esc(text)}`); ok++; }
    catch { fail++; }
    await new Promise(r => setTimeout(r, 50));
  }
  await bot.deleteMessage(msg.chat.id, load.message_id).catch(() => {});
  LogRepo.append(msg.chat.id, 'broadcast', `ok:${ok} fail:${fail}`);
  await send(bot, msg.chat.id, `✅ Xong\\! ✉️ ${esc(String(ok))} \\| ❌ ${esc(String(fail))}`);
}

async function handleLogs(bot, msg) {
  if (!guard(bot, msg)) return;
  const logs = LogRepo.recent(15);
  if (!logs.length) return send(bot, msg.chat.id, '📭 Chưa có log\\.');
  const lines = [`📋 *LOG*\n`];
  logs.forEach(l => {
    lines.push(`\`${esc(String(l.chatId))}\` ${esc(l.action)} ${esc(l.detail)} _${esc(new Date(l.at).toLocaleString('vi-VN'))}_`);
  });
  await send(bot, msg.chat.id, lines.join('\n'));
}

async function handleBalance(bot, msg) {
  if (!guard(bot, msg)) return;
  try {
    const data  = await expressApi.getBalance();
    const total = data.total ?? data.balance ?? '—';
    await send(bot, msg.chat.id, `💰 *Số dư API*\n\n🏦 Còn lại: *${esc(String(total))}* credit`);
  } catch (err) {
    await send(bot, msg.chat.id, `❌ ${esc(err.message)}`);
  }
}

async function handleBotOff(bot, msg) {
  if (!guard(bot, msg)) return;
  config.bot.maintenance = true;
  LogRepo.append(msg.chat.id, 'maintenance', 'on');
  await send(bot, msg.chat.id, '🛠️ Đã *BẬT* chế độ bảo trì\\. Chỉ admin dùng bot được\\.');
}

async function handleBotOn(bot, msg) {
  if (!guard(bot, msg)) return;
  config.bot.maintenance = false;
  LogRepo.append(msg.chat.id, 'maintenance', 'off');
  await send(bot, msg.chat.id, '✅ Đã *TẮT* bảo trì\\. User dùng bot lại bình thường\\.');
}

async function handleMaintenanceStatus(bot, msg) {
  if (!guard(bot, msg)) return;
  await send(
    bot,
    msg.chat.id,
    `🛠️ Maintenance hiện tại: *${config.bot.maintenance ? 'ON' : 'OFF'}*`
  );
}

module.exports = {
  isAdmin,
  handleSetKey, handleAdmin, handleUsers,
  handleBan, handleUnban, handleAddCredits,
  handleBroadcast, handleLogs, handleBalance,
  handleBotOff, handleBotOn, handleMaintenanceStatus,
};