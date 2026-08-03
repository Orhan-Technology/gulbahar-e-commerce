'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check, Share2 } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

/**
 * Share this product (Prompt: the missing share control).
 *
 * WHATSAPP IS THE CHANNEL. In this market a product reaches a second person by
 * being pasted into a chat, not by an email capture or a social embed — so the
 * one control that matters is the one that hands the platform's own share sheet
 * a title and a link. `navigator.share` opens exactly that on a phone.
 *
 * THE FALLBACK IS A COPY, not an absence. On a desktop browser without the Web
 * Share API the link goes to the clipboard and the button says so for a moment
 * before returning — a confirmation the reader can see without a dialog to
 * dismiss. `document.execCommand` is not used as a third tier: an insecure
 * origin has no clipboard and no share sheet, and the honest response there is
 * the error toast rather than a silent no-op.
 *
 * CAPABILITY IS CHECKED IN THE HANDLER, never during render. `navigator.share`
 * does not exist on the server, so branching on it while rendering would produce
 * markup that disagrees with the client's and a hydration mismatch on every
 * product page.
 *
 * A CANCELLED SHARE IS NOT A FAILURE. The share sheet rejects with an
 * `AbortError` when the user backs out of it, and reporting that as an error
 * tells someone their deliberate choice went wrong.
 */
export function ShareButton({
  title,
  iconOnly = false,
  className,
}: {
  /** The product's localised title — what the share sheet shows as the subject. */
  title: string;
  /**
   * Square icon button instead of a labelled row.
   *
   * The phone layout stacks the buy controls, and a labelled share made a
   * THIRD full-width button under "add to cart" and "buy now" — three bars of
   * equal weight, one of which does not buy anything. As an icon beside the
   * wishlist heart it reads as what it is: a secondary action on the product.
   */
  iconOnly?: boolean;
  className?: string;
}) {
  const t = useTranslations('product.share');
  const [copied, setCopied] = React.useState(false);

  // A timeout that outlives the component would setState after unmount.
  const timer = React.useRef<number | null>(null);
  React.useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  async function onShare() {
    // The canonical address of the product: no query, no hash. A link carrying
    // `?reviewStars=1` shares a filtered reading of the reviews, which is not
    // what "share this product" means.
    const url = `${window.location.origin}${window.location.pathname}`;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') return;
        // Anything else falls through to the copy, which is still useful.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t('copied'));
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error(t('failed'));
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      // The icon form loses its visible text, so the name has to come from
      // somewhere — and it is the same word either way.
      aria-label={iconOnly ? t('label') : undefined}
      title={iconOnly ? t('label') : undefined}
      className={cn(
        'rounded-control border-input bg-card focus-visible:ring-ring inline-flex h-10 items-center justify-center gap-2 border text-sm font-medium transition-colors duration-150 hover:bg-neutral-100 focus-visible:ring-2 focus-visible:outline-none',
        iconOnly ? 'w-10 shrink-0' : 'px-3',
        copied && 'border-success text-success',
        className,
      )}
    >
      {copied ? (
        <Check className="h-4 w-4" aria-hidden />
      ) : (
        <Share2 className="h-4 w-4" aria-hidden />
      )}
      {!iconOnly && (copied ? t('copiedShort') : t('label'))}
    </button>
  );
}
