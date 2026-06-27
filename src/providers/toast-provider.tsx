'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CheckCircle2, XCircle, Bell, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; title: string; message: string; type: ToastType; }

interface ToastContextValue {
  toast: (title: string, message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback((title: string, message: string, type: ToastType = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, title, message, type }]);
    setTimeout(() => remove(id), 4500);
  }, [remove]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-5 right-5 z-[100] flex flex-col gap-3 max-w-sm w-[calc(100%-2.5rem)] sm:w-auto">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-fade-in glass-card-gold rounded-xl p-4 flex items-start gap-3 shadow-2xl border-l-4 ${
              t.type === 'success' ? 'border-l-green-500' : t.type === 'error' ? 'border-l-red-500' : 'border-l-gold-500'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              {t.type === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
              {t.type === 'info' && <Bell className="w-4 h-4 text-gold-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-white">{t.title}</div>
              <div className="text-[11px] text-zinc-400 mt-1 leading-normal">{t.message}</div>
            </div>
            <button onClick={() => remove(t.id)} className="text-zinc-500 hover:text-white shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
