import 'server-only';

/**
 * Bank transfer abstraction layer.
 *
 * Mongolian banks do not have a single unified disbursement API. This module
 * supports two providers selectable via BANK_TRANSFER_PROVIDER env:
 *
 *   "KHAN"   — Khan Bank Open Banking API (most common for MNT payouts)
 *   "MOCK"   — Always succeeds; use in development / staging
 *
 * Add more providers (Golomt, TDB, etc.) by implementing the BankTransferProvider
 * interface and registering them in getProvider().
 *
 * Required env per provider:
 *   KHAN:  KHAN_BANK_CLIENT_ID, KHAN_BANK_CLIENT_SECRET, KHAN_BANK_ACCOUNT_NO
 *          KHAN_BANK_BASE_URL (default: https://api.khanbank.com/v1)
 *   MOCK:  no additional env required
 */

export interface TransferResult {
  success: boolean;
  providerRef: string;   // bank-side transaction reference for reconciliation
  message?: string;
}

interface BankTransferProvider {
  send(params: {
    toAccount: string;
    toBankName: string;
    toName: string;
    amountMNT: number;
    description: string;
    idempotencyKey: string;
  }): Promise<TransferResult>;
}

// ---------------------------------------------------------------------------
// Mock provider — always succeeds (dev/staging)
// ---------------------------------------------------------------------------
class MockProvider implements BankTransferProvider {
  async send(params: { toAccount: string; amountMNT: number; idempotencyKey: string }): Promise<TransferResult> {
    // Simulate a small network delay
    await new Promise((r) => setTimeout(r, 300));
    return {
      success: true,
      providerRef: `MOCK-${params.idempotencyKey.slice(-8).toUpperCase()}`,
      message: 'Mock transfer succeeded',
    };
  }
}

// ---------------------------------------------------------------------------
// Khan Bank Open Banking provider
// Docs: https://developer.khanbank.com (OAuth2 client_credentials + transfer API)
// ---------------------------------------------------------------------------
interface KhanTokenState { token: string; expiresAt: number }
let khanToken: KhanTokenState | null = null;

class KhanBankProvider implements BankTransferProvider {
  private base: string;
  private clientId: string;
  private clientSecret: string;
  private fromAccount: string;

  constructor() {
    this.base = process.env.KHAN_BANK_BASE_URL ?? 'https://api.khanbank.com/v1';
    this.clientId = this.require('KHAN_BANK_CLIENT_ID');
    this.clientSecret = this.require('KHAN_BANK_CLIENT_SECRET');
    this.fromAccount = this.require('KHAN_BANK_ACCOUNT_NO');
  }

  private require(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Khan Bank config error: ${name} is not set`);
    return v;
  }

  private async getToken(): Promise<string> {
    if (khanToken && Date.now() < khanToken.expiresAt) return khanToken.token;

    const res = await fetch(`${this.base}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: 'transfer',
      }),
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Khan Bank auth failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    khanToken = {
      token: data.access_token,
      expiresAt: Date.now() + Math.max(0, data.expires_in - 60) * 1000,
    };
    return khanToken.token;
  }

  async send(params: {
    toAccount: string;
    toBankName: string;
    toName: string;
    amountMNT: number;
    description: string;
    idempotencyKey: string;
  }): Promise<TransferResult> {
    const token = await this.getToken();

    const body = {
      from_account: this.fromAccount,
      to_account: params.toAccount,
      to_bank: params.toBankName,
      to_name: params.toName,
      amount: Math.round(params.amountMNT),
      currency: 'MNT',
      description: params.description,
      idempotency_key: params.idempotencyKey,
    };

    const res = await fetch(`${this.base}/transfer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': params.idempotencyKey,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = (await res.json()) as {
      transaction_id?: string;
      reference?: string;
      message?: string;
      error?: string;
    };

    if (!res.ok) {
      // 409 = duplicate idempotency key → already processed, treat as success
      if (res.status === 409 && data.transaction_id) {
        return { success: true, providerRef: data.transaction_id, message: 'Duplicate — already processed' };
      }
      throw new Error(`Khan Bank transfer failed (${res.status}): ${data.error ?? data.message ?? 'unknown'}`);
    }

    return {
      success: true,
      providerRef: data.transaction_id ?? data.reference ?? params.idempotencyKey,
      message: data.message,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
function getProvider(): BankTransferProvider {
  const p = (process.env.BANK_TRANSFER_PROVIDER ?? 'MOCK').toUpperCase();
  if (p === 'KHAN') return new KhanBankProvider();
  if (p === 'MOCK') return new MockProvider();
  throw new Error(`Unknown BANK_TRANSFER_PROVIDER: "${p}". Valid values: KHAN, MOCK`);
}

/**
 * Send a bank transfer. Throws on hard failures; caller is responsible for
 * marking the withdrawal FAILED and refunding the user on catch.
 */
export async function sendBankTransfer(params: {
  toAccount: string;
  toBankName: string;
  toName: string;
  amountMNT: number;
  description: string;
  idempotencyKey: string;
}): Promise<TransferResult> {
  const provider = getProvider();
  return provider.send(params);
}
