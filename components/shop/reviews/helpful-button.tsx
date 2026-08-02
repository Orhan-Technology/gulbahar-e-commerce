'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';

import { setReviewHelpful } from '@/lib/actions/reviews';
import { formatNumber } from '@/lib/format';
import { usePathname, useRouter } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * "Was this helpful?" on a single review (Prompt: review depth).
 *
 * OPTIMISTIC WITH ROLLBACK, exactly like the wishlist heart: the count moves on
 * the tap and reconciles afterwards, because the outcome is never in doubt and a
 * button that waits for a round trip feels broken on a mall's wifi. A failure
 * puts the number back where it was and says why.
 *
 * SIGNED OUT IS NOT AN ERROR. The tap is a decision already made, so the toast
 * offers the sign-in and carries `next=` back to this exact product — the
 * pattern the wishlist button established, and the reason nobody has to guess
 * why nothing happened.
 *
 * ONE VOTE PER PERSON, and no downvote. The composite primary key on
 * review_votes is what enforces the first; the second is a product decision —
 * on a marketplace where a shop's rating is its livelihood, a downvote button is
 * a brigading tool.
 *
 * A reader may withdraw their vote by pressing again, which is why the action
 * takes the DESIRED state rather than toggling server-side.
 */
export function HelpfulButton({
  reviewId,
  initialCount,
  initialVoted,
  /** The author cannot vote for themselves; the button renders as a plain count. */
  ownReview = false,
}: {
  reviewId: string;
  initialCount: number;
  initialVoted: boolean;
  ownReview?: boolean;
}) {
  const t = useTranslations('product.helpful');
  const tAuth = useTranslations('auth');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const [voted, setVoted] = React.useState(initialVoted);
  const [count, setCount] = React.useState(initialCount);
  const [pending, startTransition] = React.useTransition();

  /*
   * Re-sync when the server sends different data — after a sign-in, the same
   * reader's votes become known. Adjusted DURING RENDER against the previous
   * prop, which is React's documented pattern; an effect mirroring a prop into
   * state cascades a render and trips react-hooks/set-state-in-effect.
   */
  const [lastVoted, setLastVoted] = React.useState(initialVoted);
  if (lastVoted !== initialVoted) {
    setLastVoted(initialVoted);
    setVoted(initialVoted);
    setCount(initialCount);
  }

  if (ownReview) {
    return count > 0 ? (
      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
        <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
        {t('countOnly', { count: formatNumber(count, locale) })}
      </span>
    ) : null;
  }

  function onVote() {
    const next = !voted;
    setVoted(next);
    setCount((current) => Math.max(0, current + (next ? 1 : -1)));

    startTransition(async () => {
      const result = await setReviewHelpful(reviewId, next);
      if (result.ok) return;

      setVoted(!next);
      setCount((current) => Math.max(0, current + (next ? -1 : 1)));

      if (result.error === 'requires_auth') {
        toast.info(t('signInToVote'), {
          action: {
            label: tAuth('signIn'),
            onClick: () => router.push(`/account/sign-in?next=${pathname}`),
          },
        });
        return;
      }
      toast.error(t('failed'));
    });
  }

  return (
    <button
      type="button"
      onClick={onVote}
      disabled={pending}
      aria-pressed={voted}
      className={cn(
        'rounded-pill focus-visible:ring-ring inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60',
        voted
          ? 'border-primary-200 bg-primary-50 text-primary'
          : 'border-border bg-card hover:border-primary hover:text-primary text-neutral-600',
      )}
    >
      <ThumbsUp className={cn('h-3.5 w-3.5', voted && 'fill-primary/20')} aria-hidden />
      {voted ? t('voted') : t('prompt')}
      {count > 0 && <span className="tabular-nums opacity-70">{formatNumber(count, locale)}</span>}
    </button>
  );
}
