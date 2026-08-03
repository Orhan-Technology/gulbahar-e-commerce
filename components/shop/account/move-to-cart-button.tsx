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
 *
 * THE LABEL SAYS MOVE, because the card disappears. It read «افزودن به سبد»
 * ("add to cart") and then the item vanished off the wishlist, which looks like
 * the save was lost rather than spent — the reverse direction already words
 * itself honestly as «نگه‌داشتن برای بعد» / «به فهرست علاقه‌مندی‌ها منتقل شد»,
 * and this is the same sentence pointing the other way. The toast carries a
 * link to the cart for the same reason: the thing the customer just moved is
 * now on a screen they are not looking at.
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
          /*
           * `movedToCart` / `moveToCartAction` rather than the original
           * `moved` / `moveToCart`: the patch pipeline that carries these
           * strings deep-merges and never overwrites an existing leaf, so
           * re-wording a shipped key means introducing a new one. The two old
           * keys are now unreferenced.
           */
          toast.success(t('movedToCart'), {
            action: { label: t('goToCart'), onClick: () => router.push('/cart') },
          });
          router.refresh();
        })
      }
    >
      <ShoppingCart />
      {disabled ? t('outOfStock') : t('moveToCartAction')}
    </Button>
  );
}
