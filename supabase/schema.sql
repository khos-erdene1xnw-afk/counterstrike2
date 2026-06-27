-- ============================================================
-- CS2 GOLD Marketplace — Supabase Production Schema
-- Primary Currency: MNT  /  Secondary: USD
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE role_type AS ENUM ('USER', 'MODERATOR', 'ADMIN');
CREATE TYPE currency_type AS ENUM ('MNT', 'USD');
CREATE TYPE listing_status_type AS ENUM ('PENDING', 'ACTIVE', 'SOLD', 'EXPIRED', 'CANCELLED');

-- FIX [ENUM MISSING VALUES]: CREATED, CONFIRMATION_NEEDED, IN_ESCROW, EXPIRED нэмсэн
-- FIX [DEFAULT MISMATCH]: DEFAULT 'SENT' → DEFAULT 'CREATED'
CREATE TYPE trade_offer_status_type AS ENUM (
  'CREATED',
  'SENT',
  'CONFIRMATION_NEEDED',
  'IN_ESCROW',
  'ACCEPTED',
  'DECLINED',
  'CANCELLED',
  'EXPIRED',
  'DISPUTED'
);

CREATE TYPE transaction_type_enum AS ENUM (
  'DEPOSIT', 'WITHDRAW', 'BUY_PAYMENT',
  'SELL_REVENUE', 'COMMISSION_FEE', 'REFUND'
);
CREATE TYPE transaction_status_enum AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
CREATE TYPE ticket_status_type     AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
CREATE TYPE invoice_status_type    AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED');
CREATE TYPE withdraw_status_type   AS ENUM ('REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED');
CREATE TYPE dispute_status_type    AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED_BUYER', 'RESOLVED_SELLER', 'CLOSED');

-- ============================================================
-- HELPER: auto-update updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABLES
-- ============================================================

-- USERS
CREATE TABLE IF NOT EXISTS public.users (
  id                   UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                VARCHAR(255) UNIQUE,
  username             VARCHAR(100),
  steam_id             VARCHAR(50)  UNIQUE NOT NULL,
  steam_name           VARCHAR(100) NOT NULL,
  steam_avatar         TEXT         NOT NULL,
  trade_url            TEXT,
  api_key              TEXT,
  level                INTEGER      NOT NULL DEFAULT 1,
  xp                   INTEGER      NOT NULL DEFAULT 0,
  role                 role_type    NOT NULL DEFAULT 'USER',
  is_verified          BOOLEAN      NOT NULL DEFAULT FALSE,
  is_banned            BOOLEAN      NOT NULL DEFAULT FALSE,
  currency_preference  currency_type NOT NULL DEFAULT 'MNT',
  rating_avg           DECIMAL(3,2) NOT NULL DEFAULT 0,
  rating_count         INTEGER      NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT timezone('utc', now()),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT timezone('utc', now())
);

-- WALLETS
-- FIX [MISSING COLUMN] pending_usd нэмсэн
CREATE TABLE IF NOT EXISTS public.wallets (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID         UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  balance_mnt DECIMAL(18,2) NOT NULL DEFAULT 0.00 CHECK (balance_mnt >= 0),
  balance_usd DECIMAL(18,2) NOT NULL DEFAULT 0.00 CHECK (balance_usd >= 0),
  locked_mnt  DECIMAL(18,2) NOT NULL DEFAULT 0.00 CHECK (locked_mnt >= 0),
  locked_usd  DECIMAL(18,2) NOT NULL DEFAULT 0.00 CHECK (locked_usd >= 0),
  pending_mnt DECIMAL(18,2) NOT NULL DEFAULT 0.00 CHECK (pending_mnt >= 0),
  pending_usd DECIMAL(18,2) NOT NULL DEFAULT 0.00 CHECK (pending_usd >= 0),
  version     INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT timezone('utc', now()),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT timezone('utc', now())
);

-- SKINS
-- FIX [MISSING COLUMN] market_hash_name (UNIQUE), collection, is_souvenir нэмсэн
CREATE TABLE IF NOT EXISTS public.skins (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             VARCHAR(255) UNIQUE NOT NULL,
  market_hash_name VARCHAR(255) UNIQUE NOT NULL,
  type             VARCHAR(50)  NOT NULL,
  weapon           VARCHAR(100) NOT NULL,
  exterior         VARCHAR(30)  NOT NULL,
  rarity           VARCHAR(50)  NOT NULL,
  collection       VARCHAR(100),
  is_stattrak      BOOLEAN      NOT NULL DEFAULT FALSE,
  is_souvenir      BOOLEAN      NOT NULL DEFAULT FALSE,
  image_url        TEXT         NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT timezone('utc', now())
);

