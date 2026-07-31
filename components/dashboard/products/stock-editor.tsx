'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { setProductStock } from '@/lib/actions/shop-products';
import { formatNumber } from '@/lib/format';

/*
 * Extracted from the product table so the C10 stock report can offer the SAME
 * control. Two inline editors for one number is how they end up disagreeing
 * about what happens on Escape, or about whether the toast appears — and the
 * report exists precisely so a shopkeeper can fix stock without leaving it.
 */

/**
 * Tap the stock number to edit it; saves on blur or Enter with a toast.
 *
 * Optimistic display with rollback: the number changes immediately and reverts if
 * the action fails, so the list never shows a value the database does not hold.
 */
export function StockEditor({ productId, stock }: { productId: string; stock: number }) {
  const t = useTranslations('shopProducts');
  const locale = useLocale();
  const router = useRouter();

  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(String(stock));
  const [shown, setShown] = React.useState(stock);
  const [pending, startTransition] = React.useTransition();

  // Re-sync when the server sends a new value, adjusted during render rather than
  // in an effect (which would cascade).
  const [lastStock, setLastStock] = React.useState(stock);
  if (lastStock !== stock) {
    setLastStock(stock);
    setShown(stock);
    setValue(String(stock));
  }

  function commit() {
    setEditing(false);
    const next = Number(value.replace(/\D/g, ''));
    if (!Number.isInteger(next) || next === shown) {
      setValue(String(shown));
      return;
    }

    const previous = shown;
    setShown(next);

    startTransition(async () => {
      const result = await setProductStock(productId, next);
      if (!result.ok) {
        setShown(previous);
        setValue(String(previous));
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('stockSaved', { count: formatNumber(next, locale) }));
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-control text-foreground inline-flex items-center gap-1 px-1.5 py-0.5 font-medium hover:bg-neutral-100"
        aria-label={t('editStock')}
      >
        {t('stockLabel', { count: formatNumber(shown, locale) })}
        <Pencil className="h-3 w-3 opacity-60" aria-hidden />
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Input
        autoFocus
        value={value}
        inputMode="numeric"
        onChange={(event) => setValue(event.target.value.replace(/\D/g, ''))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') {
            setValue(String(shown));
            setEditing(false);
          }
        }}
        onBlur={commit}
        aria-label={t('editStock')}
        className="h-7 w-16 text-xs"
        disabled={pending}
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={commit}
        aria-label={t('save')}
      >
        <Check className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => {
          setValue(String(shown));
          setEditing(false);
        }}
        aria-label={t('cancel')}
      >
        <X className="h-3 w-3" />
      </Button>
    </span>
  );
}
