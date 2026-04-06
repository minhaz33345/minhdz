# 🤖 Express Tracking Bot v4

Telegram bot theo dõi đơn vận chuyển express.io.vn — kiến trúc clean, service layer rõ ràng.

## 🚀 Cài đặt

```bash
npm install
cp .env.example .env
# Điền TELEGRAM_BOT_TOKEN, EXPRESS_API_KEY, ADMIN_ID
npm start
```

## 📂 Cấu trúc

```
bot-v4/
├── server.js                    ← Entry point
├── src/
│   ├── config.js                ← Tập trung tất cả env vars
│   ├── api/
│   │   └── expressApi.js        ← HTTP client + retry + schema validator
│   ├── db/
│   │   ├── schema.js            ← Định nghĩa schema DB
│   │   └── repositories/
│   │       ├── base.js          ← lowdb instance
│   │       ├── UserRepository.js
│   │       ├── SubscriptionRepository.js
│   │       ├── OrderCacheRepository.js
│   │       └── LogRepository.js
│   ├── services/
│   │   ├── CreditService.js     ← Toàn bộ logic credit/quota
│   │   ├── OrderService.js      ← Toàn bộ logic đơn hàng
│   │   └── (NotifyService trong jobs/)
│   ├── jobs/
│   │   └── notifier.js          ← Background job polling API
│   ├── handlers/
│   │   ├── orders.js            ← Thin: nhận msg → gọi service → format reply
│   │   ├── account.js
│   │   └── admin.js
│   ├── bot/
│   │   ├── index.js             ← Khởi tạo TelegramBot
│   │   ├── router.js            ← Route command đến handler
│   │   ├── callbacks.js         ← Xử lý inline button
│   │   └── server.js            ← Express server + webhook
│   ├── middleware/
│   │   └── rateLimit.js
│   └── utils/
│       ├── format.js            ← Format Telegram MarkdownV2
│       └── session.js           ← In-memory session
└── data/
    └── db.json                  ← Database (tự tạo khi chạy)
```

## 📱 Lệnh

| Lệnh | Mô tả |
|------|-------|
| `/add <mã> [tên]` | Thêm & theo dõi đơn (tự thông báo khi đổi trạng thái) |
| `/add` | Hướng dẫn nhập mã đơn |
| `/list` | Danh sách đơn đang theo dõi |
| `/untrack <mã>` | Bỏ theo dõi |
| `/trackall` | Theo dõi tất cả đơn trên API |
| `/rename <mã> <tên>` | Đổi tên đơn |
| `/delete <mã>` | Xóa & bỏ theo dõi |
| `/me` | Thông tin tài khoản & số dư |
| `/plans` | Các gói dịch vụ |
| `/partners` | Hãng vận chuyển & phí |
| `/contact` | Liên hệ admin |

**Admin:**

| Lệnh | Mô tả |
|------|-------|
| `/setkey <key>` | Cập nhật API key (hot reload) |
| `/admin` | Bảng điều khiển |
| `/users` | Danh sách user |
| `/ban <id>` / `/unban <id>` | Khóa/mở tài khoản |
| `/setplan <id> <plan>` | Đổi gói (free/pro/business) |
| `/addcredits <id> <số>` | Nạp đơn cho user |
| `/broadcast <nội dung>` | Gửi thông báo tất cả |
| `/logs` | Xem log gần đây |
| `/balance` | Số dư API key |

## ☁️ Deploy

```bash
npm install -g pm2
pm2 start server.js --name express-bot
pm2 save && pm2-startup install
```

> ⚠️ Backup `data/db.json` định kỳ — đây là toàn bộ database.
