'use client';

import * as React from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { ImageOff, ZoomIn } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface GalleryImage {
  path: string;
  alt?: string;
  /** 16px WebP data URI generated at seed time — see lib/images.ts. */
  blurDataUrl?: string | null;
}

export interface ImageGalleryProps {
  images: GalleryImage[];
  /** Product title, used for alt text fallback and the zoom dialog label. */
  title: string;
  className?: string;
  /** 4:5 on product pages, 1:1 elsewhere (PRD §10.7). */
  aspect?: 'square' | 'portrait';
  /**
   * `side` puts the thumbnail rail in a column beside the main image, which is
   * how the product page is drawn. It stays BELOW the image on small screens
   * regardless — a vertical rail on a 390px phone costs a fifth of the width
   * the photograph needs.
   */
  rail?: 'below' | 'side';
}

/** The stored master's edge, from scripts/seed-images.ts. */
const MASTER_PX = 1600;

/**
 * Product image gallery with a thumbnail rail, a hover magnifier and
 * tap-to-zoom (PRD §5.2, §10.4).
 *
 * The rail is a horizontal scroller that inherits document direction, so in Dari
 * it scrolls from the right. Explicit aspect boxes mean no layout shift while
 * images decode (PRD §9.3).
 *
 * THE MAGNIFIER pairs a lens on the photo with a panel beside it, which is the
 * only arrangement that answers "which part am I looking at" — a panel with no
 * lens leaves the reader hunting, and a lens that magnifies in place covers the
 * thing it is describing.
 *
 * It is worth stating why this is right here and wrong on a product CARD, where
 * the same gesture was removed: on a card the magnification was INCIDENTAL, it
 * fired while the eye was travelling and moved the target. Here it is
 * DELIBERATE — the reader has arrived, and is pointing at the detail they want.
 *
 * POINTER POSITION IS WRITTEN STRAIGHT TO THE DOM, not through state. A
 * mousemove handler that calls setState re-renders the whole gallery on every
 * pixel of travel, and the panel visibly lags the cursor. Only open/closed is
 * state.
 */
