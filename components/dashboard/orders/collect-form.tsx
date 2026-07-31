'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PackageCheck } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { collectOrder } from '@/lib/actions/shop-orders';
import { COLLECTION_CODE_LENGTH, normaliseCollectionCode } from '@/lib/collection-code';

/**
 * The counter: match the code, hand the parcel over (Prompt C11).
 *
 * TYPED, NOT TAPPED. A "mark collected" button would work and would be wrong —
 * the whole point of the code is that the shopkeeper checks the person in front
 * of them against the parcel in their hand, and a button they can press without
 * looking removes exactly the step that prevents the wrong bag going out.
 *
 * The input NORMALISES AS YOU TYPE: uppercase, no dashes, no spaces. Customers
 * read the code out with the dash the display puts in, and a shopkeeper who
 * types what they hear should not be told they got it wrong.
 *
 * A MISMATCH IS NOT AN ERROR STATE, it is information: the code belongs to a
 * different order. The toast says that rather than "invalid", and the field
 * keeps what was typed so the two can be compared.
 */
export function CollectForm({ orderId }: { orderId: string }) {
  const t = useTranslations('shopOrders.collect');
  const router = useRouter();

  const [code, setCode] = React.useState('');
  const [pending, startTransition] = React.useTransition();

  const ready = code.length >= COLLECTION_CODE_LENGTH;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready) return;

    startTransition(async () => {
      const result = await collectOrder({ orderId, code });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      setCode('');
      toast.success(t('done', { reference: result.data.reference }));
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2" data-collect-form>
      <div className="space-y-1">
        <Label htmlFor={`collect-${orderId}`} className="text-xs">
          {t('label')}
        </Label>
        <Input
          id={`collect-${orderId}`}
          value={code}
          onChange={(event) => setCode(normaliseCollectionCode(event.target.value))}
          placeholder={t('placeholder')}
          autoComplete="off"
          spellCheck={false}
          maxLength={COLLECTION_CODE_LENGTH}
          dir="ltr"
          className="h-9 w-32 text-center font-mono text-base tracking-widest"
        />
      </div>

      <Button type="submit" size="sm" disabled={pending || !ready}>
        <PackageCheck />
        {pending ? t('saving') : t('submit')}
      </Button>
    </form>
  );
}
