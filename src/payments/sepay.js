const config       = require('../config');
const CreditService = require('../services/CreditService');
const UserRepo     = require('../db/repositories/UserRepository');
const LogRepo      = require('../db/repositories/LogRepository');

// Tối ưu của bạn: Dùng calcCredits từ payment handler để đồng bộ bảng giá
function calcCredits(amount) {
  const { calcCredits: calc } = require('../handlers/payment');
  return calc(amount);
}

// Parse chatId từ nội dung chuyển khoản
// Đã thêm \s* để bắt được cả "NAP123" và "NAP 123"
function parseChatId(content = '') {
  const m = content.match(/nap\s*(\d+)/i);
  return m ? parseInt(m[1]) : null;
}

// Xử lý webhook từ SePay
async function handleWebhook(req, res) {
  try {
    // 1. SỬA LỖI UNAUTHORIZED: Đọc chuẩn header của SePay (Apikey ...)
    const authHeader = req.headers['authorization'] || '';
    const secret = authHeader.replace(/^Apikey\s+/i, '').trim();

    if (config.sepay.webhookSecret && secret !== config.sepay.webhookSecret) {
      console.error(`[SePay] Invalid webhook secret. Received: "${secret}"`);
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const data = req.body;

    // Chỉ xử lý giao dịch tiền vào
    if (data.transferType !== 'in') {
      return res.json({ success: true, message: 'Skipped (not incoming)' });
    }

    const amount  = data.transferAmount || 0;
    const content = data.content || '';
    const transactionId = data.id; // Lấy ID giao dịch của SePay

    if (amount <= 0) {
      return res.json({ success: true, message: 'Skipped (zero amount)' });
    }

    // 2. CHỐNG LẶP GIAO DỊCH (Tránh cộng tiền 2 lần)
    // Đảm bảo LogRepo đã có hàm checkTransactionExists nhé
    if (LogRepo.checkTransactionExists) {
        const isProcessed = await LogRepo.checkTransactionExists(transactionId);
        if (isProcessed) {
            console.log(`[SePay] ⚠️ Bỏ qua giao dịch đã xử lý. ID: ${transactionId}`);
            return res.json({ success: true, message: 'Transaction already processed' });
        }
    }

    // Parse chatId từ nội dung
    const chatId = parseChatId(content);
    if (!chatId) {
      console.log(`[SePay] No chatId in content: "${content}" amount:${amount}`);
      // Thêm await để đảm bảo ghi log xong
      await LogRepo.append(0, 'payment_no_user', `txId:${transactionId} amount:${amount} content:${content}`);
      return res.json({ success: true, message: 'No user found in content' });
    }

    // Tính số đơn
    const credits = calcCredits(amount);
    if (credits <= 0) {
      return res.json({ success: true, message: 'Amount too small' });
    }

    // 3. TƯƠNG TÁC DATABASE (Đã bổ sung await đầy đủ)
    // Đảm bảo user tồn tại
    await CreditService.ensureUser(chatId);

    // Nạp credit
    await CreditService.addPaid(chatId, credits);

    // Lưu log nạp thành công kèm transactionId
    await LogRepo.append(chatId, 'payment_received', `txId:${transactionId} amount:${amount} credits:+${credits} ref:${data.referenceCode || ''}`);

    console.log(`[SePay] ✅ Payment: chatId=${chatId} amount=${amount}đ → +${credits} đơn (Mã GD SePay: ${transactionId})`);

    // Trả về success để SePay không retry
    return res.json({ success: true });

  } catch (err) {
    console.error('[SePay] Webhook error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { handleWebhook, calcCredits, parseChatId };
