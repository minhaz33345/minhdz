const expressApi     = require('../api/expressApi');
const SubRepo        = require('../db/repositories/SubscriptionRepository');
const OrderCacheRepo = require('../db/repositories/OrderCacheRepository');
const LogRepo        = require('../db/repositories/LogRepository');
const { extractLatest, getSortedTrackingHistory, toMillis } = require('../services/OrderService');
const config         = require('../config');

let botRef      = null;
let intervalRef = null;
let isRunning   = false;
let pendingRun  = false;

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
  console.log(
    `🔔 NotifyService started — interval: ${config.notify.intervalSec}s, ` +
    `batch:${config.notify.batchSize}, gap:${config.notify.batchGapMs}ms`
  );
  triggerNow('startup');
  intervalRef = setInterval(run, config.notify.intervalSec * 1000);
}


function triggerNow(reason = 'manual') {
  if (!botRef) return;
  if (isRunning) {
    pendingRun = true;
    return;
  }
  run().catch((err) => {
    console.warn(`[Notify] trigger(${reason}) failed: ${err.message}`);
  });
}

function stop() {
  if (intervalRef) clearInterval(intervalRef);
}

async function run() {
  if (isRunning) return;
  if (!botRef) return;
  const codes = SubRepo.allTrackedCodes();
  if (!codes.length) return;
  isRunning = true;

  try {
    const batchSize = Math.max(1, config.notify.batchSize || 5);
    for (let i = 0; i < codes.length; i += batchSize) {
      const batch = codes.slice(i, i + batchSize);
      await Promise.all(batch.map(code => _processCode(code)));
      if (i + batchSize < codes.length) {
        await new Promise(r => setTimeout(r, config.notify.batchGapMs || 150));
      }
    }
  } finally {
    isRunning = false;
    if (pendingRun) {
      pendingRun = false;
      setTimeout(() => triggerNow('pending'), 0);
    }
  }
}

async function _processCode(code) {
  try {
    const order     = await expressApi.getOrderDetail(code);
    const name      = order.item_name || code;
    const latest    = extractLatest(order);
    const history   = getSortedTrackingHistory(order);
    const newStatus = latest.status;

    if (!newStatus) return;

    const cached    = OrderCacheRepo.findByCode(code);
    const oldStatus = cached?.status || null;
    const newEvents = _extractNewEvents(history, cached);

    if (oldStatus !== null && newEvents.length) {
      const eventToNotify = newEvents[newEvents.length - 1];
      const isFinal       = isFinalStatus(eventToNotify.status || newStatus);
      await _notifyAll(code, name, oldStatus, eventToNotify, newEvents.length, isFinal);

      if (isFinal) {
        // Ngừng theo dõi tất cả user đang track đơn này
        const chatIds = SubRepo.chatIdsForCode(code);
        chatIds.forEach(chatId => SubRepo.remove(chatId, code));
        LogRepo.append(0, 'auto_untrack', `${code} final:${newStatus}`);
      }
    }

    const latestSignature = _eventSignature(latest);
    OrderCacheRepo.upsert(code, newStatus, name, null, {
      lastTrackingTime: toMillis(latest.time),
      lastTrackingSignature: latestSignature,
    });
  } catch (err) {
    console.warn(`[Notify] Skip code=${code}: ${err.message}`);
  }
}

function _eventSignature(event = {}) {
  return `${event.time || ''}|${event.status || ''}|${event.location || ''}`;
}

function _extractNewEvents(history, cached) {
  if (!history.length) return [];

  const lastTime = cached?.lastTrackingTime ?? null;
  const lastSig  = cached?.lastTrackingSignature ?? null;

  if (lastTime == null && !lastSig) return [];

  // Cắt theo event cuối cùng đã xử lý để tránh notify lặp, kể cả event thiếu time.
  if (lastSig) {
    const lastIdx = history.map((e, idx) => ({ e, idx })).reverse().find(({ e }) => {
      const sig = _eventSignature(e);
      if (sig !== lastSig) return false;
      if (lastTime == null) return true;
      const t = toMillis(e.time);
      return t === lastTime;
    })?.idx;

    if (typeof lastIdx === 'number') return history.slice(lastIdx + 1);
  }

  // Fallback cho dữ liệu legacy chưa có signature/time đồng bộ.
  return history.filter((e) => {
    const t = toMillis(e.time);
    return lastTime != null && t != null && t > lastTime;
  });
}

async function _notifyAll(code, name, oldStatus, latestEvent, newEventCount, isFinal) {
  const chatIds = SubRepo.chatIdsForCode(code);
  const newStatus = latestEvent.status || oldStatus;
  const location  = latestEvent.location ? latestEvent.location.split('☎')[0].trim() : '';
  const locLine   = location ? `\n📍 ${_esc(location)}` : '';
  const timeLine  = latestEvent.time ? `\n🕒 ${_esc(latestEvent.time)}` : '';
  const flowLine  = newEventCount > 1 ? `\n📈 Có *${newEventCount}* chặng mới từ API` : '';

  let text;
  if (isFinal) {
    text = (
      `✅ *ĐƠN HÀNG ĐÃ GIAO THÀNH CÔNG*\n\n` +
      `📦 *${_esc(name)}*\n` +
      `🔖 Mã: \`${_esc(code.replace(/-\d{4}$/, ''))}\`\n\n` +
      `📌 *${_esc(newStatus)}*${locLine}${timeLine}${flowLine}\n\n` +
      `_Bot đã ngừng theo dõi đơn này\\._`
    );
  } else {
    text = (
      `🔔 *CẬP NHẬT ĐƠN HÀNG*\n\n` +
      `📦 *${_esc(name)}*\n` +
      `🔖 Mã: \`${_esc(code.replace(/-\d{4}$/, ''))}\`\n\n` +
      `📌 ${_esc(oldStatus)} ➡️ *${_esc(newStatus)}*${locLine}${timeLine}${flowLine}`
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

module.exports = { init, stop, triggerNow };