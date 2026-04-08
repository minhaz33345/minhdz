'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getApiKeys, createApiKey, deleteApiKey, resetApiKeys } from '@/lib/api';
import Toast from '@/components/Toast';

type ApiKey = { keyMasked: string; label: string; createdAt: number };
type ToastType = 'success' | 'error' | 'info';
type ToastState = { message: string; type: ToastType } | null;

export default function ApiKeysClient() {
  const router = useRouter();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [maxKeys, setMaxKeys] = useState(2);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState>(null);
  
  const [newLabel, setNewLabel] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [fullKey, setFullKey] = useState<string | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'error') => setToast({ message, type }), []);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await getApiKeys();
      setKeys(res.data);
      setMaxKeys(res.maxKeys || 2);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('401')) {
        localStorage.removeItem('session_token');
        router.push('/');
      } else {
        showToast(e instanceof Error ? e.message : 'Lỗi tải API keys');
      }
    } finally { setLoading(false); }
  }, [router, showToast]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (keys.length >= maxKeys) return showToast(`Tối đa ${maxKeys} key`);
    setIsCreating(true);
    try {
      const res = await createApiKey(newLabel.trim());
      setFullKey(res.key); // show once
      setNewLabel('');
      showToast('Đã tạo API Key', 'success');
      await fetchKeys();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Lỗi tạo key');
    } finally { setIsCreating(false); }
  }

  async function handleDelete(prefix: string) {
    if (!confirm('Xác nhận xóa key này? Các ứng dụng đang dùng sẽ lỗi.')) return;
    try {
      await deleteApiKey(prefix);
      showToast('Đã xóa', 'info');
      await fetchKeys();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Lỗi xóa key');
    }
  }

  async function handleReset() {
    if (!confirm('⚠️ CẢNH BÁO: Reset sẽ XÓA TOÀN BỘ keys hiện tại và tạo 1 key mới. Bạn có chắc chắn?')) return;
    setIsCreating(true);
    try {
      const res = await resetApiKeys();
      setFullKey(res.key); // show once
      setNewLabel('');
      showToast('Đã reset toàn bộ keys!', 'success');
      await fetchKeys();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Lỗi reset key');
    } finally { setIsCreating(false); }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    showToast('Đã copy', 'info');
  }

  if (loading) return <div className="text-center py-20"><span className="spinner w-8 h-8"></span></div>;

  return (
    <div className="space-y-6">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div>
        <h2 className="text-2xl font-bold mb-2">🔑 Quản lý API Keys</h2>
        <p className="text-white/60">Tạo khóa (key) để tích hợp với ứng dụng bên thứ 3 của bạn. Tối đa {maxKeys} key/tài khoản.</p>
      </div>

      {fullKey && (
        <div className="fade-in glass border-teal-500/50 p-5 mb-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-teal-500"></div>
          <h3 className="font-bold text-teal-400 mb-2">🎉 API Key đã được tạo!</h3>
          <p className="text-sm text-white/70 mb-3">
            Hãy copy key này ngay bây giờ. <strong>Key sẽ không bao giờ hiển thị lại sau khi bạn đóng thông báo này.</strong>
          </p>
          <div className="flex bg-black/40 rounded border border-white/10 p-1">
            <code className="flex-1 p-2 font-mono text-sm break-all">{fullKey}</code>
            <button onClick={() => copy(fullKey)} className="btn-primary py-1 px-4 ml-2">Copy</button>
          </div>
          <button onClick={() => setFullKey(null)} className="btn-secondary text-xs mt-3 py-1">Đã lưu & đóng</button>
        </div>
      )}

      {/* Tạo mới */}
      {keys.length < maxKeys ? (
        <div className="glass p-5">
          <h3 className="font-semibold mb-4">Tạo key mới ({keys.length}/{maxKeys})</h3>
          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
            <input
              className="input flex-1"
              placeholder="Tên gợi nhớ (ví dụ: Tool Auto GHTK)"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              maxLength={40}
            />
            <button type="submit" className="btn-primary w-full sm:w-32" disabled={isCreating}>
              {isCreating ? 'Đang tạo...' : '+ Tạo key'}
            </button>
          </form>
        </div>
      ) : (
        <div className="glass p-6 text-center border-yellow-500/30">
          <h3 className="text-yellow-400 font-bold mb-2">⚠️ Đã đạt giới hạn ({maxKeys}/{maxKeys} keys)</h3>
          <p className="text-white/60 text-sm mb-4">Bạn không thể tạo thêm. Nếu bạn bị lộ key, hãy Reset để xóa tất cả.</p>
          <button onClick={handleReset} className="btn-danger" disabled={isCreating}>
            {isCreating ? 'Đang xử lý...' : '🔄 Reset tất cả Keys'}
          </button>
        </div>
      )}

      {/* List */}
      <h3 className="font-bold mt-8 mb-4">Keys hiện có</h3>
      <div className="space-y-3">
        {keys.length === 0 ? (
          <div className="text-center py-10 glass border-dashed">
            <p className="text-white/40">Bạn chưa có API Key nào.</p>
          </div>
        ) : (
          keys.map(k => {
            const prefix = k.keyMasked.split('.')[0];
            return (
              <div key={k.keyMasked} className="glass p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h4 className="font-bold mb-1">{k.label || 'Không tên'}</h4>
                  <code className="text-sm text-teal-300 font-mono bg-teal-400/10 px-2 py-0.5 rounded">
                    {k.keyMasked}
                  </code>
                  <p className="text-xs text-white/40 mt-2">Ngày tạo: {new Date(k.createdAt).toLocaleString('vi-VN')}</p>
                </div>
                <button onClick={() => handleDelete(prefix)} className="btn-secondary text-red-400 hover:border-red-400/50 hover:bg-red-400/10 py-1.5 text-sm">
                  🗑️ Xóa key
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
