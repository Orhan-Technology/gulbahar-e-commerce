'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { saveOffer } from '@/lib/actions/shop-promotions';
import { digitsOnly } from '@/lib/digits';
import { formatCurrency, formatNumber } from '@/lib/format';

export type OfferProduct = { id: string; title: string; price: number };

export type OfferDraft = {
  id?: string;
  nameFa: string;
  nameEn: string;
  type: 'percent' | 'fixed';
  value: string;
  scope: 'shop' | 'products';
  productIds: string[];
  startsAt: string;
  endsAt: string;
};

/** `datetime-local` needs "YYYY-MM-DDTHH:mm" in LOCAL time, not an ISO string. */
function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/*
 * NOT exported. A function living in a 'use client' module cannot be CALLED from a
 * server component — only rendered as a component or passed as a prop — and the
 * failure is a runtime 500 ("Attempted to call … from the server"). The page passes
 * `now` as an ISO string instead and the draft is built here.
 */
function emptyOfferDraft(now: Date): OfferDraft {
  const week = new Date(now.getTime() + 7 * 86_400_000);
  return {
    nameFa: '',
    nameEn: '',
    type: 'percent',
    value: '10',
    scope: 'products',
    productIds: [],
    startsAt: toLocalInput(now),
    endsAt: toLocalInput(week),
  };
}

/**
 * Create or edit an offer (PRD §6.4, §8.1).
 *
 * The discount preview is the important part of this dialog: a shopkeeper entering
 * "30" needs to see what 30% does to their actual prices before they commit,
 * because the offer goes live on the storefront with no approval step.
 */
export function OfferDialog({
  initial,
  now,
  products,
  trigger,
}: {
  /** Omitted when creating; `now` then seeds an empty draft. */
  initial?: OfferDraft;
  /** ISO timestamp from the server, so the client renders no impure clock read. */
  now: string;
  products: OfferProduct[];
  trigger?: React.ReactNode;
}) {
  const t = useTranslations('shopPromotions.offerForm');
  const locale = useLocale();
  const router = useRouter();

  const seed = React.useMemo(() => initial ?? emptyOfferDraft(new Date(now)), [initial, now]);

  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(seed);
  const [pending, startTransition] = React.useTransition();

  // Re-seed the form when the dialog is reopened for a different offer, adjusted
  // during render rather than in an effect.
  const [lastId, setLastId] = React.useState(seed.id);
  if (lastId !== seed.id) {
    setLastId(seed.id);
    setDraft(seed);
  }

  const set = <K extends keyof OfferDraft>(key: K, value: OfferDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const numericValue = Number(digitsOnly(draft.value)) || 0;

  /** What the customer would pay, on the products actually in scope. */
  const preview = React.useMemo(() => {
    const inScope =
      draft.scope === 'shop'
        ? products
        : products.filter((product) => draft.productIds.includes(product.id));

    return inScope.slice(0, 3).map((product) => ({
      ...product,
      after:
        draft.type === 'percent'
          ? Math.max(Math.round(product.price * (1 - numericValue / 100)), 0)
          : Math.max(product.price - numericValue, 0),
    }));
  }, [draft.scope, draft.productIds, draft.type, numericValue, products]);

  function submit() {
    startTransition(async () => {
      const result = await saveOffer({
        id: draft.id,
        name: { fa: draft.nameFa, en: draft.nameEn || null },
        type: draft.type,
        value: numericValue,
        scope: draft.scope,
        productIds: draft.scope === 'products' ? draft.productIds : undefined,
        // datetime-local gives local time; Date normalises it to UTC for storage.
        startsAt: new Date(draft.startsAt).toISOString(),
        endsAt: new Date(draft.endsAt).toISOString(),
      });

      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(draft.id ? t('saved') : t('created'));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus />
            {t('newOffer')}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{draft.id ? t('editTitle') : t('newTitle')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="offer-name-fa">{t('nameFa')}</Label>
              <Input
                id="offer-name-fa"
                value={draft.nameFa}
                onChange={(event) => set('nameFa', event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-name-en">{t('nameEn')}</Label>
              <Input
                id="offer-name-en"
                dir="ltr"
                value={draft.nameEn}
                onChange={(event) => set('nameEn', event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('type')}</Label>
            <RadioGroup
              value={draft.type}
              onValueChange={(value) => set('type', value as OfferDraft['type'])}
              className="flex gap-4"
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="percent" />
                {t('typePercent')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="fixed" />
                {t('typeFixed')}
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="offer-value">
              {draft.type === 'percent' ? t('valuePercent') : t('valueFixed')}
            </Label>
            <Input
              id="offer-value"
              inputMode="numeric"
              dir="ltr"
              value={draft.value}
              onChange={(event) => set('value', digitsOnly(event.target.value))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('scope')}</Label>
            <RadioGroup
              value={draft.scope}
              onValueChange={(value) => set('scope', value as OfferDraft['scope'])}
              className="flex gap-4"
            >
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="products" />
                {t('scopeProducts')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="shop" />
                {t('scopeShop')}
              </label>
            </RadioGroup>
          </div>

          {draft.scope === 'products' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{t('pickProducts')}</Label>
                <span className="text-muted-foreground text-xs">
                  {t('selectedCount', { count: formatNumber(draft.productIds.length, locale) })}
                </span>
              </div>
              <ul className="border-border rounded-control max-h-48 space-y-1 overflow-y-auto border p-2">
                {products.map((product) => (
                  <li key={product.id}>
                    <label className="rounded-control flex cursor-pointer items-center gap-2 p-1.5 text-sm hover:bg-neutral-50">
                      <Checkbox
                        checked={draft.productIds.includes(product.id)}
                        onCheckedChange={(checked) =>
                          set(
                            'productIds',
                            checked
                              ? [...draft.productIds, product.id]
                              : draft.productIds.filter((id) => id !== product.id),
                          )
                        }
                      />
                      <span className="clamp-1 flex-1">{product.title}</span>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {formatCurrency(product.price, locale)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="offer-start">{t('startsAt')}</Label>
              <Input
                id="offer-start"
                type="datetime-local"
                dir="ltr"
                value={draft.startsAt}
                onChange={(event) => set('startsAt', event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-end">{t('endsAt')}</Label>
              <Input
                id="offer-end"
                type="datetime-local"
                dir="ltr"
                value={draft.endsAt}
                onChange={(event) => set('endsAt', event.target.value)}
              />
            </div>
          </div>

          {/* Preview on real prices, so a mistyped value is obvious before it ships. */}
          {numericValue > 0 && preview.length > 0 && (
            <div className="rounded-control space-y-1.5 bg-neutral-50 p-3">
              <p className="text-muted-foreground text-xs">{t('preview')}</p>
              {preview.map((product) => (
                <div key={product.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="clamp-1">{product.title}</span>
                  <span className="shrink-0">
                    <span className="text-muted-foreground line-through">
                      {formatCurrency(product.price, locale)}
                    </span>{' '}
                    <span className="text-foreground font-medium">
                      {formatCurrency(product.after, locale)}
                    </span>
                  </span>
                </div>
              ))}
              {preview.some((product) => product.after === 0) && (
                <Badge variant="destructive">{t('zeroWarning')}</Badge>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={pending || !draft.nameFa.trim() || numericValue <= 0}>
            {pending ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
