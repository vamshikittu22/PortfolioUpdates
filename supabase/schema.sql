-- FolioIntel Database Schema (Multi-Account Architecture)
-- Supabase PostgreSQL

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES Table (App-wide settings)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    theme TEXT DEFAULT 'dark' CHECK (theme IN ('light', 'dark', 'system')),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Trigger to automatically create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, theme)
  VALUES (new.id, 'dark')
  ON CONFLICT (id) DO NOTHING;
  
  -- Also create a default investment account
  INSERT INTO public.investment_accounts (user_id, name, base_currency)
  VALUES (new.id, 'Main Portfolio', 'INR');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists before recreating to avoid errors if we reset
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 2. INVESTMENT_ACCOUNTS Table (The core multi-tenant pivot)
CREATE TABLE IF NOT EXISTS public.investment_accounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    base_currency TEXT DEFAULT 'INR' CHECK (base_currency IN ('INR', 'USD')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.investment_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own accounts" ON public.investment_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own accounts" ON public.investment_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own accounts" ON public.investment_accounts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own accounts" ON public.investment_accounts FOR DELETE USING (auth.uid() = user_id);


-- 3. BROKERS Table (Scoped to account)
CREATE TABLE IF NOT EXISTS public.brokers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID REFERENCES public.investment_accounts(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL CHECK (name IN ('Groww', 'Zerodha', 'Binance', 'CoinDCX', 'Robinhood', 'Manual')),
    encrypted_api_key TEXT,
    encrypted_api_secret TEXT,
    last_synced_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.brokers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view brokers for their accounts" ON public.brokers FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.brokers.account_id AND user_id = auth.uid())
);
CREATE POLICY "Users can insert brokers for their accounts" ON public.brokers FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = account_id AND user_id = auth.uid())
);
CREATE POLICY "Users can update brokers for their accounts" ON public.brokers FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.brokers.account_id AND user_id = auth.uid())
);
CREATE POLICY "Users can delete brokers for their accounts" ON public.brokers FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.brokers.account_id AND user_id = auth.uid())
);


-- 4. HOLDINGS Table (Scoped to account)
CREATE TABLE IF NOT EXISTS public.holdings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID REFERENCES public.investment_accounts(id) ON DELETE CASCADE NOT NULL,
    symbol TEXT NOT NULL,
    exchange TEXT NOT NULL,
    asset_type TEXT NOT NULL CHECK (asset_type IN ('stocks', 'crypto', 'etf')),
    broker_id UUID REFERENCES public.brokers(id) ON DELETE SET NULL,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    avg_buy_price NUMERIC NOT NULL CHECK (avg_buy_price >= 0),
    currency TEXT NOT NULL CHECK (currency IN ('INR', 'USD')),
    buy_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view holdings for their accounts" ON public.holdings FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.holdings.account_id AND user_id = auth.uid())
);
CREATE POLICY "Users can insert holdings for their accounts" ON public.holdings FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = account_id AND user_id = auth.uid())
);
CREATE POLICY "Users can update holdings for their accounts" ON public.holdings FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.holdings.account_id AND user_id = auth.uid())
);
CREATE POLICY "Users can delete holdings for their accounts" ON public.holdings FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.holdings.account_id AND user_id = auth.uid())
);


-- 5. WATCHLIST_ITEMS Table (Scoped to account)
CREATE TABLE IF NOT EXISTS public.watchlist_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID REFERENCES public.investment_accounts(id) ON DELETE CASCADE NOT NULL,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(account_id, symbol)
);

ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view watchlist items for their accounts" ON public.watchlist_items FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.watchlist_items.account_id AND user_id = auth.uid())
);
CREATE POLICY "Users can manage watchlist items for their accounts" ON public.watchlist_items FOR ALL USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.watchlist_items.account_id AND user_id = auth.uid())
);


