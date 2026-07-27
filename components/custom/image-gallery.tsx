'use client';

import * as React from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ImageOff, ZoomIn } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface GalleryImage {
  path: string;
  alt?: string;
}

export interface ImageGalleryProps {
  images: GalleryImage[];
  /** Product title, used for alt text fallback and the zoom dialog label. */
  title: string;
  className?: string;
  /** 4:5 on product pages, 1:1 elsewhere (PRD §10.7). */
  aspect?: 'square' | 'portrait';
}

/**
 * Product image gallery with a thumbnail rail and tap-to-zoom (PRD §5.2, §10.4).
 *
 * The rail is a horizontal scroller that inherits document direction, so in Dari
 * it scrolls from the right. Explicit aspect boxes mean no layout shift while
 * images decode (PRD §9.3).
 */
export function ImageGallery({ images, title, className, aspect = 'portrait' }: ImageGalleryProps) {
  const t = useTranslations('product');
  const [active, setActive] = React.useState(0);
  const [zoomed, setZoomed] = React.useState(false);

  const aspectClass = aspect === 'square' ? 'aspect-square' : 'aspect-[4/5]';
  const current = images[active];

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
    <div className={cn('space-y-3', className)}>
      <button
        type="button"
        onClick={() => setZoomed(true)}
        aria-label={t('zoomImage')}
        className={cn(
          aspectClass,
          'group rounded-card border-border relative w-full overflow-hidden border bg-neutral-100',
        )}
      >
        <Image
          src={current.path}
          alt={current.alt ?? title}
          fill
          sizes="(max-width: 768px) 100vw, 520px"
          priority
          className="object-cover"
        />
        <span className="rounded-pill bg-card/90 text-foreground shadow-card absolute end-3 bottom-3 flex h-9 w-9 items-center justify-center backdrop-blur transition-opacity duration-150">
          <ZoomIn className="h-4 w-4" aria-hidden />
        </span>
      </button>

      {images.length > 1 && (
        <div className="flex scrollbar-none gap-2 overflow-x-auto">
          {images.map((image, index) => (
            <button
              key={image.path}
              type="button"
              onClick={() => setActive(index)}
              aria-label={t('viewImageNumber', { number: index + 1 })}
              aria-current={index === active}
              className={cn(
                'rounded-control relative h-16 w-16 shrink-0 overflow-hidden border-2 bg-neutral-100 transition-colors duration-150',
                index === active ? 'border-primary-600' : 'hover:border-border border-transparent',
              )}
            >
              <Image src={image.path} alt="" fill sizes="64px" className="object-cover" />
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
