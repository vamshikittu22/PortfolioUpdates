'use client';

// DGST-02 — the digest's user-facing control surface on /alerts. A
// structural clone of TelegramLinkCard.tsx: same 'use client' + useTransition
// + inline-error discipline, same glass-card styling vocabulary. Two zones
// in one card: the enable/disable toggle (persists independently of the
// Telegram link state — the preference is user-owned, delivery respect is
// enforced server-side) and the "Send test digest" button (the human's local
// verification lever for 07-05). Every outcome — inline toggle error,
// unlinked warning, test-send success/failure, degraded news, dispatcher
// failure — is rendered VERBATIM from the Server Action's own returned
// result; nothing here is fabricated or guessed. The displayed toggle state
// always comes from the `enabled` prop (the RSC re-read after
// revalidatePath('/alerts')) — a successful setDigestEnabled call never
// flips local state directly, matching TelegramLinkCard's status-prop flip.

import { useState, useTransition } from 'react';
import { CalendarClock } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { setDigestEnabled, sendTestDigest } from '@/server-actions/digest';

interface DigestSettingsCardProps {
  enabled: boolean;
  telegramLinked: boolean;
}

type TestResult =
  | { kind: 'success'; sent: number; failed: number; newsDegraded: boolean }
  | { kind: 'error'; error: string };

export function DigestSettingsCard({ enabled, telegramLinked }: DigestSettingsCardProps) {
  const [isPending, startTransition] = useTransition();
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const handleToggle = (next: boolean) => {
    setToggleError(null);
    startTransition(async () => {
      const result = await setDigestEnabled(next);
      if (!result.success) {
        setToggleError(result.error);
      }
      // On success the Server Action already revalidated '/alerts'; the
      // parent RSC re-fetches getDigestPreference and this component flips
      // via its `enabled` prop on the next render — never flipped locally.
    });
  };

  const handleSendTest = () => {
    setTestResult(null);
    startTransition(async () => {
      const result = await sendTestDigest();
      if (!result.success) {
        setTestResult({ kind: 'error', error: result.error });
        return;
      }
      setTestResult({
        kind: 'success',
        sent: result.dispatched.sent,
        failed: result.dispatched.failed,
        newsDegraded: result.newsDegraded,
      });
    });
  };

  return (
    <div className="glass-card rounded-2xl p-5 border border-border/50 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center h-9 w-9 rounded-full bg-primary/10 text-primary">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-foreground">Daily Digest</p>
            <p className="text-xs text-muted-foreground">
              One Telegram message a day — portfolio value, day P&amp;L, top movers, and your portfolio news (~08:45
              IST).
            </p>
          </div>
        </div>
        <Switch checked={enabled} disabled={isPending} onCheckedChange={handleToggle} aria-label="Enable daily digest" />
      </div>

      {toggleError && <p className="text-danger text-xs">{toggleError}</p>}

      {!telegramLinked && (
        <p className="text-warning text-[11px]">
          Telegram is not linked — the digest will not be delivered until you link it above.
        </p>
      )}

      <div className="pt-2 border-t border-border/40 space-y-2">
        <button
          type="button"
          onClick={handleSendTest}
          disabled={isPending}
          className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border/60 hover:bg-muted text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-60"
        >
          {isPending ? 'Sending…' : 'Send test digest'}
        </button>

        {testResult?.kind === 'success' && (
          <div className="space-y-1">
            <p className="text-success text-[11px]">
              Test digest queued — sent {testResult.sent}, failed {testResult.failed}.
            </p>
            {testResult.newsDegraded && (
              <p className="text-warning text-[11px]">
                News section degraded — portfolio-only (news pipeline not live yet).
              </p>
            )}
          </div>
        )}
        {testResult?.kind === 'error' && <p className="text-danger text-[11px]">{testResult.error}</p>}
      </div>
    </div>
  );
}
