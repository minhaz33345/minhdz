const db = require('./base');

const MAX_LOGS = 1000;

function append(chatId, action, detail = '') {
  db.get('logs').push({ chatId, action, detail, at: Date.now() }).write();
  const logs = db.get('logs').value();
  if (logs.length > MAX_LOGS) db.set('logs', logs.slice(-MAX_LOGS)).write();
}

function recent(limit = 20) {
  return db.get('logs').value().slice(-limit).reverse();
}

module.exports = { append, recent };
