'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, Check, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { PriceDisplay } from '@/components/custom/price-display';
import { QuantityStepper } from '@/components/custom/quantity-stepper';
import { WishlistButton } from '@/components/shop/wishlist-button';
import { addCartItem } from '@/lib/actions/cart';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export type BuyPanelVariant = {
  id: string;
  name: string;
  options: string[];
};

export type BuyPanelProps = {
  productId: string;
  price: number;
  discountPrice: number | null;
  stock: number;
  variants: BuyPanelVariant[];
  initialSaved: boolean;
  /**
   * Vacation mode on the SHOP that sells this product (lib/pause.ts).
   *
   * The ISO date trading resumes, or null when the shop is trading. A string,
   * and already decided by the server: this is a client component and may not
   * read a clock during render (React 19 purity, CLAUDE.md), so it is told
   * whether the shop is paused rather than working it out.
   */
  pausedUntil?: string | null;
  /** The shopkeeper's own words, already localised by the server. */
  pauseNote?: string | null;
};

const LOW_STOCK_THRESHOLD = 5;

/**
 * Variant selection, quantity, and add-to-cart (PRD §5.2).
 *
 * The add-to-cart acknowledgement (PRD §10.6) is a state flip on the button
 * itself rather than a flying-image animation: it survives a slow action, needs no
 * measurement of two moving targets, and still reads as a confirmation. The cart
 * badge increments because the action revalidates and the layout re-renders.
 *
 * Renders twice on a product page — inline, and inside the sticky mobile bar — so
 * `compact` trims it to price plus button.
 */
