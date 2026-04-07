/**
 * Zalo Bot sender — plain text, không hỗ trợ edit/delete message
 * safeEdit được giữ lại tên để tránh sửa nhiều chỗ nhưng thực chất gửi tin mới
 */
async function safeSend(bot, chatId, text) {
  try {
    return await bot.sendMessage(chatId, text);
  } catch (err) {
    console.error(`[safeSend] chatId=${chatId} err=${err.message}`);
    throw err;
  }
}

/**
 * Zalo không hỗ trợ edit message — gửi tin nhắn mới thay thế
 * msgId bị bỏ qua hoàn toàn
 */
async function safeEdit(bot, chatId, _msgId, text) {
  return safeSend(bot, chatId, text);
}

module.exports = { safeSend, safeEdit };