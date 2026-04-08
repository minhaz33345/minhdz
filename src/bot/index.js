const TelegramBot = require('node-telegram-bot-api');
const config      = require('../config');
const router      = require('./router');
const notifier    = require('../jobs/notifier');
const { syncOnStartup } = require('../jobs/syncCache');

let botInstance = null;

function init() {
  const useWebhook = !!config.telegram.webhookUrl;

  botInstance = useWebhook
    ? new TelegramBot(config.telegram.token)
    : new TelegramBot(config.telegram.token, { polling: true });

  console.log(`🤖 Bot v4 — ${useWebhook ? 'WEBHOOK' : 'POLLING'} mode`);

  router.register(botInstance);
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