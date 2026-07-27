'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { addCartItem } from '@/lib/actions/cart';
import { toggleWishlist } from '@/lib/actions/wishlist';
import { useRouter } from '@/lib/i18n/navigation';

/**
 * Move-to-cart from the wishlist (PRD §5.6).
 *
 * "Move" means exactly that: added to the cart AND removed from the wishlist. If
 * the add fails the wishlist entry is left alone, so the item is never lost.
 */
export function MoveToCartButton({
  productId,
  disabled,
}: {
  productId: string;
  disabled?: boolean;
}) {
  const t = useTranslations('wishlist');
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      size="sm"
      className="w-full"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const added = await addCartItem({ productId, quantity: 1 });
          if (!added.ok) {
            toast.error(t(`errors.${added.error}` as never));
            return;
          }
          await toggleWishlist(productId, false);
          toast.success(t('moved'));
          router.refresh();
        })
      }
    >
      <ShoppingCart />
      {disabled ? t('outOfStock') : t('moveToCart')}
    </Button>
  );
}
