import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, logAudit } from '@/lib/auth';
import { depositSchema } from '@/lib/validation';
import { createInvoice } from '@/lib/qpay';
import { clientIp } from '@/lib/request';

const INVOICE_TTL_MINUTES = 30;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = depositSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    const amountMNT = parsed.data.amountMNT;

    // 1. Persist a PENDING invoice first — its id is the idempotent sender_invoice_no.
    const expiresAt = new Date(Date.now() + INVOICE_TTL_MINUTES * 60_000);
    const invoice = await prisma.paymentInvoice.create({
      data: { userId: user.id, amountMNT, status: 'PENDING', expiresAt },
    });

    // 2. Create the real QPay invoice.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const qp = await createInvoice({
      senderInvoiceNo: invoice.id,
      amountMNT,
      description: `CS2GOLD wallet top-up for ${user.username ?? user.steamId}`,
      receiverCode: user.id,
      callbackUrl: `${appUrl}/api/wallet/deposit/callback`,
    });

    // 3. Store QPay identifiers + QR payload.
    await prisma.paymentInvoice.update({
      where: { id: invoice.id },
      data: { qpayInvoiceId: qp.invoiceId, qrText: qp.qrText, qrImage: qp.qrImage },
    });

    await logAudit({
      userId: user.id,
      action: 'QPAY_INVOICE_CREATED',
      ipAddress: clientIp(request),
      details: { invoiceId: invoice.id, qpayInvoiceId: qp.invoiceId, amountMNT },
    });

    return NextResponse.json({
      success: true,
      invoice: {
        id: invoice.id,
        amountMNT,
        qrText: qp.qrText,
        qrImage: `data:image/png;base64,${qp.qrImage}`,
        urls: qp.urls,
        expiresAt,
      },
    });
  } catch (e) {
    const msg = (e as Error).message;
    const status = msg === 'UNAUTHORIZED' ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? 'Sign in required' : msg }, { status });
  }
}
