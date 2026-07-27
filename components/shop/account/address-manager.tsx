'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { deleteAddress, saveAddress } from '@/lib/actions/account';
import { useRouter } from '@/lib/i18n/navigation';

export type ManagedAddress = {
  id: string;
  label: string;
  district: string;
  streetDetails: string;
  phone: string;
};

/** Saved-address CRUD (PRD §5.4). */
export function AddressManager({
  addresses,
  districts,
}: {
  addresses: ManagedAddress[];
  districts: string[];
}) {
  const t = useTranslations('account');
  const router = useRouter();
  const [editing, setEditing] = React.useState<ManagedAddress | 'new' | null>(null);
  const [pending, startTransition] = React.useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const id = editing && editing !== 'new' ? editing.id : undefined;

    startTransition(async () => {
      const result = await saveAddress({
        id,
        label: String(data.get('label') ?? ''),
        district: String(data.get('district') ?? ''),
        streetDetails: String(data.get('streetDetails') ?? ''),
        phone: String(data.get('phone') ?? ''),
      });

      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }

      toast.success(t('addressSaved'));
      setEditing(null);
      router.refresh();
    });
  }

  function onDelete(id: string) {
    startTransition(async () => {
      const result = await deleteAddress(id);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      toast.success(t('addressDeleted'));
      router.refresh();
    });
  }

  const current = editing === 'new' ? null : editing;

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {addresses.map((address) => (
          <li
            key={address.id}
            className="rounded-control border-border flex items-start gap-3 border p-3"
          >
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">{address.label}</p>
              <p className="text-muted-foreground text-xs">
                {address.district} — {address.streetDetails}
              </p>
              <p className="text-muted-foreground text-xs" dir="ltr">
                {address.phone}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditing(address)}
                aria-label={t('editAddress')}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(address.id)}
                disabled={pending}
                aria-label={t('deleteAddress')}
                className="hover:text-danger text-neutral-500"
              >
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {editing === null ? (
        <Button variant="outline" onClick={() => setEditing('new')}>
          <Plus />
          {t('addAddress')}
        </Button>
      ) : (
        <form onSubmit={onSubmit} className="rounded-control space-y-3 bg-neutral-50 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="a-label">{t('addressLabel')}</Label>
              <Input id="a-label" name="label" required defaultValue={current?.label ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a-district">{t('district')}</Label>
              <Select name="district" required defaultValue={current?.district}>
                <SelectTrigger id="a-district">
                  <SelectValue placeholder={t('districtHint')} />
                </SelectTrigger>
                <SelectContent>
                  {districts.map((district) => (
                    <SelectItem key={district} value={district}>
                      {district}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="a-street">{t('streetDetails')}</Label>
            <Input
              id="a-street"
              name="streetDetails"
              required
              defaultValue={current?.streetDetails ?? ''}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="a-phone">{t('phone')}</Label>
            <Input
              id="a-phone"
              name="phone"
              required
              dir="ltr"
              defaultValue={current?.phone ?? ''}
              placeholder="0700000000"
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {t('save')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
