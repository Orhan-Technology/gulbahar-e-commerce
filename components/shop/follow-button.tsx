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
 *
 * WHAT FOLLOWING DOES is told HERE, in the first success toast, and used to be
 * a permanent paragraph under the button in the shop's identity card. Two
 * different readers were being served badly by that: the one who never presses
 * it read an explanation of a feature they did not ask about, on every shop
 * page, forever; and the one who does press it got a confirmation that said
 * nothing about where the thing they just followed had gone. Moved, it costs
 * the first reader nothing and hands the second the link at the exact moment it
 * is worth having.
 *
 * ONCE, remembered in localStorage. The second follow is a confirmation, not a
 * lesson, and a toast that teaches the same thing every time is a toast people
 * learn to dismiss unread. The flag is read inside the click handler rather
 * than during render — a render that reads storage is a hydration mismatch, and
 * this component has no reason to know the answer before it is pressed.
 */
const EXPLAINED_KEY = 'gulbahar:follow-explained';
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

  /**
   * The explainer, the first time only. `undefined` afterwards, which is what
   * sonner wants for "no description" — the toast then collapses back to the
   * one-line confirmation.
   *
   * Wrapped in try/catch because localStorage throws outright in a browser with
   * site data blocked, and losing a follow over a preference nobody set would
   * be an absurd trade. The fallback is to explain every time, which is the
   * harmless direction to fail in.
   */
  function explainer() {
    try {
      if (window.localStorage.getItem(EXPLAINED_KEY)) return undefined;
      window.localStorage.setItem(EXPLAINED_KEY, '1');
    } catch {
      // Ignored — see above.
    }
    return t.rich('followExplainer', {
      link: (chunks) => (
        <Link href="/account/following" className="font-semibold underline">
          {chunks}
        </Link>
      ),
    });
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
      if (next) toast.success(t('followed'), { description: explainer() });
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