-- LISTINGS
-- FIX [MISSING COLUMN] paint_seed, paint_index нэмсэн
CREATE TABLE IF NOT EXISTS public.listings (
  id             UUID                  PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id      UUID                  NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  skin_id        UUID                  NOT NULL REFERENCES public.skins(id) ON DELETE CASCADE,
  asset_id       VARCHAR(100)          NOT NULL,
  inspect_link   TEXT,
  float_value    DECIMAL(12,10),
  paint_seed     INTEGER,
  paint_index    INTEGER,
  price_mnt      DECIMAL(18,2)         NOT NULL CHECK (price_mnt > 0),
  price_usd      DECIMAL(18,2)         NOT NULL CHECK (price_usd > 0),
  commission_mnt DECIMAL(18,2)         NOT NULL CHECK (commission_mnt >= 0),
  commission_usd DECIMAL(18,2)         NOT NULL CHECK (commission_usd >= 0),
  status         listing_status_type   NOT NULL DEFAULT 'ACTIVE',
  view_count     INTEGER               NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ           NOT NULL DEFAULT timezone('utc', now()),
  updated_at     TIMESTAMPTZ           NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (seller_id, asset_id, status)
);

-- TRADE OFFERS
-- FIX [MISSING COLUMN] escrow_days, last_synced_at, expires_at нэмсэн
-- FIX [DEFAULT MISMATCH] DEFAULT 'CREATED'
CREATE TABLE IF NOT EXISTS public.trade_offers (
  id             UUID                       PRIMARY KEY DEFAULT uuid_generate_v4(),
  listing_id     UUID                       NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  buyer_id       UUID                       NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seller_id      UUID                       NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  steam_offer_id VARCHAR(100)               UNIQUE,
  status         trade_offer_status_type    NOT NULL DEFAULT 'CREATED',
  security_code  VARCHAR(10)                NOT NULL,
  escrow_days    INTEGER                    NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ                NOT NULL DEFAULT timezone('utc', now()),
  updated_at     TIMESTAMPTZ                NOT NULL DEFAULT timezone('utc', now())
);

-- TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.transactions (
  id               UUID                      PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id        UUID                      NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  amount_mnt       DECIMAL(18,2)             NOT NULL,
  amount_usd       DECIMAL(18,2)             NOT NULL,
  currency         currency_type             NOT NULL,
  type             transaction_type_enum     NOT NULL,
  status           transaction_status_enum   NOT NULL DEFAULT 'PENDING',
  payment_provider VARCHAR(50),
  reference_id     VARCHAR(100),
  idempotency_key  TEXT                      UNIQUE,
  created_at       TIMESTAMPTZ               NOT NULL DEFAULT timezone('utc', now())
);

-- PAYMENT INVOICES (QPay)
CREATE TABLE IF NOT EXISTS public.payment_invoices (
  id                UUID                 PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID                 NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  qpay_invoice_id   VARCHAR(100)         UNIQUE,
  sender_invoice_no VARCHAR(100)         UNIQUE NOT NULL,
  amount_mnt        DECIMAL(18,2)        NOT NULL CHECK (amount_mnt > 0),
  status            invoice_status_type  NOT NULL DEFAULT 'PENDING',
  qr_text           TEXT,
  qr_image          TEXT,
  paid_amount       DECIMAL(18,2)        NOT NULL DEFAULT 0,
  qpay_payment_id   VARCHAR(100),
  expires_at        TIMESTAMPTZ          NOT NULL,
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ          NOT NULL DEFAULT timezone('utc', now()),
  updated_at        TIMESTAMPTZ          NOT NULL DEFAULT timezone('utc', now())
);

