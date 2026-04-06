const expressApi     = require('../api/expressApi');
const SubRepo        = require('../db/repositories/SubscriptionRepository');
const OrderCacheRepo = require('../db/repositories/OrderCacheRepository');
const LogRepo        = require('../db/repositories/LogRepository');

// ─── Partner map (đúng với API) ────────────────────────────────
// Chỉ dùng để detect khi user không ép hãng
// Không truyền partner vào API khi đoán — để API tự nhận diện
// Chỉ truyền partner khi user ép hãng tường minh (prefix)
const FORCED_PARTNER_MAP = {
  SPX: 'SPX', GHN: 'GHN', GHTK: 'GHTK',
  JT: 'JT', JNT: 'JT',
  LEX: 'LEX', LAZADA: 'LEX',
  VNPOST: 'VNPOST', EMS: 'VNPOST',
  VIETTELPOST: 'VIETTELPOST', VTP: 'VIETTELPOST',
  BEST: 'BEST', FUTA: 'FUTA', TFE: 'TFE',
  NHATTIN: 'NHATTIN', NETCO: 'NETCO', NETPOST: 'NETPOST',
};

// Chỉ dùng để hiển thị tên đẹp
const PARTNER_DISPLAY = {
  SPX: 'Shopee Express', GHN: 'Giao Hàng Nhanh', GHTK: 'Giao Hàng Tiết Kiệm',
  JT: 'J&T Express', LEX: 'Lazada Express', VNPOST: 'VN Post',
  VIETTELPOST: 'Viettel Post', BEST: 'Best Express', FUTA: 'FUTA Express',
  TFE: 'TFE Express', NHATTIN: 'Nhất Tín', NETCO: 'Netco', NETPOST: 'Net Post',
};

// Parse input dòng đơn: "VNPOST MãĐơn-4SĐT Tên gợi nhớ"
function parseLine(line) {
  const parts = line.trim().split(/\s+/);
  if (!parts.length || !parts[0]) return null;

  let forcedPartner = null;
  let codeRaw, nameParts;

  const firstUp = parts[0].toUpperCase();
  if (FORCED_PARTNER_MAP[firstUp] && parts.length >= 2) {
    forcedPartner = FORCED_PARTNER_MAP[firstUp];
    codeRaw       = parts[1];
    nameParts     = parts.slice(2);
  } else {
    codeRaw   = parts[0];
    nameParts = parts.slice(1);
  }

  // Tách phone suffix MãĐơn-4SĐT
  const m           = codeRaw.match(/^(.+)-(\d{4})$/);
  const baseCode    = m ? m[1] : codeRaw;
  const phoneSuffix = m ? m[2] : null;

  if (!baseCode || baseCode.length < 4) return null;

  return {
    fullCode:      phoneSuffix ? `${baseCode}-${phoneSuffix}` : baseCode,
    forcedPartner, // null nếu user không ép hãng
    displayName:   nameParts.join(' ') || null,
  };
}

// Parse nhiều đơn cách nhau bởi |
function parseInput(text) {
  return text.split('|').map(s => s.trim()).filter(Boolean).map(parseLine).filter(Boolean);
}

// Lấy latest status + location từ tracking_history
function extractLatest(order) {
  const history = order.tracking_history || [];
  if (!history.length) return { status: null, location: null, time: null };
  const last = history[history.length - 1];
  return {
    status:   last.status   || null,
    location: last.location ? last.location.split('☎')[0].trim() : null,
    time:     last.time     || null,
  };
}

// Lấy credit cost của 1 partner
function getCreditCost(partner) {
  const config = require('../config');
  if (!partner) return 1;
  return config.partnerCreditCost[partner.toUpperCase()] || 1;
}

