/**
 * /api/v1/* — Public API cho bên thứ 3 tích hợp
 * Xác thực: X-API-Key header hoặc ?api_key= query
 */
const express      = require('express');
const router       = express.Router();
const ApiKeyRepo   = require('../db/repositories/ApiKeyRepository');
const OrderCacheRepo = require('../db/repositories/OrderCacheRepository');
const OrderService = require('../services/OrderService');
const CreditService= require('../services/CreditService');
const expressApi   = require('../api/expressApi');

// ── Auth middleware ────────────────────────────────────────────
function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (!key) return res.status(401).json({ error: 'Thiếu API key', hint: 'Truyền header X-API-Key' });

  const record = ApiKeyRepo.findByKey(key);
  if (!record) return res.status(401).json({ error: 'API key không hợp lệ' });

  req.apiChatId = Number(record.chatId);
  next();
}

// ── GET /api/v1/orders ─────────────────────────────────────────
router.get('/orders', requireApiKey, (req, res) => {
  try {
    const list = OrderService.getTrackedList(req.apiChatId).map(({ code, cached }) => ({
      code,
      name:      cached?.name   || null,
      status:    cached?.status || null,
      updatedAt: cached?.updatedAt || null,
    }));
    res.json({ ok: true, data: { orders: list, total: list.length } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/v1/orders ────────────────────────────────────────
// Body: { code: string, name?: string, partner?: string }
// hoặc { orders: [{ code, name?, partner? }] } (batch)
router.post('/orders', requireApiKey, async (req, res) => {
  try {
    const chatId = req.apiChatId;
    const bal    = CreditService.getBalance(chatId);
    if (bal.total < 1) {
      return res.status(402).json({ error: 'Hết credit. Nạp thêm qua bot Telegram.' });
    }

    // Hỗ trợ cả single và batch
    let items = [];
    if (req.body.orders && Array.isArray(req.body.orders)) {
      items = req.body.orders;
    } else if (req.body.code) {
      items = [{ code: req.body.code, name: req.body.name, partner: req.body.partner }];
    } else {
      return res.status(400).json({ error: 'Thiếu trường code hoặc orders[]' });
    }

    const results = [];
    for (const item of items.slice(0, 10)) { // tối đa 10 đơn/request
      const { code, name, partner } = item;
      if (!code) { results.push({ error: 'Thiếu code' }); continue; }

      const parsed = OrderService.parseInput(`${partner ? partner + ' ' : ''}${code}${name ? ' ' + name : ''}`);
      if (!parsed.length) { results.push({ code, error: 'Mã đơn không hợp lệ' }); continue; }

      const result = await OrderService.addAndTrack(chatId, parsed[0]);
      if (result.type === 'API_ERROR') { results.push({ code, error: result.error }); continue; }
      if (result.type === 'ALREADY_TRACKING') { results.push({ code, status: 'already_tracking' }); continue; }

      const cost = result.creditCost || 1;
      CreditService.consume(chatId, cost);
      results.push({ code, status: result.type.toLowerCase(), creditUsed: cost });
    }

    res.json({ ok: true, data: results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/v1/orders/:code ───────────────────────────────────
router.get('/orders/:code', requireApiKey, async (req, res) => {
  try {
    const code   = req.params.code.toUpperCase();
    const cached = OrderCacheRepo.findByCode(code);

    let orderDetail = null;
    try {
      orderDetail = await expressApi.getOrderDetail(code);
    } catch {}

    if (!orderDetail && !cached) {
      return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    }

    const latest = orderDetail ? OrderService.extractLatest(orderDetail) : {};
    res.json({
      ok: true,
      data: {
        code,
        name:            cached?.name || orderDetail?.item_name || null,
        partner:         orderDetail?.partner || null,
        status:          latest.status || cached?.status || null,
        location:        latest.location || null,
        time:            latest.time || null,
        tracking_history: orderDetail?.tracking_history || [],
        updatedAt:       cached?.updatedAt || null,
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/v1/orders/:code ───────────────────────────────────
router.put('/orders/:code', requireApiKey, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Thiếu trường name' });
    await OrderService.renameOrder(req.apiChatId, req.params.code, name.trim());
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/v1/orders/:code ────────────────────────────────
router.delete('/orders/:code', requireApiKey, async (req, res) => {
  try {
    await OrderService.deleteOrder(req.apiChatId, req.params.code);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/v1/balance ────────────────────────────────────────
router.get('/balance', requireApiKey, (req, res) => {
  const bal = CreditService.getBalance(req.apiChatId);
  res.json({ ok: true, data: bal });
});

module.exports = router;
