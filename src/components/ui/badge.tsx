import { cn } from '@/lib/utils';

const variants: Record<string, string> = {
  gold: 'bg-gold-500/10 text-gold-400 border-gold-500/20',
  green: 'bg-green-500/10 text-green-400 border-green-500/20',
  red: 'bg-red-500/10 text-red-400 border-red-500/20',
  zinc: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
};

export function Badge({
  children,
  variant = 'zinc',
  className,
}: {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider', variants[variant], className)}>
      {children}
    </span>
  );
}
