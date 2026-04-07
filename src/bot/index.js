const ZaloBot    = require('./zaloBot');
const config     = require('../config');
const router     = require('./router');
const notifier   = require('../jobs/notifier');
const { syncOnStartup } = require('../jobs/syncCache');

let botInstance = null;

function init() {
  botInstance = new ZaloBot(config.zalo.token);
  console.log('🤖 Zalo Bot v4 — WEBHOOK mode (Zalo chỉ hỗ trợ webhook)');

  notifier.init(botInstance);

  // Sync cache sau 3s để đảm bảo config.express.apiKey đã load
  setTimeout(() => syncOnStartup(), 3000);

  return botInstance;
}

function getBot() {
  if (!botInstance) throw new Error('Bot not initialized');
  return botInstance;
}

module.exports = { init, getBot };