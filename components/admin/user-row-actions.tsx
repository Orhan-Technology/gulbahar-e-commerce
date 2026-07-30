'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { UserCheck, UserCog, UserX } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { setUserActive, setUserRole } from '@/lib/actions/admin-catalogue';
import type { UserRole } from '@/lib/db/schema';

/**
 * Per-user decisions (PRD §7.5, Prompt A4): change the role, or lock the account.
 *
 * Deactivation is a sign-in block, not a delete: orders reference their user with
 * ON DELETE RESTRICT so history cannot be erased, and that is deliberate. The
 * dialog says as much, because "deactivate" reads like "remove" otherwise.
 *
 * The role change asks for a NOTE and will not proceed without one. It is the
 * most consequential control on this screen — promoting to admin hands over the
 * platform — and the note is delivered to the person it happened to as an in-app
 * notification, so the reason lands somewhere real instead of in a field that
 * gets discarded.
 */
export function UserRowActions({
  userId,
  role,
  active,
  isSelf,
}: {
  userId: string;
  role: UserRole;
  active: boolean;
  isSelf: boolean;
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
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setNextRole(role);
          setRoleOpen(true);
        }}
        className="text-neutral-600"
      >
        <UserCog />
        {t('changeRole')}
      </Button>

      {active ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          className="hover:text-danger text-neutral-600"
        >
          <UserX />
          {t('deactivate')}
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run(true)}>
          <UserCheck />
          {t('reactivate')}
        </Button>
      )}

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
