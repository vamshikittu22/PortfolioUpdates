import React from 'react';
import { AlertsTable } from '@/components/dashboard/AlertsTable';
import { Bell, Settings } from 'lucide-react';

// Phase 5 (ALRT-*) is not live yet — no mock store, no fabricated alerts.
// AlertsTable already renders a correct "No active alerts" empty state for
// an empty array. No per-account profile name is needed here (single real
// account per user, PORT-07).
export default function AlertsPage() {
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            Alert Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure triggers for your portfolio
          </p>
        </div>

        <button className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border/60 hover:bg-muted text-xs font-semibold rounded-lg transition-colors cursor-pointer">
          <Settings className="h-3.5 w-3.5 text-muted-foreground" />
          Delivery Settings
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <AlertsTable alerts={[]} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 glass-card rounded-2xl border border-border/50 bg-primary/5">
          <h3 className="font-bold text-sm mb-2 text-foreground">Price Alerts</h3>
          <p className="text-xs text-muted-foreground">Trigger notifications when an asset crosses a specific price threshold.</p>
        </div>
        <div className="p-5 glass-card rounded-2xl border border-border/50 bg-primary/5">
          <h3 className="font-bold text-sm mb-2 text-foreground">Sentiment Shifts</h3>
          <p className="text-xs text-muted-foreground">Get notified when AI detects a major shift in news sentiment for your holdings.</p>
        </div>
        <div className="p-5 glass-card rounded-2xl border border-border/50 bg-primary/5">
          <h3 className="font-bold text-sm mb-2 text-foreground">Volume Spikes</h3>
          <p className="text-xs text-muted-foreground">Receive alerts when news volume or trading volume anomalously spikes.</p>
        </div>
      </div>
    </div>
  );
}
