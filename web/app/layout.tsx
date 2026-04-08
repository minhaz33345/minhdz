import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Track Dashboard — Theo dõi đơn hàng',
  description: 'Quản lý đơn vận chuyển, tạo API key tích hợp, theo dõi trạng thái real-time.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="bg-[#0a0a0f] text-white min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
