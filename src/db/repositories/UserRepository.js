const db     = require('./base');
const config = require('../../config');

function findById(chatId) {
  return db.get('users').find({ chatId }).value() || null;
}

function findAll() {
  return db.get('users').value();
}

function count() {
  return db.get('users').size().value();
}

function create(chatId, { username, firstName } = {}) {
  const user = {
    chatId,
    username:        username || null,
    firstName:       firstName || null,
    joinedAt:        Date.now(),
    banned:          false,
    freeCredits:     config.trialCredits || 0, // chỉ dùng thử, không reset
    referralCredits: 0,
    paidCredits:     0,
    referredBy:      null,
    refRewarded:     false,
  };
  db.get('users').push(user).write();
  return user;
}

function update(chatId, patch) {
  db.get('users').find({ chatId }).assign(patch).write();
}

module.exports = { findById, findAll, count, create, update };