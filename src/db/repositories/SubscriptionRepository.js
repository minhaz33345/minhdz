const db = require('./base');

function add(chatId, code) {
  const upper = code.toUpperCase();
  if (!db.get('subscriptions').find({ chatId, code: upper }).value()) {
    db.get('subscriptions').push({ chatId, code: upper, subscribedAt: Date.now() }).write();
  }
}

function remove(chatId, code) {
  db.get('subscriptions').remove({ chatId, code: code.toUpperCase() }).write();
}

function findByChatId(chatId) {
  return db.get('subscriptions').filter({ chatId }).map('code').value();
}

function findAll() {
  return db.get('subscriptions').value();
}

function allTrackedCodes() {
  return [...new Set(db.get('subscriptions').value().map(s => s.code))];
}

function chatIdsForCode(code) {
  return db.get('subscriptions').filter({ code: code.toUpperCase() }).map('chatId').value();
}

module.exports = { add, remove, findByChatId, findAll, allTrackedCodes, chatIdsForCode };
