const crypto = require('crypto');

// In-memory store — không cần persist
const otpStore     = new Map(); // chatId → { otp, expiresAt }
const sessionStore = new Map(); // token → { chatId, expiresAt }

const OTP_TTL_MS     = 5  * 60 * 1000; // 5 phút
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// ── OTP ────────────────────────────────────────────────────────
function createOtp(chatId) {
  const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 số
  otpStore.set(String(chatId), { otp, expiresAt: Date.now() + OTP_TTL_MS });
  return otp;
}

function verifyOtp(chatId, otp) {
  const key    = String(chatId);
  const record = otpStore.get(key);
  if (!record) return false;
  if (Date.now() > record.expiresAt) { otpStore.delete(key); return false; }
  if (record.otp !== String(otp))    return false;
  otpStore.delete(key);
  return true;
}

// ── Session ────────────────────────────────────────────────────
function createSession(chatId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessionStore.set(token, { chatId: String(chatId), expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const record = sessionStore.get(token);
  if (!record) return null;
  if (Date.now() > record.expiresAt) { sessionStore.delete(token); return null; }
  return record.chatId;
}

function deleteSession(token) {
  sessionStore.delete(token);
}

// Dọn hết session hết hạn (gọi định kỳ nếu cần)
function cleanup() {
  const now = Date.now();
  for (const [k, v] of otpStore)     if (now > v.expiresAt) otpStore.delete(k);
  for (const [k, v] of sessionStore) if (now > v.expiresAt) sessionStore.delete(k);
}
setInterval(cleanup, 10 * 60 * 1000); // mỗi 10 phút

module.exports = { createOtp, verifyOtp, createSession, getSession, deleteSession };
