'use client';

import * as React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ImagePlus, Store } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { FieldError } from '@/components/custom/field-error';
import { WeeklyHoursEditor } from '@/components/dashboard/profile/weekly-hours';
import { saveShopProfile, uploadShopImage } from '@/lib/actions/shop-profile';
import { digitsOnly } from '@/lib/digits';
import { formatOpeningHours } from '@/lib/format';

export type ProfileCategory = { id: string; label: string };

export type ShopProfileValues = {
  nameFa: string;
  nameEn: string;
  namePs: string;
  descriptionFa: string;
  descriptionEn: string;
  descriptionPs: string;
  categoryId: string | null;
  floor: string;
  unitNumber: string;
  phone: string;
  /** Canonical "HH:MM-HH:MM", or empty. */
  hours: string;
  logoPath: string | null;
  bannerPath: string | null;
  status: 'pending' | 'approved' | 'suspended' | 'closed';
};

/**
 * Shop profile editor (PRD §6.6).
 *
 * Status is displayed but not editable: approval is admin's decision (PRD §7.1),
 * and a pending shop can still fill in everything here — that is the point of the
 * pending state.
 *
 * Hours are two `<input type="time">` fields rather than free text, and the preview
 * underneath shows the result in the current locale, so the shopkeeper can see that
 * what they set will read correctly in Dari.
 */
