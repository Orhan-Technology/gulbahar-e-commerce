'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { addStaff, removeStaff, setDashboardLocale } from '@/lib/actions/shop-settings';
import { usePathname, useRouter as useLocaleRouter } from '@/lib/i18n/navigation';

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

/** Staff roster (PRD §6.8). Only the owner sees the controls. */
export function StaffPanel({ staff, canManage }: { staff: StaffMember[]; canManage: boolean }) {
  const t = useTranslations('shopSettings.staff');
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
                {member.phone}
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
                onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
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
