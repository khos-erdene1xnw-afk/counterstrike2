'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingBag, Archive, Repeat, Wallet, Shield, LayoutDashboard } from 'lucide-react';
import { CurrencySwitcher } from '@/components/ui/currency-switcher';
import { NotificationsBell } from '@/components/layout/notifications-bell';
import { useCurrency } from '@/providers/currency-provider';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', label: 'Market', icon: ShoppingBag },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inventory', label: 'Inventory', icon: Archive },
  { href: '/trades', label: 'Trades', icon: Repeat },
  { href: '/wallet', label: 'Wallet', icon: Wallet },
];

export function Navbar() {
  const pathname = usePathname();
  const { rate } = useCurrency();

  return (
    <header className="glass-card sticky top-0 z-40 w-full border-b border-zinc-800/80 px-4 py-3 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-gradient p-1.5 shadow-lg">
            <svg className="h-full w-full text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <span className="font-display text-xl font-bold tracking-wider text-white">
              CS2<span className="gold-text ml-1 font-extrabold">GOLD</span>
            </span>
            <div className="text-[10px] font-semibold uppercase leading-none tracking-widest text-gold-500/80">P2P Marketplace</div>
          </div>
        </Link>

        <nav className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-ink-900/80 p-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={cn('flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition sm:px-4', active ? 'bg-gold-500 text-black' : 'text-zinc-400 hover:text-white')}>
                <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
          <Link href="/admin" className={cn('flex items-center gap-1.5 rounded-lg border border-dashed border-gold-500/20 px-3 py-2 text-xs font-semibold transition sm:px-4', pathname.startsWith('/admin') ? 'bg-gold-500 text-black' : 'text-zinc-400 hover:text-white')}>
            <Shield className="h-3.5 w-3.5 text-gold-500" /> <span className="hidden sm:inline">Admin</span>
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <CurrencySwitcher />
          <div className="hidden text-right md:block">
            <div className="text-[10px] uppercase text-zinc-400">Live Rate</div>
            <div className="text-xs font-bold text-gold-400">1 USD = \u20ae{rate.toLocaleString()}</div>
          </div>
          <NotificationsBell />
          <Link href="/api/auth/steam" className="btn-gold px-4 py-2 text-xs">Steam Login</Link>
        </div>
      </div>
    </header>
  );
}
