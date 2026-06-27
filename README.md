# CS2 GOLD — Premium CS2 Skin Marketplace

A production-ready, mobile-first CS2 skin marketplace competing with Buff163, Skinport, CSFloat and GamerPay.
Black / white / gold premium gaming UI, Steam-verified escrow trading, Mongolian QPay payments, and instant
MNT ⇆ USD dual-currency pricing.

## Tech Stack
- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS** (custom gold theme, glassmorphism, dark mode)
- **Supabase** — Postgres, Auth, Storage, Row Level Security
- **Prisma ORM** — type-safe data layer
- **Steam** — OpenID login, Web API, inventory, trade offers
- **QPay** — Mongolian payment gateway (Khan, Golomt, State Bank, TDB)
- **Vercel** — hosting + cron jobs

## Currency System
- Primary: **MNT** (Mongolian Tugrik) · Secondary: **USD**
- Instant in-UI switching, preference saved per user (localStorage + DB)
- Live exchange-rate refresh (hourly cron) — admin can override manually
- All marketplace prices auto-convert; wallet shows both currencies

## Project Structure
```
cs2-marketplace/
├── prisma/schema.prisma          # 14 models, enums, indexes
├── supabase/schema.sql           # Tables, RLS policies, triggers
├── src/
│   ├── middleware.ts             # Rate limiting, RBAC, auth guards
│   ├── app/
│   │   ├── layout.tsx            # Root shell (providers, navbar, footer)
│   │   ├── page.tsx              # Marketplace home
│   │   ├── dashboard/            # User dashboard
│   │   ├── wallet/               # Wallet + QPay deposit
│   │   ├── inventory/            # Steam inventory → sell
│   │   ├── trades/               # Escrow trade hub
│   │   ├── profile/              # User profile + stats
│   │   ├── admin/                # Admin control center
│   │   └── api/                  # Backend routes
│   │       ├── auth/steam/       # OpenID login + callback
│   │       ├── steam/inventory/  # Inventory fetch
│   │       ├── marketplace/      # listings, buy (atomic escrow)
│   │       ├── wallet/deposit/   # QPay invoice + callback
│   │       ├── exchange-rate/    # Public rate read
│   │       ├── admin/            # Admin rate config
│   │       ├── user/currency/    # Save currency preference
│   │       └── cron/             # Rate sync + listing expiry
│   ├── components/               # Navbar, SkinCard, BuyModal, Filters, etc.
│   ├── providers/                # CurrencyProvider, ToastProvider
│   └── lib/                      # prisma, supabase, auth, validation, rate-limit, steam
```

## Setup
1. `npm install`
2. Copy `.env.example` → `.env` and fill in Supabase, Steam, QPay keys.
3. Apply the database:
   - Run `supabase/schema.sql` in the Supabase SQL editor (tables, RLS, triggers), **or**
   - `npm run db:push` to sync via Prisma.
4. `npm run dev` → http://localhost:3000

## Security
- **SQL injection**: Prisma parameterized queries only
- **XSS**: React auto-escaping + strict CSP headers (`next.config.js`)
- **CSRF**: Supabase SameSite session cookies + same-origin checks
- **Rate limiting**: sliding-window limiter in `middleware.ts` (swap to Upstash Redis for multi-instance)
- **Input validation**: Zod schemas (`lib/validation.ts`) on every mutation
- **Auth**: Steam OpenID → Supabase Auth, JWT sessions
- **RBAC**: `requireRole()` + middleware admin guards (USER / MODERATOR / ADMIN)
- **Audit logs**: every sensitive action recorded (`logAudit()` + DB triggers)
- **Escrow**: purchases run in a single Prisma transaction (no double-spend)

## Marketplace Flow
1. Seller syncs Steam inventory → lists a skin at their own MNT price (USD auto-derived).
2. Buyer purchases instantly → funds move to **escrow lock**, listing → `PENDING`.
3. A unique anti-scam authorization code is generated for the trade.
4. Seller sends a Steam trade offer containing the code.
5. On Steam confirmation, escrow releases to seller minus **2.5% commission**; listing → `SOLD`.

Listing statuses: `PENDING · ACTIVE · SOLD · EXPIRED · CANCELLED`

## Deployment (Vercel)
1. Push to GitHub, import into Vercel.
2. Add all `.env` variables in Vercel project settings.
3. Set `CRON_SECRET` and add the cron jobs from `vercel.json` (auto-detected).
4. Build command: `prisma generate && next build` (already configured).
5. Steam return URLs and QPay callback must point to your production domain.

© 2026 CS2 GOLD.
