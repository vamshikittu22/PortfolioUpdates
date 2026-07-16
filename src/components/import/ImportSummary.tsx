'use client';

// IMPT-03 result screen — the locked audit-trail decision: explicit
// imported/skipped/duplicate counts, a link to Holdings, and NO
// auto-redirect (this screen IS the record of what just happened, not a
// toast). Also implements 04-RESEARCH Pattern 5: fires the existing
// refreshPricesNow() Server Action once, fire-and-forget, so newly imported
// instruments are priced by the time the user follows the Holdings link.

import { useEffect, useRef, useTransition } from 'react';
import Link from 'next/link';
import { CheckCircle2, SkipForward, Copy, ArrowRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { refreshPricesNow } from '@/server-actions/prices';

interface ImportSummaryResult {
  imported: number;
  skipped: number;
  duplicates: number;
}

interface ImportSummaryProps {
  result: ImportSummaryResult;
  onReset: () => void;
}

const STATS: Array<{ key: keyof ImportSummaryResult; label: string; icon: typeof CheckCircle2; tone: string }> = [
  { key: 'imported', label: 'Imported', icon: CheckCircle2, tone: 'text-success bg-success/10 border-success/20' },
  { key: 'skipped', label: 'Skipped', icon: SkipForward, tone: 'text-warning bg-warning/10 border-warning/20' },
  { key: 'duplicates', label: 'Duplicates', icon: Copy, tone: 'text-muted-foreground bg-muted/40 border-border/50' },
];

export function ImportSummary({ result, onReset }: ImportSummaryProps) {
  const [, startTransition] = useTransition();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    // Fire-and-forget: this screen never blocks or errors on the background
    // price refresh. refreshPricesNow already records its own honest
    // fetch_error/StalenessBadge state and calls revalidatePath('/holdings')
    // on success, so Holdings shows real prices once it resolves.
    startTransition(() => {
      refreshPricesNow().catch(() => {
        // Swallowed deliberately — see comment above.
      });
    });
  }, [startTransition]);

  return (
    <div className="glass-card rounded-2xl p-6 space-y-6 border border-border/50">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-success" />
        <h2 className="text-lg font-bold">Import complete</h2>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {STATS.map(({ key, label, icon: Icon, tone }) => (
          <div key={key} className={cn('rounded-xl border p-4 flex flex-col gap-2', tone)}>
            <Icon className="h-4 w-4" />
            <span className="text-2xl font-bold font-tabular">{result[key]}</span>
            <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Link
          href="/holdings"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity"
        >
          View Holdings
          <ArrowRight className="h-4 w-4" />
        </Link>
        <button
          type="button"
          onClick={onReset}
          className="px-4 py-2 bg-muted/40 border border-border text-foreground text-sm font-semibold rounded-xl hover:bg-muted/60 transition-colors cursor-pointer"
        >
          Import another file
        </button>
      </div>
    </div>
  );
}
