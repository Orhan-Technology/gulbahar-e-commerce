'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Lock, Pencil } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateProfile } from '@/lib/actions/account';
import { formatDate, formatPhone } from '@/lib/format';
import { Link, useRouter } from '@/lib/i18n/navigation';

export type ProfilePanelData = {
  name: string;
  phone: string;
  locale: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  hasPassword: boolean;
  passwordUpdatedAt: Date | null;
  defaultAddress: string | null;
};

/**
 * "Profile information" — the reference's per-field panel (Prompt A2).
 *
 * The rule that shapes every row: a field with nothing in it shows the ACTION
 * that would fill it, never an empty value or a "not set" dash. "Add email" is
 * a door; "Email: —" is a dead end that makes the account look broken rather
 * than incomplete.
 *
 * Only the name edits in place. Phone cannot be edited at all — it is the
 * account identity (A1) and says so, with a lock rather than a disabled pencil,
 * because a greyed-out control invites people to hunt for how to enable it.
 * Email and password lead to /account/security, where the flows that verify
 * and re-authenticate already live; duplicating those multi-step forms into a
 * side panel would mean two implementations of the same rules.
 */
export function ProfilePanel({ data }: { data: ProfilePanelData }) {
  const t = useTranslations('account');

  return (
    <section
      className="rounded-card border-border bg-card space-y-1 border p-4"
      aria-labelledby="profile-panel-heading"
    >
      <h2 id="profile-panel-heading" className="mb-2 text-sm font-bold">
        {t('panel.heading')}
      </h2>

      <dl className="divide-border divide-y">
        <NameRow name={data.name} locale={data.locale} />

        <Row label={t('panel.phone')}>
          <span className="flex items-center gap-1.5">
            <span className="text-sm tabular-nums" dir="ltr">
              {formatPhone(data.phone, data.locale)}
            </span>
            <Lock className="h-3 w-3 shrink-0 text-neutral-400" aria-hidden />
          </span>
          <p className="text-2xs mt-0.5 text-neutral-500">{t('panel.phoneIsIdentity')}</p>
        </Row>

        <Row label={t('panel.email')}>
          {data.email && data.emailVerifiedAt ? (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="min-w-0 truncate text-sm" dir="ltr">
                {data.email}
              </span>
              <Badge variant="secondary" className="gap-1">
                <Check className="h-3 w-3" aria-hidden />
                {t('security.emailVerified')}
              </Badge>
            </span>
          ) : (
            <PanelAction href="/account/security" label={t('security.addEmail')} />
          )}
        </Row>

        <Row label={t('panel.password')}>
          {data.hasPassword ? (
            <span className="text-sm">
              {data.passwordUpdatedAt
                ? t('security.passwordUpdatedOn', {
                    date: formatDate(data.passwordUpdatedAt, data.locale),
                  })
                : t('panel.passwordSet')}
            </span>
          ) : (
            <PanelAction href="/account/security" label={t('security.setPassword')} />
          )}
        </Row>

        <Row label={t('panel.defaultAddress')}>
          {data.defaultAddress ? (
            <Link
              href="/account/addresses"
              className="hover:text-primary text-sm underline-offset-2 hover:underline"
            >
              {data.defaultAddress}
            </Link>
          ) : (
            <PanelAction href="/account/addresses" label={t('addAddress')} />
          )}
        </Row>

        <Row label={t('panel.language')}>
          <Link
            href="/account/settings"
            className="hover:text-primary text-sm underline-offset-2 hover:underline"
          >
            {t(`locales.${data.locale}` as never)}
          </Link>
        </Row>
      </dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5">
      <dt className="text-2xs text-neutral-500">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function PanelAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-primary text-sm font-semibold underline-offset-2 hover:underline"
    >
      {label}
    </Link>
  );
}

/** The one row that edits in place — everything else is a link or is locked. */
function NameRow({ name, locale }: { name: string; locale: string }) {
  const t = useTranslations('account');
  const uiLocale = useLocale();
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('name') ?? '');

    startTransition(async () => {
      // The locale travels unchanged: this row edits a name, and folding a
      // language change into it would move the page out from under the reader.
      const result = await updateProfile({ name: value, locale });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('profileSaved'));
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <Row label={t('panel.fullName')}>
        <span className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm font-medium">{name}</span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-control shrink-0 p-1 text-neutral-500 transition-colors duration-150 hover:bg-neutral-100 hover:text-foreground"
            aria-label={t('panel.editName')}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      </Row>
    );
  }

  return (
    <Row label={t('panel.fullName')}>
      <form onSubmit={onSubmit} className="space-y-2">
        <Label htmlFor="panel-name" className="sr-only">
          {t('panel.fullName')}
        </Label>
        <Input
          id="panel-name"
          name="name"
          defaultValue={name}
          required
          minLength={2}
          maxLength={80}
          autoFocus
          lang={uiLocale}
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? t('saving') : t('save')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            {t('cancel')}
          </Button>
        </div>
      </form>
    </Row>
  );
}
