'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Reveals its children as they scroll into view.
 *
 * The reference recording is one long unbroken scroll, and each band arriving
 * with a short rise is most of why it reads as composed rather than as a list
 * that happens to be long.
 *
 * Three decisions keep it from being the usual scroll-animation nuisance:
 *
 *   - It renders VISIBLE and only hides itself once the observer is attached,
 *     in an effect. A server-rendered `opacity: 0` means a reader with no
 *     JavaScript, or one whose bundle fails, gets a blank page — the single
 *     most common way this pattern breaks a site.
 *   - It fires ONCE per element and then unobserves. Re-animating on the way
 *     back up makes a page feel like it is fighting the scrollbar.
 *   - Anything already on screen at mount is revealed immediately with no
 *     transition, so the first paint is never animated. The hero must not
 *     fade in under a reader who is already looking at it.
 *
 * Under reduced motion the effect never runs at all, so the content simply
 * stays where the server put it.
 */
export function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<'static' | 'hidden' | 'shown'>('static');

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Already in view at mount: leave it exactly as the server rendered it.
    if (node.getBoundingClientRect().top < window.innerHeight) return;

    setState('hidden');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setState('shown');
          observer.unobserve(entry.target);
        }
      },
      // A little before the edge, so a band is settled by the time it is read.
      { rootMargin: '0px 0px -12% 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        state === 'hidden' && 'opacity-0',
        state === 'shown' && 'animate-reveal',
        className,
      )}
    >
      {children}
    </div>
  );
}
