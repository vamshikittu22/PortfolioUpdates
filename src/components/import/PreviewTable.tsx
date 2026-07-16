'use client';

// IMPT-03 (locked decision): skip/override is bulk, category-level ONLY —
// this component has no individually selectable row control anywhere.
// Expanding a row (below) is purely a view affordance, never an import
// choice; the only controls that change what commits are the two category
// toggles bound to CommitChoices. Category tones reuse StalenessBadge's
// success/warning/danger/muted palette rather than a new color system.

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Switch } from '@/components/ui/switch';
import type { ImportPreview, RowStatus, CommitChoices } from '@/lib/import/types';

type Preview = Extract<ImportPreview, { ok: true }>;

interface PreviewTableProps {
  preview: Preview;
  choices: CommitChoices;
  onChoicesChange: (c: CommitChoices) => void;
}

const STATUS_ORDER: RowStatus[] = ['valid', 'duplicate', 'unmatched', 'unsupported', 'invalid'];

const STATUS_COPY: Record<RowStatus, { label: string; tone: string; onCommit: string }> = {
  valid: {
    label: 'Valid',
    tone: 'bg-success/10 text-success border-success/20',
    onCommit: 'Imported.',
  },
  duplicate: {
    label: 'Duplicate',
    tone: 'bg-warning/10 text-warning border-warning/20',
    onCommit:
      'Skipped by default — matches a row already imported or entered manually. Toggle below to import anyway.',
  },
  unmatched: {
    label: 'Unmatched',
    tone: 'bg-warning/10 text-warning border-warning/20',
    onCommit: 'Not importable until its broker symbol is resolved in "Resolve symbols" below.',
  },
  unsupported: {
    label: 'Unsupported',
    tone: 'bg-muted/40 text-muted-foreground border-border/50',
    onCommit: 'A recognized but unsupported row type (e.g. dividends, options, fees). Skipped by default.',
  },
  invalid: {
    label: 'Invalid',
    tone: 'bg-danger/10 text-danger border-danger/20',
    onCommit: 'A required field failed to parse. Not importable — fix the source file and re-upload.',
  },
};

export function PreviewTable({ preview, choices, onChoicesChange }: PreviewTableProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleExpanded = (rowIndex: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  };

  const presentStatuses = STATUS_ORDER.filter((s) => preview.categories[s] > 0);

  return (
    <div className="glass-card rounded-2xl border border-border/50 overflow-hidden">
      <div className="p-5 border-b border-border/50 space-y-4">
        <h2 className="text-lg font-bold">
          Preview — {preview.rowCount} row{preview.rowCount === 1 ? '' : 's'}
        </h2>

        {/* Category chips — per-category counts from preview.categories. */}
        <div className="flex flex-wrap gap-2">
          {presentStatuses.map((status) => (
            <span
              key={status}
              className={cn('px-2.5 py-1 rounded-full text-xs font-semibold border', STATUS_COPY[status].tone)}
            >
              {STATUS_COPY[status].label} · {preview.categories[status]}
            </span>
          ))}
        </div>

        {/* Bulk-only category toggle — the ONLY control that changes what
            commits. Uses the existing Switch primitive, not a native form
            control, so this stays unambiguous from row-level selection.
            `unsupported` rows have no ImportTxnType and commitImport (04-04)
            never reads choices.importUnsupported — they cannot become a
            transaction regardless of any UI toggle, so no override switch is
            offered for them (a working-looking control that does nothing
            would mislead the user); the category count + explanation below
            is informational only. */}
        <div className="space-y-3 pt-1">
          {preview.categories.duplicate > 0 && (
            <div className="flex items-start gap-3">
              <Switch
                checked={choices.importDuplicates}
                onCheckedChange={(checked) => onChoicesChange({ ...choices, importDuplicates: checked })}
              />
              <div className="text-sm">
                <p className="font-semibold text-foreground">Import duplicates anyway</p>
                <p className="text-xs text-muted-foreground">
                  {choices.importDuplicates
                    ? `All ${preview.categories.duplicate} duplicate row(s) will be imported.`
                    : `${preview.categories.duplicate} duplicate row(s) are skipped by default.`}
                </p>
              </div>
            </div>
          )}
        </div>

        <ul className="text-[11px] text-muted-foreground space-y-1 pt-1">
          {presentStatuses.map((status) => (
            <li key={status}>
              <span className="font-semibold text-foreground">{STATUS_COPY[status].label}:</span>{' '}
              {STATUS_COPY[status].onCommit}
            </li>
          ))}
        </ul>
      </div>

      {/* Compact rows (locked): symbol, type, quantity, status badge.
          Clicking a row only toggles the expanded detail panel below it —
          selection for import is category-level only, never here. */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/20 text-muted-foreground text-xs uppercase font-semibold">
            <tr>
              <th className="px-5 py-3 text-left" aria-label="Expand" />
              <th className="px-5 py-3 text-left">Symbol</th>
              <th className="px-5 py-3 text-left">Type</th>
              <th className="px-5 py-3 text-right">Quantity</th>
              <th className="px-5 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {preview.rows.map((row) => {
              const isExpanded = expanded.has(row.rowIndex);
              return (
                <Fragment key={row.rowIndex}>
                  <tr
                    onClick={() => toggleExpanded(row.rowIndex)}
                    className="hover:bg-muted/10 transition-colors cursor-pointer"
                  >
                    <td className="px-5 py-3 text-muted-foreground">
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </td>
                    <td className="px-5 py-3 font-semibold">{row.symbol || '—'}</td>
                    <td className="px-5 py-3">{row.txnType ?? '—'}</td>
                    <td className="px-5 py-3 text-right font-tabular">{row.quantity ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-md text-[10px] font-semibold border',
                          STATUS_COPY[row.status].tone
                        )}
                      >
                        {STATUS_COPY[row.status].label}
                      </span>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-muted/5">
                      <td colSpan={5} className="px-5 py-3">
                        <div className="space-y-2 text-xs">
                          {row.status === 'unmatched' && (
                            <p className="flex items-center gap-1.5 text-warning">
                              <AlertTriangle className="h-3 w-3" />
                              Becomes importable once resolved in &quot;Resolve symbols&quot; below.
                            </p>
                          )}
                          {row.statusReason && (
                            <p className="text-muted-foreground">
                              <span className="font-semibold text-foreground">Reason: </span>
                              {row.statusReason}
                            </p>
                          )}
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                            <p>
                              <span className="font-semibold text-foreground">ISIN:</span> {row.isin ?? '—'}
                            </p>
                            <p>
                              <span className="font-semibold text-foreground">Price:</span> {row.priceStr ?? '—'}
                            </p>
                            <p>
                              <span className="font-semibold text-foreground">Date:</span> {row.dateISO ?? '—'}
                            </p>
                            <p>
                              <span className="font-semibold text-foreground">Instrument:</span>{' '}
                              {row.instrumentId ?? 'Unmatched'}
                            </p>
                          </div>
                          <div className="pt-1 border-t border-border/30">
                            <p className="font-semibold text-foreground mb-1">Raw fields</p>
                            <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
                              {Object.entries(row.rawFields).map(([key, value]) => (
                                <p key={key} className="text-muted-foreground">
                                  <span className="text-foreground">{key}:</span> {value ?? '—'}
                                </p>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
