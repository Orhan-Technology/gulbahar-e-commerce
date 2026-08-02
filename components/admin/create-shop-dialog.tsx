'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createShopWithOwner } from '@/lib/actions/admin-shops';
// Persian digits, not `\D`: JS classes are ASCII-only, so an ASCII
// sanitiser deletes «۵۰۰» keystroke by keystroke and the field a Dari
// admin types into stays empty. One shared helper, lib/digits.ts.
import { digitsOnly } from '@/lib/digits';

export type CreateShopCategory = { id: string; label: string };

/**
 * Admin creates a shop on a tenant's behalf (PRD §7.1, §13.1).
 *
 * The alternative onboarding path: many Gulbahar tenants will simply ask mall
 * management to set things up. The shop lands approved — admin has vetted it by
 * definition — and the owner claims it by signing in with the phone number entered
 * here, so there is no claim token to lose.
 */
export function CreateShopDialog({
  categories,
  trigger,
}: {
  categories: CreateShopCategory[];
  trigger: React.ReactNode;
}) {
  const t = useTranslations('adminShops.create');
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [form, setForm] = React.useState({
    nameFa: '',
    nameEn: '',
    categoryId: '',
    floor: '',
    unitNumber: '',
    ownerName: '',
    ownerPhone: '',
  });

  const set = <K extends keyof typeof form>(key: K, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  function submit() {
    startTransition(async () => {
      const result = await createShopWithOwner({
        nameFa: form.nameFa,
        nameEn: form.nameEn || null,
        categoryId: form.categoryId || null,
        floor: form.floor ? Number(form.floor) : null,
        unitNumber: form.unitNumber || null,
        ownerName: form.ownerName,
        ownerPhone: form.ownerPhone,
      });

      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(result.data.ownerCreated ? t('createdWithOwner') : t('createdExistingOwner'));
      setOpen(false);
      setForm({
        nameFa: '',
        nameEn: '',
        categoryId: '',
        floor: '',
        unitNumber: '',
        ownerName: '',
        ownerPhone: '',
      });
      router.refresh();
    });
  }

  const ready =
    form.nameFa.trim().length >= 2 &&
    form.ownerName.trim().length >= 2 &&
    /^07\d{8}$/.test(form.ownerPhone);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="create-name-fa">{t('nameFa')}</Label>
              <Input
                id="create-name-fa"
                value={form.nameFa}
                onChange={(event) => set('nameFa', event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-name-en">{t('nameEn')}</Label>
              <Input
                id="create-name-en"
                dir="ltr"
                value={form.nameEn}
                onChange={(event) => set('nameEn', event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="create-category">{t('category')}</Label>
            <Select
              value={form.categoryId || undefined}
              onValueChange={(value) => set('categoryId', value)}
            >
              <SelectTrigger id="create-category">
                <SelectValue placeholder={t('categoryHint')} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="create-floor">{t('floor')}</Label>
              <Input
                id="create-floor"
                inputMode="numeric"
                dir="ltr"
                value={form.floor}
                onChange={(event) => set('floor', digitsOnly(event.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-unit">{t('unit')}</Label>
              <Input
                id="create-unit"
                dir="ltr"
                value={form.unitNumber}
                onChange={(event) => set('unitNumber', event.target.value)}
              />
            </div>
          </div>

          <div className="border-border space-y-3 border-t pt-3">
            <p className="text-sm font-medium">{t('ownerHeading')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="create-owner-name">{t('ownerName')}</Label>
                <Input
                  id="create-owner-name"
                  value={form.ownerName}
                  onChange={(event) => set('ownerName', event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-owner-phone">{t('ownerPhone')}</Label>
                <Input
                  id="create-owner-phone"
                  inputMode="tel"
                  dir="ltr"
                  placeholder="07XXXXXXXX"
                  value={form.ownerPhone}
                  onChange={(event) =>
                    set('ownerPhone', digitsOnly(event.target.value, 10))
                  }
                />
              </div>
            </div>
            {/* Set the expectation: this is how the tenant gets in. */}
            <p className="text-muted-foreground text-xs">{t('claimNote')}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={pending || !ready}>
            {pending ? t('creating') : t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
