import { Bell } from 'lucide-react';
import { AlertsTable } from '@/components/dashboard/AlertsTable';
import { TelegramLinkCard } from '@/components/dashboard/TelegramLinkCard';
import { createClient } from '@/utils/supabase/server';
import { getAccountId } from '@/lib/supabase/portfolio';
import { getPriceAlerts } from '@/lib/alerts/read';
import { getTelegramLink } from '@/lib/telegram/read';

// ALRT-01/ALRT-02 — rewritten in place from the mock-era static page (empty
// AlertsTable, three Phase-6 marketing cards, a dead "Delivery Settings"
// button) into an auth-guarded async Server Component reading real data,
// same pattern as holdings/page.tsx: createClient -> auth.getUser ->
// if (!user) return null -> getAccountId, then the phase-5 reads
// (getPriceAlerts, getTelegramLink). No mock, no fabricated alerts — an
// empty portfolio renders AlertsTable's real "No active alerts" state.
//
// The old "Delivery Settings" button's role moves into TelegramLinkCard
// (the actual Telegram linking handshake, ALRT-01). The Sentiment/Volume
// marketing cards (Phase 6, not built yet) are removed — only the one
// feature that actually exists (price alerts) gets an honest note.
export default async function AlertsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const accountId = await getAccountId(supabase, user.id);

  const [alerts, link] = await Promise.all([
    getPriceAlerts(supabase, accountId),
    getTelegramLink(supabase, user.id),
  ]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" />
          Alert Management
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure price triggers for your portfolio — delivered via Telegram.
        </p>
      </div>

      <TelegramLinkCard status={link.status} linkedAt={link.linkedAt} />

      <div className="grid grid-cols-1 gap-6">
        <AlertsTable alerts={alerts} />
      </div>

      <div className="p-5 glass-card rounded-2xl border border-border/50 bg-primary/5">
        <h3 className="font-bold text-sm mb-2 text-foreground">Price Alerts</h3>
        <p className="text-xs text-muted-foreground">
          Get a Telegram message when a holding or watched instrument crosses a price threshold you set above or
          below its current price.
        </p>
      </div>
    </div>
  );
}
