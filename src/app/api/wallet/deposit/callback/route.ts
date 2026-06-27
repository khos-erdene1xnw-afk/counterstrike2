import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkInvoicePayment } from '@/lib/qpay';
import { mntToUsd } from '@/lib/money';
import { acquireLock, releaseLock } from '@/lib/redis';
import { logAudit } from '@/lib/auth';

/**
 * QPay webhook. QPay calls this with ?invoice=<senderInvoiceNo> (our PaymentInvoice id).
 * We NEVER trust the request body for the amount — we re-verify with QPay
 * payment/check (server-to-server) before crediting. A distributed lock +
 * unique idempotency key make double-credits impossible even under concurrent
 * webhook retries.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const senderInvoiceNo = url.searchParams.get('invoice');
  if (!senderInvoiceNo) {
    return NextResponse.json({ error: 'Missing invoice reference' }, { status: 400 });
  }

  const lockKey = `qpay:credit:${senderInvoiceNo}`;
  const locked = await acquireLock(lockKey, 30);
  if (!locked) {
    // Another webhook delivery is processing this invoice right now.
    return NextResponse.json({ success: true, status: 'processing' });
  }

  try {
    const invoice = await prisma.paymentInvoice.findUnique({ where: { id: senderInvoiceNo } });
    if (!invoice) return NextResponse.json({ error: 'Unknown invoice' }, { status: 404 });

    // Already credited — idempotent no-op.
    if (invoice.status === 'PAID') {
      return NextResponse.json({ success: true, status: 'already_paid' });
    }

    if (invoice.status === 'EXPIRED' || invoice.status === 'CANCELLED') {
      return NextResponse.json({ success: true, status: invoice.status.toLowerCase() });
    }

    if (!invoice.qpayInvoiceId) {
      return NextResponse.json({ error: 'Invoice not registered with QPay' }, { status: 409 });
    }

    // Authoritative verification.
    const check = await checkInvoicePayment(invoice.qpayInvoiceId);
    if (!check.paid || check.paidAmount < Number(invoice.amountMNT)) {
      return NextResponse.json({ success: true, status: 'unpaid' });
    }

    const amountMNT = Number(invoice.amountMNT);
    const amountUSD = await mntToUsd(amountMNT);
    const paidPaymentId = check.rows.find((r) => r.payment_status === 'PAID')?.payment_id ?? null;

    // Atomic: mark invoice paid, credit wallet, write ledger row (unique idempotency key).
    await prisma.$transaction(async (tx) => {
      await tx.paymentInvoice.update({
        where: { id: invoice.id },
        data: { status: 'PAID', paidAmount: amountMNT, qpayPaymentId: paidPaymentId, paidAt: new Date() },
      });

      const wallet = await tx.wallet.findUnique({ where: { userId: invoice.userId } });
      if (!wallet) throw new Error('Wallet not found');

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          amountMNT,
          amountUSD,
          currency: 'MNT',
          type: 'DEPOSIT',
          status: 'COMPLETED',
          paymentProvider: 'QPAY',
          referenceId: invoice.qpayInvoiceId,
          idempotencyKey: `qpay:${invoice.id}`,
        },
      });

      await tx.wallet.update({
        where: { userId: invoice.userId },
        data: {
          balanceMNT: { increment: amountMNT },
          balanceUSD: { increment: amountUSD },
          version: { increment: 1 },
        },
      });

      await tx.notification.create({
        data: {
          userId: invoice.userId,
          title: 'Deposit Successful',
          message: `Your deposit of \u20ae${amountMNT.toLocaleString()} has been credited.`,
          type: 'WALLET',
          link: '/wallet',
        },
      });
    });

    await logAudit({
      userId: invoice.userId,
      action: 'QPAY_PAYMENT_CREDITED',
      details: { invoiceId: invoice.id, amountMNT, qpayPaymentId: paidPaymentId },
    });

    return NextResponse.json({ success: true, status: 'credited' });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    await releaseLock(lockKey);
  }
}

// QPay may probe the callback with GET.
export async function GET(request: Request) {
  return POST(request);
}
