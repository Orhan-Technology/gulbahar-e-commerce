'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Eraser, MessageSquare, Radio, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { clearReadLog, fetchNotificationLog, markLogRead, type LogEntry } from '@/lib/actions/demo';
import { OPEN_LOG_EVENT } from '@/lib/demo';
import { formatNumber, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

type ChannelFilter = 'all' | 'sms' | 'inapp';
type RoleFilter = 'all' | 'customer' | 'shopkeeper' | 'admin';

const LOCALE_LABEL: Record<string, string> = { fa: 'دری', en: 'EN', ps: 'پښتو' };

/**
 * The demo notification log (PRD §9.2).
 *
 * Every SMS the system WOULD send, appearing as it is written. This demos better
 * than real SMS: the client watches the message land on screen the moment the
 * shopkeeper accepts the order, and the panel shows the Dari and English templates
 * side by side, which is the multilingual claim made visible rather than asserted.
 *
 * Polls every two seconds. A poll rather than a socket for the same reason as the
 * rest of the app — the demo runs on one machine with no external services
 * (PRD §12.1) — and a two-second beat is fast enough that an arrival feels live
 * while the presenter is still talking.
 *
 * Entries that are new SINCE THE LAST POLL animate in. That is tracked by id rather
 * than by the `read` flag, so an arrival is visibly new even when the panel is
 * already open and marking things read as it goes.
 */
export function NotificationLog() {
  const t = useTranslations('demoLog');
  const locale = useLocale();

  const [open, setOpen] = React.useState(false);
  const [entries, setEntries] = React.useState<LogEntry[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [channel, setChannel] = React.useState<ChannelFilter>('all');
  const [role, setRole] = React.useState<RoleFilter>('all');
  const [pending, startTransition] = React.useTransition();

  // Ids seen on the previous poll; anything outside this set animates in.
  const seenRef = React.useRef<Set<string>>(new Set());
  const [freshIds, setFreshIds] = React.useState<Set<string>>(new Set());
  /*
   * QA fix: changing a filter swaps the visible set wholesale, and every entry
   * the previous filter had hidden looked "new" — the entire list flashed the
   * arrival highlight, which read as broken. Freshness only means anything
   * within one unchanged filter, so a filter change resets the baseline the
   * same way first load does.
   */
  const filterRef = React.useRef('all/all');

  const load = React.useCallback(async () => {
    const result = await fetchNotificationLog({
      channel: channel === 'all' ? undefined : channel,
      role: role === 'all' ? undefined : role,
      limit: 60,
    });
    if (!result.ok) return;

    const filterKey = `${channel}/${role}`;
    const filterChanged = filterRef.current !== filterKey;
    filterRef.current = filterKey;

    const ids = new Set(result.data.entries.map((entry) => entry.id));
    const fresh = new Set(
      result.data.entries.filter((entry) => !seenRef.current.has(entry.id)).map((e) => e.id),
    );
    // First load and filter changes are not "fresh" — otherwise sixty rows all
    // slide in highlighted at once.
    setFreshIds(seenRef.current.size === 0 || filterChanged ? new Set() : fresh);
    seenRef.current = ids;

    setEntries(result.data.entries);
    setUnread(result.data.unread);
  }, [channel, role]);

  /*
   * Anything can ask the panel to open — the sign-in form does, so a customer
   * hunting for their code is taken straight to it instead of having to know what
   * "the notification panel" means and where the button is.
   */
  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_LOG_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_LOG_EVENT, onOpen);
  }, []);

  React.useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const tick = () => {
      if (document.visibilityState === 'visible') void load();
    };

    void (async () => {
      await load();
      if (cancelled) return;
      timer = setInterval(tick, 2000);
    })();

    return () => {
      cancelled = true;
      if (timer !== null) clearInterval(timer);
    };
  }, [load]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Opening the panel is the presenter acknowledging what is in it.
        if (next) startTransition(async () => void (await markLogRead()));
      }}
    >
      <SheetTrigger asChild>
        <Button
          variant="default"
          size="icon"
          aria-label={t('open')}
          // Fixed, above the mobile tab bar, on the trailing side so it never sits
          // under the RTL back gesture area.
          className="rounded-pill shadow-overlay fixed end-4 bottom-24 z-40 h-11 w-11 md:bottom-6"
        >
          <Radio className="h-5 w-5" aria-hidden />
          {unread > 0 && (
            <span
              className="rounded-pill bg-danger text-danger-fg absolute end-0 -top-1 flex h-5 min-w-5 items-center justify-center px-1 text-xs font-bold"
              aria-hidden
            >
              {formatNumber(unread, locale)}
            </span>
          )}
        </Button>
      </SheetTrigger>

      {/* `end` is LOGICAL — our Sheet resolves it per document direction, so the
          panel slides in from the left in Dari and the right in English without a
          conditional here (PRD §9.2 "correct side per locale"). */}
      <SheetContent side="end" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Radio className="h-4 w-4" aria-hidden />
            {t('title')}
          </SheetTitle>
          <p className="text-muted-foreground text-xs">{t('subtitle')}</p>
        </SheetHeader>

        <div className="space-y-2 px-4">
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'sms', 'inapp'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setChannel(option)}
                className={cn(
                  'rounded-pill border px-2.5 py-1 text-xs',
                  channel === option
                    ? 'border-primary bg-primary-50 text-primary font-medium'
                    : 'border-border hover:border-primary',
                )}
              >
                {t(`channels.${option}`)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'customer', 'shopkeeper', 'admin'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRole(option)}
                className={cn(
                  'rounded-pill border px-2.5 py-1 text-xs',
                  role === option
                    ? 'border-primary bg-primary-50 text-primary font-medium'
                    : 'border-border hover:border-primary',
                )}
              >
                {t(`roles.${option}`)}
              </button>
            ))}
          </div>
        </div>

        <ul className="flex-1 space-y-2 overflow-y-auto px-4 pb-4">
          {entries.length === 0 && (
            <li className="text-muted-foreground rounded-card border-border border border-dashed p-6 text-center text-sm">
              {t('empty')}
            </li>
          )}

          {entries.map((entry) => (
            <li
              key={entry.id}
              className={cn(
                'rounded-card border-border bg-card flex gap-3 border p-3',
                freshIds.has(entry.id) && 'animate-queue-in border-primary bg-primary-50',
              )}
            >
              {/* Channel avatar: SMS in brand green, in-app muted — scannable at a
                  glance while the list is moving. */}
              <span
                className={cn(
                  'rounded-pill flex h-8 w-8 shrink-0 items-center justify-center',
                  entry.channel === 'sms'
                    ? 'bg-primary-50 text-primary'
                    : 'bg-muted text-muted-foreground',
                )}
                aria-hidden
              >
                {entry.channel === 'sms' ? (
                  <Smartphone className="h-4 w-4" />
                ) : (
                  <MessageSquare className="h-4 w-4" />
                )}
              </span>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-bold">{entry.title}</span>
                  <time className="text-muted-foreground shrink-0 text-xs">
                    {formatRelative(entry.createdAt, locale)}
                  </time>
                </div>

                {/* Rendered in its own language, so a Dari body reads right-to-left
                    even when the panel is in English. */}
                <p className="text-sm leading-relaxed" dir={entry.locale === 'en' ? 'ltr' : 'rtl'}>
                  {entry.body}
                </p>

                <div className="text-muted-foreground flex items-center gap-1.5 pt-0.5 text-xs">
                  <Badge variant="secondary">{t(`roles.${entry.recipientRole}`)}</Badge>
                  <span className="truncate">
                    {entry.recipientName ?? t(`roles.${entry.recipientRole}`)}
                    {entry.recipientPhone && <span dir="ltr"> · {entry.recipientPhone}</span>}
                  </span>
                  {/* The language the template rendered in — the multilingual claim. */}
                  <Badge variant="outline" className="ms-auto shrink-0">
                    {LOCALE_LABEL[entry.locale] ?? entry.locale}
                  </Badge>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="border-border flex items-center gap-2 border-t p-4">
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await clearReadLog();
                if (result.ok) {
                  toast.success(t('cleared', { count: formatNumber(result.data.removed, locale) }));
                  seenRef.current = new Set();
                  await load();
                }
              })
            }
          >
            <Eraser />
            {t('clearRead')}
          </Button>
          {/* Unread entries are never destroyed — an arrival mid-demo survives. */}
          <span className="text-muted-foreground text-xs">{t('clearNote')}</span>
        </div>
      </SheetContent>
    </Sheet>
  );
}
