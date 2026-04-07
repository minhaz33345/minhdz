const CreditService = require('../services/CreditService');

async function checkBanned(bot, msg) {
  const chatId   = msg.chat.id;
  const UserRepo = require('../db/repositories/UserRepository');
  const user     = UserRepo.findById(chatId);
  if (user?.banned) {
    await bot.sendMessage(chatId,
      '🚫 Tài khoản của bạn đã bị khóa. Liên hệ admin: /contact'
    );
    return false;
  }
  return true;
}

async function hasEnoughCredits(bot, msg, amount = 1) {
  if (!await checkBanned(bot, msg)) return false;
  const chatId = msg.chat.id;
  const bal    = CreditService.getBalance(chatId);
  if (bal.total < amount) {
    await bot.sendMessage(chatId,
      `⚠️ Không đủ số dư!\n\n` +
      `💰 Hiện có: ${bal.total} đơn | Cần: ${amount} đơn\n\n` +
      `💳 Gõ /nap để nạp thêm đơn`
    );
    return false;
  }
  return true;
}

module.exports = { checkBanned, hasEnoughCredits };