'use client';

// ALRT-01 — the Telegram linking handshake UI. Replaces the dead "Delivery
// Settings" button that used to sit in the /alerts header — this card is
// its functional successor. A useTransition state machine over the three
// Server Actions from 05-06 (src/server-actions/telegram.ts):
//   not linked -> generateTelegramLink() renders the t.me deep link ->
//   "I've sent /start" -> checkTelegramLink() polls+binds -> linked view
//   (flip driven by the parent RSC re-fetching getTelegramLink after the
//   Server Action's revalidatePath('/alerts'), which updates this
//   component's `status` prop) -> Unlink -> unlinkTelegram().
// Every branch surfaces its error inline — never swallowed, including the
// honest "no /start received yet" case when checkTelegramLink polls clean.

import { useState, useTransition } from 'react';
import { Send, Link2, Unlink, CheckCircle2 } from 'lucide-react';
import { generateTelegramLink, checkTelegramLink, unlinkTelegram } from '@/server-actions/telegram';
import type { TelegramLinkStatus } from '@/lib/telegram/read';

interface TelegramLinkCardProps {
  status: TelegramLinkStatus;
  linkedAt: string | null;
}

// Pinned locale/timezone — same StalenessBadge-lesson discipline applied
// throughout this phase's UI (server/browser default-locale hydration bug).
const DISPLAY_LOCALE = 'en-IN';
const DISPLAY_TIME_ZONE = 'Asia/Kolkata';

function formatLinkedAt(value: string | null): string | null {
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

export function TelegramLinkCard({ status, linkedAt }: TelegramLinkCardProps) {
  const [isPending, startTransition] = useTransition();
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);

  const isLinked = status === 'linked';
  const linkedAtLabel = formatLinkedAt(linkedAt);

  const handleGenerate = () => {
    setError(null);
    setCheckMessage(null);
    startTransition(async () => {
      const result = await generateTelegramLink();
      if (result.ok) {
        setLinkUrl(result.url);
      } else {
        setError(result.error);
      }
    });
  };

  const handleCheck = () => {
    setError(null);
    setCheckMessage(null);
    startTransition(async () => {
      const result = await checkTelegramLink();
      if (!result.ok) {
        // Never swallowed — e.g. a 409 (webhook active locally) is
        // diagnosable information, not a generic failure.
        setError(result.error);
        return;
      }
      if (!result.linked) {
        setCheckMessage("No /start received yet — open the link, tap START, then try again.");
      }
      // On success the Server Action already revalidated '/alerts'; the
      // parent RSC re-fetches getTelegramLink and this component flips to
      // the linked view via its `status` prop on the next render.
    });
  };

  const handleUnlink = () => {
    setError(null);
    setCheckMessage(null);
    startTransition(async () => {
      const result = await unlinkTelegram();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLinkUrl(null);
    });
  };

  if (isLinked) {
    return (
      <div className="glass-card rounded-2xl p-5 border border-border/50 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center h-9 w-9 rounded-full bg-success/10 text-success">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-foreground">Telegram linked</p>
            <p className="text-xs text-muted-foreground">
              {linkedAtLabel ? `Linked since ${linkedAtLabel}` : 'Alerts will be delivered to your linked chat.'}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={handleUnlink}
            disabled={isPending}
            className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border/60 hover:bg-muted text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-60"
          >
            <Unlink className="h-3.5 w-3.5" />
            Unlink
          </button>
          {error && <p className="text-danger text-[11px] max-w-[220px] text-right">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-5 border border-border/50 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center h-9 w-9 rounded-full bg-primary/10 text-primary">
            <Send className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-foreground">Telegram not linked</p>
            <p className="text-xs text-muted-foreground">Link Telegram to receive price alert notifications.</p>
          </div>
        </div>
        {!linkUrl && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isPending}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-md shadow-primary/20 transition-all hover:bg-primary/90 cursor-pointer disabled:opacity-60"
          >
            <Link2 className="h-3.5 w-3.5" />
            {isPending ? 'Generating…' : 'Link Telegram'}
          </button>
        )}
      </div>

      {linkUrl && (
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Open the link, tap <span className="font-semibold text-foreground">START</span>, then click the button
            below.
          </p>
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-xs font-mono text-primary break-all underline"
          >
            {linkUrl}
          </a>
          <button
            type="button"
            onClick={handleCheck}
            disabled={isPending}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-md shadow-primary/20 transition-all hover:bg-primary/90 cursor-pointer disabled:opacity-60"
          >
            {isPending ? 'Checking…' : "I've sent /start"}
          </button>
          {checkMessage && <p className="text-warning text-[11px]">{checkMessage}</p>}
        </div>
      )}

      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  );
}
