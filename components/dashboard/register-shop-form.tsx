'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Store } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { registerShop } from '@/lib/actions/shop-registration';
import { formatOpeningHours } from '@/lib/format';
import { useRouter as useLocaleRouter } from '@/lib/i18n/navigation';

export type RegistrationCategory = { id: string; label: string };

export type RegistrationValues = {
  nameFa: string;
  nameEn: string;
  descriptionFa: string;
  categoryId: string | null;
  floor: string;
  unitNumber: string;
  phone: string;
  hours: string;
};

/**
 * Shop registration / resubmission (PRD §13.1).
 *
 * Deliberately short: name, category, where in the mall, how to reach you. Everything
 * else — logo, banner, products, hours per language — is added afterwards from the
 * profile screen, because a long form is what stops a tenant finishing sign-up at a
 * counter on a phone.
 *
 * The same form handles amendment after a rejection, with the reason shown above it.
 */
export function RegisterShopForm({
  initial,
  categories,
  rejectionReason,
}: {
  initial: RegistrationValues;
  categories: RegistrationCategory[];
  rejectionReason: string | null;
}) {
  const t = useTranslations('shopRegistration');
  const locale = useLocale();
  const router = useRouter();
  const localeRouter = useLocaleRouter();

  const [values, setValues] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();

  const set = <K extends keyof RegistrationValues>(key: K, value: RegistrationValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const hoursMatch = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(values.hours);
  const pad = (value: string) => value.padStart(2, '0');
  const open = hoursMatch ? `${pad(hoursMatch[1])}:${hoursMatch[2]}` : '';
  const close = hoursMatch ? `${pad(hoursMatch[3])}:${hoursMatch[4]}` : '';

  function setHours(nextOpen: string, nextClose: string) {
    set('hours', nextOpen && nextClose ? `${nextOpen}-${nextClose}` : '');
  }

  function submit() {
    startTransition(async () => {
      const result = await registerShop({
        nameFa: values.nameFa,
        nameEn: values.nameEn || null,
        descriptionFa: values.descriptionFa || null,
        categoryId: values.categoryId,
        floor: values.floor ? Number(values.floor) : null,
        unitNumber: values.unitNumber || null,
        phone: values.phone || null,
        hours: values.hours || null,
      });

      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }

      toast.success(result.data.resubmitted ? t('resubmitted') : t('submitted'));
      /*
       * The session carries shopId, so a brand-new shop needs the JWT refreshed
       * before the dashboard guard will let them in — the auth config re-resolves
       * the shop link on an explicit update (see lib/auth/index.ts).
       */
      router.refresh();
      localeRouter.replace('/dashboard');
    });
  }

  return (
    <div className="space-y-5">
      {rejectionReason && (
        <section className="rounded-card border-danger-border bg-danger-bg space-y-1 border p-4">
          <p className="text-danger text-sm font-bold">{t('rejectedHeading')}</p>
          <p className="text-danger/90 text-sm">{rejectionReason}</p>
          <p className="text-danger/80 text-xs">{t('rejectedHint')}</p>
        </section>
      )}

      <section className="rounded-card border-border bg-card space-y-3 border p-4">
        <div className="flex items-center gap-2">
          <Store className="text-primary h-4 w-4" aria-hidden />
          <h2 className="text-sm font-bold">{t('detailsHeading')}</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="reg-name-fa">{t('nameFa')}</Label>
            <Input
              id="reg-name-fa"
              value={values.nameFa}
              onChange={(event) => set('nameFa', event.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg-name-en">{t('nameEn')}</Label>
            <Input
              id="reg-name-en"
              dir="ltr"
              value={values.nameEn}
              onChange={(event) => set('nameEn', event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reg-category">{t('category')}</Label>
          <Select
            value={values.categoryId ?? undefined}
            onValueChange={(value) => set('categoryId', value)}
          >
            <SelectTrigger id="reg-category">
              <SelectValue placeholder={t('categoryHint')} />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="reg-description">{t('description')}</Label>
          <Textarea
            id="reg-description"
            rows={3}
            value={values.descriptionFa}
            onChange={(event) => set('descriptionFa', event.target.value)}
            placeholder={t('descriptionHint')}
          />
        </div>
      </section>

      <section className="rounded-card border-border bg-card space-y-3 border p-4">
        <h2 className="text-sm font-bold">{t('locationHeading')}</h2>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="reg-floor">{t('floor')}</Label>
            <Input
              id="reg-floor"
              inputMode="numeric"
              dir="ltr"
              value={values.floor}
              onChange={(event) => set('floor', event.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg-unit">{t('unit')}</Label>
            <Input
              id="reg-unit"
              dir="ltr"
              value={values.unitNumber}
              onChange={(event) => set('unitNumber', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reg-phone">{t('phone')}</Label>
            <Input
              id="reg-phone"
              inputMode="tel"
              dir="ltr"
              placeholder="07XXXXXXXX"
              value={values.phone}
              onChange={(event) => set('phone', event.target.value.replace(/\D/g, '').slice(0, 10))}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t('hours')}</Label>
          <div className="flex items-center gap-2">
            <Input
              type="time"
              aria-label={t('opensAt')}
              dir="ltr"
              className="w-32"
              value={open}
              onChange={(event) => setHours(event.target.value, close)}
            />
            <span className="text-muted-foreground">—</span>
            <Input
              type="time"
              aria-label={t('closesAt')}
              dir="ltr"
              className="w-32"
              value={close}
              onChange={(event) => setHours(open, event.target.value)}
            />
          </div>
          {values.hours && (
            <p className="text-muted-foreground text-xs">
              {formatOpeningHours(values.hours, locale)}
            </p>
          )}
        </div>
      </section>

      {/* Set the expectation clearly: pending is a working state, not a waiting room. */}
      <p className="rounded-card border-primary-200 bg-primary-50 text-primary p-3 text-xs">
        {t('pendingExplainer')}
      </p>

      <Button onClick={submit} disabled={pending || values.nameFa.trim().length < 2}>
        {pending ? t('submitting') : rejectionReason ? t('resubmit') : t('submit')}
      </Button>
    </div>
  );
}
