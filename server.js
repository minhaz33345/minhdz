const config = require('./src/config');
const bot    = require('./src/bot/index');
const { createServer } = require('./src/bot/server');

// Khởi tạo bot (polling hoặc webhook) + notifier
const botInstance = bot.init();

// Khởi tạo HTTP server
const app = createServer(botInstance);
app.listen(config.server.port, () => {
  console.log(`🚀 Server: http://localhost:${config.server.port}`);
});
