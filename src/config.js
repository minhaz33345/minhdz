require('dotenv').config();

function required(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

module.exports = {
  telegram: {
    token:      required('TELEGRAM_BOT_TOKEN'),
    adminId:    parseInt(process.env.ADMIN_ID || '0', 10),
    webhookUrl: process.env.WEBHOOK_URL || null,
  },
  express: {
    apiKey:  process.env.EXPRESS_API_KEY || null,
    baseUrl: 'https://express.io.vn/api/v1',
    timeout: 15000,
    retry:   3,
  },
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
  },
  notify: {
    intervalSec: parseInt(process.env.NOTIFY_INTERVAL || '60', 10),
  },
  credits: {
    monthlyFreeByPlan: { free: 5, pro: 20, business: 50 },
  },
  contact: process.env.CONTACT_INFO || 'Liên hệ admin để được hỗ trợ.',

  // SePay payment config
  sepay: {
    apiToken:      process.env.SEPAY_API_TOKEN || '',
    webhookSecret: process.env.SEPAY_WEBHOOK_SECRET || '',
    bankAccount:   process.env.BANK_ACCOUNT || '',
    bankName:      process.env.BANK_NAME || 'BIDV',
    accountName:   process.env.ACCOUNT_NAME || '',
  },

  // Gói nạp đơn (VNĐ → số đơn)
  packages: [
    { amount: 20000,  credits: 10,  label: '20k → 10 đơn' },
    { amount: 50000,  credits: 30,  label: '50k → 30 đơn' },
    { amount: 100000, credits: 70,  label: '100k → 70 đơn' },
    { amount: 200000, credits: 160, label: '200k → 160 đơn' },
  ],

  // Số đơn dùng thử cho user mới (0 = không có)
  trialCredits: 2,

  // Credit cost per partner (số đơn bị trừ khi add)
  partnerCreditCost: {
    SPX: 1, GHN: 1, EMS: 1, JT: 1, FUTA: 1, TFE: 1,
    '247EXPRESS': 1, NETCO: 1, NETPOST: 1,
    BEST: 1.5, LEX: 1.5, VNPOST: 1.5, VIETTELPOST: 1.5, NHATTIN: 1.5,
    GHTK: 2,
  },
};