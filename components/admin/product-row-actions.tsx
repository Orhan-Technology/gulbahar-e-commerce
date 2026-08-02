'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { EyeOff } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { unpublishProduct } from '@/lib/actions/admin-catalogue';
import type { ProductStatus } from '@/lib/db/schema';

/** The same floor the server enforces — the button stays disabled until it is met. */
const MIN_REASON = 10;

/**
 * The ONLY write admin has over a product (PRD §3.1, §7.2): take it off the
 * storefront. There is deliberately no edit button, no price field, no title field
 * — anywhere on the admin surface.
 *
 * IT NOW ASKS WHY, and the answer goes three places: the `unpublishReason`
 * column the shopkeeper's own catalogue reads, a notification to everyone at
 * the shop, and the audit line. Before this the listing simply vanished — the
 * one decision in the console that happened without a stated reason, on a
 * surface whose whole argument is that decisions carry them.
 */
export function ProductRowActions({
  productId,
  status,
}: {
  productId: string;
  status: ProductStatus;
}) {
  const t = useTranslations('adminProducts');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [pending, startTransition] = React.useTransition();

  // Only a live listing can be taken down. A draft is already invisible, and an
  // ARCHIVED product is a shopkeeper's delete — offering to unpublish or
  // republish something the shop has thrown away would be the mall reaching
  // into a catalogue decision that is not its own (PRD §3.1).
  if (status !== 'published') return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-danger hover:bg-danger-bg shrink-0"
      >
        <EyeOff />
        {t('unpublish')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('unpublishTitle')}</DialogTitle>
            <DialogDescription>{t('unpublishBody')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={`unpublish-${productId}`}>{t('reasonLabel')}</Label>
            <Textarea
              id={`unpublish-${productId}`}
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('reasonPlaceholder')}
            />
            <p className="text-muted-foreground text-xs">{t('reasonNote')}</p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={pending || reason.trim().length < MIN_REASON}
              onClick={() =>
                startTransition(async () => {
                  const result = await unpublishProduct({ productId, reason });
                  if (!result.ok) {
                    toast.error(t(`errors.${result.error}` as never));
                    return;
                  }
                  toast.success(t('unpublished'));
                  setOpen(false);
                  setReason('');
                  router.refresh();
                })
              }
            >
              {pending ? t('working') : t('confirmUnpublish')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
