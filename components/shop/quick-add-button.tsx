'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, Plus, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

import { addCartItem } from '@/lib/actions/cart';
import { cn } from '@/lib/utils';

/**
 * Add to cart from a card, without leaving the page (Prompt P5).
 *
 * On a rail the product is already decided — the shopper recognises it and
 * wants it in the basket — and making them open the product page to press the
 * same button is a detour that loses about half of them.
 *
 * DOES NOT NAVIGATE, and does not open the cart. The confirmation is the button
 * flipping to a tick plus a toast, the same acknowledgement the product page
 * uses (PRD §10.6); a redirect to the cart from a rail would throw away the
 * browsing the shopper was in the middle of.
 *
 * Absent when the product is out of stock. A disabled control on a card is a
 * question ("why not?") that the card has no room to answer — the card's own
 * out-of-stock treatment already says it.
 */
export function QuickAddButton({
  productId,
  disabled = false,
  className,
}: {
  productId: string;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations('product');
  const router = useRouter();
  const [added, setAdded] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  if (disabled) return null;

  function add(event: React.MouseEvent) {
    // The card is a link; without this the click both adds and navigates.
    event.preventDefault();
    event.stopPropagation();

    startTransition(async () => {
      const result = await addCartItem({ productId, quantity: 1, variantSelection: null });
      if (!result.ok) {
        toast.error(t(`cartError.${result.error}` as never));
        return;
      }

      setAdded(true);
      toast.success(t('addedToCart'));
      // The header's cart badge is server-rendered, so it only moves on a
      // refresh — without this the basket silently disagrees with the toast.
      router.refresh();
      window.setTimeout(() => setAdded(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={add}
      disabled={pending}
      aria-label={t('addToCart')}
      className={cn(
        'rounded-pill bg-card/95 text-foreground shadow-card hover:bg-primary hover:text-primary-foreground absolute end-2 bottom-2 z-10 flex h-9 w-9 items-center justify-center backdrop-blur transition-[background-color,color,scale] duration-150 ease-out active:scale-95',
        added && 'bg-success text-primary-foreground',
        className,
      )}
    >
      {added ? (
        <Check className="h-4 w-4" aria-hidden />
      ) : (
        <span className="relative flex items-center justify-center">
          <ShoppingCart className="h-4 w-4" aria-hidden />
          <Plus className="absolute -end-1.5 -top-1.5 h-2.5 w-2.5" aria-hidden />
        </span>
      )}
    </button>
  );
}
