import { useTranslations } from 'next-intl';
import { Megaphone } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * The «تبلیغ شده» / "Sponsored" marker required on every promoted result
 * (PRD §8.4). Deliberately visible rather than subtle: the guardrail only works
 * if a customer can tell paid placement from organic ranking.
 */
export function SponsoredBadge({
  className,
  withIcon = false,
}: {
  className?: string;
  withIcon?: boolean;
}) {
  const t = useTranslations('promotions');

  return (
    <Badge variant="accent" className={cn('gap-1', className)}>
      {withIcon && <Megaphone className="h-3 w-3" aria-hidden />}
      {t('sponsored')}
    </Badge>
  );
}

SponsoredBadge.Skeleton = function SponsoredBadgeSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('h-5 w-20 rounded-pill', className)} />;
};
