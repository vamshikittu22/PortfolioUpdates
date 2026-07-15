import { cn } from '@/utils/cn';
import type { StalenessInfo } from '@/lib/prices/get-portfolio-pnl';

// PRICE-04/PRICE-05 — the single shared "as of / stale / error / pending"
// badge. Every place staleness is shown (HoldingsTable rows today, any
// future dashboard-level "oldest price" summary) MUST use this component
// instead of hand-rolling a second staleness-formatting implementation.
//
// No 'use client' directive — purely presentational, no hooks/state, safe
// to render from a Server Component (HoldingsTable is currently a client
// component, but this stays usable from either).

interface StalenessBadgeProps {
  staleness: StalenessInfo;
  className?: string;
}

// Display locale/timezone are PINNED, not left to the runtime default.
//
// This badge is server-rendered and then hydrated. `toLocaleString(undefined, …)`
// resolves to the *runtime's* default locale, which differs between Node and the
// browser — the server produced "Jul 15, 12:01 AM" while the browser produced
// "15 Jul, 12:01 am", causing a React hydration mismatch on every page load
// (verified live 2026-07-15). React then discarded the server HTML for this
// subtree and re-rendered it on the client.
//
// Pinning the locale alone is NOT sufficient: in production the server runs UTC
// (e.g. Vercel) while the browser is IST, so the *time* would still disagree.
// Both must be fixed for SSR output to be deterministic.
//
// IST/en-IN is the correct choice for this product, not an arbitrary one: the
// portfolio is INR-based and the tracked markets are NSE/BSE. Change both
// constants together if that ever stops being true.
const DISPLAY_LOCALE = 'en-IN';
const DISPLAY_TIME_ZONE = 'Asia/Kolkata';

function formatAsOf(asOf: string | null): string | null {
  if (!asOf) return null;
  const date = new Date(asOf);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(DISPLAY_LOCALE, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: DISPLAY_TIME_ZONE,
  });
}

const LEVEL_STYLES: Record<StalenessInfo['level'], string> = {
  fresh: 'bg-muted/40 text-muted-foreground border-border/50',
  stale: 'bg-warning/10 text-warning border-warning/25',
  'very-stale': 'bg-danger/10 text-danger border-danger/25',
  error: 'bg-danger/10 text-danger border-danger/25',
  pending: 'bg-muted/40 text-muted-foreground border-border/50',
};

export function StalenessBadge({ staleness, className }: StalenessBadgeProps) {
  const { level, asOf } = staleness;
  const asOfLabel = formatAsOf(asOf);

  let text: string;
  switch (level) {
    case 'fresh':
      text = asOfLabel ? `As of ${asOfLabel}` : 'Fresh';
      break;
    case 'stale':
      text = asOfLabel ? `Stale · as of ${asOfLabel}` : 'Stale';
      break;
    case 'very-stale':
      text = asOfLabel ? `Very stale · as of ${asOfLabel}` : 'Very stale';
      break;
    case 'error':
      // Never hides that the LATEST attempt failed, but still surfaces the
      // last-known-good time when one exists — never a blank/silent state.
      text = asOfLabel ? `Fetch failed · last known ${asOfLabel}` : 'Fetch failed · no price available yet';
      break;
    case 'pending':
    default:
      text = 'Not yet priced';
      break;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-semibold border whitespace-nowrap',
        LEVEL_STYLES[level],
        className
      )}
    >
      {text}
    </span>
  );
}
