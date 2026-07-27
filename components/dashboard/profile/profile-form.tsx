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
import { saveShopProfile, uploadShopImage } from '@/lib/actions/shop-profile';
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

/** Splits the canonical hours string for the two time inputs. */
function splitHours(hours: string): { open: string; close: string } {
  const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(hours);
  if (!match) return { open: '', close: '' };
  const pad = (value: string) => value.padStart(2, '0');
  return { open: `${pad(match[1])}:${match[2]}`, close: `${pad(match[3])}:${match[4]}` };
}

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

  const set = <K extends keyof ShopProfileValues>(key: K, value: ShopProfileValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const { open, close } = splitHours(values.hours);

  function setHours(nextOpen: string, nextClose: string) {
    // Only a complete pair is a valid value; a half-set range would fail Zod.
    set('hours', nextOpen && nextClose ? `${nextOpen}-${nextClose}` : '');
  }

  function submit() {
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
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
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
                  />
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
              onChange={(event) => set('floor', event.target.value.replace(/\D/g, ''))}
            />
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
              value={open}
              onChange={(event) => setHours(event.target.value, close)}
              className="w-32"
            />
            <span className="text-muted-foreground">—</span>
            <Input
              type="time"
              aria-label={t('closesAt')}
              dir="ltr"
              value={close}
              onChange={(event) => setHours(open, event.target.value)}
              className="w-32"
            />
          </div>
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
