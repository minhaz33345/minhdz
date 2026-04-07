# 🤖 Zalo Bot — Theo dõi vận đơn

Bot theo dõi đơn vận chuyển tích hợp **Zalo Bot Platform**, tự động thông báo khi có cập nhật, hỗ trợ nạp đơn qua SePay.

---

## ⚡ Cài đặt nhanh

### 1. Cài Node.js
Tải và cài từ https://nodejs.org (phiên bản LTS)

### 2. Cài dependencies
```bash
cd bot-v4vipppp
npm install
```

### 3. Cấu hình `.env`

Mở file `.env` và điền thông tin:

```env
# BẮT BUỘC — Lấy từ https://bot.zapps.me sau khi tạo bot
ZALO_BOT_TOKEN=YOUR_ZALO_BOT_TOKEN_HERE

# Express API key để tra cứu vận đơn
EXPRESS_API_KEY=your_express_api_key

# ID Zalo của admin — xem hướng dẫn bên dưới để lấy
ZALO_ADMIN_ID=YOUR_ZALO_ADMIN_ID_HERE

# URL domain của server (HTTPS bắt buộc)
WEBHOOK_URL=https://your-domain.com

# Secret token cho webhook Zalo (tự đặt)
ZALO_WEBHOOK_SECRET=your_secret_here
```

---

## 🔑 Cách lấy Zalo ID của bạn (ZALO_ADMIN_ID)

**Zalo ID là chuỗi hex** (ví dụ: `6ede9afa66b88fe6d6a9`), không phải số điện thoại.

### Cách 1 — Dùng lệnh `/myid` (dễ nhất)
1. Khởi động bot (chưa cần có ZALO_ADMIN_ID)
2. Mở Zalo → tìm bot của bạn → nhắn tin `/myid`
3. Bot trả về ID của bạn → copy vào `.env`

### Cách 2 — Đọc server log
Khi `ZALO_ADMIN_ID` chưa được cài đặt, mỗi lần ai nhắn bot server sẽ in ra:
```
⭐ [SETUP] Người dùng nhắn tin — Zalo ID: 6ede9afa66b88fe6d6a9 | Tên: Minh
   → Copy ID này vào .env: ZALO_ADMIN_ID=6ede9afa66b88fe6d6a9
```

---

## 🏗️ Tạo Zalo Bot

1. Truy cập https://bot.zapps.me → Đăng nhập bằng tài khoản Zalo
2. Tạo Bot mới → Lấy **Bot Token**
3. Điền token vào `.env` → `ZALO_BOT_TOKEN=...`

---

## 🚀 Chạy bot

```bash
# Development
node server.js

# Production (dùng PM2)
npm install -g pm2
pm2 start server.js --name zalo-bot
pm2 save
```

---

## 🔗 Cài đặt Webhook

Bot sẽ **tự động đăng ký webhook** khi khởi động nếu `WEBHOOK_URL` đã được cài đặt.

Webhook Zalo: `https://your-domain.com/webhooks`  
Webhook SePay: `https://your-domain.com/payment/sepay`

> ⚠️ Zalo yêu cầu domain **HTTPS**. Dùng Nginx + Let's Encrypt nếu chạy VPS.

---

## 📋 Danh sách lệnh

| Lệnh | Mô tả |
|------|--------|
| `/start` | Bắt đầu, xem số dư |
| `/help` | Danh sách lệnh |
| `/add <mã>` | Thêm & theo dõi đơn |
| `/list` | Danh sách đơn (gõ số để xem chi tiết) |
| `/untrack <mã>` | Bỏ theo dõi |
| `/clearlist` | Xóa toàn bộ |
| `/nap` | Nạp đơn qua chuyển khoản |
| `/me` | Thông tin tài khoản |
| `/ref` | Link giới thiệu |
| `/contact` | Liên hệ admin |
| `/myid` | **Lấy Zalo ID của bạn** |
| `/cancel` hoặc `/huy` | Hủy thao tác hiện tại |

### Lệnh Admin
| Lệnh | Mô tả |
|------|--------|
| `/admin` | Bảng điều khiển |
| `/users` | Danh sách user |
| `/ban <id>` | Khóa tài khoản |
| `/unban <id>` | Mở khóa |
| `/addcredits <id> <số>` | Nạp đơn thủ công |
| `/broadcast <nội dung>` | Thông báo tất cả |
| `/botoff` / `/boton` | Bật/tắt bảo trì |
| `/balance` | Số dư API express.io |

---

## 🔄 So sánh với bot Telegram cũ

| Tính năng | Telegram | Zalo |
|---|---|---|
| Inline keyboard | ✅ | ❌ → Text menu (gõ số) |
| Edit message | ✅ | ❌ → Gửi tin mới |
| Polling mode | ✅ | ❌ → Webhook only |
| MarkdownV2 | ✅ | ❌ → Plain text |
| /myid | ❌ | ✅ (mới thêm) |

---

## 📁 Cấu trúc project

```
bot-v4vipppp/
├── server.js              # Entry point
├── .env                   # Cấu hình (không commit lên Git)
├── src/
│   ├── bot/
│   │   ├── zaloBot.js     # Zalo Bot HTTP client (thay node-telegram-bot-api)
│   │   ├── index.js       # Khởi tạo bot
│   │   ├── router.js      # Dispatch lệnh từ webhook
│   │   └── server.js      # Express server + webhook endpoints
│   ├── handlers/          # Logic từng lệnh
│   ├── services/          # CreditService, OrderService
│   ├── jobs/              # Notifier (tự động check đơn)
│   ├── payments/          # SePay webhook
│   ├── middleware/        # Rate limit, ban check
│   ├── db/                # LowDB repositories
│   └── utils/             # format.js, sender.js, session.js
```
