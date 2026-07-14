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

function formatAsOf(asOf: string | null): string | null {
  if (!asOf) return null;
  const date = new Date(asOf);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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
