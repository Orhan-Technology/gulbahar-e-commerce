import { getTranslations } from 'next-intl/server';
import { CreditCard } from 'lucide-react';

import { UnavailableCard } from '@/components/custom/unavailable-card';

/**
 * Payment methods — kept, and visibly disabled (Prompt A3).
 *
 * Kept because it is real product intent: cash on delivery and HesabPay are the
 * PRD's rails and both are chosen at checkout, so an account-level list of
 * saved instruments is the next step rather than an invention. Disabled because
 * nothing stores one. Loyalty tiers, memberships and subscriptions failed the
 * same test and were omitted entirely instead — inventing a points balance on a
 * client demo is a lie, not a placeholder.
 */
export async function PaymentMethodsCard({ className }: { className?: string }) {
  const t = await getTranslations('account');

  return (
    <UnavailableCard
      icon={<CreditCard className="h-5 w-5" />}
      title={t('payments.title')}
      body={t('payments.body')}
      pillLabel={t('comingSoon')}
      className={className}
    />
  );
}