-- WITHDRAWALS
-- FIX [MISSING COLUMN] provider_ref, processed_at, failure_reason нэмсэн (auto-payout)
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id             UUID                  PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID                  NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount_mnt     DECIMAL(18,2)         NOT NULL CHECK (amount_mnt > 0),
  bank_name      VARCHAR(64)           NOT NULL,
  bank_account   VARCHAR(32)           NOT NULL,
  account_name   VARCHAR(80)           NOT NULL,
  status         withdraw_status_type  NOT NULL DEFAULT 'REQUESTED',
  reviewed_by    UUID,
  reject_reason  TEXT,
  provider_ref   VARCHAR(200),          -- банкны гүйлгээний reference ID
  processed_at   TIMESTAMPTZ,           -- auto-payout амжилттай болсон цаг
  failure_reason TEXT,                  -- auto-payout алдаасан шалтгаан
  created_at     TIMESTAMPTZ           NOT NULL DEFAULT timezone('utc', now()),
  updated_at     TIMESTAMPTZ           NOT NULL DEFAULT timezone('utc', now())
);

-- SELLER RATINGS
CREATE TABLE IF NOT EXISTS public.seller_ratings (
  id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  rater_id   UUID         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seller_id  UUID         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  score      INTEGER      NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (rater_id, seller_id)
);

