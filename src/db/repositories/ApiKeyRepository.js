const crypto = require('crypto');
const db     = require('./base');

const MAX_KEYS = 2;

function generateKey() {
  return crypto.randomBytes(32).toString('hex');
}

function countByChatId(chatId) {
  return db.get('apiKeys').filter({ chatId }).size().value();
}

function findByKey(key) {
  return db.get('apiKeys').find({ key }).value() || null;
}

function findByChatId(chatId) {
  return db.get('apiKeys').filter({ chatId }).value();
}

function create(chatId, label = '') {
  if (countByChatId(chatId) >= MAX_KEYS) {
    throw new Error(`Bạn đã có ${MAX_KEYS} API key. Hãy xóa bớt hoặc Reset.`);
  }
  const key = generateKey();
  db.get('apiKeys').push({
    key,
    chatId,
    label: label || `Key ${Date.now()}`,
    createdAt: Date.now(),
  }).write();
  return key;
}

function revoke(key, chatId) {
  db.get('apiKeys').remove({ key, chatId }).write();
}

function revokeAll(chatId) {
  db.get('apiKeys').remove({ chatId }).write();
}

module.exports = {
  MAX_KEYS,
  create, findByKey, findByChatId, countByChatId,
  revoke, revokeAll,
};
