'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Point { date: string; revenue: number; volume: number; }

export function RevenueChart({ data }: { data: Point[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d4af37" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#d4af37" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gVol" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={{ stroke: '#27272a' }} tickLine={false} />
        <YAxis tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          contentStyle={{ background: '#121216', border: '1px solid #27272a', borderRadius: 12, fontSize: 12 }}
          labelStyle={{ color: '#fff' }}
          formatter={(value: number, name: string) => [`\u20ae${value.toLocaleString()}`, name === 'revenue' ? 'Commission' : 'Volume']}
        />
        <Area type="monotone" dataKey="volume" stroke="#6366f1" strokeWidth={2} fill="url(#gVol)" />
        <Area type="monotone" dataKey="revenue" stroke="#d4af37" strokeWidth={2} fill="url(#gRev)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
