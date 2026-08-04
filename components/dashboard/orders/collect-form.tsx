'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, PackageCheck, PartyPopper } from 'lucide-react';
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
 *
 * THE MATCH GETS A BEAT (Prompt: the signature moment).
 *
 * A code matching is the end of the whole loop — the customer walked in, the
 * parcel goes over the counter, the money is earned — and it used to be
 * acknowledged by a toast in a corner that was gone in four seconds. This is
 * the interaction a shopkeeper shows the shop next door. So the card itself
 * turns over: the form is replaced in place by a confirmation that says the
 * sale is recorded and where the money went, and it STAYS until the shopkeeper
 * says they are done or the timer below runs out. Nothing scrolls, nothing
 * vanishes, and the toast is gone — a moment worth having is not a notification.
 */

/**
 * How long the confirmation holds the card before the row settles into its
 * fulfilled state.
 *
 * Long enough to be read twice and looked up from; short enough that a card
 * left alone behind a counter does not sit on a stale panel all afternoon. The
 * shopkeeper can always end it sooner, and the poll is held off meanwhile
 * (see `data-hold-refresh` in components/dashboard/live-refresh.tsx).
 */
const CELEBRATION_MS = 12_000;

export function CollectForm({ orderId }: { orderId: string }) {
  const t = useTranslations('shopOrders.collect');
  const router = useRouter();

  const [code, setCode] = React.useState('');
  const [collected, setCollected] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const ready = code.length >= COLLECTION_CODE_LENGTH;

  /*
   * The refresh is DEFERRED, not skipped: the row really is fulfilled now and
   * the screen has to catch up eventually. `router.refresh()` is not a state
   * write, so this effect breaks no React 19 rule; it is a timer that owns the
   * end of the moment rather than a render that races it.
   */
  React.useEffect(() => {
    if (collected === null) return;
    const timer = window.setTimeout(() => router.refresh(), CELEBRATION_MS);
    return () => window.clearTimeout(timer);
  }, [collected, router]);

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
      // No toast: the card below IS the confirmation, and two of them for one
      // event reads as the screen saying the same thing twice.
      setCollected(result.data.reference);
    });
  }

  if (collected !== null) {
    return (
      <div
        /* Tells the ten-second poll to wait — without it a refresh landing here
           would unmount this subtree (the order is fulfilled, so its controls
           are gone) and the moment would be over before it was read. */
        data-hold-refresh
        role="status"
        className="rounded-card border-success-border bg-success-bg motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 w-full space-y-2 border p-4 duration-200"
      >
        <p className="text-success flex items-center gap-2 text-sm font-bold">
          {/*
            THE ANIMATION IS GATED, NEVER THE FEEDBACK. `prefers-reduced-motion`
            means remove the movement, not remove the confirmation — a reader
            who has asked for less motion gets the identical card, held for the
            identical time, without the rise.
          */}
          <PartyPopper className="h-5 w-5 shrink-0" aria-hidden />
          {t('celebrateTitle')}
        </p>
        <p className="text-success/90 text-xs leading-relaxed">
          {t('celebrateBody', { reference: collected })}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setCollected(null);
            router.refresh();
          }}
        >
          <Check />
          {t('celebrateDismiss')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-1.5" data-collect-form>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`collect-${orderId}`} className="text-xs">
            {t('label')}
          </Label>
          <Input
            id={`collect-${orderId}`}
            value={code}
            onChange={(event) => setCode(normaliseCollectionCode(event.target.value))}
            /*
             * DASHES, NOT «AC7K4» (Prompt C11).
             *
             * The placeholder was a well-formed five-character code sitting in
             * the field of every ready order — indistinguishable from a real
             * one at a glance, and a shopkeeper comparing it against the code
             * on a customer's screen has no way to know it is furniture. One
             * slot per character says "type here, this long" and cannot be
             * mistaken for data. Built from the length constant so it can
             * never drift from the code the system actually issues, and not a
             * translated string because it is not language.
             */
            placeholder={'–'.repeat(COLLECTION_CODE_LENGTH)}
            autoComplete="off"
            spellCheck={false}
            maxLength={COLLECTION_CODE_LENGTH}
            dir="ltr"
            aria-describedby={`collect-hint-${orderId}`}
            className="h-9 w-32 text-center font-mono text-base tracking-widest"
          />
        </div>

        <Button type="submit" size="sm" disabled={pending || !ready}>
          <PackageCheck />
          {pending ? t('saving') : t('submit')}
        </Button>
      </div>

      {/* PERMANENT, not a placeholder that vanishes on the first keystroke: it
          says where the code comes from, which is the one thing a shopkeeper
          doing this for the first time does not know. */}
      <p id={`collect-hint-${orderId}`} className="text-muted-foreground text-2xs">
        {t('hint')}
      </p>
    </form>
  );
}
