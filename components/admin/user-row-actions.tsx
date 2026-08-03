'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MoreHorizontal, Store, UserCheck, UserCog, UserX } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { setUserActive, setUserRole } from '@/lib/actions/admin-catalogue';
import { Link } from '@/lib/i18n/navigation';
import type { UserRole } from '@/lib/db/schema';

/** What the shop behind this account would be left with. Pre-formatted server-side. */
export type ShopConsequence = {
  id: string;
  name: string;
  /** Persian-digit strings — every number on this surface goes through lib/format. */
  publishedProducts: string;
  openOrders: string;
  hasOpenOrders: boolean;
};

/**
 * Per-user decisions (PRD §7.5, Prompt A4): change the role, or lock the account.
 *
 * BOTH LIVE BEHIND A KEBAB, and that is deliberate. These are the two most
 * consequential controls in the console — one hands over the platform, the
 * other stops a tenant signing in — and they were also the two most-rendered
 * pieces of UI on it: two hundred rows, four hundred buttons, «تغییر نقش» and
 * «غیرفعال‌کردن» repeated down the page until they read as decoration. Risk and
 * repetition should run in opposite directions.
 *
 * Deactivation is a sign-in block, not a delete: orders reference their user with
 * ON DELETE RESTRICT so history cannot be erased, and that is deliberate. The
 * dialog says as much, because "deactivate" reads like "remove" otherwise.
 *
 * AND IT NOW NAMES THE SHOP IT WOULD STRAND. Locking a shopkeeper leaves their
 * shop published, with live products and possibly unanswered orders, and nobody
 * able to sign in and accept one. The admin was making that decision blind; the
 * dialog now puts the count of listings and open orders in front of them before
 * the confirm button, and points at the shop.
 *
 * The role change asks for a NOTE and will not proceed without one. The note is
 * delivered to the person it happened to as an in-app notification, so the
 * reason lands somewhere real instead of in a field that gets discarded.
 */
export function UserRowActions({
  userId,
  role,
  active,
  isSelf,
  shop,
}: {
  userId: string;
  role: UserRole;
  active: boolean;
  isSelf: boolean;
  /** Present only for an account that owns a shop — see the note above. */
  shop?: ShopConsequence | null;
}) {
  const t = useTranslations('adminUsers');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [roleOpen, setRoleOpen] = React.useState(false);
  const [nextRole, setNextRole] = React.useState<UserRole>(role);
  const [note, setNote] = React.useState('');
  const [pending, startTransition] = React.useTransition();

  // An admin locking themselves out — or demoting themselves — mid-demo would
  // need a database console to fix.
  if (isSelf) return null;

  function run(next: boolean) {
    startTransition(async () => {
      const result = await setUserActive(userId, next);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t(next ? 'reactivated' : 'deactivated'));
      setOpen(false);
      router.refresh();
    });
  }

  function saveRole() {
    startTransition(async () => {
      const result = await setUserRole({ userId, role: nextRole, note });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('roleChanged'));
      setRoleOpen(false);
      setNote('');
      router.refresh();
    });
  }

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('rowMenu')}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          {shop && (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/admin/shops/${shop.id}`}>
                  <Store />
                  {t('viewShop')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuItem
            onSelect={(event) => {
              // The menu must not tear its focus trap down under an opening
              // dialog — see the same note on ProductRowActions.
              event.preventDefault();
              setNextRole(role);
              setRoleOpen(true);
            }}
          >
            <UserCog />
            {t('changeRole')}
          </DropdownMenuItem>

          {active ? (
            <DropdownMenuItem
              className="text-danger focus:text-danger focus:bg-danger-bg"
              onSelect={(event) => {
                event.preventDefault();
                setOpen(true);
              }}
            >
              <UserX />
              {t('deactivate')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                run(true);
              }}
            >
              <UserCheck />
              {t('reactivate')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('roleTitle')}</DialogTitle>
            <DialogDescription>{t('roleBody')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="next-role">{t('colRole')}</Label>
              <Select value={nextRole} onValueChange={(value) => setNextRole(value as UserRole)}>
                <SelectTrigger id="next-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['customer', 'shopkeeper', 'admin'] as const).map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`roles.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {nextRole === 'shopkeeper' && role !== 'shopkeeper' && (
                <p className="text-muted-foreground text-xs">{t('roleShopkeeperHint')}</p>
              )}
              {/* Demoting the owner of a live shop is the same stranding as a
                  deactivation, so it is named in the same words. */}
              {shop && role === 'shopkeeper' && nextRole !== 'shopkeeper' && (
                <p className="rounded-control border-warning-border bg-warning-bg text-warning-fg border-s-2 p-2 text-xs leading-relaxed">
                  {t('roleShopWarning', { shop: shop.name })}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role-note">{t('roleNote')}</Label>
              <Textarea
                id="role-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                maxLength={200}
                placeholder={t('roleNotePlaceholder')}
              />
              <p className="text-muted-foreground text-xs">{t('roleNoteHint')}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRoleOpen(false)} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button
              disabled={pending || note.trim().length < 3 || nextRole === role}
              onClick={saveRole}
            >
              {pending ? t('working') : t('confirmRole')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deactivateTitle')}</DialogTitle>
            <DialogDescription>{t('deactivateBody')}</DialogDescription>
          </DialogHeader>

          {/* THE CONSEQUENCE, before the button rather than after the fact. */}
          {shop && (
            <div
              data-deactivate-consequence
              className={
                shop.hasOpenOrders
                  ? 'rounded-control border-danger-border bg-danger-bg border-s-2 p-3'
                  : 'rounded-control border-warning-border bg-warning-bg border-s-2 p-3'
              }
            >
              <p
                className={
                  shop.hasOpenOrders
                    ? 'text-danger text-xs font-bold'
                    : 'text-warning-fg text-xs font-bold'
                }
              >
                {t('deactivateShopTitle', { shop: shop.name })}
              </p>
              <p
                className={
                  shop.hasOpenOrders
                    ? 'text-danger/90 mt-1 text-xs leading-relaxed'
                    : 'text-warning-fg/80 mt-1 text-xs leading-relaxed'
                }
              >
                {t('deactivateShopBody', {
                  products: shop.publishedProducts,
                  orders: shop.openOrders,
                })}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => run(false)}>
              {pending ? t('working') : t('confirmDeactivate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
