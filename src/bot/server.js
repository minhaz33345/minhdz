const express  = require('express');
const config   = require('../config');
const { handleWebhook } = require('../payments/sepay');
const { handleMessage } = require('./router');

function formatViDateTime(input) {
  const d = input ? new Date(input) : new Date();
  return d.toLocaleString('vi-VN', { hour12: false });
}

function createServer(bot) {
  const app = express();
  app.use(express.json());

  // Health check
  app.get('/', (_, res) => res.json({
    status: 'ok', version: '4.0',
    platform: 'ZaloBot',
    mode: 'webhook',
    notify_interval: `${config.notify.intervalSec}s`,
  }));

  // ── Zalo Bot Webhook ─────────────────────────────────────────
  // Đăng ký URL này tại Zalo Bot Dashboard qua setWebhook API
  app.post('/webhooks', async (req, res) => {
    // Xác thực secret token
    const secretToken = req.headers['x-bot-api-secret-token'];
    if (secretToken !== config.zalo.webhookSecret) {
      console.warn('[Zalo Webhook] Unauthorized request — wrong secret token');
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Trả về 200 ngay để Zalo không retry
    res.json({ message: 'Success' });

    // Xử lý message bất đồng bộ
    try {
      await handleMessage(bot, req.body);
    } catch (err) {
      console.error('[Zalo Webhook] handleMessage error:', err.message);
    }
  });

  // ── SePay payment webhook ─────────────────────────────────────
  // Điền URL này vào SePay Dashboard: https://bot.yourdomain.com/payment/sepay
  app.post('/payment/sepay', async (req, res) => {
    await handleWebhook(req, res);

    // Sau khi xử lý thành công → notify user qua bot
    if (res.statusCode === 200) {
      const data    = req.body;
      const content = data.content || '';
      const amount  = Number(data.transferAmount || 0);
      const paidAt  = data.transactionDate || data.createdAt || Date.now();
      const { parseChatId, calcCredits } = require('../payments/sepay');
      const chatId  = parseChatId(content);
      const credits = calcCredits(amount);

      if (chatId && credits > 0 && bot) {
        const CreditService    = require('../services/CreditService');
        const { clearNapFlow } = require('../handlers/payment');
        const bal = CreditService.getBalance(chatId);
        try {
          await clearNapFlow(bot, chatId);
          await bot.sendMessage(chatId,
            `🎉 NẠP ĐƠN THÀNH CÔNG!\n\n` +
            `💰 Số tiền: ${amount.toLocaleString('vi-VN')} VNĐ\n` +
            `📦 Số đơn được nạp: ${credits} đơn\n` +
            `🕐 Thời gian: ${formatViDateTime(paidAt)}\n` +
            `📊 Tổng số đơn sau khi nạp: ${bal.total} đơn\n\n` +
            `Cảm ơn bạn đã ủng hộ! 💖`
          );
        } catch (e) {
          console.error('[SePay] Notify user failed:', e.message);
        }
      }
    }
  });

  // ── Đăng ký webhook với Zalo khi khởi động ───────────────────
  if (config.zalo.webhookUrl) {
    const webhookPath = '/webhooks';
    const fullUrl     = `${config.zalo.webhookUrl}${webhookPath}`;
    bot.setWebhook(fullUrl, config.zalo.webhookSecret)
      .then(() => console.log(`✅ Zalo webhook đã đăng ký: ${fullUrl}`))
      .catch(err => console.error('❌ Zalo setWebhook lỗi:', err.message));

    console.log(`💳 SePay webhook: ${config.zalo.webhookUrl}/payment/sepay`);
  } else {
    console.warn('⚠️  WEBHOOK_URL chưa được cấu hình — Zalo Bot cần webhook để hoạt động!');
  }

  return app;
}

module.exports = { createServer };