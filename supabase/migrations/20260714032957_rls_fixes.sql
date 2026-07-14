-- RLS Fixes: close shared-table write holes + add RLS join-column indexes
--
-- Security: the initial schema granted ALL/INSERT to any authenticated user on the
-- two shared, global tables (price_cache, news_items). Any logged-in user could
-- poison prices or inject news for everyone. Writes to these tables must be reserved
-- for the service role (which bypasses RLS). The SELECT-only policies remain, so
-- authenticated users keep read access.

-- 1. Drop the permissive write policies on shared tables
DROP POLICY IF EXISTS "Allow authenticated users to insert/update prices" ON public.price_cache;
DROP POLICY IF EXISTS "Allow authenticated users to insert news" ON public.news_items;

-- 2. Performance: index the columns used in RLS policy EXISTS(...) subqueries so
--    per-row policy checks do not force sequential scans as data grows.
CREATE INDEX IF NOT EXISTS idx_investment_accounts_user_id ON public.investment_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_holdings_account_id ON public.holdings(account_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_account_id ON public.watchlist_items(account_id);
CREATE INDEX IF NOT EXISTS idx_alerts_account_id ON public.alerts(account_id);
CREATE INDEX IF NOT EXISTS idx_brokers_account_id ON public.brokers(account_id);
