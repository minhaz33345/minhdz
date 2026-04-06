const expressApi     = require('../api/expressApi');
const SubRepo        = require('../db/repositories/SubscriptionRepository');
const OrderCacheRepo = require('../db/repositories/OrderCacheRepository');
const LogRepo        = require('../db/repositories/LogRepository');
const { extractLatest } = require('../services/OrderService');
const config         = require('../config');

let botRef      = null;
let intervalRef = null;

// Các trạng thái "đã hoàn tất" — ngừng theo dõi sau khi thông báo
const FINAL_STATUSES = [
  'Đã phát thành công',
  'Giao hàng thành công',
  'Đã giao hàng',
  'Phát thành công',
  'Delivered',
  'delivered',
  'Đã ký nhận',
  'Ký nhận thành công',
  'Hoàn thành',
];

function isFinalStatus(status = '') {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return FINAL_STATUSES.some(f => s.includes(f.toLowerCase())) ||
    s.includes('phát thành công') ||
    s.includes('giao thành công') ||
    s.includes('ký nhận') ||
    s.includes('delivered') ||
    s.includes('hoàn thành');
}

function init(bot) {
  botRef = bot;
  console.log(`🔔 NotifyService started — interval: ${config.notify.intervalSec}s`);
  intervalRef = setInterval(run, config.notify.intervalSec * 1000);
}

function stop() {
  if (intervalRef) clearInterval(intervalRef);
}

async function run() {
  if (!botRef) return;
  const codes = SubRepo.allTrackedCodes();
  if (!codes.length) return;

  for (const code of codes) {
    try {
      const order     = await expressApi.getOrderDetail(code);
      const name      = order.item_name || code;
      const latest    = extractLatest(order);
      const newStatus = latest.status;

      if (!newStatus) continue;

      const cached    = OrderCacheRepo.findByCode(code);
      const oldStatus = cached?.status || null;

      if (oldStatus !== null && oldStatus !== newStatus) {
        const isFinal = isFinalStatus(newStatus);
        await _notifyAll(code, name, oldStatus, newStatus, latest.location, isFinal);

        if (isFinal) {
          // Ngừng theo dõi tất cả user đang track đơn này
          const chatIds = SubRepo.chatIdsForCode(code);
          chatIds.forEach(chatId => SubRepo.remove(chatId, code));
          LogRepo.append(0, 'auto_untrack', `${code} final:${newStatus}`);
        }
      }

      OrderCacheRepo.upsert(code, newStatus, name);
    } catch { /* đơn bị xóa hoặc API lỗi tạm */ }

    await new Promise(r => setTimeout(r, 400));
  }
}

async function _notifyAll(code, name, oldStatus, newStatus, location, isFinal) {
  const chatIds = SubRepo.chatIdsForCode(code);
  const locLine = location ? `\n📍 ${_esc(location)}` : '';

  let text;
  if (isFinal) {
    text = (
      `✅ *ĐƠN HÀNG ĐÃ GIAO THÀNH CÔNG*\n\n` +
      `📦 *${_esc(name)}*\n` +
      `🔖 Mã: \`${_esc(code.replace(/-\d{4}$/, ''))}\`\n\n` +
      `📌 *${_esc(newStatus)}*${locLine}\n\n` +
      `_Bot đã ngừng theo dõi đơn này\\._`
    );
  } else {
    text = (
      `🔔 *CẬP NHẬT ĐƠN HÀNG*\n\n` +
      `📦 *${_esc(name)}*\n` +
      `🔖 Mã: \`${_esc(code.replace(/-\d{4}$/, ''))}\`\n\n` +
      `📌 ${_esc(oldStatus)} ➡️ *${_esc(newStatus)}*${locLine}`
    );
  }

  for (const chatId of chatIds) {
    try {
      const { safeSend } = require('../utils/sender');
      await safeSend(botRef, chatId, text);
      LogRepo.append(chatId, 'notify', `${code}: ${oldStatus} → ${newStatus}${isFinal ? ' [FINAL]' : ''}`);
    } catch (e) {
      console.error(`[Notify] Failed chatId=${chatId} code=${code}: ${e.message}`);
    }
  }
}

function _esc(t) {
  if (t == null) return '';
  return String(t).replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
}

module.exports = { init, stop };