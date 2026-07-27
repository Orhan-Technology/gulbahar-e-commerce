'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { QuantityStepper } from '@/components/custom/quantity-stepper';
import { addCartItem, removeCartItem, updateCartQuantity } from '@/lib/actions/cart';

/**
 * Quantity and removal for one cart line (PRD §5.3).
 *
 * Removal is undoable via the toast action rather than a confirm dialog: a confirm
 * on every line makes editing a basket tedious, while undo costs one tap only when
 * the removal was a mistake.
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
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function setQuantity(next: number) {
    startTransition(async () => {
      await updateCartQuantity(productId, next);
      router.refresh();
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
        onClick={remove}
        disabled={pending}
        aria-label={t('remove')}
        className="hover:text-danger text-neutral-500"
      >
        <Trash2 />
      </Button>
    </div>
  );
}