-- 6. PRICE_CACHE Table (Shared, global)
CREATE TABLE IF NOT EXISTS public.price_cache (
    symbol TEXT PRIMARY KEY,
    price NUMERIC NOT NULL,
    change_pct NUMERIC,
    source TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.price_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view price cache" ON public.price_cache FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Allow authenticated users to insert/update prices" ON public.price_cache FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);


-- 7. NEWS_ITEMS Table (Shared, global)
CREATE TABLE IF NOT EXISTS public.news_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    headline TEXT NOT NULL,
    summary TEXT,
    url TEXT UNIQUE NOT NULL,
    source TEXT,
    published_at TIMESTAMPTZ NOT NULL,
    sentiment NUMERIC CHECK (sentiment >= -1 AND sentiment <= 1),
    sentiment_label TEXT CHECK (sentiment_label IN ('Bullish', 'Bearish', 'Mixed', 'Neutral')),
    affected_symbols TEXT[] NOT NULL,
    importance TEXT CHECK (importance IN ('High', 'Medium', 'Low')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view news items" ON public.news_items FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Allow authenticated users to insert news" ON public.news_items FOR INSERT TO authenticated WITH CHECK (TRUE);


-- 8. ACCOUNT_SETTINGS Table (Scoped to account)
CREATE TABLE IF NOT EXISTS public.account_settings (
    account_id UUID REFERENCES public.investment_accounts(id) ON DELETE CASCADE PRIMARY KEY,
    default_tab TEXT DEFAULT 'overview',
    compact_mode BOOLEAN DEFAULT FALSE,
    refresh_interval_price INTEGER DEFAULT 5,
    refresh_interval_news INTEGER DEFAULT 6,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.account_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage settings for their accounts" ON public.account_settings FOR ALL USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.account_settings.account_id AND user_id = auth.uid())
);

-- Trigger to automatically create account settings when an account is created
CREATE OR REPLACE FUNCTION public.handle_new_account()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.account_settings (account_id)
  VALUES (new.id)
  ON CONFLICT (account_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_account_created
  AFTER INSERT ON public.investment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_account();


-- 9. YT_CHANNELS Table (Scoped to account)
CREATE TABLE IF NOT EXISTS public.yt_channels (
    channel_id TEXT NOT NULL,
    account_id UUID REFERENCES public.investment_accounts(id) ON DELETE CASCADE NOT NULL,
    channel_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (channel_id, account_id)
);

ALTER TABLE public.yt_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage YT channels for their accounts" ON public.yt_channels FOR ALL USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.yt_channels.account_id AND user_id = auth.uid())
);


-- 10. YT_VIDEOS Table (Scoped to account)
CREATE TABLE IF NOT EXISTS public.yt_videos (
    video_id TEXT NOT NULL,
    account_id UUID REFERENCES public.investment_accounts(id) ON DELETE CASCADE NOT NULL,
    channel_id TEXT NOT NULL,
    title TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL,
    analysis_status TEXT DEFAULT 'pending' CHECK (analysis_status IN ('pending', 'analyzed', 'failed')),
    summary_bullets TEXT[],
    mentioned_tickers TEXT[],
    bullish_on TEXT[],
    bearish_on TEXT[],
    key_themes TEXT[],
    confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
    raw_transcript TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (video_id, account_id),
    FOREIGN KEY (channel_id, account_id) REFERENCES public.yt_channels(channel_id, account_id) ON DELETE CASCADE
);

ALTER TABLE public.yt_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage YT videos for their accounts" ON public.yt_videos FOR ALL USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.yt_videos.account_id AND user_id = auth.uid())
);


-- 11. ALERTS Table (Scoped to account)
CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID REFERENCES public.investment_accounts(id) ON DELETE CASCADE NOT NULL,
    symbol TEXT NOT NULL,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('price_above', 'price_below', 'sentiment_change', 'news_spike')),
    threshold_value NUMERIC,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage alerts for their accounts" ON public.alerts FOR ALL USING (
    EXISTS (SELECT 1 FROM public.investment_accounts WHERE id = public.alerts.account_id AND user_id = auth.uid())
);
