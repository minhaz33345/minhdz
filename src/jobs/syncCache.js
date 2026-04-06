// Sync OrderCache từ API khi bot khởi động
// Đảm bảo dù restart hay xóa data, bot vẫn biết đơn nào đã tồn tại
const expressApi     = require('../api/expressApi');
const OrderCacheRepo = require('../db/repositories/OrderCacheRepository');
const LogRepo        = require('../db/repositories/LogRepository');

async function syncOnStartup() {
  try {
    console.log('🔄 Syncing order cache from API...');
    const orders = await expressApi.getOrders();

    if (!Array.isArray(orders) || !orders.length) {
      console.log('🔄 No orders to sync');
      return;
    }

    let synced = 0;
    for (const o of orders) {
      const code   = o.express_id;
      const status = o.latest_status || o.status || null;
      const name   = o.item_name || code;
      if (!code) continue;

      // Chỉ upsert nếu chưa có trong cache (không ghi đè cache mới hơn)
      const existing = OrderCacheRepo.findByCode(code);
      if (!existing) {
        OrderCacheRepo.upsert(code, status, name);
        synced++;
      }
    }

    LogRepo.append(0, 'sync_startup', `synced:${synced} total:${orders.length}`);
    console.log(`✅ Cache synced — ${synced} new / ${orders.length} total orders`);
  } catch (err) {
    // Nếu API key chưa có hoặc lỗi → bỏ qua, không crash bot
    console.log(`⚠️  Cache sync skipped: ${err.message}`);
  }
}

module.exports = { syncOnStartup };