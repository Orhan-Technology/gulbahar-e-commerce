'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Loader2, ShieldCheck, Smartphone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/format';

/**
 * Simulated HesabPay payment sheet (PRD §9.1).
 *
 * There is no integration and no network call — this is a styled, branded sheet
 * with a confirm step and a success beat. It is deliberately honest about being a
 * demo: nothing here claims a payment was actually taken.
 *
 * The states are: review → authorising → approved. The approved beat holds for a
 * moment before handing control back, because the confirmation is the point of the
 * animation (PRD §10.5).
 */
type Stage = 'review' | 'authorising' | 'approved';

export function HesabPaySheet({
  open,
  amount,
  onOpenChange,
  onApproved,
}: {
  open: boolean;
  amount: number;
  onOpenChange: (open: boolean) => void;
  onApproved: () => void;
}) {
  const t = useTranslations('checkout.hesabpaySheet');
  const locale = useLocale();
  const [stage, setStage] = React.useState<Stage>('review');

  /*
   * Reset whenever the sheet is reopened, so a second attempt starts clean.
   *
   * Adjusted DURING RENDER against the previous `open` value rather than in an
   * effect: mirroring a prop into state via an effect causes a cascading render
   * and is flagged by react-hooks/set-state-in-effect. This is React's documented
   * pattern for "reset state when a prop changes".
   */
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setStage('review');
  }

  function authorise() {
    setStage('authorising');
    window.setTimeout(() => {
      setStage('approved');
      // Hold the success state briefly, then continue.
      window.setTimeout(onApproved, 900);
    }, 1100);
  }

  return (
    <Dialog open={open} onOpenChange={stage === 'review' ? onOpenChange : undefined}>
      <DialogContent className="max-w-sm overflow-hidden p-0">
        <DialogTitle className="sr-only">{t('title')}</DialogTitle>

        {/* Branded header — HesabPay's own colour, not ours, so it reads as a
            third-party sheet the way the real one would. */}
        <div className="bg-hesabpay px-5 py-4 text-white">
          <div className="flex items-center gap-2">
            <span className="rounded-control flex h-8 w-8 items-center justify-center bg-white/15">
              <Smartphone className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-bold">{t('title')}</p>
              <p className="text-xs opacity-80">{t('subtitle')}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <div className="text-center">
            <p className="text-muted-foreground text-xs">{t('amountLabel')}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(amount, locale)}</p>
          </div>

          {stage === 'review' && (
            <>
              <p className="rounded-control text-muted-foreground bg-neutral-100 px-3 py-2 text-xs">
                {t('demoNotice')}
              </p>
              <Button onClick={authorise} size="lg" className="w-full">
                <ShieldCheck />
                {t('confirm')}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
                {t('cancel')}
              </Button>
            </>
          )}

          {stage === 'authorising' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="text-primary h-8 w-8 animate-spin" aria-hidden />
              <p className="text-muted-foreground text-sm">{t('authorising')}</p>
            </div>
          )}

          {stage === 'approved' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <span className="animate-heart-pop rounded-pill bg-success text-success-fg flex h-14 w-14 items-center justify-center">
                <Check className="h-7 w-7" aria-hidden />
              </span>
              <p className="text-success text-sm font-semibold">{t('approved')}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