export function ProfileForm({
  initial,
  categories,
}: {
  initial: ShopProfileValues;
  categories: ProfileCategory[];
}) {
  const t = useTranslations('shopProfile');
  const locale = useLocale();
  const router = useRouter();

  const [values, setValues] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();

  /*
   * Errors under the FIELDS, not only in a toast (Prompt: errors have no
   * field-level surface). See components/custom/field-error.tsx for the
   * argument; the action returns `fields` keyed by these names.
   */
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const set = <K extends keyof ShopProfileValues>(key: K, value: ShopProfileValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  };

  const fieldError = (field: string) =>
    fieldErrors[field] ? t(`fieldErrors.${fieldErrors[field]}` as never) : null;

  function submit() {
    // The one rule worth catching before the round trip: a phone number that is
    // not an Afghan mobile is the commonest thing typed wrong here.
    if (values.phone && !/^07\d{8}$/.test(values.phone)) {
      setFieldErrors({ phone: 'bad_phone' });
      toast.error(t('errors.bad_phone'));
      return;
    }

    startTransition(async () => {
      const result = await saveShopProfile({
        name: { fa: values.nameFa, en: values.nameEn || null, ps: values.namePs || null },
        description: {
          fa: values.descriptionFa || null,
          en: values.descriptionEn || null,
          ps: values.descriptionPs || null,
        },
        categoryId: values.categoryId,
        floor: values.floor ? Number(values.floor) : null,
        unitNumber: values.unitNumber || null,
        phone: values.phone || null,
        hours: values.hours || null,
      });

      if (!result.ok) {
        setFieldErrors(result.fields ?? {});
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      setFieldErrors({});
      toast.success(t('saved'));
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* Imagery */}
      <section className="rounded-card border-border bg-card space-y-3 border p-4">
        <h2 className="text-sm font-bold">{t('imagesHeading')}</h2>

        <div className="flex flex-wrap items-start gap-4">
          <ImageSlot
            kind="logo"
            path={values.logoPath}
            label={t('logo')}
            hint={t('logoHint')}
            className="h-20 w-20 rounded-full"
          />
          <ImageSlot
            kind="banner"
            path={values.bannerPath}
            label={t('banner')}
            hint={t('bannerHint')}
            className="rounded-card h-20 w-full max-w-xs"
          />
        </div>
      </section>

      {/* Name and description, per language */}
      <section className="rounded-card border-border bg-card space-y-3 border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">{t('contentHeading')}</h2>
          <Badge variant={values.status === 'approved' ? 'success' : 'warning'}>
            {t(`status.${values.status}`)}
          </Badge>
        </div>

        <Tabs defaultValue="fa">
          <TabsList>
            <TabsTrigger value="fa">
              {t('langFa')}
              <Badge variant="destructive" className="ms-1.5">
                {t('required')}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="en">
              {t('langEn')}
              {!values.nameEn.trim() && (
                <Badge variant="outline" className="ms-1.5">
                  {t('missing')}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="ps">
              {t('langPs')}
              {!values.namePs.trim() && (
                <Badge variant="outline" className="ms-1.5">
                  {t('missing')}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {(['fa', 'en', 'ps'] as const).map((lang) => {
            const nameKey = `name${lang === 'fa' ? 'Fa' : lang === 'en' ? 'En' : 'Ps'}` as const;
            const descKey =
              `description${lang === 'fa' ? 'Fa' : lang === 'en' ? 'En' : 'Ps'}` as const;
            return (
              <TabsContent key={lang} value={lang} className="space-y-3 pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`shop-name-${lang}`}>{t('name')}</Label>
                  <Input
                    id={`shop-name-${lang}`}
                    dir={lang === 'en' ? 'ltr' : 'rtl'}
                    value={values[nameKey]}
                    onChange={(event) => set(nameKey, event.target.value)}
                    aria-invalid={lang === 'fa' && fieldError('nameFa') !== null}
                    aria-describedby={
                      lang === 'fa' && fieldError('nameFa') ? 'shop-name-fa-error' : undefined
                    }
                  />
                  {lang === 'fa' && (
                    <FieldError id="shop-name-fa-error" message={fieldError('nameFa')} />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`shop-desc-${lang}`}>{t('description')}</Label>
                  <Textarea
                    id={`shop-desc-${lang}`}
                    dir={lang === 'en' ? 'ltr' : 'rtl'}
                    rows={3}
                    value={values[descKey]}
                    onChange={(event) => set(descKey, event.target.value)}
                  />
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </section>

      {/* Location and contact */}
      <section className="rounded-card border-border bg-card space-y-3 border p-4">
        <h2 className="text-sm font-bold">{t('locationHeading')}</h2>

        <div className="space-y-1.5">
          <Label htmlFor="shop-category">{t('category')}</Label>
          <Select
            value={values.categoryId ?? undefined}
            onValueChange={(value) => set('categoryId', value)}
          >
            <SelectTrigger id="shop-category">
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

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="shop-floor">{t('floor')}</Label>
            <Input
              id="shop-floor"
              inputMode="numeric"
              dir="ltr"
              value={values.floor}
              onChange={(event) => set('floor', digitsOnly(event.target.value))}
              aria-invalid={fieldError('floor') !== null}
              aria-describedby={fieldError('floor') ? 'shop-floor-error' : undefined}
            />
            <FieldError id="shop-floor-error" message={fieldError('floor')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shop-unit">{t('unit')}</Label>
            <Input
              id="shop-unit"
              dir="ltr"
              value={values.unitNumber}
              onChange={(event) => set('unitNumber', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shop-phone">{t('phone')}</Label>
            <Input
              id="shop-phone"
              inputMode="tel"
              dir="ltr"
              placeholder="07XXXXXXXX"
              value={values.phone}
              onChange={(event) => set('phone', digitsOnly(event.target.value, 10))}
              aria-invalid={fieldError('phone') !== null}
              aria-describedby={fieldError('phone') ? 'shop-phone-error' : undefined}
            />
            <FieldError id="shop-phone-error" message={fieldError('phone')} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t('hours')}</Label>
          {/*
            Per-day hours, still inside the same free-text column — see
            components/dashboard/profile/weekly-hours.tsx for the canonical
            format and why it did not need a schema change.
          */}
          <WeeklyHoursEditor
            value={values.hours}
            onChange={(next) => set('hours', next)}
            error={fieldError('hours')}
          />
          {/* Shown the way a customer will read it. */}
          {values.hours && (
            <p className="text-muted-foreground text-xs">
              {t('hoursPreview', { value: formatOpeningHours(values.hours, locale) })}
            </p>
          )}
        </div>
      </section>

      <div className="bg-background/95 rounded-card border-border sticky bottom-16 z-20 border p-3 backdrop-blur-md md:bottom-0">
        <Button onClick={submit} disabled={pending || !values.nameFa.trim()}>
          {pending ? t('saving') : t('save')}
        </Button>
      </div>
    </div>
  );
}

function ImageSlot({
  kind,
  path,
  label,
  hint,
  className,
}: {
  kind: 'logo' | 'banner';
  path: string | null;
  label: string;
  hint: string;
  className?: string;
}) {
  const t = useTranslations('shopProfile');
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    startTransition(async () => {
      const result = await uploadShopImage(kind, formData);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('imageUpdated'));
      router.refresh();
    });
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">{label}</p>
      <label className="block cursor-pointer">
        <span
          className={`border-input hover:border-primary relative block overflow-hidden border border-dashed bg-neutral-100 ${className ?? ''}`}
        >
          {path ? (
            <Image src={path} alt="" fill sizes="160px" className="object-cover" />
          ) : (
            <span className="text-muted-foreground flex h-full w-full items-center justify-center">
              {kind === 'logo' ? (
                <Store className="h-5 w-5" aria-hidden />
              ) : (
                <ImagePlus className="h-5 w-5" aria-hidden />
              )}
            </span>
          )}
        </span>
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={onChange}
          disabled={pending}
        />
      </label>
      <p className="text-muted-foreground text-xs">{pending ? t('uploading') : hint}</p>
    </div>
  );
}
