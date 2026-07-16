'use client';

// ALRT-02 — rewritten in place from the mock-era categorical-alert table
// (sentiment shift / news spike alert kinds, a string threshold,
// Email/Push/In-App delivery) to render the real price-alert shape
// (PriceAlertView, 05-07). A feature is not done until its mock module is
// deleted — this IS that deletion for the AlertsTable half of the surface.
//
// Row actions (edit/toggle/delete) each run inside their own useTransition
// and surface `{ success:false, error }` inline per-row — never swallowed,
// same idiom as HoldingsTable's delete/toggle handlers.

import React, { useState, useTransition } from 'react';
import { Bell, TrendingUp, TrendingDown, Send, Pencil, Pause, Play, Trash2, Plus } from 'lucide-react';
import type { PriceAlertView } from '@/lib/alerts/read';
import { togglePriceAlert, deletePriceAlert } from '@/server-actions/alerts';
import { cn } from '@/utils/cn';
import { formatCurrency } from '@/utils/format';
import { AlertFormDialog } from './AlertFormDialog';

interface AlertsTableProps {
  alerts: PriceAlertView[];
}

// Pinned locale/timezone for any rendered timestamp — the exact hydration
// bug StalenessBadge fixed (server/browser default-locale disagreement).
// See StalenessBadge.tsx's header comment for the full story.
const DISPLAY_LOCALE = 'en-IN';
const DISPLAY_TIME_ZONE = 'Asia/Kolkata';

function formatTriggeredAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(DISPLAY_LOCALE, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: DISPLAY_TIME_ZONE,
  });
}

export function AlertsTable({ alerts }: AlertsTableProps) {
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const setRowError = (id: string, message: string) => {
    setRowErrors((prev) => ({ ...prev, [id]: message }));
  };

  const handleToggle = (alert: PriceAlertView) => {
    setBusyId(alert.id);
    setRowError(alert.id, '');
    startTransition(async () => {
      try {
        const result = await togglePriceAlert({ id: alert.id, isActive: !alert.isActive });
        if (!result.success) setRowError(alert.id, result.error);
      } catch (err) {
        setRowError(alert.id, err instanceof Error ? err.message : 'Could not update alert');
      } finally {
        setBusyId(null);
      }
    });
  };

  const handleDelete = (alert: PriceAlertView) => {
    if (
      !window.confirm(
        `Delete the ${alert.direction} ${formatCurrency(alert.threshold, alert.currency)} alert for ${alert.ticker}?`
      )
    ) {
      return;
    }
    setBusyId(alert.id);
    setRowError(alert.id, '');
    startTransition(async () => {
      try {
        const result = await deletePriceAlert({ id: alert.id });
        if (!result.success) setRowError(alert.id, result.error);
      } catch (err) {
        setRowError(alert.id, err instanceof Error ? err.message : 'Could not delete alert');
      } finally {
        setBusyId(null);
      }
    });
  };

  return (
    <div className="glass-card rounded-2xl overflow-hidden border border-border/50">
      <div className="flex items-center justify-between p-5 border-b border-border/50">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Active Alerts
        </h2>
        <AlertFormDialog
          mode="add"
          trigger={
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-md shadow-primary/20 transition-all hover:bg-primary/90 cursor-pointer">
              <Plus className="h-3.5 w-3.5" />
              Create Alert
            </button>
          }
        />
      </div>

      {alerts.length === 0 ? (
        <div className="p-8 text-center flex flex-col items-center justify-center space-y-3 text-muted-foreground">
          <Bell className="h-10 w-10 text-muted-foreground/30" />
          <p className="font-semibold text-sm">No active alerts for this portfolio.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/20 text-muted-foreground text-xs uppercase font-semibold">
              <tr>
                <th className="px-5 py-4 tracking-wider">Symbol</th>
                <th className="px-5 py-4 tracking-wider">Trigger</th>
                <th className="px-5 py-4 tracking-wider text-right">Current</th>
                <th className="px-5 py-4 tracking-wider text-center">Delivery</th>
                <th className="px-5 py-4 tracking-wider text-center">Status</th>
                <th className="px-5 py-4 tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {alerts.map((alert) => {
                const triggeredLabel = formatTriggeredAt(alert.lastTriggeredAt);
                const rowBusy = isPending && busyId === alert.id;
                return (
                  <tr key={alert.id} className="hover:bg-muted/10 transition-colors group">
                    <td className="px-5 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-foreground">{alert.ticker}</span>
                        <span className="text-[11px] text-muted-foreground/80 truncate max-w-[160px]">
                          {alert.name} · {alert.exchange}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {alert.direction === 'above' ? (
                          <TrendingUp className="h-4 w-4 text-success" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-danger" />
                        )}
                        <span className="font-mono text-sm bg-muted/50 px-2.5 py-1 rounded-md border border-border/50">
                          {alert.direction} {formatCurrency(alert.threshold, alert.currency)}
                        </span>
                      </div>
                      {triggeredLabel && (
                        <p className="mt-1 text-[10px] text-muted-foreground">Last triggered {triggeredLabel}</p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {alert.currentPrice === null ? (
                        <span className="text-muted-foreground font-tabular" title="Not yet priced">
                          —
                        </span>
                      ) : (
                        <span className="font-tabular font-medium text-foreground">
                          {formatCurrency(alert.currentPrice, alert.currency)}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      {/* Telegram is the ONLY delivery channel this phase
                          supports — the mock's Push/Email/In-App icons are
                          gone, not just relabeled. */}
                      <div className="flex items-center justify-center gap-1.5 text-muted-foreground text-xs font-semibold">
                        <Send className="h-3.5 w-3.5" />
                        Telegram
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span
                        className={cn(
                          'px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider',
                          alert.isActive
                            ? 'bg-success/10 text-success border-success/20'
                            : 'bg-muted text-muted-foreground border-border/50'
                        )}
                      >
                        {alert.isActive ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <AlertFormDialog
                          mode="edit"
                          alert={alert}
                          trigger={
                            <button
                              type="button"
                              title="Edit"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          }
                        />
                        <button
                          type="button"
                          title={alert.isActive ? 'Pause' : 'Activate'}
                          onClick={() => handleToggle(alert)}
                          disabled={rowBusy}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-warning hover:bg-warning/10 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {alert.isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={() => handleDelete(alert)}
                          disabled={rowBusy}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {rowErrors[alert.id] && (
                        <p className="mt-1 text-[10px] text-danger text-right max-w-[180px] ml-auto">
                          {rowErrors[alert.id]}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
