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
import { unpublishProduct } from '@/lib/actions/admin-catalogue';

/**
 * The ONLY write admin has over a product (PRD §3.1, §7.2): take it off the
 * storefront. There is deliberately no edit button, no price field, no title field
 * — anywhere on the admin surface.
 *
 * Confirmed, because it makes a tenant's listing disappear, and the dialog states
 * that the shop can put it back.
 */
export function ProductRowActions({
  productId,
  status,
}: {
  productId: string;
  status: 'draft' | 'published' | 'unpublished';
}) {
  const t = useTranslations('adminProducts');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  // Only a live listing can be taken down; a draft is already invisible.
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

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await unpublishProduct(productId);
                  if (!result.ok) {
                    toast.error(t(`errors.${result.error}` as never));
                    return;
                  }
                  toast.success(t('unpublished'));
                  setOpen(false);
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
