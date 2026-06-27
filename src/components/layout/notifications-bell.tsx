'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Notif { id: string; title: string; message: string; isRead: boolean; type: string; link?: string | null; createdAt: string; }

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items ?? []);
      setUnread(data.unread ?? 0);
    } catch { /* ignore when signed out */ }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const markAll = async () => {
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { setOpen((o) => !o); if (!open) markAll(); }} className="relative rounded-lg border border-zinc-800 bg-ink-900/80 p-2 text-zinc-400 transition hover:text-white" aria-label="Notifications">
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div className="glass-card-gold animate-fade-in absolute right-0 z-50 mt-2 w-80 rounded-2xl p-2 shadow-2xl">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-bold text-white">Notifications</span>
            <button onClick={markAll} className="text-[10px] font-semibold text-gold-400 hover:underline">Mark all read</button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-zinc-500">No notifications yet.</p>
            ) : items.map((n) => (
              <a key={n.id} href={n.link ?? '#'} className={cn('block rounded-xl px-3 py-2.5 transition hover:bg-ink-900', !n.isRead && 'bg-gold-500/5')}>
                <div className="flex items-start gap-2">
                  <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', n.isRead ? 'bg-zinc-700' : 'bg-gold-500')} />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white">{n.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-400">{n.message}</div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
