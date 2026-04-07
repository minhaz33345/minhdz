// Zalo Bot — không còn dùng MarkdownV2, plain text hoàn toàn
// esc() chỉ giữ lại để code cũ không bị lỗi (trả về text gốc)
function esc(text) {
  if (text == null) return '';
  return String(text); // Zalo không cần escape
}

function fmtTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  } catch { return String(iso); }
}

function formatOrderList(orders) {
  if (!orders || !orders.length) return '📭 Chưa có đơn hàng nào.';
  return orders.map((o, i) => {
    const code     = o.express_id || '—';
    const name     = o.item_name || '—';
    const partner  = o.partner || '—';
    const status   = o.latest_status || o.status || '—';
    const location = o.latest_location ? `\n   📍 ${o.latest_location.split('☎')[0].trim()}` : '';
    const time     = o.latest_time ? `\n   🕒 ${fmtTime(o.latest_time)}` : '';
    return `${i + 1}. [${code}]\n   📦 ${name} | 🚚 ${partner}\n   📌 ${status}${location}${time}`;
  }).join('\n\n');
}

function formatOrderDetail(o, history = []) {
  if (!o) return '❌ Không tìm thấy đơn.';
  const lines = [
    `📋 CHI TIẾT ĐƠN HÀNG`,
    `🔖 Mã: ${o.express_id || '—'}`,
    `📦 Tên: ${o.item_name || '—'}`,
    `🚚 Hãng: ${o.partner || '—'}`,
  ];

  if (history.length) {
    const last = history[history.length - 1];
    if (last.status)   lines.push(`📌 Trạng thái: ${last.status}`);
    if (last.location) lines.push(`📍 Vị trí: ${last.location.split('☎')[0].trim()}`);
    if (last.time)     lines.push(`🕒 Cập nhật: ${fmtTime(last.time)}`);
  }

  if (o.created_at) lines.push(`📅 Tạo lúc: ${fmtTime(o.created_at)}`);

  if (history.length) {
    lines.push(`\n📜 Lịch sử gần đây:`);
    history.slice(-5).reverse().forEach(h => {
      const t = h.time     ? fmtTime(h.time) : '';
      const l = h.location ? h.location.split('☎')[0].trim() : '';
      lines.push(`  • ${h.status}${l ? ' — ' + l : ''}${t ? '\n    ' + t : ''}`);
    });
    if (history.length > 5) lines.push(`  (...và ${history.length - 5} mốc trước)`);
  }

  return lines.join('\n');
}

function formatBalance(data) {
  const total = data.total ?? data.balance ?? data.credits ?? '—';
  return `💰 Số dư API\n\n🏦 Số dư: ${total} credit`;
}

function formatPartners(list) {
  if (!list || !list.length) return '❌ Không có dữ liệu.';
  return [`🏢 HÃNG VẬN CHUYỂN & PHÍ\n`,
    ...list.map((p, i) => `${i + 1}. ${p.partner || '—'} — ${p.credit_cost ?? '—'} credit/đơn`)
  ].join('\n');
}

function formatCredits(bal, planName) {
  return (
    `💰 SỐ DƯ CỦA BẠN\n\n` +
    `   • 🎁 Miễn phí: ${bal.free} đơn (reset ngày 1 hàng tháng)\n` +
    `   • 👥 Giới thiệu: ${bal.referral} đơn\n` +
    `   • 💳 Đã nạp: ${bal.paid} đơn\n` +
    `   • 📊 Tổng: ${bal.total} đơn\n\n` +
    `🎫 Gói: ${planName}`
  );
}

function formatInputGuide() {
  return (
    '📦 HƯỚNG DẪN NHẬP MÃ ĐƠN\n\n' +
    'Cú pháp cơ bản:\n' +
    '/add MãĐơn Tên gợi nhớ\n\n' +
    'Đơn cần 4 số cuối SĐT (JT, BEST, LEX):\n' +
    '/add MãĐơn-SốCuốiSĐT Tên gợi nhớ\n' +
    'Ví dụ: /add JT1234567890-0912 Áo thun\n\n' +
    'Ép hãng cụ thể (thêm tên hãng trước mã):\n' +
    '/add VNPOST MãĐơn Tên gợi nhớ\n\n' +
    'Nhiều đơn cùng lúc (ngăn bởi |):\n' +
    '/add SPX123 Áo | BEST456-9088 Quần\n\n' +
    '--------------------\n' +
    '🚚 PHÍ TRA CỨU THEO HÃNG\n\n' +
    '💰 1 đơn: SPX • GHN • EMS • JT • FUTA • TFE • 247EXPRESS • NETCO • NETPOST\n\n' +
    '💰 1.5 đơn: BEST • LEX • VNPOST • VIETTELPOST • NHATTIN\n\n' +
    '💰 2 đơn: GHTK\n\n' +
    '--------------------\n' +
    '💡 Lưu ý:\n' +
    '• JT, BEST, LEX bắt buộc thêm 4 số cuối SĐT\n' +
    '• GHTK & VNPOST mất thêm thời gian (captcha)\n' +
    '• VIETTELPOST đơn vào hàng chờ xử lý'
  );
}

function formatTrackedList(items) {
  if (!items.length) return `📭 Bạn chưa theo dõi đơn nào.\n\nDùng /add <mã> để thêm đơn.`;
  const lines = items.map((item, i) => {
    const { code, cached } = item;
    const name   = cached?.name && cached.name !== code ? ` (${cached.name})` : '';
    const status = cached?.status ? ` — ${cached.status}` : '';
    const upd    = cached?.updatedAt
      ? `\n    🕒 ${fmtTime(new Date(cached.updatedAt).toISOString())}`
      : '';
    return `${i + 1}. ${code}${name}${status}${upd}`;
  });
  return (
    `📋 ĐANG THEO DÕI ${items.length} ĐƠN\n\n` +
    lines.join('\n\n') + '\n\n' +
    `Gõ /untrack <mã> để bỏ theo dõi`
  );
}

module.exports = {
  esc, fmtTime,
  formatOrderList, formatOrderDetail, formatBalance, formatPartners,
  formatCredits, formatInputGuide, formatTrackedList,
};