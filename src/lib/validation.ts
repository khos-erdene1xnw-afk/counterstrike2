import { z } from 'zod';

export const createListingSchema = z.object({
  assetId: z.string().min(1, 'Asset ID is required'),
  skinName: z.string().min(1).max(255),
  priceMNT: z.number().positive('Price must be greater than zero').max(10_000_000_000),
});

export const buySchema = z.object({
  listingId: z.string().uuid('Invalid listing identifier'),
});

export const depositSchema = z.object({
  amountMNT: z.number().positive().min(1000, 'Minimum deposit is ₮1,000').max(100_000_000),
});

export const withdrawSchema = z.object({
  amountMNT: z.number().positive().min(5000, 'Minimum withdrawal is ₮5,000'),
  bankAccount: z.string().min(6).max(32).regex(/^[0-9]+$/, 'Bank account must be digits only'),
  bankName: z.string().min(2).max(64),
  accountName: z.string().min(2).max(80).optional(),
});

export const tradeUrlSchema = z.object({
  tradeUrl: z
    .string()
    .regex(
      /^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d+&token=[a-zA-Z0-9_-]+$/,
      'Invalid Steam trade URL'
    ),
});

export const currencyPrefSchema = z.object({
  currency: z.enum(['MNT', 'USD']),
});

export const exchangeRateSchema = z.object({
  rate: z.number().positive().min(100).max(100000),
  source: z.enum(['MANUAL', 'AUTOMATIC']).default('MANUAL'),
});

export type CreateListingInput = z.infer<typeof createListingSchema>;
export type BuyInput = z.infer<typeof buySchema>;
export type DepositInput = z.infer<typeof depositSchema>;
