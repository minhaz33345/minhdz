'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getOrders, addOrder, renameOrder, deleteOrder, getBalance } from '@/lib/api';
import Toast from '@/components/Toast';

type Order = { code: string; cached: { status: string | null; name: string | null; updatedAt: number | null } };
type ToastType = 'success' | 'error' | 'info';
type ToastState = { message: string; type: ToastType } | null;

export default function DashboardClient() {
  const router = useRouter();
  const [orders, setOrders]   = useState<Order[]>([]);
  const [balance, setBalance] = useState({ total: 0 });
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState<ToastState>(null);

  // Add flow
  const [newCode, setNewCode]       = useState('');
  const [newPartner, setNewPartner] = useState('');
  const [isAdding, setIsAdding]     = useState(false);

  // Edit flow
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [editName, setEditName]   = useState('');

  const showToast = useCallback((message: string, type: ToastType = 'error') => setToast({ message, type }), []);

  const fetchData = useCallback(async () => {
    try {
      const [ordRes, balRes] = await Promise.all([getOrders(), getBalance()]);
      if (ordRes.data) setOrders(ordRes.data);
      if (balRes.data) setBalance(balRes.data);
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes('401')) {
        localStorage.removeItem('session_token');
        router.push('/');
      } else {
        showToast(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
      }
    } finally { setLoading(false); }
  }, [router, showToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Handle Add
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newCode.trim()) return showToast('Nhập mã đơn');
    if (balance.total < 1) return showToast('Hết đơn. Vui lòng nạp thêm qua bot Telegram.');
    setIsAdding(true);
    try {
      const res = await addOrder(newCode.trim(), undefined, newPartner.trim() || undefined);
      if (res.type === 'ALREADY_TRACKING') {
        showToast('Đơn đã được theo dõi', 'info');
      } else {
        showToast('Đã thêm đơn!', 'success');
        setNewCode(''); setNewPartner('');
      }
      await fetchData();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Lỗi thêm đơn');
    } finally { setIsAdding(false); }
  }

  // Handle Rename
  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!editOrder || !editName.trim()) return;
    try {
      await renameOrder(editOrder.code, editName.trim());
      showToast('Đã đổi tên', 'success');
      setEditOrder(null); setEditName('');
      await fetchData();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Lỗi đổi tên');
    }
  }

  // Handle Delete
  async function handleDelete(code: string) {
    if (!confirm('Bạn có chắc chắn muốn xóa đơn: ' + code + ' ?')) return;
    try {
      await deleteOrder(code);
      showToast('Đã xóa', 'info');
      await fetchData();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Lỗi xóa đơn');
    }
  }

  if (loading) return <div className="text-center py-20"><span className="spinner w-8 h-8"></span></div>;

  return (
    <div className="space-y-6">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Danh sách đơn hàng</h2>
          <p className="text-sm text-white/50">Đang theo dõi {orders.length} đơn</p>
        </div>
        <div className="glass px-4 py-2 flex items-center gap-3">
          <span className="text-xl">💰</span>
          <div>
            <p className="text-xs text-white/50">Số dư hiện tại</p>
            <p className="font-bold text-lg text-teal-400">{balance.total} <span className="text-sm">đơn</span></p>
          </div>
        </div>
      </div>

      {/* Thêm đơn mới */}
      <div className="glass p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <span className="text-lg">➕</span> Thêm đơn mới
        </h3>
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
          <input
            className="input flex-1"
            placeholder="Mã đơn hàng (ví dụ: SPX123...)"
            value={newCode}
            onChange={e => setNewCode(e.target.value)}
          />
          <input
            className="input w-full sm:w-48"
            placeholder="Hãng (không bắt buộc)"
            value={newPartner}
            onChange={e => setNewPartner(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={isAdding}>
            {isAdding ? 'Đang thêm...' : 'Thêm ngay'}
          </button>
        </form>
        <p className="text-xs text-white/40 mt-2">Gợi ý: Mở app Telegram @BotName để nhận thông báo tự động khi trạng thái thay đổi. Phí: 1 đơn / mã.</p>
      </div>

      {/* Modal Rename */}
      {editOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="glass-dark p-6 w-full max-w-md fade-in">
            <h3 className="text-lg font-bold mb-4">✏️ Đổi tên đơn hàng</h3>
            <p className="text-sm text-white/60 mb-2">Mã: <code className="text-white bg-white/10 px-1 py-0.5 rounded">{editOrder.code}</code></p>
            <form onSubmit={handleRename} className="space-y-4">
              <input
                className="input"
                autoFocus
                placeholder="Tên gợi nhớ..."
                value={editName}
                onChange={e => setEditName(e.target.value)}
              />
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setEditOrder(null)} className="btn-secondary">Hủy</button>
                <button type="submit" className="btn-primary flex-1">Lưu tên mới</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {orders.length === 0 ? (
          <div className="col-span-full py-16 text-center border border-dashed border-white/10 rounded-2xl text-white/50">
            📭 Danh sách trống. Hãy thêm mã đơn phía trên.
          </div>
        ) : (
          orders.map(o => {
            const name   = o.cached?.name;
            const status = o.cached?.status || 'Chưa rõ';
            
            let statusColor = 'badge-gray';
            if (status.includes('thành công') || status.includes('Đã giao')) statusColor = 'badge-green';
            else if (status.includes('hủy') || status.includes('trả')) statusColor = 'badge-red';
            else if (status.includes('đang giao') || status.includes('phát hàng')) statusColor = 'badge-blue';
            else if (status.includes('lấy') || status.includes('tạo')) statusColor = 'badge-yellow';

            return (
              <div key={o.code} className="glass p-5 hover:border-white/20 transition-colors flex flex-col h-full">
                <div className="flex justify-between items-start mb-3">
                  <div className="truncate flex-1">
                    <h4 className="font-bold text-lg truncate" title={name || o.code}>
                      {name || o.code}
                    </h4>
                    <p className="text-xs text-white/50 font-mono tracking-wider mt-1">{o.code}</p>
                  </div>
                </div>

                <div className="mb-6 flex-1">
                  <span className={`badge ${statusColor}`}>
                    {status}
                  </span>
                </div>

                <div className="flex gap-2 justify-end border-t border-white/5 pt-3 mt-auto">
                  <button onClick={() => { setEditOrder(o); setEditName(name || ''); }} className="btn-secondary flex-1 py-1.5 text-xs">
                    ✏️ Đổi tên
                  </button>
                  <button onClick={() => handleDelete(o.code)} className="btn-danger flex-1 py-1.5 text-xs">
                    🗑️ Xóa
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
