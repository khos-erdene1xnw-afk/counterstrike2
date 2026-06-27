'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, QrCode, Check, Clock, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import { useCurrency } from '@/providers/currency-provider';
import { useToast } from '@/providers/toast-provider';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Tx { id: string; type: string; amountMNT: number; amountUSD: number; status: string; date: string; }
interface Invoice { id: string; amountMNT: number; qrImage: string; expiresAt: string; }

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS  = 30 * 60 * 1000;

const BANKS = ['Khan Bank', 'Golomt Bank', 'State Bank', 'Trade and Development Bank', 'Xac Bank', 'Capitron Bank'];

export function WalletClient({
  initialBalanceMNT = 0,
  initialLockedMNT = 0,
  initialPendingMNT = 0,
  initialTx = [],
}: {
  initialBalanceMNT?: number;
  initialLockedMNT?: number;
  initialPendingMNT?: number;
  initialTx?: Tx[];
}) {
  const { rate } = useCurrency();
  const { toast } = useToast();
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [balanceMNT, setBalanceMNT] = useState(initialBalanceMNT);
  const [lockedMNT] = useState(initialLockedMNT);
  const [pendingMNT, setPendingMNT] = useState(initialPendingMNT);
  const [txs, setTxs] = useState<Tx[]>(initialTx);

  // Deposit state
  const [amount, setAmount] = useState(50000);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [depLoading, setDepLoading] = useState(false);
  const [invoicePaid, setInvoicePaid] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);

  // Withdraw state
  const [wAmount, setWAmount] = useState(50000);
  const [bankName, setBankName] = useState(BANKS[0]);
  const [bankAccount, setBankAccount] = useState('');
  const [accountName, setAccountName] = useState('');
  const [wLoading, setWLoading] = useState(false);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (inv: Invoice) => {
    stopPolling();
    setInvoicePaid(false);
    pollStartRef.current = Date.now();

    pollRef.current = setInterval(async () => {
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        stopPolling();
        return;
      }
      try {
        const res = await fetch(`/api/wallet/deposit/status?invoiceId=${inv.id}`, { cache: 'no-store' });
        const data = await res.json();
        if (data.status === 'PAID') {
          stopPolling();
          setInvoicePaid(true);
          setBalanceMNT(data.balanceMNT);
          setTxs((prev) => [{
            id: `TX-${inv.id.slice(0, 6).toUpperCase()}`,
            type: 'DEPOSIT',
            amountMNT: data.paidAmount,
            amountUSD: data.paidAmount / rate,
            status: 'COMPLETED',
            date: new Date().toISOString().slice(0, 16).replace('T', ' '),
          }, ...prev]);
          toast('Deposit Successful', `\u20ae${data.paidAmount.toLocaleString()} credited to your wallet!`, 'success');
        } else if (data.status === 'EXPIRED' || data.status === 'CANCELLED') {
          stopPolling();
        }
      } catch {
        // network blip — keep polling
      }
    }, POLL_INTERVAL_MS);
  };

  // Clean up on unmount
  useEffect(() => () => stopPolling(), []);

  const generateInvoice = async () => {
    if (amount < 1000) return toast('Invalid amount', 'Minimum deposit is \u20ae1,000.', 'error');
    setDepLoading(true);
    try {
      const res = await fetch('/api/wallet/deposit/qpay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountMNT: amount }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create invoice');
      setInvoice(data.invoice);
      setInvoicePaid(false);
      startPolling(data.invoice);
      toast('QPay Invoice Created', `Scan the QR with any Mongolian bank app to pay \u20ae${amount.toLocaleString()}.`, 'info');
    } catch (e) {
      toast('Could not create invoice', e instanceof Error ? e.message : 'Try again', 'error');
    } finally {
      setDepLoading(false);
    }
  };

  const submitWithdraw = async () => {
    if (wAmount < 5000) return toast('Invalid amount', 'Minimum withdrawal is \u20ae5,000.', 'error');
    if (!/^[0-9]{6,}$/.test(bankAccount)) return toast('Invalid account', 'Enter a valid bank account number.', 'error');
    if (accountName.trim().length < 2) return toast('Invalid name', 'Enter the account holder name.', 'error');
    if (wAmount > balanceMNT) return toast('Insufficient balance', 'You cannot withdraw more than your available balance.', 'error');
    setWLoading(true);
    try {
      const res = await fetch('/api/wallet/withdraw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountMNT: wAmount, bankName, bankAccount, accountName }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Withdrawal failed');
      setBalanceMNT((b) => b - wAmount);
      setPendingMNT((p) => p + wAmount);
      setTxs((t) => [{ id: `TX-${Math.floor(100000 + Math.random() * 900000)}`, type: 'WITHDRAW', amountMNT: -wAmount, amountUSD: -(wAmount / rate), status: 'PENDING', date: new Date().toISOString().slice(0, 16).replace('T', ' ') }, ...t]);
      toast('Withdrawal Requested', `\u20ae${wAmount.toLocaleString()} moved to pending. An admin will process the payout.`, 'success');
      setBankAccount(''); setAccountName('');
    } catch (e) {
      toast('Withdrawal failed', e instanceof Error ? e.message : 'Try again', 'error');
    } finally {
      setWLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="flex flex-col gap-5 lg:col-span-1">
        <div className="glass-card flex flex-col gap-5 rounded-2xl p-5">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Available Balance</span>
            <div className="mt-2 text-3xl font-extrabold leading-none text-white">\u20ae{balanceMNT.toLocaleString()}</div>
            <div className="mt-1.5 text-base font-bold text-gold-500/90">${(balanceMNT / rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
          <div className="flex flex-col gap-2 border-t border-zinc-800/80 pt-4">
            <Line label="Locked in Escrow" value={`\u20ae${lockedMNT.toLocaleString()}`} />
            <Line label="Pending Withdrawal" value={`\u20ae${pendingMNT.toLocaleString()}`} />
            <Line label="USD Equivalent" value={`$${(balanceMNT / rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:col-span-2">
        <div className="glass-card rounded-2xl p-6">
          <div className="mb-5 flex items-center gap-1 rounded-xl border border-zinc-800 bg-ink-900/80 p-1">
            <TabBtn active={tab === 'deposit'} onClick={() => setTab('deposit')} icon={<ArrowDownToLine className="h-4 w-4" />}>Add Funds</TabBtn>
            <TabBtn active={tab === 'withdraw'} onClick={() => setTab('withdraw')} icon={<ArrowUpFromLine className="h-4 w-4" />}>Withdraw</TabBtn>
          </div>

          {tab === 'deposit' ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-4">
                <p className="text-xs text-zinc-400">Top up instantly via QPay. Scan with Khan, Golomt, State Bank or TDB.</p>
                <div className="grid grid-cols-3 gap-2">
                  {[10000, 50000, 100000].map((a) => (
                    <button key={a} onClick={() => setAmount(a)} className={cn('rounded-lg border py-2 text-xs font-bold transition', amount === a ? 'border-gold-500 bg-gold-500/10 text-gold-400' : 'border-zinc-800 bg-ink-900 text-white hover:border-gold-500/50')}>\u20ae{a / 1000}k</button>
                  ))}
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-3.5 text-xs font-bold text-zinc-500">\u20ae</span>
                  <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full rounded-xl border border-zinc-800 bg-ink-900 py-3 pl-8 pr-4 text-xs font-bold text-white focus:border-gold-500 focus:outline-none" />
                </div>
                <button onClick={generateInvoice} disabled={depLoading} className="btn-gold w-full py-3 text-xs disabled:opacity-60">{depLoading ? 'Creating invoice...' : 'Generate QPay Invoice'}</button>
              </div>

              <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-zinc-900 bg-ink-950 p-4">
                {!invoice ? (
                  <div className="p-6 text-center text-zinc-500"><QrCode className="mx-auto mb-3 h-12 w-12 text-zinc-600" /><p className="text-xs">Your QPay QR will appear here.</p></div>
                ) : invoicePaid ? (
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <CheckCircle2 className="h-14 w-14 text-green-500" />
                    <div className="text-sm font-extrabold text-white">Payment Received!</div>
                    <div className="text-xs text-green-400">\u20ae{invoice.amountMNT.toLocaleString()} credited to your wallet</div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center">
                    <div className="mb-3 rounded-xl border border-zinc-800 bg-white p-2.5">
                      <Image src={invoice.qrImage} alt="QPay QR" width={160} height={160} unoptimized className="h-40 w-40" />
                    </div>
                    <span className="font-mono text-[10px] font-bold tracking-wider text-zinc-500">INVOICE: {invoice.id.slice(0, 8).toUpperCase()}</span>
                    <div className="mt-1 text-xs font-extrabold text-white">\u20ae{invoice.amountMNT.toLocaleString()}</div>
                    <p className="mt-2 flex items-center gap-1 text-[10px] text-zinc-500"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-400" /><Clock className="h-3 w-3" /> Waiting for bank confirmation...</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Amount (MNT)">
                <input type="number" value={wAmount} onChange={(e) => setWAmount(Number(e.target.value))} className={inputClass} />
              </Field>
              <Field label="Bank">
                <select value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputClass}>
                  {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="Account Number">
                <input value={bankAccount} onChange={(e) => setBankAccount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Digits only" className={inputClass} />
              </Field>
              <Field label="Account Holder Name">
                <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Full name" className={inputClass} />
              </Field>
              <div className="sm:col-span-2">
                <button onClick={submitWithdraw} disabled={wLoading} className="btn-gold w-full py-3 text-xs disabled:opacity-60">{wLoading ? 'Submitting...' : `Request Withdrawal of \u20ae${wAmount.toLocaleString()}`}</button>
                <p className="mt-2 text-center text-[10px] text-zinc-500">Withdrawals are reviewed by an admin before payout. Funds move to pending immediately.</p>
              </div>
            </div>
          )}
        </div>

        <div className="glass-card rounded-2xl p-5">
          <h3 className="mb-4 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-zinc-400"><span>Recent Transactions</span><Clock className="h-4 w-4 text-zinc-500" /></h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-400">
              <thead className="border-b border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-500">
                <tr><th className="py-2.5">ID</th><th>Type</th><th>MNT</th><th>USD</th><th>Status</th><th>Date</th></tr>
              </thead>
              <tbody>
                {txs.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-zinc-600">No transactions yet.</td></tr>
                ) : txs.map((tx) => (
                  <tr key={tx.id} className="border-b border-zinc-900 transition hover:bg-ink-900/40">
                    <td className="py-3 font-mono text-zinc-300">{tx.id}</td>
                    <td className="py-3"><Badge variant={tx.type === 'DEPOSIT' || tx.type === 'SELL_REVENUE' ? 'green' : tx.type === 'WITHDRAW' ? 'red' : 'zinc'}>{tx.type}</Badge></td>
                    <td className={cn('py-3 font-semibold', tx.amountMNT > 0 ? 'text-green-400' : 'text-zinc-300')}>{tx.amountMNT > 0 ? '+' : ''}\u20ae{tx.amountMNT.toLocaleString()}</td>
                    <td className="py-3 font-medium text-zinc-400">${Math.abs(tx.amountUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-3"><span className={cn('flex items-center gap-1 text-[10px] font-semibold', tx.status === 'COMPLETED' ? 'text-green-500' : tx.status === 'PENDING' ? 'text-gold-400' : 'text-red-500')}><span className={cn('h-1.5 w-1.5 rounded-full', tx.status === 'COMPLETED' ? 'bg-green-500' : tx.status === 'PENDING' ? 'bg-gold-400' : 'bg-red-500')} />{tx.status}</span></td>
                    <td className="py-3 font-mono text-zinc-500">{tx.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputClass = 'w-full rounded-xl border border-zinc-800 bg-ink-900 px-3 py-2.5 text-xs font-medium text-white focus:border-gold-500 focus:outline-none';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-2"><label className="text-xs font-bold text-zinc-400">{label}</label>{children}</div>;
}
function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between text-xs"><span className="text-zinc-400">{label}:</span><span className="font-bold text-zinc-300">{value}</span></div>;
}
function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition', active ? 'bg-gold-500 text-black' : 'text-zinc-400 hover:text-white')}>
      {icon}{children}
    </button>
  );
}
