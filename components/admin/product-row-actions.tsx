'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ExternalLink, EyeOff, MoreHorizontal, Store } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { unpublishProduct } from '@/lib/actions/admin-catalogue';
import { Link } from '@/lib/i18n/navigation';
import type { ProductStatus } from '@/lib/db/schema';

/** The same floor the server enforces — the button stays disabled until it is met. */
const MIN_REASON = 10;

/**
 * The ONLY write admin has over a product (PRD §3.1, §7.2): take it off the
 * storefront. There is deliberately no edit button, no price field, no title
 * field — anywhere on the admin surface.
 *
 * IT IS NOW BEHIND A KEBAB, and that is the point of this file's last change.
 * The page rendered seventy-five outlined red «برداشتن از فروشگاه» buttons, one
 * per row, which made the single destructive action the loudest thing on a
 * screen an admin visits to READ. A wall of red is not a warning — it is
 * wallpaper, and wallpaper is what people click through. Behind a menu the
 * action costs one extra click, which is the correct price for the only control
 * here that takes a shop's listing off the storefront.
 *
 * The menu is not empty for other statuses either: "open the storefront page"
 * and "see this shop" are the two things an admin actually does with a row, and
 * they were previously only reachable from links buried in the row's text.
 *
 * IT ASKS WHY, and the answer goes three places: the `unpublishReason` column
 * the shopkeeper's own catalogue reads, a notification to everyone at the shop,
 * and the audit line.
 */
export function ProductRowActions({
  productId,
  productSlug,
  shopId,
  status,
}: {
  productId: string;
  productSlug: string;
  shopId: string;
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
  const canUnpublish = status === 'published';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0" aria-label={t('rowMenu')}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem asChild>
            <Link href={`/products/${productSlug}`} target="_blank">
              <ExternalLink />
              {t('viewPublic')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            {/* A uuid, never a slug: /admin/shops/[id] is a uuid column and a
                slug reaching it is a Postgres type error (CLAUDE.md). */}
            <Link href={`/admin/shops/${shopId}`}>
              <Store />
              {t('viewShop')}
            </Link>
          </DropdownMenuItem>

          {canUnpublish && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-danger focus:text-danger focus:bg-danger-bg"
                onSelect={(event) => {
                  // The dialog and the menu cannot both own focus; letting the
                  // menu close itself first leaves the dialog opening into a
                  // torn-down focus trap.
                  event.preventDefault();
                  setOpen(true);
                }}
              >
                <EyeOff />
                {t('unpublish')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

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
