export function Footer() {
  return (
    <footer className="glass-card mt-auto w-full border-t border-zinc-800/80 px-4 py-6 text-center text-xs text-zinc-500">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold text-white">
            CS2<span className="gold-text ml-0.5 font-extrabold">GOLD</span>
          </span>
          <span>© {new Date().getFullYear()}. All rights reserved.</span>
        </div>
        <div className="flex items-center gap-4 text-zinc-400">
          <a href="/terms" className="transition hover:text-gold-500">Terms of Service</a>
          <a href="/steam-rules" className="transition hover:text-gold-500">Steam API Rules</a>
          <a href="/qpay-policy" className="transition hover:text-gold-500">QPay Policy</a>
        </div>
      </div>
    </footer>
  );
}
