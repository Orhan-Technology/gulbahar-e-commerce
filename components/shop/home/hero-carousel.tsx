'use client';

import * as React from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { SponsoredBadge } from '@/components/custom/sponsored-badge';
import { usePrefersReducedMotion } from '@/components/custom/stat-card';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

export type HeroSlide = {
  key: string;
  href: string;
  /** Small line above the headline — usually the shop's name. */
  eyebrow?: string;
  sponsored?: boolean;
  title: string;
  body?: string;
  imagePath?: string | null;
  ctaLabel: string;
};

const ADVANCE_MS = 6000;

/**
 * The home hero, rotating (PRD §5.1, §8.2).
 *
 * Slides CROSS-FADE rather than slide. A horizontal slide has to know the
 * document direction, and getting it wrong is not subtle — the carousel would
 * advance backwards in Dari. A fade is direction-agnostic and reads as calm,
 * which is what the top of the page wants.
 *
 * All copy arrives pre-formatted from the server: this component never sees a
 * locale, a price or a database row, so the only thing it can get wrong is the
 * timing.
 *
 * Auto-advance stops on hover and on focus-within, and never starts at all
 * under reduced motion — where the dots remain as ordinary buttons, so the
 * other slides stay reachable rather than becoming unreachable content.
 */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const t = useTranslations('home');
  const prefersReduced = usePrefersReducedMotion();
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  const count = slides.length;

  React.useEffect(() => {
    if (count < 2 || paused || prefersReduced) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % count), ADVANCE_MS);
    return () => clearInterval(timer);
  }, [count, paused, prefersReduced]);

  if (count === 0) return null;

  return (
    <div
      className="flex flex-col gap-3"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/*
        Every slide stays mounted and is faded between, rather than swapping
        one in. Mounting on demand means the incoming slide's photograph starts
        downloading at the moment it is needed, so the first rotation shows an
        empty gradient for as long as the image takes.
      */}
      <div className="rounded-card relative min-h-[320px] overflow-hidden lg:min-h-[380px]">
        {slides.map((slide, position) => (
          <Slide
            key={slide.key}
            slide={slide}
            active={position === index}
            priority={position === 0}
          />
        ))}
      </div>

      {count > 1 && (
        <div className="flex items-center justify-center gap-2" role="tablist">
          {slides.map((slide, position) => (
            <button
              key={slide.key}
              type="button"
              role="tab"
              aria-selected={position === index}
              aria-label={t('heroSlideNumber', { number: position + 1 })}
              onClick={() => setIndex(position)}
              className={cn(
                'rounded-pill h-2 transition-all duration-[420ms] ease-[var(--ease-settle)]',
                position === index ? 'bg-primary w-6' : 'w-2 bg-neutral-300 hover:bg-neutral-400',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Slide({
  slide,
  active,
  priority,
}: {
  slide: HeroSlide;
  active: boolean;
  priority: boolean;
}) {
  return (
    <div
      // aria-hidden AND inert: without inert the inactive slides' buttons stay
      // in the tab order, so keyboard focus disappears into a slide nobody can
      // see.
      aria-hidden={!active}
      inert={!active}
      className={cn(
        'from-primary-800 via-primary-700 to-primary-500 text-primary-foreground absolute inset-0 grid lg:grid-cols-[1fr_42%] ltr:bg-linear-to-br rtl:bg-linear-to-bl',
        // motion-decorative: a slide cross-fade. Nobody is waiting on it, so it
        // is held to the 500ms budget rather than the 300ms feedback one.
        'transition-opacity duration-[420ms] ease-[var(--ease-settle)]',
        active ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <div className="relative z-10 flex flex-col justify-center gap-3 p-6 sm:p-10">
        {(slide.sponsored || slide.eyebrow) && (
          <span className="flex items-center gap-2">
            {slide.sponsored && <SponsoredBadge tone="dark" />}
            {slide.eyebrow && (
              <span className="text-primary-200 text-xs font-semibold">{slide.eyebrow}</span>
            )}
          </span>
        )}

        {/* `dir="auto"` on both: a slide's headline and body are a shop's own
            product title, shop name or offer name, and a Latin one inheriting
            the page's RTL renders its trailing punctuation on the wrong side. */}
        <p dir="auto" className="max-w-xl text-2xl leading-tight font-extrabold sm:text-3xl">
          {slide.title}
        </p>

        {slide.body && (
          <p dir="auto" className="text-primary-200 clamp-2 max-w-lg text-base">
            {slide.body}
          </p>
        )}

        <div className="flex flex-wrap gap-3 pt-3">
          <Button asChild size="lg" variant="secondary">
            <Link href={slide.href}>
              {slide.ctaLabel}
              <ArrowRight className="rtl:rotate-180" />
            </Link>
          </Button>
        </div>
      </div>

      {slide.imagePath && (
        <div className="relative min-h-[180px] lg:min-h-0">
          <Image
            src={slide.imagePath}
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 590px"
            priority={priority}
            className="object-cover"
          />
          {/* Feathers the photo into the gradient instead of ending on a hard
              seam. Physical direction: the photo is always on the far side. */}
          <div className="from-primary-700 absolute inset-0 to-transparent ltr:bg-linear-to-r rtl:bg-linear-to-l" />
        </div>
      )}
    </div>
  );
}
