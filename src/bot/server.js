const express     = require('express');
const cors        = require('cors');
const config      = require('../config');
const { handleWebhook } = require('../payments/sepay');
const publicApiRouter   = require('../routes/publicApi');
const { router: webApiRouter, setBot } = require('../routes/webApi');

function formatViDateTime(input) {
  const d = input ? new Date(input) : new Date();
  return d.toLocaleString('vi-VN', { hour12: false });
}

function createServer(bot) {
  const app = express();

  // ── CORS — cho phép web dashboard (Vercel) gọi vào ──────────
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  app.use(cors({
    origin: (origin, callback) => {
      // Cho phép: requests không có origin (curl, server-to-server) + whitelist
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} không được phép`));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
  }));

  app.use(express.json());

  // Gắn botInstance vào webApi để gửi OTP
  setBot(bot);

  // ── Health check ─────────────────────────────────────────────
  app.get('/', (_, res) => res.json({
    status: 'ok', version: '4.1',
    mode: config.telegram.webhookUrl ? 'webhook' : 'polling',
    notify_interval: `${config.notify.intervalSec}s`,
  }));

  // ── Public API (xác thực bằng user API key) ──────────────────
  app.use('/api/v1', publicApiRouter);

  // ── Web Dashboard API (xác thực bằng session token) ──────────
  app.use('/web-api', webApiRouter);

  // ── SePay payment webhook ─────────────────────────────────────
  app.post('/payment/sepay', async (req, res) => {
    await handleWebhook(req, res);

    if (res.statusCode === 200) {
      const data    = req.body;
      const content = data.content || '';
      const amount  = Number(data.transferAmount || 0);
      const paidAt  = data.transactionDate || data.createdAt || Date.now();
      const { parseChatId, calcCredits } = require('../payments/sepay');
      const chatId  = parseChatId(content);
      const credits = calcCredits(amount);

      if (chatId && credits > 0 && bot) {
        const CreditService = require('../services/CreditService');
        const { clearNapFlow } = require('../handlers/payment');
        const bal = CreditService.getBalance(chatId);
        const { safeSend } = require('../utils/sender');
        const { esc } = require('../utils/format');
        try {
          await clearNapFlow(bot, chatId);
          await safeSend(bot, chatId,
            `🎉 *NẠP ĐƠN THÀNH CÔNG\\!*\n\n` +
            `💰 Số tiền: *${esc(amount.toLocaleString('vi-VN'))} VNĐ*\n` +
            `📦 Số đơn được nạp: *${esc(String(credits))} đơn*\n` +
            `🕐 Thời gian: *${esc(formatViDateTime(paidAt))}*\n` +
            `📊 Tổng số đơn sau khi nạp: *${esc(String(bal.total))} đơn*\n\n` +
            `Cảm ơn bạn đã ủng hộ\\! 💖`
          );
        } catch (e) {
          console.error('[SePay] Notify user failed:', e.message);
        }
      }
    }
  });

  // ── Telegram webhook ──────────────────────────────────────────
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
    console.log(`🌐 Web API:  ${config.telegram.webhookUrl}/web-api`);
    console.log(`🔌 Public API: ${config.telegram.webhookUrl}/api/v1`);
  }

  return app;
}

module.exports = { createServer };