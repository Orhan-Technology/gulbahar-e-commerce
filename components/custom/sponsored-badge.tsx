import { useTranslations } from 'next-intl';
import { Megaphone } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Three placements, because the marker has to stay legible on all of them:
 *
 *   media — sitting on a product photo: an opaque white pill with a shadow, so
 *           it cannot be lost in a light patch of the image.
 *   dark  — on the green hero: translucent white, which reads as an overlay on
 *           the gradient rather than a sticker on top of it.
 *   inline— beside a heading in normal flow, where a shadow would be noise.
 */
const TONES = {
  media: 'bg-card text-neutral-600 shadow-card',
  dark: 'bg-card/20 text-primary-foreground',
  inline: 'bg-neutral-100 text-neutral-600',
} as const;

/**
 * The «تبلیغ شده» / "Sponsored" marker required on every promoted result
 * (PRD §8.4). The guardrail only works if a customer can tell paid placement
 * from organic ranking, so it is never smaller than 11px and never below the
 * contrast of the muted text around it.
 *
 * Not the gold Badge it used to be: gold is the rating-star colour, and a gold
 * pill on a card whose star row is also gold read as a quality mark — the
 * opposite of a disclosure. Neutral says "this is an ad" without dressing it up.
 */
export function SponsoredBadge({
  className,
  tone = 'media',
  withIcon = false,
}: {
  className?: string;
  tone?: keyof typeof TONES;
  withIcon?: boolean;
}) {
  const t = useTranslations('promotions');

  return (
    <span
      className={cn(
        'rounded-pill text-2xs inline-flex items-center gap-1 px-2.5 py-1.5 font-semibold',
        TONES[tone],
        className,
      )}
    >
      {withIcon && <Megaphone className="h-3 w-3" aria-hidden />}
      {t('sponsored')}
    </span>
  );
}

export function SponsoredBadgeSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('rounded-pill h-5 w-20', className)} />;
}

/*
 * Static alias for client-side call sites (the styleguide). The NAMED export
 * above is canonical: a static property attached to a 'use client' component
 * does not survive the RSC boundary — a server component importing it receives
 * a client reference proxy, and SponsoredBadge.Skeleton reads as undefined. Server code
 * must import SponsoredBadgeSkeleton directly.
 */
SponsoredBadge.Skeleton = SponsoredBadgeSkeleton;
