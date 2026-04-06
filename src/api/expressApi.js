const axios = require('axios');
const config = require('../config');

// ─── Axios instance ───────────────────────────────────────────
function makeClient() {
  const key = config.express.apiKey;
  if (!key) throw new AppError('API key chưa được cài đặt. Admin vui lòng chạy /setkey', 'NO_API_KEY');
  return axios.create({
    baseURL: config.express.baseUrl,
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    timeout: config.express.timeout,
  });
}

// ─── Custom error ─────────────────────────────────────────────
class AppError extends Error {
  constructor(message, code = 'UNKNOWN', httpStatus = null) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

// ─── Normalize axios error → AppError (không log headers thừa) ─
function normalizeError(err) {
  if (err instanceof AppError) return err;
  const status  = err.response?.status;
  const apiMsg  = err.response?.data?.message || err.response?.data?.error;
  const message = apiMsg || err.message || 'Lỗi kết nối API';
  return new AppError(message, 'HTTP_ERROR', status);
}

// ─── Retry wrapper ────────────────────────────────────────────
async function withRetry(fn, retries = config.express.retry) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = err.response?.status;
      // Không retry 4xx (lỗi client — mã sai, không tìm thấy...)
      if (status && status >= 400 && status < 500) throw normalizeError(err);
      lastErr = normalizeError(err);
      if (i < retries - 1) await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

// ─── Response validator ───────────────────────────────────────
function validateResponse(res, shape) {
  if (!res || typeof res !== 'object') {
    throw new AppError('Response không hợp lệ từ API', 'INVALID_RESPONSE');
  }
  if (res.status !== 'ok' || res.code !== 0) {
    const msg = res.message || res.error || 'API trả về lỗi không xác định';
    throw new AppError(msg, 'API_ERROR');
  }
  if (shape === 'orders') {
    if (!res.data || !Array.isArray(res.data.orders)) {
      throw new AppError('Response thiếu data.orders', 'INVALID_SCHEMA');
    }
  }
  if (shape === 'order') {
    if (!res.data || typeof res.data !== 'object' || !res.data.express_id) {
      throw new AppError('Không tìm thấy đơn hàng', 'ORDER_NOT_FOUND');
    }
  }
  if (shape === 'partners') {
    if (!res.data || !Array.isArray(res.data.partners)) {
      throw new AppError('Response thiếu data.partners', 'INVALID_SCHEMA');
    }
  }
  return res;
}

// ─── API methods ──────────────────────────────────────────────
async function getPartners() {
  const res = await withRetry(() => axios.get(`${config.express.baseUrl}/partners`));
  return validateResponse(res.data, 'partners').data.partners;
}

async function getOrders() {
  const res = await withRetry(() => makeClient().get('/orders'));
  return validateResponse(res.data, 'orders').data.orders;
}

async function getOrderDetail(code, partner = null) {
  const params = partner ? { partner } : {};
  const res = await withRetry(() => makeClient().get(`/orders/${encodeURIComponent(code)}`, { params }));
  return validateResponse(res.data, 'order').data;
}

async function addOrders(orders) {
  if (!Array.isArray(orders) || orders.length === 0) {
    throw new AppError('Danh sách đơn không hợp lệ', 'INVALID_INPUT');
  }
  const res = await withRetry(() => makeClient().post('/orders', { orders }));
  validateResponse(res.data, null);
  // Response: {status:"ok", code:0, data:{added:N, orders:[], errors:[{code,error}]}}
  const data = res.data.data || {};
  return {
    added:  data.added  || 0,
    orders: data.orders || [],
    errors: data.errors || [],
  };
}

async function updateOrder(code, name) {
  const res = await withRetry(() => makeClient().put(`/orders/${encodeURIComponent(code)}`, { name }));
  validateResponse(res.data, null);
  return res.data;
}

async function deleteOrder(code, partner = null) {
  const params = partner ? { partner } : {};
  const res = await withRetry(() => makeClient().delete(`/orders/${encodeURIComponent(code)}`, { params }));
  validateResponse(res.data, null);
  return res.data;
}

async function getBalance() {
  const res = await withRetry(() => makeClient().get('/balance'));
  validateResponse(res.data, null);
  // Response: {status:"ok", code:0, data:{total:40}}
  return res.data.data || {};
}

module.exports = {
  AppError,
  getPartners, getOrders, getOrderDetail,
  addOrders, updateOrder, deleteOrder, getBalance,
};