export function BuyPanel({
  productId,
  price,
  discountPrice,
  stock,
  variants,
  initialSaved,
  pausedUntil = null,
  pauseNote = null,
  compact = false,
}: BuyPanelProps & { compact?: boolean }) {
  const t = useTranslations('product');
  const locale = useLocale();
  const router = useRouter();

  const [quantity, setQuantity] = React.useState(1);
  const [selection, setSelection] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();
  const [added, setAdded] = React.useState(false);

  /*
   * A PAUSED SHOP CANNOT SELL, and the button has to say so rather than fail
   * afterwards. This is presentation only — the shop is closed for orders in the
   * database too, and the cart and checkout must refuse the line regardless
   * (a disabled button is a courtesy, never the rule).
   *
   * Kept separate from `outOfStock`: the product is there, the stock is there,
   * and the reason is a person being away — which is why the copy names a date
   * instead of saying "unavailable".
   */
  const paused = Boolean(pausedUntil);
  // Parsing a prop is pure; it is READING the clock that render may not do.
  const backOn = pausedUntil ? formatDate(pausedUntil, locale, 'medium') : '';
  const outOfStock = stock <= 0;
  const blocked = outOfStock || paused;
  const lowStock = !outOfStock && stock <= LOW_STOCK_THRESHOLD;
  const saving = discountPrice !== null && discountPrice < price ? price - discountPrice : 0;

  async function add() {
    const result = await addCartItem({
      productId,
      quantity,
      variantSelection:
        variants.length > 0 ? variants.map((v) => selection[v.id] ?? v.options[0]) : null,
    });

    if (!result.ok) {
      toast.error(t(`cartError.${result.error}` as never));
      return false;
    }
    return true;
  }

  function onAdd() {
    startTransition(async () => {
      if (!(await add())) return;

      setAdded(true);
      // Refresh so the header badge picks up the new count from the server.
      router.refresh();
      window.setTimeout(() => setAdded(false), 1600);
    });
  }

  /*
   * Buy now is add-to-cart plus a jump to checkout, not a second purchase path.
   * A separate express flow would have to duplicate the cart's offer, stock and
   * delivery-fee rules, and the two would drift.
   */
  function onBuyNow() {
    startTransition(async () => {
      if (!(await add())) return;
      router.push('/checkout');
    });
  }

  const addButton = (
    <Button
      onClick={onAdd}
      disabled={blocked || pending}
      size="lg"
      className={cn(
        'flex-1 transition-colors duration-200',
        added && 'bg-success hover:bg-success',
      )}
    >
      {paused ? <CalendarClock /> : added ? <Check /> : <ShoppingCart />}
      {paused
        ? t('paused.button')
        : outOfStock
          ? t('outOfStock')
          : added
            ? t('addedToCart')
            : t('addToCart')}
    </Button>
  );

  /*
   * The HONEST LINE under a disabled button. A control that is simply greyed out
   * makes the reader wonder whether the page is broken; a date turns it into a
   * plan, and the shopkeeper's own note — when they wrote one — is the part that
   * makes it read like a shop rather than a system message.
   */
  const pausedNotice = paused ? (
    <div className="rounded-control border-warning-border bg-warning-bg flex gap-2 border p-3">
      <CalendarClock className="text-warning-fg mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="text-warning-fg text-sm font-semibold">
          {t('paused.title', { date: backOn })}
        </p>
        <p className="text-warning-fg/85 text-xs leading-relaxed">{t('paused.body')}</p>
        {pauseNote && <p className="text-warning-fg/85 text-xs leading-relaxed">«{pauseNote}»</p>}
      </div>
    </div>
  ) : null;

  if (compact) {
    return (
      <div className="space-y-2">
        {/* On the mobile bar the notice is one line: the full explanation is in
            the panel further up the same page, and a three-line warning inside
            a sticky bar would swallow the screen it is pinned to. */}
        {paused && (
          <p className="text-warning-fg flex items-center gap-1.5 text-xs font-medium">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t('paused.title', { date: backOn })}
          </p>
        )}
        <div className="flex items-center gap-3">
          <PriceDisplay price={price} discountPrice={discountPrice} size="md" />
          {addButton}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <PriceDisplay price={price} discountPrice={discountPrice} size="lg" showDiscountPercent />
        {saving > 0 && (
          <p className="text-success text-sm font-semibold">
            {t('youSave', { amount: formatNumber(saving, locale) })}
          </p>
        )}
      </div>

      {/* Stock status chip */}
      <div>
        {outOfStock ? (
          <span className="rounded-pill bg-danger-bg text-danger inline-flex px-2.5 py-1 text-xs font-semibold">
            {t('outOfStock')}
          </span>
        ) : lowStock ? (
          <span className="rounded-pill bg-warning-bg text-warning-fg inline-flex px-2.5 py-1 text-xs font-semibold">
            {t('lowStock', { count: formatNumber(stock, locale) })}
          </span>
        ) : (
          <span className="rounded-pill bg-success-bg text-success inline-flex px-2.5 py-1 text-xs font-semibold">
            {t('inStock')}
          </span>
        )}
      </div>

      {pausedNotice}

      {/* Variant pills */}
      {variants.map((variant) => (
        <fieldset key={variant.id} className="space-y-2">
          <legend className="text-foreground text-sm font-medium">{variant.name}</legend>
          <div className="flex flex-wrap gap-2">
            {variant.options.map((option, index) => {
              const active = (selection[variant.id] ?? variant.options[0]) === option;
              return (
                <button
                  key={`${variant.id}-${index}`}
                  type="button"
                  onClick={() => setSelection((current) => ({ ...current, [variant.id]: option }))}
                  aria-pressed={active}
                  className={cn(
                    'rounded-pill border px-3 py-1.5 text-sm transition-colors duration-150',
                    active
                      ? 'border-primary bg-primary-50 text-primary font-semibold'
                      : 'border-input bg-card hover:border-primary',
                  )}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}

      {/* Quantity + actions */}
      <div className="space-y-3">
        {!blocked && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{t('quantity')}</span>
            <QuantityStepper value={quantity} onChange={setQuantity} max={stock} />
          </div>
        )}

        <div className="flex gap-2">
          {addButton}
          <WishlistButton productId={productId} initialSaved={initialSaved} variant="inline" />
        </div>

        {!blocked && (
          <Button
            onClick={onBuyNow}
            disabled={pending}
            size="lg"
            variant="outline"
            className="w-full"
          >
            {t('buyNow')}
          </Button>
        )}
      </div>
    </div>
  );
}
