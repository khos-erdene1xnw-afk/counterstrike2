import 'server-only';
import { prisma } from '@/lib/prisma';
import { cacheGet, cacheSet } from '@/lib/redis';

const RATE_CACHE_KEY = 'exchange_rate:usd_mnt';
const RATE_TTL = 300; // 5 minutes

/** Current 1 USD -> MNT rate, cached. Respects manual admin overrides. */
export async function getExchangeRate(): Promise<number> {
  const cached = await cacheGet<number>(RATE_CACHE_KEY);
  if (cached) return cached;

  const record = await prisma.exchangeRate.findFirst({ orderBy: { updatedAt: 'desc' } });
  const rate = record ? Number(record.rate) : Number(process.env.DEFAULT_USD_MNT_RATE ?? 3420);
  await cacheSet(RATE_CACHE_KEY, rate, RATE_TTL);
  return rate;
}

/** Round MNT to whole tugrik, USD to 2 decimals — always via integer math. */
export function roundMNT(value: number): number {
  return Math.round(value);
}
export function roundUSD(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function mntToUsd(mnt: number): Promise<number> {
  const rate = await getExchangeRate();
  return roundUSD(mnt / rate);
}
export async function usdToMnt(usd: number): Promise<number> {
  const rate = await getExchangeRate();
  return roundMNT(usd * rate);
}

export const COMMISSION_RATE = Number(process.env.COMMISSION_RATE ?? 0.025);

export function commissionMNT(priceMNT: number): number {
  return roundMNT(priceMNT * COMMISSION_RATE);
}
