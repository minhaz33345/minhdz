/**
 * /web-api/* — API dành riêng cho Web Dashboard
 * Xác thực: Authorization: Bearer <session_token>
 */
const express      = require('express');
const router       = express.Router();
const UserRepo     = require('../db/repositories/UserRepository');
const ApiKeyRepo   = require('../db/repositories/ApiKeyRepository');
const WebSession   = require('../db/repositories/WebSessionRepository');
const OrderService = require('../services/OrderService');
const CreditService= require('../services/CreditService');

// Lấy botInstance từ module-level (được set bởi server.js)
let _bot = null;
function setBot(bot) { _bot = bot; }

// ── Auth middleware ────────────────────────────────────────────
function requireAuth(req, res, next) {
  const auth    = req.headers.authorization || '';
  const token   = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const chatId  = WebSession.getSession(token);
  if (!chatId) return res.status(401).json({ error: 'Chưa đăng nhập hoặc phiên hết hạn' });
  req.chatId = chatId;
  next();
}

// ── Auth endpoints ─────────────────────────────────────────────
// POST /web-api/auth/request-otp
router.post('/auth/request-otp', async (req, res) => {
  try {
    const chatId = String(req.body.chatId || '').trim();
    if (!chatId || !/^\d+$/.test(chatId)) {
      return res.status(400).json({ error: 'chatId không hợp lệ (chỉ gồm số)' });
    }
    // Kiểm tra user tồn tại
    const user = UserRepo.findById(Number(chatId));
    if (!user) {
      return res.status(404).json({ error: 'Tài khoản không tồn tại. Vui lòng /start bot trước.' });
    }
    if (user.banned) {
      return res.status(403).json({ error: 'Tài khoản đã bị khoá.' });
    }
    const otp = WebSession.createOtp(chatId);
    if (_bot) {
      await _bot.sendMessage(Number(chatId),
        `🔐 *Mã đăng nhập Web Dashboard của bạn:*\n\n` +
        `\`${otp}\`\n\n` +
        `⏱ Mã hết hạn sau *5 phút*\\. Không chia sẻ mã này cho bất kỳ ai\\.`,
        { parse_mode: 'MarkdownV2' }
      ).catch(() => {});
    }
    res.json({ ok: true, message: 'OTP đã gửi qua Telegram' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /web-api/auth/verify-otp
router.post('/auth/verify-otp', (req, res) => {
  const chatId = String(req.body.chatId || '').trim();
  const otp    = String(req.body.otp    || '').trim();
  if (!chatId || !otp) return res.status(400).json({ error: 'Thiếu chatId hoặc otp' });

  const ok = WebSession.verifyOtp(chatId, otp);
  if (!ok) return res.status(401).json({ error: 'OTP sai hoặc đã hết hạn' });

  const token = WebSession.createSession(chatId);
  const user  = UserRepo.findById(Number(chatId));
  res.json({ ok: true, token, user: { chatId, username: user?.username, firstName: user?.firstName } });
});

// POST /web-api/auth/logout
router.post('/auth/logout', requireAuth, (req, res) => {
  const token = (req.headers.authorization || '').slice(7);
  WebSession.deleteSession(token);
  res.json({ ok: true });
});

// GET /web-api/auth/me
router.get('/auth/me', requireAuth, (req, res) => {
  const user = UserRepo.findById(Number(req.chatId));
  res.json({ chatId: req.chatId, username: user?.username, firstName: user?.firstName });
});

// ── Orders ─────────────────────────────────────────────────────
// GET /web-api/orders
router.get('/orders', requireAuth, (req, res) => {
  try {
    const list = OrderService.getTrackedList(Number(req.chatId));
    res.json({ ok: true, data: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /web-api/orders  body: { code, name?, partner? }
router.post('/orders', requireAuth, async (req, res) => {
  try {
    const chatId = Number(req.chatId);
    const bal    = CreditService.getBalance(chatId);
    if (bal.total < 1) {
      return res.status(402).json({ error: 'Hết credit. Nạp thêm qua bot Telegram.' });
    }
    const { code, name, partner } = req.body;
    if (!code) return res.status(400).json({ error: 'Thiếu mã đơn' });

    const parsed = OrderService.parseInput(`${partner ? partner + ' ' : ''}${code}${name ? ' ' + name : ''}`);
    if (!parsed.length) return res.status(400).json({ error: 'Mã đơn không hợp lệ' });

    const result = await OrderService.addAndTrack(chatId, parsed[0]);
    if (result.type === 'API_ERROR') return res.status(422).json({ error: result.error });
    if (result.type === 'ALREADY_TRACKING') {
      return res.json({ ok: true, type: 'ALREADY_TRACKING', data: result });
    }
    // Trừ credit
    const cost = result.creditCost || 1;
    CreditService.consume(chatId, cost);
    res.json({ ok: true, type: result.type, data: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /web-api/orders/:code  body: { name }
router.put('/orders/:code', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Thiếu tên mới' });
    await OrderService.renameOrder(Number(req.chatId), req.params.code, name.trim());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /web-api/orders/:code
router.delete('/orders/:code', requireAuth, async (req, res) => {
  try {
    await OrderService.deleteOrder(Number(req.chatId), req.params.code);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Balance ────────────────────────────────────────────────────
// GET /web-api/balance
router.get('/balance', requireAuth, (req, res) => {
  const bal = CreditService.getBalance(Number(req.chatId));
  res.json({ ok: true, data: bal });
});

// ── API Keys ───────────────────────────────────────────────────
// GET /web-api/api-keys
router.get('/api-keys', requireAuth, (req, res) => {
  const keys = ApiKeyRepo.findByChatId(req.chatId).map(k => ({
    keyMasked: k.key.slice(0, 8) + '...' + k.key.slice(-4),
    label:     k.label,
    createdAt: k.createdAt,
  }));
  const count = keys.length;
  res.json({ ok: true, data: keys, count, maxKeys: ApiKeyRepo.MAX_KEYS });
});

// POST /web-api/api-keys  body: { label? }
router.post('/api-keys', requireAuth, (req, res) => {
  try {
    const key = ApiKeyRepo.create(req.chatId, req.body.label || '');
    res.json({ ok: true, key }); // Trả key đầy đủ chỉ lần này
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE /web-api/api-keys/:keyPrefix  (xóa theo 8 ký tự đầu)
router.delete('/api-keys/:keyPrefix', requireAuth, (req, res) => {
  const { keyPrefix } = req.params;
  const keys = ApiKeyRepo.findByChatId(req.chatId);
  const match = keys.find(k => k.key.startsWith(keyPrefix));
  if (!match) return res.status(404).json({ error: 'Không tìm thấy key' });
  ApiKeyRepo.revoke(match.key, req.chatId);
  res.json({ ok: true });
});

// POST /web-api/api-keys/reset
router.post('/api-keys/reset', requireAuth, (req, res) => {
  try {
    ApiKeyRepo.revokeAll(req.chatId);
    const key = ApiKeyRepo.create(req.chatId, 'Key mới (sau reset)');
    res.json({ ok: true, key });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = { router, setBot };
