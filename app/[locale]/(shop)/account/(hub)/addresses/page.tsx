import { getTranslations, setRequestLocale } from 'next-intl/server';

import { AddressManager } from '@/components/shop/account/address-manager';
import { requireUser } from '@/lib/auth/guards';
import { accountAddresses, defaultAddressId } from '@/lib/db/queries/account';
import { KABUL_DISTRICTS } from '@/lib/districts';
import { AccountSectionHeader } from '@/components/shop/account/section-header';

/**
 * Saved addresses (Prompt A2) — promoted out of the profile form.
 *
 * It was the third card down a single-column page, which put "where my orders
 * go" behind "what my name is". Delivery is the thing a customer actually
 * revisits, and it now has a URL, so checkout and the profile panel can both
 * point straight at it.
 */
export default async function AccountAddressesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('account');

  const session = await requireUser(locale);
  const [saved, preferredAddressId] = await Promise.all([
    accountAddresses(session.id),
    defaultAddressId(session.id),
  ]);

  /*
   * WHICH ONE CHECKOUT WILL USE (finding #14).
   *
   * The profile card has always claimed one of these was the «آدرس پیش‌فرض»
   * and this list gave no clue which — nor any way to change it. There is no
   * `is_default` column and the schema is frozen this pass, so the answer is
   * derived from the last order's destination and simply SHOWN here, alongside
   * the sentence that explains how to change it: send an order somewhere else.
   * A control that sets it needs the column; see the report.
   */
  const defaultId =
    preferredAddressId && saved.some((address) => address.id === preferredAddressId)
      ? preferredAddressId
      : (saved[0]?.id ?? null);

  return (
    <div className="space-y-4">
      <AccountSectionHeader
        title={t('sections.addresses.title')}
        description={t('sections.addresses.body')}
      />

      <div className="rounded-card border-border bg-card border p-4">
        <AddressManager
          addresses={saved}
          defaultAddressId={defaultId}
          districts={KABUL_DISTRICTS}
        />
      </div>
    </div>
  );
}