// Thêm & bắt đầu theo dõi 1 đơn — trả về kết quả để handler format
async function addAndTrack(chatId, parsed) {
  const { fullCode, forcedPartner, displayName } = parsed;
  const codeUpper = fullCode.toUpperCase();

  // Idempotency: đang theo dõi rồi
  const subs = SubRepo.findByChatId(chatId);
  if (subs.includes(codeUpper)) {
    const cached = OrderCacheRepo.findByCode(codeUpper);
    return { type: 'ALREADY_TRACKING', code: fullCode, cached };
  }

  // Kiểm tra cache: đơn đã từng được add chưa, và bởi ai
  // - null    → đơn mới hoàn toàn → trừ credit
  // - 'own'   → chính user này đã add trước (restart/xóa data) → miễn phí
  // - 'sync'  → đơn lấy từ API lúc startup, không rõ chủ → trừ credit (an toàn)
  // - 'other' → người khác đã add → trừ credit bình thường
  const ownership = OrderCacheRepo.checkOwnership(codeUpper, chatId);
  const isFreeRe  = ownership === 'own'; // chỉ miễn phí nếu chính mình đã add

  // Bước 1: POST /orders — thêm đơn vào hệ thống express.io.vn
  try {
    const addPayload = { code: fullCode };
    if (displayName)   addPayload.name    = displayName;
    if (forcedPartner) addPayload.partner = forcedPartner;

    const addResult = await expressApi.addOrders([addPayload]);

    // Kiểm tra errors — chỉ "Đơn hàng đã tồn tại" mới được bỏ qua
    const err = addResult.errors.find(e => e.code === fullCode || e.code === codeUpper);
    if (err) {
      const alreadyExists = err.error && (
        err.error.includes('đã tồn tại') ||
        err.error.includes('already exists') ||
        err.error.toLowerCase().includes('exist')
      );
      if (!alreadyExists) {
        return { type: 'API_ERROR', code: fullCode, error: err.error };
      }
    }
  } catch (err) {
    return { type: 'API_ERROR', code: fullCode, error: err.message };
  }

  // Bước 2: GET /orders/{id} — lấy thông tin sau khi add
  let order;
  try {
    order = await expressApi.getOrderDetail(fullCode, forcedPartner || null);
  } catch (err) {
    SubRepo.add(chatId, fullCode);
    const name       = displayName || fullCode;
    const creditCost = isFreeRe ? 0 : getCreditCost((forcedPartner || '').toUpperCase());
    OrderCacheRepo.upsert(fullCode, null, name, chatId); // lưu ownership ngay
    LogRepo.append(chatId, 'add', `${fullCode} cost:${creditCost} ownership:${ownership}`);
    return { type: 'ADDED_PENDING', code: fullCode, name, creditCost };
  }

  const name       = displayName || order.item_name || fullCode;
  const partnerKey = (order.partner || forcedPartner || '').toUpperCase();
  const partner    = order.partner || forcedPartner || 'Không xác định';
  const latest     = extractLatest(order);
  const status     = latest.status || order.status || null;
  const creditCost = isFreeRe ? 0 : getCreditCost(partnerKey);

  // Subscribe và cache — lưu chatId là owner nếu đây là lần đầu add
  SubRepo.add(chatId, fullCode);
  if (status) OrderCacheRepo.upsert(fullCode, status, name, chatId);
  LogRepo.append(chatId, 'add', `${fullCode} cost:${creditCost} ownership:${ownership}`);

  return {
    type:       'SUCCESS',
    code:       fullCode,
    name,
    partner:    PARTNER_DISPLAY[partnerKey] || partner,
    status,
    location:   latest.location,
    time:       latest.time,
    creditCost, // số đơn sẽ bị trừ
  };
}

function untrack(chatId, code) {
  SubRepo.remove(chatId, code);
  LogRepo.append(chatId, 'untrack', code);
}

function getTrackedList(chatId) {
  return SubRepo.findByChatId(chatId).map(code => ({
    code,
    cached: OrderCacheRepo.findByCode(code),
  }));
}

async function subscribeAll(chatId) {
  const orders = await expressApi.getOrders();
  orders.forEach(o => {
    const code = o.express_id;
    if (!code) return;
    SubRepo.add(chatId, code);
    const status = o.latest_status || o.status;
    if (status) OrderCacheRepo.upsert(code, status, o.item_name || code);
  });
  LogRepo.append(chatId, 'trackall', `count:${orders.length}`);
  return orders.length;
}

async function renameOrder(chatId, code, name) {
  // Cập nhật local cache trước
  const cached = OrderCacheRepo.findByCode(code);
  if (cached) OrderCacheRepo.upsert(code, cached.status, name);

  // Thử update API (best-effort, không bắt buộc)
  try { await expressApi.updateOrder(code, name); } catch {}

  LogRepo.append(chatId, 'rename', `${code} → ${name}`);
}

async function deleteOrder(chatId, code, partner = null) {
  try { await expressApi.deleteOrder(code, partner); } catch {}
  SubRepo.remove(chatId, code);
  LogRepo.append(chatId, 'delete', code);
}

module.exports = {
  parseInput, extractLatest,
  addAndTrack, untrack, getTrackedList, subscribeAll,
  renameOrder, deleteOrder,
  PARTNER_DISPLAY,
};