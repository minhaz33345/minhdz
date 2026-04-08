'use client';
import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { requestOtp, verifyOtp } from '@/lib/api';
import Toast from '@/components/Toast';

type Step = 'chatid' | 'otp';
type ToastType = 'success' | 'error' | 'info';
type ToastState = { message: string; type: ToastType } | null;

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep]     = useState<Step>('chatid');
  const [chatId, setChatId] = useState('');
  const [otp, setOtp]       = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast]   = useState<ToastState>(null);

  const showToast = (message: string, type: ToastType = 'error') => setToast({ message, type });

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!chatId.trim() || !/^\d+$/.test(chatId.trim())) {
      return showToast('ChatID chỉ gồm chữ số. Lấy bằng cách nhắn /start cho @userinfobot');
    }
    setLoading(true);
    try {
      await requestOtp(chatId.trim());
      showToast('OTP đã gửi qua Telegram!', 'success');
      setStep('otp');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Lỗi gửi OTP');
    } finally { setLoading(false); }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otp.trim() || otp.trim().length !== 6) {
      return showToast('Nhập đúng 6 số OTP');
    }
    setLoading(true);
    try {
      await verifyOtp(chatId.trim(), otp.trim());
      showToast('Đăng nhập thành công!', 'success');
      setTimeout(() => router.push('/dashboard'), 500);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'OTP sai hoặc hết hạn');
    } finally { setLoading(false); }
  }

  const closeToast = useCallback(() => setToast(null), []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {toast && <Toast {...toast} onClose={closeToast} />}

      <div className="w-full max-w-md fade-in">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🚀</div>
          <h1 className="text-3xl font-bold gradient-text mb-2">TrackDash</h1>
          <p className="text-white/50 text-sm">Đăng nhập bằng tài khoản Telegram của bạn</p>
        </div>

        <div className="glass p-8 space-y-6">
          {step === 'chatid' ? (
            <form onSubmit={handleRequestOtp} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">
                  Telegram Chat ID
                </label>
                <input
                  className="input"
                  type="text"
                  placeholder="Ví dụ: 6941441964"
                  value={chatId}
                  onChange={e => setChatId(e.target.value)}
                  autoFocus
                  id="chatid-input"
                />
                <p className="text-xs text-white/40 mt-2">
                  Lấy chatId: nhắn <code className="text-purple-400">/start</code> cho{' '}
                  <a href="https://t.me/userinfobot" target="_blank" className="text-purple-400 hover:underline">@userinfobot</a>
                </p>
              </div>

              <button
                type="submit"
                id="send-otp-btn"
                className="btn-primary w-full py-3 text-base"
                disabled={loading}
              >
                {loading ? <><span className="spinner mr-2 align-middle" />Đang gửi...</> : '📨 Gửi mã OTP qua Telegram'}
              </button>

              <div className="border-t border-white/10 pt-4">
                <div className="flex items-start gap-3 text-sm text-white/50">
                  <span className="text-xl">🔐</span>
                  <p>Chúng tôi sẽ gửi mã xác nhận 6 số vào bot Telegram của bạn. Không cần mật khẩu.</p>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div className="text-center py-2">
                <div className="text-4xl mb-2">📱</div>
                <p className="text-white/70 text-sm">Kiểm tra Telegram — mã OTP đã được gửi</p>
                <p className="text-xs text-white/40 mt-1">Mã hết hạn sau 5 phút</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">Mã OTP (6 số)</label>
                <input
                  className="input text-center text-2xl tracking-widest font-bold"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="• • • • • •"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  id="otp-input"
                />
              </div>

              <button
                type="submit"
                id="verify-otp-btn"
                className="btn-primary w-full py-3 text-base"
                disabled={loading}
              >
                {loading ? <><span className="spinner mr-2 align-middle" />Đang xác thực...</> : '✅ Xác nhận & Đăng nhập'}
              </button>

              <button
                type="button"
                onClick={() => { setStep('chatid'); setOtp(''); }}
                className="btn-secondary w-full py-2 text-sm"
              >
                ← Quay lại nhập ChatID
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-white/30 mt-6">
          Chỉ dành cho người dùng đã đăng ký bot Telegram
        </p>
      </div>
    </div>
  );
}