-- RECENTLY VIEWED
CREATE TABLE IF NOT EXISTS public.recently_viewed (
  id        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id   UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  skin_id   UUID        NOT NULL REFERENCES public.skins(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (user_id, skin_id)
);

-- WISHLISTS
CREATE TABLE IF NOT EXISTS public.wishlists (
  id        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id   UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  skin_id   UUID        NOT NULL REFERENCES public.skins(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (user_id, skin_id)
);

-- NOTIFICATIONS
-- FIX [MISSING COLUMN] link нэмсэн
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title      VARCHAR(255) NOT NULL,
  message    TEXT        NOT NULL,
  is_read    BOOLEAN     NOT NULL DEFAULT FALSE,
  type       VARCHAR(30) NOT NULL,
  link       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- EXCHANGE RATES
CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  base_currency   VARCHAR(10)   NOT NULL DEFAULT 'USD',
  target_currency VARCHAR(10)   NOT NULL DEFAULT 'MNT',
  rate            DECIMAL(18,4) NOT NULL,
  source          VARCHAR(30)   NOT NULL DEFAULT 'AUTOMATIC',
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT timezone('utc', now())
);

-- DISPUTES
CREATE TABLE IF NOT EXISTS public.disputes (
  id              UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
  trade_offer_id  UUID                UNIQUE NOT NULL REFERENCES public.trade_offers(id) ON DELETE CASCADE,
  opened_by_id    UUID                NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason          TEXT                NOT NULL,
  status          dispute_status_type NOT NULL DEFAULT 'OPEN',
  resolution      TEXT,
  created_at      TIMESTAMPTZ         NOT NULL DEFAULT timezone('utc', now()),
  updated_at      TIMESTAMPTZ         NOT NULL DEFAULT timezone('utc', now())
);

-- REPORTS
CREATE TABLE IF NOT EXISTS public.reports (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_type VARCHAR(20) NOT NULL,
  target_id   VARCHAR(100) NOT NULL,
  reason      TEXT        NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- BANS
CREATE TABLE IF NOT EXISTS public.bans (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason       TEXT        NOT NULL,
  banned_by_id UUID        NOT NULL,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  action     VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- SUPPORT TICKETS
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id         UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID               NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title      VARCHAR(255)       NOT NULL,
  status     ticket_status_type NOT NULL DEFAULT 'OPEN',
  category   VARCHAR(50)        NOT NULL,
  priority   VARCHAR(10)        NOT NULL DEFAULT 'MEDIUM',
  created_at TIMESTAMPTZ        NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ        NOT NULL DEFAULT timezone('utc', now())
);

-- TICKET MESSAGES
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id      UUID        NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message        TEXT        NOT NULL,
  attachment_url TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_skins_type_weapon        ON public.skins(type, weapon);
CREATE INDEX IF NOT EXISTS idx_skins_rarity             ON public.skins(rarity);
CREATE INDEX IF NOT EXISTS idx_skins_exterior           ON public.skins(exterior);
CREATE INDEX IF NOT EXISTS idx_listings_seller_status   ON public.listings(seller_id, status);
CREATE INDEX IF NOT EXISTS idx_listings_skin_status     ON public.listings(skin_id, status);
CREATE INDEX IF NOT EXISTS idx_listings_status_created  ON public.listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_status_price    ON public.listings(status, price_mnt);
-- FIX [MISSING INDEX] trade_offers(status, last_synced_at) — cron sync performance
CREATE INDEX IF NOT EXISTS idx_trade_offers_sync        ON public.trade_offers(status, last_synced_at);
CREATE INDEX IF NOT EXISTS idx_trade_offers_listing     ON public.trade_offers(listing_id);
CREATE INDEX IF NOT EXISTS idx_trade_offers_parties     ON public.trade_offers(buyer_id, seller_id);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet      ON public.transactions(wallet_id, created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_type_status ON public.transactions(type, status);
CREATE INDEX IF NOT EXISTS idx_transactions_ref         ON public.transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread     ON public.notifications(user_id) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_user_read  ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_invoices_user            ON public.payment_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status_exp      ON public.payment_invoices(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user         ON public.withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status       ON public.withdrawals(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ratings_seller           ON public.seller_ratings(seller_id);
CREATE INDEX IF NOT EXISTS idx_recent_user              ON public.recently_viewed(user_id, viewed_at);
CREATE INDEX IF NOT EXISTS idx_disputes_status          ON public.disputes(status);
CREATE INDEX IF NOT EXISTS idx_reports_status           ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_target           ON public.reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_bans_user                ON public.bans(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user          ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action        ON public.audit_logs(action, created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_status           ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_user             ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket   ON public.ticket_messages(ticket_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skins             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_offers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_invoices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_ratings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recently_viewed   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bans              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages   ENABLE ROW LEVEL SECURITY;

-- Admin helper (reads authoritative role column — not metadata cache)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'ADMIN'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Users
CREATE POLICY "Users: public read"        ON public.users FOR SELECT USING (true);
CREATE POLICY "Users: own update"         ON public.users FOR UPDATE USING (auth.uid() = id);

-- Wallets
CREATE POLICY "Wallets: own or admin"     ON public.wallets FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- Skins
CREATE POLICY "Skins: public read"        ON public.skins FOR SELECT USING (true);
CREATE POLICY "Skins: admin write"        ON public.skins FOR ALL    USING (public.is_admin());

-- Listings
CREATE POLICY "Listings: public read"     ON public.listings FOR SELECT USING (true);
CREATE POLICY "Listings: seller manage"   ON public.listings FOR ALL    USING (auth.uid() = seller_id OR public.is_admin());

-- Trade offers
CREATE POLICY "Trades: parties or admin select" ON public.trade_offers FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id OR public.is_admin());
CREATE POLICY "Trades: parties or admin update" ON public.trade_offers FOR UPDATE
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id OR public.is_admin());

-- Transactions
CREATE POLICY "Transactions: own or admin" ON public.transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.wallets
      WHERE wallets.id = transactions.wallet_id AND wallets.user_id = auth.uid()
    ) OR public.is_admin()
  );

-- Payment invoices
-- FIX [MISSING RLS POLICY] INSERT policy нэмсэн
CREATE POLICY "Invoices: own or admin select" ON public.payment_invoices FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Invoices: own insert"          ON public.payment_invoices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Withdrawals
-- FIX [MISSING RLS POLICY] INSERT policy нэмсэн
CREATE POLICY "Withdrawals: own or admin select" ON public.withdrawals FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Withdrawals: own insert"          ON public.withdrawals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Seller ratings
CREATE POLICY "Ratings: public read"       ON public.seller_ratings FOR SELECT USING (true);
CREATE POLICY "Ratings: own insert"        ON public.seller_ratings FOR INSERT WITH CHECK (auth.uid() = rater_id);

-- Recently viewed
CREATE POLICY "Recent: own"                ON public.recently_viewed FOR ALL USING (auth.uid() = user_id);

-- Wishlists
CREATE POLICY "Wishlist: own or admin"     ON public.wishlists FOR ALL USING (auth.uid() = user_id OR public.is_admin());

-- Notifications
CREATE POLICY "Notifications: own or admin" ON public.notifications FOR ALL USING (auth.uid() = user_id OR public.is_admin());

-- Exchange rates
CREATE POLICY "ExRate: public read"        ON public.exchange_rates FOR SELECT USING (true);
CREATE POLICY "ExRate: admin write"        ON public.exchange_rates FOR ALL    USING (public.is_admin());

-- Disputes
CREATE POLICY "Disputes: parties or admin" ON public.disputes FOR SELECT
  USING (auth.uid() = opened_by_id OR public.is_admin());

-- Reports
CREATE POLICY "Reports: own or admin"      ON public.reports FOR SELECT
  USING (auth.uid() = reporter_id OR public.is_admin());

-- Bans
CREATE POLICY "Bans: admin only"           ON public.bans FOR SELECT USING (public.is_admin());

-- Audit logs
CREATE POLICY "Audit: admin only"          ON public.audit_logs FOR SELECT USING (public.is_admin());

-- Support tickets
CREATE POLICY "Tickets: own or admin"      ON public.support_tickets FOR ALL
  USING (auth.uid() = user_id OR public.is_admin());

-- Ticket messages
CREATE POLICY "TicketMsg: ticket owner or admin" ON public.ticket_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets
      WHERE support_tickets.id = ticket_messages.ticket_id
        AND support_tickets.user_id = auth.uid()
    ) OR public.is_admin()
  );

-- ============================================================
-- TRIGGERS
-- ============================================================

-- FIX [MISSING TRIGGER]: updated_at auto-refresh for all mutable tables
CREATE OR REPLACE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_listings_updated_at
  BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_trade_offers_updated_at
  BEFORE UPDATE ON public.trade_offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_payment_invoices_updated_at
  BEFORE UPDATE ON public.payment_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_withdrawals_updated_at
  BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_disputes_updated_at
  BEFORE UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create wallet when a new user is inserted
CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.wallets (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_user_created
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_setup();

-- Dual-currency sync on listing price change
CREATE OR REPLACE FUNCTION public.sync_listing_currencies()
RETURNS TRIGGER AS $$
DECLARE
  current_rate DECIMAL(18,4);
BEGIN
  SELECT rate INTO current_rate FROM public.exchange_rates
  ORDER BY updated_at DESC LIMIT 1;
  IF current_rate IS NULL THEN current_rate := 3420.00; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.price_mnt > 0 AND (NEW.price_usd IS NULL OR NEW.price_usd = 0) THEN
      NEW.price_usd      := ROUND(NEW.price_mnt / current_rate, 2);
      NEW.commission_usd := ROUND(NEW.commission_mnt / current_rate, 2);
    ELSIF NEW.price_usd > 0 AND (NEW.price_mnt IS NULL OR NEW.price_mnt = 0) THEN
      NEW.price_mnt      := ROUND(NEW.price_usd * current_rate, 2);
      NEW.commission_mnt := ROUND(NEW.commission_usd * current_rate, 2);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.price_mnt <> OLD.price_mnt THEN
      NEW.price_usd      := ROUND(NEW.price_mnt / current_rate, 2);
      NEW.commission_usd := ROUND(NEW.commission_mnt / current_rate, 2);
    ELSIF NEW.price_usd <> OLD.price_usd THEN
      NEW.price_mnt      := ROUND(NEW.price_usd * current_rate, 2);
      NEW.commission_mnt := ROUND(NEW.commission_usd * current_rate, 2);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER sync_listing_currencies_trigger
  BEFORE INSERT OR UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.sync_listing_currencies();

-- Wallet mutation audit trail
CREATE OR REPLACE FUNCTION public.log_wallet_mutations()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, details)
  VALUES (
    NEW.user_id,
    'WALLET_BALANCE_UPDATE',
    jsonb_build_object(
      'old_balance_mnt', OLD.balance_mnt,
      'new_balance_mnt', NEW.balance_mnt,
      'old_balance_usd', OLD.balance_usd,
      'new_balance_usd', NEW.balance_usd,
      'old_locked_mnt',  OLD.locked_mnt,
      'new_locked_mnt',  NEW.locked_mnt,
      'old_pending_mnt', OLD.pending_mnt,
      'new_pending_mnt', NEW.pending_mnt
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER wallet_balance_audit_trigger
  AFTER UPDATE OF balance_mnt, balance_usd, locked_mnt, pending_mnt
  ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.log_wallet_mutations();

-- Seller rating aggregate (auto-maintain rating_avg, rating_count on users)
CREATE OR REPLACE FUNCTION public.refresh_seller_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.users SET
    rating_avg   = (SELECT COALESCE(AVG(score), 0) FROM public.seller_ratings WHERE seller_id = NEW.seller_id),
    rating_count = (SELECT COUNT(*) FROM public.seller_ratings WHERE seller_id = NEW.seller_id)
  WHERE id = NEW.seller_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER seller_rating_aggregate
  AFTER INSERT OR UPDATE ON public.seller_ratings
  FOR EACH ROW EXECUTE FUNCTION public.refresh_seller_rating();
