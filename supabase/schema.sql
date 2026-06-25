-- FolioIntel Database Schema
-- Supabase PostgreSQL

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    refresh_interval_price INTEGER DEFAULT 5, -- in minutes
    refresh_interval_news INTEGER DEFAULT 6, -- in hours
    refresh_interval_youtube INTEGER DEFAULT 24, -- in hours
    theme TEXT DEFAULT 'dark' CHECK (theme IN ('light', 'dark')),
    currency TEXT DEFAULT 'both' CHECK (currency IN ('inr', 'usd', 'both')),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Trigger to automatically create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, theme, currency)
  VALUES (new.id, 'dark', 'both')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 2. BROKERS Table
CREATE TABLE IF NOT EXISTS public.brokers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL CHECK (name IN ('Groww', 'Binance', 'CoinDCX', 'Robinhood', 'Manual')),
    encrypted_api_key TEXT,
    encrypted_api_secret TEXT,
    last_synced_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on brokers
ALTER TABLE public.brokers ENABLE ROW LEVEL SECURITY;

-- Brokers Policies
CREATE POLICY "Users can view their own brokers"
    ON public.brokers FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own brokers"
    ON public.brokers FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own brokers"
    ON public.brokers FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own brokers"
    ON public.brokers FOR DELETE
    USING (auth.uid() = user_id);


-- 3. HOLDINGS Table
CREATE TABLE IF NOT EXISTS public.holdings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
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

-- Enable RLS on holdings
ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;

-- Holdings Policies
CREATE POLICY "Users can view their own holdings"
    ON public.holdings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own holdings"
    ON public.holdings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own holdings"
    ON public.holdings FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own holdings"
    ON public.holdings FOR DELETE
    USING (auth.uid() = user_id);


-- 4. PRICE_CACHE Table (Shared cache across users to save API limits)
CREATE TABLE IF NOT EXISTS public.price_cache (
    symbol TEXT PRIMARY KEY,
    price NUMERIC NOT NULL,
    change_pct NUMERIC,
    source TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on price_cache
ALTER TABLE public.price_cache ENABLE ROW LEVEL SECURITY;

-- Price Cache Policies
CREATE POLICY "Authenticated users can view price cache"
    ON public.price_cache FOR SELECT
    TO authenticated
    USING (TRUE);

-- Write/Update is restricted to Service Role or background tasks
-- If client side needs fallback updates, a specific policy can be added, but keeping it read-only for clients is safer.
-- Service role has bypass access, so no write policy is needed for cron/backend functions.
CREATE POLICY "Allow authenticated users to insert/update prices"
    ON public.price_cache FOR ALL
    TO authenticated
    USING (TRUE)
    WITH CHECK (TRUE);


-- 5. NEWS_ITEMS Table (Shared news repository)
CREATE TABLE IF NOT EXISTS public.news_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    headline TEXT NOT NULL,
    summary TEXT,
    url TEXT UNIQUE NOT NULL,
    source TEXT,
    published_at TIMESTAMPTZ NOT NULL,
    sentiment NUMERIC CHECK (sentiment >= -1 AND sentiment <= 1),
    sentiment_label TEXT CHECK (sentiment_label IN ('Bullish', 'Bearish', 'Neutral')),
    affected_symbols TEXT[] NOT NULL,
    importance TEXT CHECK (importance IN ('High', 'Medium', 'Low')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on news_items
ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;

-- News Items Policies
CREATE POLICY "Authenticated users can view news items"
    ON public.news_items FOR SELECT
    TO authenticated
    USING (TRUE);

CREATE POLICY "Allow authenticated users to insert news"
    ON public.news_items FOR INSERT
    TO authenticated
    WITH CHECK (TRUE);


-- 6. YT_CHANNELS Table
CREATE TABLE IF NOT EXISTS public.yt_channels (
    channel_id TEXT PRIMARY KEY,
    channel_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on yt_channels
ALTER TABLE public.yt_channels ENABLE ROW LEVEL SECURITY;

-- YouTube Channels Policies
CREATE POLICY "Users can view their own tracked channels"
    ON public.yt_channels FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own channels"
    ON public.yt_channels FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own channels"
    ON public.yt_channels FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own channels"
    ON public.yt_channels FOR DELETE
    USING (auth.uid() = user_id);


-- 7. YT_VIDEOS Table
CREATE TABLE IF NOT EXISTS public.yt_videos (
    video_id TEXT PRIMARY KEY,
    channel_id TEXT REFERENCES public.yt_channels(channel_id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL,
    transcript_summary TEXT,
    mentioned_tickers TEXT[] DEFAULT '{}',
    bullish_on TEXT[] DEFAULT '{}',
    bearish_on TEXT[] DEFAULT '{}',
    key_points JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on yt_videos
ALTER TABLE public.yt_videos ENABLE ROW LEVEL SECURITY;

-- YouTube Videos Policies
CREATE POLICY "Users can view videos from their channels"
    ON public.yt_videos FOR SELECT
    USING (
        channel_id IN (
            SELECT channel_id FROM public.yt_channels WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Allow authenticated users to insert video data"
    ON public.yt_videos FOR INSERT
    TO authenticated
    WITH CHECK (TRUE);


-- 8. ALERTS Table
CREATE TABLE IF NOT EXISTS public.alerts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    holding_id UUID REFERENCES public.holdings(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('EARNINGS', 'NEWS', 'VIDEO', 'PRICE', 'POSITIVE')),
    severity TEXT NOT NULL CHECK (severity IN ('Critical', 'Watch', 'Info', 'Positive')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    sources JSONB DEFAULT '[]',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on alerts
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Alerts Policies
CREATE POLICY "Users can view their own alerts"
    ON public.alerts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own alerts"
    ON public.alerts FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own alerts"
    ON public.alerts FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Allow authenticated users to create alerts"
    ON public.alerts FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);
