import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';

/**
 * GET /api/wallet/deposit/status?invoiceId=<id>
 *
 * Lightweight poll endpoint the client uses to detect when QPay has credited
 * the wallet. Returns the invoice status and, on PAID, the new wallet balance
 * so the UI can update optimistically without a full page reload.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const invoiceId = new URL(request.url).searchParams.get('invoiceId');
    if (!invoiceId) {
      return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 });
    }

    const invoice = await prisma.paymentInvoice.findUnique({
      where: { id: invoiceId },
    });

    // Only the owner can poll their own invoice.
    if (!invoice || invoice.userId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (invoice.status === 'PAID') {
      // Return the fresh balance so the client can update without reload.
      const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
      return NextResponse.json({
        status: 'PAID',
        balanceMNT: Number(wallet?.balanceMNT ?? 0),
        balanceUSD: Number(wallet?.balanceUSD ?? 0),
        paidAmount: Number(invoice.paidAmount ?? invoice.amountMNT),
      });
    }

    if (invoice.status === 'EXPIRED' || invoice.status === 'CANCELLED') {
      return NextResponse.json({ status: invoice.status });
    }

    // Still PENDING — tell client to keep polling.
    return NextResponse.json({ status: 'PENDING' });
  } catch (e) {
    const msg = (e as Error).message;
    const status = msg === 'UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
