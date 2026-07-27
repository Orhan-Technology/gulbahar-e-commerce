'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Check, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { PriceDisplay } from '@/components/custom/price-display';
import { QuantityStepper } from '@/components/custom/quantity-stepper';
import { WishlistButton } from '@/components/shop/wishlist-button';
import { addCartItem } from '@/lib/actions/cart';
import { formatNumber } from '@/lib/format';
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
  compact = false,
}: BuyPanelProps & { compact?: boolean }) {
  const t = useTranslations('product');
  const locale = useLocale();
  const router = useRouter();

  const [quantity, setQuantity] = React.useState(1);
  const [selection, setSelection] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();
  const [added, setAdded] = React.useState(false);

  const outOfStock = stock <= 0;
  const lowStock = !outOfStock && stock <= LOW_STOCK_THRESHOLD;

  function onAdd() {
    startTransition(async () => {
      const result = await addCartItem({
        productId,
        quantity,
        variantSelection:
          variants.length > 0 ? variants.map((v) => selection[v.id] ?? v.options[0]) : null,
      });

      if (!result.ok) {
        toast.error(t(`cartError.${result.error}` as never));
        return;
      }

      setAdded(true);
      // Refresh so the header badge picks up the new count from the server.
      router.refresh();
      window.setTimeout(() => setAdded(false), 1600);
    });
  }

  const addButton = (
    <Button
      onClick={onAdd}
      disabled={outOfStock || pending}
      size="lg"
      className={cn(
        'flex-1 transition-colors duration-200',
        added && 'bg-success hover:bg-success',
      )}
    >
      {added ? <Check /> : <ShoppingCart />}
      {outOfStock ? t('outOfStock') : added ? t('addedToCart') : t('addToCart')}
    </Button>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <PriceDisplay price={price} discountPrice={discountPrice} size="md" />
        {addButton}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PriceDisplay price={price} discountPrice={discountPrice} size="lg" showDiscountPercent />

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
        {!outOfStock && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">{t('quantity')}</span>
            <QuantityStepper value={quantity} onChange={setQuantity} max={stock} />
          </div>
        )}

        <div className="flex gap-2">
          {addButton}
          <WishlistButton productId={productId} initialSaved={initialSaved} variant="inline" />
        </div>
      </div>
    </div>
  );
}
