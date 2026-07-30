'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { updatePublishedLocales } from '@/lib/actions/admin-settings';
import type { AppLocale } from '@/lib/i18n/routing';

/**
 * Which languages the storefront offers (Prompt A4).
 *
 * Two rows are deliberately NOT editable, and each says why rather than
 * appearing greyed with no explanation (A3):
 *
 * - Dari is the default locale and the one every seeded string exists in.
 *   Unpublishing it would leave the storefront with no complete language.
 * - Pashto has structure but deferred strings (PRD §11). Publishing it would
 *   hand a visitor a half-translated shop, so it is listed honestly as
 *   structure-only rather than hidden, which would suggest it does not exist.
 *
 * The default locale itself is shown read-only: it is compiled into next-intl's
 * routing table and into every generated path, so it is a deploy-time decision
 * and a select here would be a control that silently does nothing.
 */
export function LocaleSettings({
  published,
  defaultLocale,
  all,
}: {
  published: AppLocale[];
  defaultLocale: string;
  all: readonly AppLocale[];
}) {
  const t = useTranslations('adminSettings');
  const router = useRouter();
  const [selected, setSelected] = React.useState<AppLocale[]>(published);
  const [pending, startTransition] = React.useTransition();

  function toggle(locale: AppLocale, checked: boolean) {
    setSelected((current) =>
      checked ? [...new Set([...current, locale])] : current.filter((value) => value !== locale),
    );
  }

  function onSave() {
    startTransition(async () => {
      const result = await updatePublishedLocales(selected);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('saved'));
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-control flex items-center gap-2 bg-neutral-50 p-3">
        <Lock className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
        <div>
          <p className="text-sm font-medium">
            {t('defaultLocale')}: {t(`locales.${defaultLocale}` as never)}
          </p>
          <p className="text-muted-foreground text-xs">{t('defaultLocaleHint')}</p>
        </div>
      </div>

      <ul className="space-y-2">
        {all.map((locale) => {
          const locked = locale === 'fa' || locale === 'ps';
          return (
            <li key={locale} className="flex items-start gap-2.5">
              <Checkbox
                id={`locale-${locale}`}
                checked={locale === 'ps' ? false : selected.includes(locale)}
                disabled={locked}
                onCheckedChange={(checked) => toggle(locale, checked === true)}
              />
              <div className="min-w-0">
                <Label htmlFor={`locale-${locale}`} className="text-sm">
                  {t(`locales.${locale}` as never)}
                </Label>
                {locked && (
                  <p className="text-muted-foreground text-xs">
                    {locale === 'fa' ? t('localeRequired') : t('localeStructureOnly')}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Button size="sm" onClick={onSave} disabled={pending}>
        {pending ? t('saving') : t('save')}
      </Button>
    </div>
  );
}
