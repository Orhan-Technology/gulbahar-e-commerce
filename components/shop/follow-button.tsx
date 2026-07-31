'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Heart } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { setShopFollow } from '@/lib/actions/shop-social';
import { formatNumber } from '@/lib/format';
import { Link, useRouter } from '@/lib/i18n/navigation';

/**
 * Follow a shop (Prompt C8).
 *
 * OPTIMISTIC, because the answer is never in doubt — following is a preference,
 * not a transaction, and a button that waits for a round trip to change state
 * feels broken on a mall's wifi. A failure rolls back and says why.
 *
 * The action takes the DESIRED state rather than toggling, so a double tap
 * cannot leave the button and the database disagreeing about which way round
 * they ended up.
 *
 * Signed out, it is a link to sign in with `?next=` back to the shop — not a
 * disabled button, and not a dialog. Someone who wants to follow a shop has
 * already decided; the sign-in is the obstacle, so the fastest thing is to send
 * them through it and back.
 */
export function FollowButton({
  shopId,
  shopSlug,
  initialFollowing,
  initialCount,
  signedIn,
}: {
  shopId: string;
  shopSlug: string;
  initialFollowing: boolean;
  initialCount: number;
  signedIn: boolean;
}) {
  const t = useTranslations('shopPage');
  const locale = useLocale();
  const router = useRouter();

  const [following, setFollowing] = React.useState(initialFollowing);
  const [count, setCount] = React.useState(initialCount);
  const [pending, startTransition] = React.useTransition();

  if (!signedIn) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href={`/account/sign-in?next=/shops/${shopSlug}`}>
          <Heart className="h-4 w-4" aria-hidden />
          {t('follow')}
        </Link>
      </Button>
    );
  }

  function toggle() {
    const next = !following;
    setFollowing(next);
    setCount((current) => Math.max(0, current + (next ? 1 : -1)));

    startTransition(async () => {
      const result = await setShopFollow(shopId, next);
      if (!result.ok) {
        setFollowing(!next);
        setCount((current) => Math.max(0, current + (next ? -1 : 1)));
        toast.error(t(`errors.${result.error}` as never));
        return;
      }
      if (next) toast.success(t('followed'));
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={following ? 'secondary' : 'default'}
      onClick={toggle}
      disabled={pending}
      aria-pressed={following}
    >
      {following ? (
        <Check className="h-4 w-4" aria-hidden />
      ) : (
        <Heart className="h-4 w-4" aria-hidden />
      )}
      {following ? t('following') : t('follow')}
      {count > 0 && <span className="tabular-nums opacity-70">{formatNumber(count, locale)}</span>}
    </Button>
  );
}
