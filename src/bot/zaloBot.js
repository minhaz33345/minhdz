/**
 * Zalo Bot Client
 * Thay thế node-telegram-bot-api, gọi Zalo Bot Platform API qua HTTP.
 * Base URL: https://bot-api.zaloplatforms.com/bot<TOKEN>/<method>
 */
const axios = require('axios');

class ZaloBot {
  constructor(token) {
    if (!token) throw new Error('ZaloBot: token is required');
    this.token = token;
    this.baseUrl = `https://bot-api.zaloplatforms.com/bot${token}`;
  }

  async _call(method, data = {}, httpMethod = 'POST') {
    const url = `${this.baseUrl}/${method}`;
    try {
      let res;
      if (httpMethod === 'GET') {
        res = await axios.get(url, { params: data });
      } else {
        res = await axios.post(url, data, {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const body = res.data;
      if (!body.ok) {
        throw new Error(`Zalo API error [${method}]: ${body.description || JSON.stringify(body)}`);
      }
      return body.result;
    } catch (err) {
      if (err.response) {
        const b = err.response.data;
        throw new Error(`Zalo API [${method}] HTTP ${err.response.status}: ${b?.description || JSON.stringify(b)}`);
      }
      throw err;
    }
  }

  /** Gửi tin nhắn text */
  async sendMessage(chatId, text) {
    return this._call('sendMessage', { chat_id: String(chatId), text: String(text) });
  }

  /**
   * Gửi ảnh.
   * @param {string} chatId
   * @param {string} photoUrl - URL ảnh hoặc multipart (hiện tại Zalo hỗ trợ URL)
   * @param {string} [caption]
   */
  async sendPhoto(chatId, photoUrl, caption) {
    const payload = { chat_id: String(chatId), photo: photoUrl };
    if (caption) payload.caption = caption;
    try {
      return await this._call('sendPhoto', payload);
    } catch (err) {
      // fallback: gửi text nếu ảnh lỗi
      console.warn('[ZaloBot] sendPhoto failed, fallback to text:', err.message);
      const msg = caption ? `${caption}\n\n🖼 ${photoUrl}` : photoUrl;
      return this.sendMessage(chatId, msg);
    }
  }

  /** Lấy thông tin bot */
  async getMe() {
    return this._call('getMe', {}, 'GET');
  }

  /**
   * Đăng ký webhook URL
   * @param {string} url
   * @param {string} [secretToken]
   */
  async setWebhook(url, secretToken) {
    const payload = { url };
    if (secretToken) payload.secret_token = secretToken;
    return this._call('setWebhook', payload);
  }

  /** Xóa webhook */
  async deleteWebhook() {
    return this._call('deleteWebhook', {});
  }
}

module.exports = ZaloBot;
