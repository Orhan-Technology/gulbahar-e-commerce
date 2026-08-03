'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ResumeShopButton } from '@/components/dashboard/resume-shop-button';
import {
  addStaff,
  pauseShop,
  removeStaff,
  setDashboardLocale,
} from '@/lib/actions/shop-settings';
import { digitsOnly } from '@/lib/digits';
import { formatDate, formatPhone } from '@/lib/format';
import { MALL_TIME_ZONE } from '@/lib/opening';
import { usePathname, useRouter as useLocaleRouter } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

export type StaffMember = {
  userId: string;
  name: string;
  phone: string;
  role: 'owner' | 'staff';
  isSelf: boolean;
};

/**
 * Notification preferences (PRD §6.8).
 *
 * Local UI state only, and it says so: real preferences arrive with the real SMS
 * gateway (PRD §15). A toggle that pretended to persist would be a lie the demo
 * does not need — showing the intended controls with an honest note is worth more
 * than a fake setting.
 */
export function NotificationPreferences() {
  const t = useTranslations('shopSettings.notifications');
  const [prefs, setPrefs] = React.useState({
    newOrder: true,
    orderCancelled: true,
    lowStock: true,
    newReview: false,
    campaignDecisions: true,
  });

  const rows = [
    { key: 'newOrder' as const },
    { key: 'orderCancelled' as const },
    { key: 'lowStock' as const },
    { key: 'newReview' as const },
    { key: 'campaignDecisions' as const },
  ];

  return (
    <section className="rounded-card border-border bg-card space-y-3 border p-4">
      <div>
        <h2 className="text-sm font-bold">{t('heading')}</h2>
        <p className="text-muted-foreground text-xs">{t('demoNote')}</p>
      </div>

      <ul className="divide-border divide-y">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 py-2.5">
            <Label htmlFor={`pref-${row.key}`} className="text-sm font-normal">
              {t(`items.${row.key}`)}
            </Label>
            <Switch
              id={`pref-${row.key}`}
              checked={prefs[row.key]}
              onCheckedChange={(checked) =>
                setPrefs((current) => ({ ...current, [row.key]: checked }))
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * "A week", "two weeks", "a month" — the three lengths a shop is actually shut
 * for. Counted from TODAY, so the value written is `earliest + (days - 1)`:
 * `earliest` is tomorrow, the first day the shop may be back.
 */
const QUICK_PAUSES = [7, 14, 30] as const;

/**
 * Calendar arithmetic on the date PARTS, never on a timestamp: Kabul is +04:30,
 * and adding 86.4 million milliseconds to a parsed local date lands on the
 * wrong side of midnight — the same trap the save handler below documents.
 */
function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Vacation mode (Prompt: the missing escape hatch).
 *
 * The alternative a shopkeeper had was unpublishing products one at a time, and
 * republishing them one at a time on their return — for an Eid closure, a trip
 * to Dubai for stock, or a week of illness. This closes the shop with a date on
 * it and leaves the catalogue exactly where it is.
 *
 * The DATE is required and the NOTE is not, in that order on the screen, because
 * the date is what the customer is actually told: "back on ۱۲ سنبله" is useful
 * to someone deciding whether to wait, and «سفر خرید» on its own is not.
 */
export function VacationPanel({
  pausedUntil,
  paused,
  noteFa,
  noteEn,
  earliest,
}: {
  /** ISO string, or null while trading. */
  pausedUntil: string | null;
  /**
   * Whether that date is still in the future — decided on the SERVER. Working
   * it out here would mean reading the clock during render, which React 19
   * forbids (CLAUDE.md), and would also make the panel disagree with the banner
   * in the layout by however long the tab has been open.
   */
  paused: boolean;
  noteFa: string;
  noteEn: string;
  /**
   * The first day the shop may reopen — tomorrow at the mall, computed on the
   * server. It is the `min` of the date input, so the commonest way to write a
   * pause that is already over cannot be typed in the first place; the action
   * still refuses a past date, because a form control is not a validator.
   */
  earliest: string;
}) {
  const t = useTranslations('shopSettings.vacation');
  const locale = useLocale();
  const router = useRouter();

  /*
   * `pausedUntil` is the last MOMENT of the last closed day; the control asks
   * for the day the shop is BACK, which is the next one.
   *
   * Read in the MALL's timezone, not through `toISOString()`. Kabul is +04:30,
   * so the stored 23:59:59 local is 19:29 UTC on the same date — an ISO slice
   * therefore lands on the closing day and the input would show the shopkeeper
   * a return date one day earlier than the one they set, every time.
   */
  const returnDay = pausedUntil
    ? new Intl.DateTimeFormat('en-CA', { timeZone: MALL_TIME_ZONE }).format(
        new Date(new Date(pausedUntil).getTime() + 60_000),
      )
    : '';

  const [until, setUntil] = React.useState(returnDay);
  const [fa, setFa] = React.useState(noteFa);
  const [en, setEn] = React.useState(noteEn);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function save() {
    if (!until) {
      setError('bad_pause_date');
      return;
    }
    setError(null);

    startTransition(async () => {
      /*
       * The control asks when the shop is BACK; the action stores the last day
       * it is CLOSED. That is one calendar day earlier, and it is computed as
       * calendar arithmetic on the date parts rather than by subtracting 86.4
       * million milliseconds from a parsed Date — the Kabul offset is +04:30, so
       * a timestamp round-trip lands on the wrong side of midnight and the shop
       * would reopen a day early.
       */
      const [year, month, day] = until.split('-').map(Number);
      const previous = new Date(Date.UTC(year, month - 1, day));
      previous.setUTCDate(previous.getUTCDate() - 1);
      const lastClosedDay = previous.toISOString().slice(0, 10);

      const result = await pauseShop({ until: lastClosedDay, noteFa: fa, noteEn: en });
      if (!result.ok) {
        setError(result.error);
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('paused'));
      router.refresh();
    });
  }

  return (
    <section className="rounded-card border-border bg-card space-y-3 border p-4">
      <div>
        <h2 className="text-sm font-bold">{t('heading')}</h2>
        <p className="text-muted-foreground text-xs">{t('hint')}</p>
      </div>

      {paused && (
        <p className="rounded-control border-accent-warm/40 bg-accent-warm/10 p-3 text-xs font-medium">
          {t('currentlyPaused', { date: formatDate(pausedUntil!, locale, 'medium') })}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pause-until">{t('untilLabel')}</Label>

          {/*
            QUICK PICKS FIRST, AND THE ANSWER READ BACK IN SHAMSI (Prompt C19).
            `<input type="date">` renders the BROWSER's calendar — «mm/dd/yyyy»
            and a Gregorian grid — in a panel where every other date on screen
            is «۲۲ سنبله ۱۴۰۵». A shopkeeper closing for Eid does not know the
            Gregorian date of their return and should not have to convert one.
            The chips write the same ISO value the input does; the native
            control stays underneath for an exact day, and the line below says
            in the reader's own calendar what was actually chosen.
          */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PAUSES.map((days) => {
              const value = addDays(earliest, days - 1);
              const active = until === value;
              return (
                <button
                  key={days}
                  type="button"
                  onClick={() => {
                    setUntil(value);
                    setError(null);
                  }}
                  aria-pressed={active}
                  className={cn(
                    'rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors duration-150',
                    active
                      ? 'border-primary bg-primary-50 text-primary font-semibold'
                      : 'border-border bg-card hover:border-primary',
                  )}
                >
                  {t(`quick.${days}` as never)}
                </button>
              );
            })}
          </div>

          <Input
            id="pause-until"
            type="date"
            dir="ltr"
            min={earliest}
            value={until}
            aria-invalid={error !== null}
            aria-describedby={error ? 'pause-until-error' : 'pause-until-echo'}
            onChange={(event) => {
              setUntil(event.target.value);
              setError(null);
            }}
          />

          {until && !error && (
            <p id="pause-until-echo" className="text-xs font-medium text-neutral-600">
              {t('returnOn', { date: formatDate(until, locale, 'medium') })}
            </p>
          )}

          {error && (
            <p id="pause-until-error" className="text-danger text-xs font-medium">
              {t(`errors.${error}` as never)}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pause-note-fa">{t('noteLabel')}</Label>
          <Input
            id="pause-note-fa"
            value={fa}
            maxLength={200}
            placeholder={t('notePlaceholder')}
            onChange={(event) => setFa(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pause-note-en">{t('noteEnLabel')}</Label>
        <Input
          id="pause-note-en"
          dir="ltr"
          value={en}
          maxLength={200}
          onChange={(event) => setEn(event.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={save} disabled={pending || !until}>
          <CalendarClock />
          {pending ? t('saving') : paused ? t('update') : t('pause')}
        </Button>
        {pausedUntil && <ResumeShopButton label={t('resumeNow')} />}
      </div>

      {/* Say what a customer will see, before it is switched on. */}
      <p className="text-muted-foreground text-xs">{t('customerNote')}</p>
    </section>
  );
}

/** Staff roster (PRD §6.8). Only the owner sees the controls. */
export function StaffPanel({ staff, canManage }: { staff: StaffMember[]; canManage: boolean }) {
  const t = useTranslations('shopSettings.staff');
  const locale = useLocale();
  const router = useRouter();

  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [pending, startTransition] = React.useTransition();

  function add() {
    startTransition(async () => {
      const result = await addStaff({ name, phone });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(result.data.created ? t('addedNew') : t('addedExisting'));
      setName('');
      setPhone('');
      router.refresh();
    });
  }

  return (
    <section className="rounded-card border-border bg-card space-y-3 border p-4">
      <div>
        <h2 className="text-sm font-bold">{t('heading')}</h2>
        <p className="text-muted-foreground text-xs">{t('hint')}</p>
      </div>

      <ul className="divide-border divide-y">
        {staff.map((member) => (
          <li key={member.userId} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{member.name}</p>
              <p className="text-muted-foreground text-xs" dir="ltr">
                {formatPhone(member.phone, locale)}
              </p>
            </div>
            <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
              {t(`roles.${member.role}`)}
            </Badge>
            {canManage && member.role === 'staff' && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('remove')}
                disabled={pending}
                className="hover:text-danger shrink-0 text-neutral-500"
                onClick={() =>
                  startTransition(async () => {
                    const result = await removeStaff(member.userId);
                    if (!result.ok) toast.error(t(`errors.${result.error}` as never));
                    else {
                      toast.success(t('removed'));
                      router.refresh();
                    }
                  })
                }
              >
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>

      {canManage ? (
        <div className="border-border space-y-3 border-t pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="staff-name">{t('nameLabel')}</Label>
              <Input
                id="staff-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff-phone">{t('phoneLabel')}</Label>
              <Input
                id="staff-phone"
                inputMode="tel"
                dir="ltr"
                placeholder="07XXXXXXXX"
                value={phone}
                onChange={(event) => setPhone(digitsOnly(event.target.value, 10))}
              />
            </div>
          </div>
          <Button
            size="sm"
            onClick={add}
            disabled={pending || name.trim().length < 2 || phone.length !== 10}
          >
            <UserPlus />
            {pending ? t('adding') : t('add')}
          </Button>
          {/* They sign in with the same phone+OTP flow as everyone else. */}
          <p className="text-muted-foreground text-xs">{t('signInNote')}</p>
        </div>
      ) : (
        <p className="text-muted-foreground border-border border-t pt-3 text-xs">
          {t('ownerOnly')}
        </p>
      )}
    </section>
  );
}

/**
 * Interface language (PRD §6.8).
 *
 * Switching does two things: it navigates to the same page under the new locale so
 * the change is immediate, and it stores the choice on the user — which is also the
 * language their notifications will be written in.
 */
export function LanguagePanel({ current }: { current: 'fa' | 'en' | 'ps' }) {
  const t = useTranslations('shopSettings.language');
  const localeRouter = useLocaleRouter();
  const pathname = usePathname();
  const [pending, startTransition] = React.useTransition();

  const options: Array<{ value: 'fa' | 'en'; label: string }> = [
    { value: 'fa', label: t('fa') },
    { value: 'en', label: t('en') },
  ];

  return (
    <section className="rounded-card border-border bg-card space-y-3 border p-4">
      <div>
        <h2 className="text-sm font-bold">{t('heading')}</h2>
        <p className="text-muted-foreground text-xs">{t('hint')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={option.value === current ? 'default' : 'outline'}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await setDashboardLocale(option.value);
                if (!result.ok) {
                  toast.error(t(`errors.${result.error}` as never));
                  return;
                }
                localeRouter.replace(pathname, { locale: option.value });
              })
            }
          >
            {option.label}
          </Button>
        ))}
      </div>

      {/* Pashto is structurally supported but its strings are deferred (PRD §11). */}
      <p className="text-muted-foreground text-xs">{t('pashtoDeferred')}</p>
    </section>
  );
}
