'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Heart, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { QuantityStepper } from '@/components/custom/quantity-stepper';
import {
  addCartItem,
  removeCartItem,
  saveCartItemForLater,
  updateCartQuantity,
} from '@/lib/actions/cart';
import { useLocale } from 'next-intl';
import { formatNumber } from '@/lib/format';

/**
 * Quantity, save-for-later and removal for one cart line (PRD §5.3, §5.6).
 *
 * Removal is undoable via the toast action rather than a confirm dialog: a confirm
 * on every line makes editing a basket tedious, while undo costs one tap only when
 * the removal was a mistake.
 *
 * SAVE FOR LATER sits between the two, and it is the one people actually want:
 * without it, a line somebody is not ready to buy gets deleted and then has to
 * be hunted down again. It moves into the wishlist, which already has a route
 * back into the cart.
 */
export function CartLineControls({
  productId,
  quantity,
  stock,
  variantSelection,
}: {
  productId: string;
  quantity: number;
  stock: number;
  variantSelection: string[] | null;
}) {
  const t = useTranslations('cart');
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function setQuantity(next: number) {
    startTransition(async () => {
      const result = await updateCartQuantity(productId, next);
      /*
       * The shop had fewer than asked for. Said out loud, because a stepper
       * that springs back to a different number without a word reads as a bug —
       * and the alternative is meeting the same limit at checkout, where it is
       * a refusal instead of a correction.
       */
      if (result.ok && result.clampedTo !== undefined) {
        toast.info(t('clampedToStock', { count: formatNumber(result.clampedTo, locale) }));
      }
      router.refresh();
    });
  }

  function saveForLater() {
    startTransition(async () => {
      const result = await saveCartItemForLater(productId);
      if (!result.ok) {
        toast.error(t(`saveErrors.${result.error}` as never));
        return;
      }
      router.refresh();
      toast.success(t('savedForLater'), {
        action: {
          label: t('undo'),
          onClick: () => {
            startTransition(async () => {
              await addCartItem({ productId, quantity, variantSelection });
              router.refresh();
            });
          },
        },
      });
    });
  }

  function remove() {
    startTransition(async () => {
      await removeCartItem(productId);
      router.refresh();

      toast.success(t('removed'), {
        action: {
          label: t('undo'),
          onClick: () => {
            startTransition(async () => {
              await addCartItem({ productId, quantity, variantSelection });
              router.refresh();
            });
          },
        },
      });
    });
  }

  return (
    <div className="flex items-center gap-2">
      <QuantityStepper
        value={quantity}
        onChange={setQuantity}
        max={Math.max(1, stock)}
        size="sm"
        disabled={pending}
      />
      <Button
        variant="ghost"
        size="icon"
        onClick={saveForLater}
        disabled={pending}
        aria-label={t('saveForLater')}
        title={t('saveForLater')}
        className="hover:text-primary text-neutral-500"
      >
        <Heart />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={remove}
        disabled={pending}
        aria-label={t('remove')}
        title={t('remove')}
        className="hover:text-danger text-neutral-500"
      >
        <Trash2 />
      </Button>
    </div>
  );
}
