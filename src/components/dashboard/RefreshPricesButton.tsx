'use client';

import { useState, useTransition } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/utils/cn';
import { refreshPricesNow } from '@/server-actions/prices';

// PRICE-03 — client island embedded directly in the holdings/page.tsx Server
// Component header, same pattern Phase 2 used for HoldingFormDialog. Calls
// the auth-gated refreshPricesNow Server Action (03-04); that action already
// calls revalidatePath('/') / revalidatePath('/holdings') on success, so the
// page's server-fetched data refreshes automatically once this transition
// resolves — no manual router.refresh() needed here (confirmed against this
// Next.js version's docs: node_modules/next/dist/docs/01-app/01-getting-started/09-revalidating.md,
// and against Phase 2's own src/server-actions/portfolio.ts, which already
// relies on this exact revalidatePath-after-Server-Action behavior for
// addHolding/editHolding/etc.).
//
// Errors are surfaced inline (never swallowed) using the same
// isPending/error state + inline <p> pattern established by
// HoldingFormDialog.tsx.
export function RefreshPricesButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<{ succeeded: number; failed: number } | null>(null);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await refreshPricesNow();
        if (result.success) {
          setLastSummary({ succeeded: result.summary.succeeded, failed: result.summary.failed });
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Refresh failed');
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="flex items-center gap-2 px-4 py-2 bg-muted/40 border border-border text-foreground text-sm font-semibold rounded-xl hover:bg-muted/60 transition-all cursor-pointer disabled:opacity-60"
      >
        <RefreshCw className={cn('h-4 w-4', isPending && 'animate-spin')} />
        {isPending ? 'Refreshing…' : 'Refresh now'}
      </button>
      {error && <p className="text-danger text-xs max-w-[220px] text-right">{error}</p>}
      {!error && !isPending && lastSummary && (
        <p className="text-muted-foreground text-[11px]">
          Updated {lastSummary.succeeded} price{lastSummary.succeeded === 1 ? '' : 's'}
          {lastSummary.failed > 0 ? `, ${lastSummary.failed} failed` : ''}
        </p>
      )}
    </div>
  );
}
