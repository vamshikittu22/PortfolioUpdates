'use client';

import React from 'react';
import { Bell, Activity, Newspaper, TrendingUp, TrendingDown, ArrowUpRight, Smartphone, Mail, AlertTriangle } from 'lucide-react';
import type { AlertItem } from '@/lib/types';
import { cn } from '@/utils/cn';

interface AlertsTableProps {
  alerts: AlertItem[];
}

export function AlertsTable({ alerts }: AlertsTableProps) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden border border-border/50">
      <div className="flex items-center justify-between p-5 border-b border-border/50">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Active Alerts
        </h2>
        <button className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-md shadow-primary/20 transition-all hover:bg-primary/90">
          Create Alert
        </button>
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
                <th className="px-5 py-4 tracking-wider">Condition</th>
                <th className="px-5 py-4 tracking-wider text-center">Delivery</th>
                <th className="px-5 py-4 tracking-wider text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {alerts.map((alert) => (
                <tr key={alert.id} className="hover:bg-muted/10 transition-colors group">
                  <td className="px-5 py-4 font-bold text-foreground">
                    {alert.symbol}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      {alert.type === 'price_above' && <TrendingUp className="h-4 w-4 text-success" />}
                      {alert.type === 'price_below' && <TrendingDown className="h-4 w-4 text-danger" />}
                      {alert.type === 'sentiment_change' && <Activity className="h-4 w-4 text-primary" />}
                      {alert.type === 'news_spike' && <Newspaper className="h-4 w-4 text-warning" />}
                      <span className="text-sm font-medium text-foreground capitalize">
                        {alert.type.replace('_', ' ')}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-mono text-sm bg-muted/50 px-2.5 py-1 rounded-md border border-border/50">
                      {alert.threshold}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-muted-foreground text-xs font-semibold">
                      {alert.delivery === 'Push' && <Smartphone className="h-3.5 w-3.5" />}
                      {alert.delivery === 'Email' && <Mail className="h-3.5 w-3.5" />}
                      {alert.delivery === 'In-App' && <Bell className="h-3.5 w-3.5" />}
                      {alert.delivery}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className={cn(
                      'px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider',
                      alert.isActive 
                        ? 'bg-success/10 text-success border-success/20' 
                        : 'bg-muted text-muted-foreground border-border/50'
                    )}>
                      {alert.isActive ? 'Active' : 'Paused'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
