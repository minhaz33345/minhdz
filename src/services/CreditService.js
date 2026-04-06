const UserRepo = require('../db/repositories/UserRepository');
const LogRepo  = require('../db/repositories/LogRepository');

function ensureUser(chatId, meta = {}) {
  let user = UserRepo.findById(chatId);
  if (!user) user = UserRepo.create(chatId, meta);
  else if (meta.username || meta.firstName) UserRepo.update(chatId, meta);
  return UserRepo.findById(chatId);
}

function getBalance(chatId) {
  const user = UserRepo.findById(chatId);
  if (!user) return { trial: 0, referral: 0, paid: 0, total: 0 };
  const trial    = user.freeCredits     || 0; // đổi tên hiển thị thành "dùng thử"
  const referral = user.referralCredits || 0;
  const paid     = user.paidCredits     || 0;
  return { trial, referral, paid, total: Math.round((trial + referral + paid) * 100) / 100 };
}

// Trừ theo thứ tự: trial → referral → paid
function consume(chatId, amount = 1) {
  const bal = getBalance(chatId);
  if (bal.total < amount) return { ok: false, reason: 'NO_CREDITS', balance: bal };

  let remaining = amount;
  const user    = UserRepo.findById(chatId);

  if (remaining > 0 && (user.freeCredits || 0) > 0) {
    const deduct = Math.min(remaining, user.freeCredits);
    UserRepo.update(chatId, { freeCredits: Math.round(Math.max(0, user.freeCredits - deduct) * 100) / 100 });
    remaining = Math.round((remaining - deduct) * 100) / 100;
  }
  if (remaining > 0 && (user.referralCredits || 0) > 0) {
    const deduct = Math.min(remaining, user.referralCredits);
    UserRepo.update(chatId, { referralCredits: Math.round(Math.max(0, user.referralCredits - deduct) * 100) / 100 });
    remaining = Math.round((remaining - deduct) * 100) / 100;
  }
  if (remaining > 0 && (user.paidCredits || 0) > 0) {
    const deduct = Math.min(remaining, user.paidCredits);
    UserRepo.update(chatId, { paidCredits: Math.round(Math.max(0, user.paidCredits - deduct) * 100) / 100 });
  }

  LogRepo.append(chatId, 'consume', `-${amount} before:${bal.total}`);
  return { ok: true, deducted: amount, balance: getBalance(chatId) };
}

function addPaid(chatId, amount) {
  const user = UserRepo.findById(chatId);
  if (!user) return;
  UserRepo.update(chatId, { paidCredits: Math.round(((user.paidCredits || 0) + amount) * 100) / 100 });
  LogRepo.append(chatId, 'add_paid', `+${amount}`);
}

function addReferral(chatId, amount) {
  const user = UserRepo.findById(chatId);
  if (!user) return;
  UserRepo.update(chatId, { referralCredits: Math.round(((user.referralCredits || 0) + amount) * 100) / 100 });
  LogRepo.append(chatId, 'add_referral', `+${amount}`);
}

module.exports = { ensureUser, getBalance, consume, addPaid, addReferral };