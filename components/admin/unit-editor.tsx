'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Check, MapPin, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { assignShopUnit } from '@/lib/actions/admin-shops';
import { formatNumber, formatUnitNumber } from '@/lib/format';

/**
 * Move a tenant to another unit, from the floor view (Prompt C11).
 *
 * TAP THE UNIT NUMBER TO CHANGE IT — the same idiom as the shopkeeper's stock
 * editor, because it is the same shape of task: one small correction in a long
 * list, where opening a form page would cost more than the edit.
 *
 * NOT OPTIMISTIC, unlike stock. A unit clash is refused by the server, and a
 * number that appeared to change and then snapped back would leave the admin
 * unsure which of the two shops is now where — on the screen whose whole value
 * is being true about that.
 */
export function UnitEditor({
  shopId,
  floor,
  unitNumber,
}: {
  shopId: string;
  floor: number;
  unitNumber: string | null;
}) {
  const t = useTranslations('adminFloors.unitEditor');
  const locale = useLocale();
  const router = useRouter();

  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(unitNumber ?? '');
  const [pending, startTransition] = React.useTransition();

  function commit() {
    const next = value.trim();
    if (!next || next === (unitNumber ?? '')) {
      setValue(unitNumber ?? '');
      setEditing(false);
      return;
    }

    startTransition(async () => {
      const result = await assignShopUnit({ shopId, floor, unitNumber: next });
      if (!result.ok) {
        setValue(unitNumber ?? '');
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      setEditing(false);
      toast.success(t('moved', { unit: next }));
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={t('edit')}
        className="rounded-control hover:text-primary inline-flex items-center gap-1 px-1 py-0.5 text-xs hover:bg-neutral-100"
      >
        <MapPin className="h-3 w-3 opacity-60" aria-hidden />
        {t('unit', {
          floor: formatNumber(floor, locale),
          unit: formatUnitNumber(unitNumber, locale) || '—',
        })}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Input
        autoFocus
        value={value}
        inputMode="numeric"
        dir="ltr"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') {
            setValue(unitNumber ?? '');
            setEditing(false);
          }
        }}
        aria-label={t('edit')}
        className="h-7 w-20 text-center text-xs"
        disabled={pending}
      />
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={commit} aria-label={t('save')}>
        <Check className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => {
          setValue(unitNumber ?? '');
          setEditing(false);
        }}
        aria-label={t('cancel')}
      >
        <X className="h-3 w-3" />
      </Button>
    </span>
  );
}
