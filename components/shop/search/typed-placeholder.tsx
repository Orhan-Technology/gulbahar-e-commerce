'use client';

import * as React from 'react';

import { usePrefersReducedMotion } from '@/components/custom/stat-card';

const TYPE_MS = 55;
const DELETE_MS = 28;
const HOLD_MS = 1600;

/**
 * The reference design's search field types its own placeholder, cycling
 * through a few phrases with a blinking caret. It is the first thing that moves
 * on the page and the reason the header reads as alive rather than static.
 *
 * Returns the text to show. The first phrase is returned FULLY TYPED on the
 * very first render, server and client alike — starting from an empty string
 * would be a hydration mismatch on a rendered attribute, and it would also mean
 * the field is briefly unlabelled for anyone whose JavaScript is still loading.
 *
 * Under reduced motion nothing cycles and the first phrase simply stands. The
 * caret is a separate element so the global prefers-reduced-motion rule can
 * stop it blinking without this hook knowing.
 */
export function useTypedPlaceholder(phrases: string[], active: boolean): string {
  const prefersReduced = usePrefersReducedMotion();
  const [text, setText] = React.useState(() => phrases[0] ?? '');

  React.useEffect(() => {
    if (!active || prefersReduced || phrases.length < 2) return;

    let phrase = 0;
    let cut = phrases[0].length;
    let deleting = true;
    let timer: ReturnType<typeof setTimeout>;

    /*
     * One self-rescheduling timeout rather than an interval: the three phases
     * run at different speeds — deleting is quicker than typing, and a
     * completed phrase holds — and an interval would need the same state
     * machine plus a counter to skip ticks.
     */
    const step = () => {
      if (deleting) {
        cut -= 1;
        if (cut <= 0) {
          deleting = false;
          phrase = (phrase + 1) % phrases.length;
        }
      } else {
        cut += 1;
        if (cut >= phrases[phrase].length) deleting = true;
      }

      setText(phrases[phrase].slice(0, cut));
      const settled = deleting && cut >= phrases[phrase].length;
      timer = setTimeout(step, settled ? HOLD_MS : deleting ? DELETE_MS : TYPE_MS);
    };

    timer = setTimeout(step, HOLD_MS);
    return () => clearTimeout(timer);
  }, [phrases, active, prefersReduced]);

  return text;
}

/**
 * The placeholder itself, drawn over the field rather than set as its
 * `placeholder` attribute — an attribute cannot carry a blinking caret. The
 * input keeps its `aria-label`, so nothing is lost to a screen reader, and this
 * whole element is hidden from the accessibility tree.
 */
export function TypedPlaceholder({ text, caret }: { text: string; caret: boolean }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 start-0 flex items-center gap-px truncate text-sm text-neutral-500"
    >
      {text}
      {caret && <span className="animate-caret inline-block h-4 w-px bg-neutral-400" />}
    </span>
  );
}
