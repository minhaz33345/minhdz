const low      = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path     = require('path');
const fs       = require('fs');

// Cache lưu file riêng — KHÔNG bị xóa khi reset db.json
const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const adapter = new FileSync(path.join(DATA_DIR, 'order_cache.json'));
const cache   = low(adapter);
cache.defaults({ orders: [] }).write();

function findByCode(code) {
  return cache.get('orders').find({ code: code.toUpperCase() }).value() || null;
}

// addedBy: chatId của người đầu tiên add đơn này
function upsert(code, status, name, addedBy = null) {
  const upper    = code.toUpperCase();
  const existing = cache.get('orders').find({ code: upper }).value();
  if (existing) {
    // Cập nhật status/name nhưng GIỮ NGUYÊN addedBy ban đầu
    cache.get('orders').find({ code: upper })
      .assign({ status, name, updatedAt: Date.now() }).write();
  } else {
    cache.get('orders').push({
      code:      upper,
      status,
      name,
      addedBy,   // chatId đầu tiên add — null nếu từ sync startup
      updatedAt: Date.now(),
    }).write();
  }
}

// Kiểm tra mã đơn đã được add bởi chatId này chưa
// Trả về: 'own' (chính mình add), 'other' (người khác add trước), null (chưa ai add)
function checkOwnership(code, chatId) {
  const entry = findByCode(code);
  if (!entry) return null;                          // chưa có trong cache → đơn mới
  if (!entry.addedBy) return 'sync';               // từ sync startup → không rõ chủ
  if (entry.addedBy === chatId) return 'own';      // chính mình đã add trước
  return 'other';                                   // người khác đã add trước
}

module.exports = { findByCode, upsert, checkOwnership };