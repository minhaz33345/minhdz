// Safe sender — thử MarkdownV2, nếu Telegram parse lỗi thì fallback plain text
async function safeSend(bot, chatId, text, extra = {}) {
  try {
    return await bot.sendMessage(chatId, text, { parse_mode: 'MarkdownV2', ...extra });
  } catch (err) {
    if (err.message && err.message.includes('parse entities')) {
      // Strip markdown, gửi lại plain text
      const plain = text
        .replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '')
        .replace(/\\n/g, '\n');
      return await bot.sendMessage(chatId, plain, { ...extra, parse_mode: undefined });
    }
    throw err;
  }
}

// Safe edit — tương tự cho editMessageText
async function safeEdit(bot, chatId, msgId, text, extra = {}) {
  try {
    return await bot.editMessageText(text, {
      chat_id: chatId, message_id: msgId, parse_mode: 'MarkdownV2', ...extra
    });
  } catch (err) {
    if (err.message && err.message.includes('parse entities')) {
      const plain = text.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '').replace(/\\n/g, '\n');
      return await bot.editMessageText(plain, {
        chat_id: chatId, message_id: msgId, ...extra, parse_mode: undefined
      });
    }
    // Ignore "message not modified" errors
    if (!err.message?.includes('message is not modified')) throw err;
  }
}

module.exports = { safeSend, safeEdit };