export function ImageGallery({
  images,
  title,
  className,
  aspect = 'portrait',
  rail = 'below',
}: ImageGalleryProps) {
  const t = useTranslations('product');
  const locale = useLocale();
  const [active, setActive] = React.useState(0);
  const [zoomed, setZoomed] = React.useState(false);
  const [magnifying, setMagnifying] = React.useState(false);
  const strip = React.useRef<HTMLDivElement>(null);
  const stage = React.useRef<HTMLButtonElement>(null);
  const lens = React.useRef<HTMLSpanElement>(null);
  const panel = React.useRef<HTMLSpanElement>(null);

  /**
   * Moves the lens and the panel to follow the pointer.
   *
   * The panel shows the master at its natural size, so the magnification is
   * whatever the master divided by the rendered image happens to be — 1600 over
   * ~570 on a desktop, about 2.8×. Deriving it rather than hard-coding a factor
   * means a narrower viewport magnifies less and never invents detail that is
   * not in the file.
   *
   * The lens is the panel scaled DOWN by that same factor, which is what makes
   * the rectangle on the photo correspond to the panel's contents rather than
   * merely gesturing at them.
   */
  const track = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const box = stage.current;
    const glass = lens.current;
    const view = panel.current;
    if (!box || !glass || !view) return;

    const rect = box.getBoundingClientRect();
    if (rect.width === 0) return;

    const zoom = MASTER_PX / rect.width;
    const lensW = view.offsetWidth / zoom;
    const lensH = view.offsetHeight / zoom;

    // Clamped so the lens never hangs off the photo — the panel cannot show
    // anything outside the image, so a lens that could would be lying.
    const x = Math.min(Math.max(event.clientX - rect.left - lensW / 2, 0), rect.width - lensW);
    const y = Math.min(Math.max(event.clientY - rect.top - lensH / 2, 0), rect.height - lensH);

    glass.style.width = `${lensW}px`;
    glass.style.height = `${lensH}px`;
    // `left`, not an inset property: this is a pixel offset from the box's own
    // left edge in both directions, and `start` would flip it under RTL and
    // send the lens the wrong way.
    glass.style.left = `${x}px`;
    glass.style.top = `${y}px`;

    view.style.backgroundSize = `${MASTER_PX}px ${MASTER_PX}px`;
    view.style.backgroundPosition = `-${x * zoom}px -${y * zoom}px`;
  }, []);

  const aspectClass = aspect === 'square' ? 'aspect-square' : 'aspect-[4/5]';
  const current = images[active];
  const side = rail === 'side';

  if (images.length === 0) {
    return (
      <div
        className={cn(
          aspectClass,
          'rounded-card border-border flex w-full items-center justify-center border bg-neutral-100 text-neutral-400',
          className,
        )}
      >
        <ImageOff className="h-10 w-10" aria-hidden />
      </div>
    );
  }

  return (
    <div
      className={cn(
        // `relative` so the magnifier panel can be positioned against the whole
        // gallery — rail included — rather than against the photo alone.
        'relative',
        side ? 'flex flex-col gap-3 sm:flex-row-reverse sm:gap-4' : 'space-y-3',
        className,
      )}
    >
      {/*
        The magnifier panel, beside the gallery.

        `start-full` puts it past the gallery's inline END, so it opens to the
        left in Dari and to the right in English without a direction check —
        the same reason the rest of this file uses logical properties.

        It DOES cover the buy column while open, which is deliberate and is what
        the reference does: at the moment someone is inspecting the stitching,
        the price is not what they are reading. It disappears the instant the
        pointer leaves.

        `background-image` rather than an <img>: the panel shows the MASTER at
        its natural size, and routing that through next/image would hand back a
        resized derivative — the one thing this panel must not have.
      */}
      <span
        ref={panel}
        aria-hidden
        style={{ backgroundImage: `url(${current.path})` }}
        className={cn(
          'rounded-card border-border shadow-overlay pointer-events-none absolute top-0 z-30 hidden',
          'start-full ms-4 aspect-square w-[min(34rem,42vw)] border bg-neutral-100 bg-no-repeat',
          magnifying && 'lg:block',
        )}
      />
      {/*
        Two presentations of the same images.

        On a phone the main image is a SWIPEABLE strip with dots: the gesture is
        what people already do with a photograph, and a thumbnail rail on a
        390px screen spends a fifth of the width the picture needs. From `sm`
        the strip gives way to one large image with the rail beside it, where
        clicking a thumbnail is faster than swiping four times.
      */}
      <div className={cn('relative sm:hidden', side && 'sm:flex-1')}>
        <div
          ref={strip}
          onScroll={(event) => {
            const element = event.currentTarget;
            // Math.abs because RTL scroll offsets are negative in most engines.
            const index = Math.round(Math.abs(element.scrollLeft) / element.clientWidth);
            if (index !== active) setActive(Math.min(index, images.length - 1));
          }}
          className="flex scrollbar-none snap-x snap-mandatory overflow-x-auto"
        >
          {images.map((image, index) => (
            <button
              key={image.path}
              type="button"
              onClick={() => setZoomed(true)}
              aria-label={t('zoomImage')}
              className={cn(
                aspectClass,
                'rounded-card border-border relative w-full shrink-0 snap-center overflow-hidden border bg-neutral-100',
              )}
            >
              <Image
                src={image.path}
                alt={image.alt ?? title}
                fill
                sizes="100vw"
                priority={index === 0}
                placeholder={image.blurDataUrl ? 'blur' : 'empty'}
                blurDataURL={image.blurDataUrl ?? undefined}
                className="object-cover"
              />
            </button>
          ))}
        </div>

        {images.length > 1 && (
          <>
            <CountChip current={active + 1} total={images.length} locale={locale} />
            <div className="mt-2 flex justify-center gap-1.5">
              {images.map((image, index) => (
                <span
                  key={image.path}
                  className={cn(
                    'rounded-pill h-1.5 transition-[width,background-color] duration-200',
                    index === active ? 'bg-primary w-4' : 'w-1.5 bg-neutral-300',
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <button
        ref={stage}
        type="button"
        onClick={() => setZoomed(true)}
        /*
         * Pointer events, not `:hover`, because the panel has to know WHERE the
         * pointer is. A touch device fires none of these — `onMouseEnter` does
         * not exist for a tap — so the magnifier is simply absent there and the
         * click still opens the full-view dialog, which is the phone's answer.
         */
        onMouseEnter={() => setMagnifying(true)}
        onMouseLeave={() => setMagnifying(false)}
        onMouseMove={track}
        aria-label={t('zoomImage')}
        className={cn(
          aspectClass,
          'group rounded-card border-border relative hidden w-full overflow-hidden border bg-neutral-100 sm:block',
          side && 'sm:flex-1',
          magnifying && 'cursor-crosshair',
        )}
      >
        <Image
          src={current.path}
          alt={current.alt ?? title}
          fill
          // 640, matching the capped gallery (~570 plus headroom for a wider
          // viewport). The magnifier does NOT read this image — it loads the
          // stored master directly — so asking next/image for a huge derivative
          // here would buy nothing and cost every visitor who never hovers.
          sizes="(max-width: 768px) 100vw, 640px"
          priority
          placeholder={current.blurDataUrl ? 'blur' : 'empty'}
          blurDataURL={current.blurDataUrl ?? undefined}
          className="object-cover"
        />
        {images.length > 1 && (
          <CountChip current={active + 1} total={images.length} locale={locale} />
        )}
        {/*
          The lens. `hidden` rather than unmounted so its size survives between
          moves — remounting it on every enter made the first frame land at 0×0
          and the rectangle visibly grew into place.
        */}
        <span
          ref={lens}
          aria-hidden
          className={cn(
            'pointer-events-none absolute z-10 border border-primary/70 bg-primary/10',
            !magnifying && 'hidden',
          )}
        />

        <span
          className={cn(
            'rounded-pill bg-card/90 text-foreground shadow-card absolute end-3 bottom-3 flex h-9 w-9 items-center justify-center backdrop-blur transition-opacity duration-150',
            magnifying && 'opacity-0',
          )}
        >
          <ZoomIn className="h-4 w-4" aria-hidden />
        </span>
      </button>

      {images.length > 1 && (
        <div
          className={cn(
            // Hidden on phones: the swipe strip above IS the navigation there,
            // and two ways to change the same picture is one too many.
            'hidden scrollbar-none gap-2 overflow-x-auto sm:flex',
            side && 'sm:w-18 sm:flex-col sm:overflow-x-visible',
          )}
        >
          {images.map((image, index) => (
            <button
              key={image.path}
              type="button"
              onClick={() => setActive(index)}
              aria-label={t('viewImageNumber', { number: index + 1 })}
              aria-current={index === active}
              className={cn(
                'rounded-control relative h-16 w-16 shrink-0 overflow-hidden border-2 bg-neutral-100 transition-colors duration-150',
                side && 'sm:h-auto sm:w-full sm:aspect-square',
                index === active ? 'border-primary-600' : 'hover:border-border border-transparent',
              )}
            >
              <Image
                src={image.path}
                alt=""
                fill
                sizes="72px"
                placeholder={image.blurDataUrl ? 'blur' : 'empty'}
                blurDataURL={image.blurDataUrl ?? undefined}
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}

      <Dialog open={zoomed} onOpenChange={setZoomed}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <div className="rounded-control relative aspect-square w-full overflow-hidden bg-neutral-100">
            <Image
              src={current.path}
              alt={current.alt ?? title}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-contain"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** "۱ / ۴" over the image — position within the set, in the reader's digits. */
function CountChip({
  current,
  total,
  locale,
}: {
  current: number;
  total: number;
  locale: string;
}) {
  return (
    <span
      className="rounded-pill bg-foreground/70 text-2xs text-background absolute start-3 bottom-3 px-2.5 py-1 font-medium tabular-nums backdrop-blur"
      dir="ltr"
    >
      {formatNumber(current, locale)} / {formatNumber(total, locale)}
    </span>
  );
}

export function ImageGallerySkeleton({
  className,
  aspect = 'portrait',
}: {
  className?: string;
  aspect?: 'square' | 'portrait';
}) {
  return (
    <div className={cn('space-y-3', className)}>
      <Skeleton className={cn(aspect === 'square' ? 'aspect-square' : 'aspect-[4/5]', 'w-full')} />
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="rounded-control h-16 w-16 shrink-0" />
        ))}
      </div>
    </div>
  );
}

/*
 * Static alias for client-side call sites (the styleguide). The NAMED export
 * above is canonical: a static property attached to a 'use client' component
 * does not survive the RSC boundary — a server component importing it receives
 * a client reference proxy, and ImageGallery.Skeleton reads as undefined. Server code
 * must import ImageGallerySkeleton directly.
 */
ImageGallery.Skeleton = ImageGallerySkeleton;
