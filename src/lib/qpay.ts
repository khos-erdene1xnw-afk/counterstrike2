import 'server-only';

/**
 * Production QPay v2 merchant API client.
 * Docs: https://developer.qpay.mn  (Base: https://merchant.qpay.mn/v2)
 *
 * Flow:
 *  1. auth/token (Basic <user:pass>)  -> access_token (cached, auto-refreshed)
 *  2. invoice                          -> qr_text, qr_image, urls, invoice_id
 *  3. webhook hits our callback_url    -> we re-verify via payment/check
 *  4. payment/check                    -> authoritative paid amount + rows
 *
 * No value is ever trusted from the webhook query string alone — every credit
 * is confirmed against payment/check (server-to-server), which is the only
 * source of truth and the basis of duplicate-payment protection.
 */

const QPAY_BASE = process.env.QPAY_BASE_URL || 'https://merchant.qpay.mn/v2';

interface TokenState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

let tokenState: TokenState | null = null;

export interface QPayInvoiceResult {
  invoiceId: string;
  qrText: string;
  qrImage: string; // base64 PNG (data is raw, prefix with data:image/png;base64,)
  urls: { name: string; description: string; link: string }[];
}

export interface QPayPaymentRow {
  payment_id: string;
  payment_status: 'NEW' | 'FAILED' | 'PAID' | 'REFUNDED';
  payment_amount: string;
  payment_currency: string;
  payment_date: string;
}

export interface QPayCheckResult {
  paid: boolean;
  paidAmount: number;
  rows: QPayPaymentRow[];
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`QPay configuration error: ${name} is not set`);
  return v;
}

async function fetchToken(): Promise<TokenState> {
  const username = requireEnv('QPAY_USERNAME');
  const password = requireEnv('QPAY_PASSWORD');
  const basic = Buffer.from(`${username}:${password}`).toString('base64');

  const res = await fetch(`${QPAY_BASE}/auth/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QPay auth failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    // refresh 60s before the real expiry to avoid edge races
    expiresAt: Date.now() + Math.max(0, (data.expires_in - 60)) * 1000,
  };
}

async function refreshToken(state: TokenState): Promise<TokenState> {
  const res = await fetch(`${QPAY_BASE}/auth/refresh`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${state.refreshToken}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    // Refresh token expired -> full re-auth
    return fetchToken();
  }
  const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Math.max(0, data.expires_in - 60) * 1000,
  };
}

async function getAccessToken(): Promise<string> {
  if (!tokenState) {
    tokenState = await fetchToken();
  } else if (Date.now() >= tokenState.expiresAt) {
    tokenState = await refreshToken(tokenState);
  }
  return tokenState.accessToken;
}

/** Low-level authenticated request with one automatic re-auth retry on 401. */
async function qpayRequest<T>(path: string, init: RequestInit, retry = true): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${QPAY_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (res.status === 401 && retry) {
    tokenState = null; // force re-auth
    return qpayRequest<T>(path, init, false);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QPay request ${path} failed (${res.status}): ${text}`);
  }

  return (await res.json()) as T;
}

/**
 * Create a QPay invoice. `senderInvoiceNo` MUST be unique per attempt
 * (we use the DB PaymentInvoice id) — this is the key to idempotency.
 */
export async function createInvoice(params: {
  senderInvoiceNo: string;
  amountMNT: number;
  description: string;
  receiverCode: string; // usually the user id / customer code
  callbackUrl: string;
}): Promise<QPayInvoiceResult> {
  const invoiceCode = requireEnv('QPAY_INVOICE_CODE');

  const body = {
    invoice_code: invoiceCode,
    sender_invoice_no: params.senderInvoiceNo,
    invoice_receiver_code: params.receiverCode,
    invoice_description: params.description,
    amount: Math.round(params.amountMNT),
    callback_url: `${params.callbackUrl}?invoice=${encodeURIComponent(params.senderInvoiceNo)}`,
  };

  const data = await qpayRequest<{
    invoice_id: string;
    qr_text: string;
    qr_image: string;
    urls: { name: string; description: string; link: string }[];
  }>('/invoice', { method: 'POST', body: JSON.stringify(body) });

  return {
    invoiceId: data.invoice_id,
    qrText: data.qr_text,
    qrImage: data.qr_image,
    urls: data.urls ?? [],
  };
}

/** Authoritative payment verification for an invoice. */
export async function checkInvoicePayment(invoiceId: string): Promise<QPayCheckResult> {
  const data = await qpayRequest<{
    count: number;
    paid_amount: number;
    rows: QPayPaymentRow[];
  }>('/payment/check', {
    method: 'POST',
    body: JSON.stringify({
      object_type: 'INVOICE',
      object_id: invoiceId,
      offset: { page_number: 1, page_limit: 100 },
    }),
  });

  const paidRows = (data.rows ?? []).filter((r) => r.payment_status === 'PAID');
  const paidAmount = paidRows.reduce((sum, r) => sum + Number(r.payment_amount || 0), 0);

  return { paid: paidAmount > 0, paidAmount, rows: data.rows ?? [] };
}

/** Cancel an unpaid invoice (e.g. on expiry). */
export async function cancelInvoice(invoiceId: string): Promise<void> {
  await qpayRequest(`/invoice/${invoiceId}`, { method: 'DELETE' }, true);
}

/** Issue a refund against a specific QPay payment id. */
export async function refundPayment(paymentId: string): Promise<void> {
  await qpayRequest(`/payment/refund/${paymentId}`, { method: 'DELETE' }, true);
}
