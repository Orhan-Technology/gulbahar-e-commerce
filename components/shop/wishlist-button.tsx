'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';

import { toggleWishlist } from '@/lib/actions/wishlist';
import { useRouter } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

export type WishlistButtonProps = {
  productId: string;
  initialSaved: boolean;
  /** 'overlay' sits on a product image; 'inline' sits in a row of controls. */
  variant?: 'overlay' | 'inline';
  className?: string;
};

/**
 * Wishlist heart with an optimistic toggle (PRD §5.6, §10.6).
 *
 * The heart flips and pops immediately, then reconciles with the server action.
 * On failure it rolls back, so a lost network never leaves the UI lying about
 * what was saved. An anonymous tap is not an error — it invites sign-in.
 */
export function WishlistButton({
  productId,
  initialSaved,
  variant = 'overlay',
  className,
}: WishlistButtonProps) {
  const t = useTranslations('product');
  const tAuth = useTranslations('auth');
  const router = useRouter();

  const [saved, setSaved] = React.useState(initialSaved);
  const [popping, setPopping] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  /*
   * Re-sync when the server sends different data — e.g. after sign-in, when a
   * previously anonymous visitor's saved items become known.
   *
   * Adjusted DURING RENDER by comparing against the previous prop, which is
   * React's documented pattern for this. An effect that mirrors a prop into state
   * causes a cascading render and is flagged by react-hooks/set-state-in-effect.
   */
  const [lastInitial, setLastInitial] = React.useState(initialSaved);
  if (lastInitial !== initialSaved) {
    setLastInitial(initialSaved);
    setSaved(initialSaved);
  }

  function onToggle(event: React.MouseEvent) {
    // The heart usually sits inside a card-wide link.
    event.preventDefault();
    event.stopPropagation();

    const next = !saved;
    setSaved(next);
    if (next) setPopping(true);

    startTransition(async () => {
      const result = await toggleWishlist(productId, next);

      if (!result.ok) {
        setSaved(!next); // roll back
        if (result.error === 'requires_auth') {
          toast.info(tAuth('signInToSave'), {
            action: { label: tAuth('signIn'), onClick: () => router.push('/account/sign-in') },
          });
        } else {
          toast.error(t('wishlistFailed'));
        }
      }
    });
  }

  const isOverlay = variant === 'overlay';

  return (
    <button
      type="button"
      onClick={onToggle}
      onAnimationEnd={() => setPopping(false)}
      aria-pressed={saved}
      aria-busy={pending}
      aria-label={saved ? t('removeFromWishlist') : t('addToWishlist')}
      className={cn(
        'focus-visible:ring-ring flex items-center justify-center transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-2',
        isOverlay
          ? 'rounded-pill bg-card/90 shadow-card hover:bg-card h-8 w-8 backdrop-blur'
          : 'rounded-control border-input bg-card h-10 w-10 border hover:bg-neutral-100',
        className,
      )}
    >
      <Heart
        className={cn(
          'h-4 w-4 transition-colors duration-150',
          saved ? 'fill-danger text-danger' : 'text-neutral-500',
          popping && 'animate-heart-pop',
        )}
      />
    </button>
  );
}
