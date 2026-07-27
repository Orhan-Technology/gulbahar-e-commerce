'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateSlot } from '@/lib/actions/admin-promotions';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';

export type SlotRow = {
  id: string;
  key: string;
  name: string;
  capacity: number;
  pricePerWeek: number;
  occupied: number;
  occupancy: number;
};

/**
 * Slot inventory editor (PRD §7.3).
 *
 * Occupancy sits next to price because that pairing IS the pricing decision: a slot
 * running at capacity is underpriced, one sitting empty is not worth what is being
 * asked. Editing is inline — two numbers per row, and a dialog would be ceremony.
 *
 * A price change applies to future bookings only; existing campaigns keep the
 * price they were sold at (see lib/actions/admin-promotions.ts).
 */
export function SlotManager({ slots }: { slots: SlotRow[] }) {
  const t = useTranslations('adminPromotions.slots');
  const locale = useLocale();

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">{t('priceNote')}</p>
      <ul className="space-y-2">
        {slots.map((slot) => (
          <SlotCard key={slot.id} slot={slot} locale={locale} />
        ))}
      </ul>
    </div>
  );
}

function SlotCard({ slot, locale }: { slot: SlotRow; locale: string }) {
  const t = useTranslations('adminPromotions.slots');
  const router = useRouter();

  const [editing, setEditing] = React.useState(false);
  const [capacity, setCapacity] = React.useState(String(slot.capacity));
  const [price, setPrice] = React.useState(String(slot.pricePerWeek));
  const [pending, startTransition] = React.useTransition();

  // Re-sync after a server refresh, adjusted during render rather than in an effect.
  const [lastValues, setLastValues] = React.useState(`${slot.capacity}-${slot.pricePerWeek}`);
  const current = `${slot.capacity}-${slot.pricePerWeek}`;
  if (lastValues !== current) {
    setLastValues(current);
    setCapacity(String(slot.capacity));
    setPrice(String(slot.pricePerWeek));
  }

  function save() {
    startTransition(async () => {
      const result = await updateSlot({
        slotId: slot.id,
        capacity: Number(capacity) || 0,
        pricePerWeek: Number(price) || 0,
      });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('saved'));
      setEditing(false);
      router.refresh();
    });
  }

  const full = slot.occupancy >= 1;

  return (
    <li className="rounded-card border-border bg-card flex flex-wrap items-center gap-4 border p-4">
      <div className="min-w-40 flex-1">
        <p className="text-sm font-bold">{slot.name}</p>
        <p className="text-muted-foreground text-xs" dir="ltr">
          {slot.key}
        </p>
      </div>

      {editing ? (
        <>
          <div className="space-y-1">
            <Label htmlFor={`cap-${slot.id}`} className="text-xs">
              {t('capacity')}
            </Label>
            <Input
              id={`cap-${slot.id}`}
              inputMode="numeric"
              dir="ltr"
              className="h-9 w-20"
              value={capacity}
              onChange={(event) => setCapacity(event.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`price-${slot.id}`} className="text-xs">
              {t('pricePerWeek')}
            </Label>
            <Input
              id={`price-${slot.id}`}
              inputMode="numeric"
              dir="ltr"
              className="h-9 w-28"
              value={price}
              onChange={(event) => setPrice(event.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div className="flex items-end gap-1">
            <Button size="sm" onClick={save} disabled={pending}>
              <Check />
              {t('save')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setCapacity(String(slot.capacity));
                setPrice(String(slot.pricePerWeek));
                setEditing(false);
              }}
            >
              <X />
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="text-end">
            <p className="text-accent-700 text-sm font-bold">
              {t('perWeek', { price: formatCurrency(slot.pricePerWeek, locale) })}
            </p>
            <p className="text-muted-foreground text-xs">
              {t('capacityValue', { count: formatNumber(slot.capacity, locale) })}
            </p>
          </div>

          {/* Occupancy: the number that says whether the price is right. */}
          <div className="min-w-32">
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{t('occupancy')}</span>
              <span className="font-medium">{formatPercent(slot.occupancy, locale)}</span>
            </div>
            <div className="rounded-pill h-1.5 w-full overflow-hidden bg-neutral-100">
              <div
                className={`rounded-pill h-full ${full ? 'bg-success' : 'bg-primary-400'}`}
                style={{ width: `${Math.round(slot.occupancy * 100)}%` }}
              />
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {t('occupied', {
                occupied: formatNumber(slot.occupied, locale),
                capacity: formatNumber(slot.capacity, locale),
              })}
            </p>
          </div>

          {full && <Badge variant="success">{t('full')}</Badge>}

          <Button
            variant="ghost"
            size="icon"
            aria-label={t('edit')}
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
        </>
      )}
    </li>
  );
}
