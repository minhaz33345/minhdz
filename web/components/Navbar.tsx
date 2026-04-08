'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { logout } from '@/lib/api';

const navItems = [
  { href: '/dashboard', label: 'Đơn hàng', icon: '📦' },
  { href: '/api-keys',  label: 'API Keys',  icon: '🔑' },
  { href: '/docs',      label: 'Tài liệu',  icon: '📖' },
];

export default function Navbar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [user, setUser] = useState<{ firstName?: string; username?: string; chatId?: string } | null>(null);

  useEffect(() => {
    const u = localStorage.getItem('user_info');
    if (u) setUser(JSON.parse(u));
  }, []);

  async function handleLogout() {
    await logout();
    router.push('/');
  }

  return (
    <nav className="glass-dark border-b border-white/10 px-6 py-3 flex items-center justify-between sticky top-0 z-50">
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg">
        <span className="text-2xl">🚀</span>
        <span className="gradient-text">TrackDash</span>
      </Link>

      {/* Nav links */}
      <div className="flex items-center gap-1">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link text-sm ${pathname === item.href ? 'active' : ''}`}
          >
            <span>{item.icon}</span>
            <span className="hidden sm:inline">{item.label}</span>
          </Link>
        ))}
      </div>

      {/* User info + logout */}
      <div className="flex items-center gap-3">
        {user && (
          <span className="text-sm text-white/50 hidden md:block">
            {user.firstName || user.username || `#${user.chatId}`}
          </span>
        )}
        <button onClick={handleLogout} className="btn-secondary text-sm py-1.5 px-3">
          Đăng xuất
        </button>
      </div>
    </nav>
  );
}
