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

/**
 * Product image gallery with a thumbnail rail and tap-to-zoom (PRD §5.2, §10.4).
 *
 * The rail is a horizontal scroller that inherits document direction, so in Dari
 * it scrolls from the right. Explicit aspect boxes mean no layout shift while
 * images decode (PRD §9.3).
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
  const strip = React.useRef<HTMLDivElement>(null);

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
        side ? 'flex flex-col gap-3 sm:flex-row-reverse sm:gap-4' : 'space-y-3',
        className,
      )}
    >
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
        type="button"
        onClick={() => setZoomed(true)}
        aria-label={t('zoomImage')}
        className={cn(
          aspectClass,
          'group rounded-card border-border relative hidden w-full overflow-hidden border bg-neutral-100 sm:block',
          side && 'sm:flex-1',
        )}
      >
        <Image
          src={current.path}
          alt={current.alt ?? title}
          fill
          sizes="(max-width: 768px) 100vw, 520px"
          priority
          placeholder={current.blurDataUrl ? 'blur' : 'empty'}
          blurDataURL={current.blurDataUrl ?? undefined}
          className="object-cover"
        />
        {images.length > 1 && (
          <CountChip current={active + 1} total={images.length} locale={locale} />
        )}
        <span className="rounded-pill bg-card/90 text-foreground shadow-card absolute end-3 bottom-3 flex h-9 w-9 items-center justify-center backdrop-blur transition-opacity duration-150">
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
