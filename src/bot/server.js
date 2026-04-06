const express = require('express');
const config  = require('../config');
const { handleWebhook } = require('../payments/sepay');

function createServer(bot) {
  const app = express();
  app.use(express.json());

  // Health check
  app.get('/', (_, res) => res.json({
    status: 'ok', version: '4.0',
    mode: config.telegram.webhookUrl ? 'webhook' : 'polling',
    notify_interval: `${config.notify.intervalSec}s`,
  }));

  // SePay payment webhook
  // Điền URL này vào SePay Dashboard: https://bot.yourdomain.com/payment/sepay
  app.post('/payment/sepay', async (req, res) => {
    await handleWebhook(req, res);

    // Sau khi xử lý thành công → notify user qua bot
    if (res.statusCode === 200) {
      const data    = req.body;
      const content = data.content || '';
      const amount  = data.transferAmount || 0;
      const { parseChatId, calcCredits } = require('../payments/sepay');
      const chatId  = parseChatId(content);
      const credits = calcCredits(amount);

      if (chatId && credits > 0 && bot) {
        const CreditService = require('../services/CreditService');
        const bal = CreditService.getBalance(chatId);
        const { safeSend } = require('../utils/sender');
        const { esc } = require('../utils/format');
        try {
          await safeSend(bot, chatId,
            `✅ *NẠP ĐƠN THÀNH CÔNG\\!*\n\n` +
            `💰 Đã cộng: *\\+${esc(String(credits))}* đơn\n` +
            `📊 Số dư mới: *${esc(String(bal.total))}* đơn\n\n` +
            `_Cảm ơn bạn đã sử dụng dịch vụ\\!_`
          );
        } catch (e) {
          console.error('[SePay] Notify user failed:', e.message);
        }
      }
    }
  });

  // Telegram webhook
  if (config.telegram.webhookUrl) {
    const path = `/webhook/${config.telegram.token}`;
    app.post(path, (req, res) => {
      bot.processUpdate(req.body);
      res.sendStatus(200);
    });

    bot.setWebHook(`${config.telegram.webhookUrl}${path}`)
      .then(() => console.log(`✅ Telegram webhook: ${config.telegram.webhookUrl}${path}`))
      .catch(err => console.error('❌ Webhook error:', err.message));

    console.log(`💳 SePay webhook: ${config.telegram.webhookUrl}/payment/sepay`);
  }

  return app;
}

module.exports = { createServer };