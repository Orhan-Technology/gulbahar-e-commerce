'use client';

import * as React from 'react';

/**
 * One press feedback for the whole product (PRD §10.6, revised).
 *
 * A card, a chip and a button are three different components, but a finger
 * landing on any of them is the same event and should get the same answer: the
 * thing you touched gives, slightly, and comes back. Doing that per-component
 * produced three near-misses; this is the single implementation.
 *
 * It is a CLASS plus a delegated listener rather than a wrapper component, for
 * two reasons that both matter here:
 *
 *   - Most of the call sites are server components. A wrapper would need
 *     'use client' at every one of them and would drag a card, a chip and a
 *     banner into the client bundle for a 3% scale.
 *   - The listeners are three, on the document, for the whole app — not one set
 *     per pressable element on a page that renders sixty of them.
 *
 * Why not plain `:active`? Because `:active` and a scroll gesture disagree.
 * On a touch device the browser holds `:active` through the start of a scroll
 * and only drops it later, so flicking a long grid leaves a trail of cards
 * visibly shrinking under the finger. `pointercancel` fires the moment the
 * browser claims the gesture for scrolling, which is exactly the signal wanted,
 * and the scroll listener is the belt to that braces.
 *
 * Reduced motion is handled in CSS beside the rule itself (app/globals.css), so
 * there is no second source of truth and no client-side branch.
 */

/** Add to any element that should give under a press. */
export const pressable = 'pressable';

const PRESSED = 'data-pressed';

/**
 * Installs the delegated listeners. Mount ONCE, in the root layout.
 *
 * Renders nothing — it exists for its effect, which is why it is a component
 * rather than a hook: the layouts that need it are server components and can
 * render a client component but cannot call one.
 */
export function PressFeedback() {
  React.useEffect(() => {
    let pressed: Element | null = null;

    function clear() {
      if (!pressed) return;
      pressed.removeAttribute(PRESSED);
      pressed = null;
    }

    function onDown(event: PointerEvent) {
      // Secondary buttons open menus; they are not a press.
      if (event.button !== 0) return;
      clear();
      const target = (event.target as Element | null)?.closest?.(`.${pressable}`);
      if (!target) return;
      pressed = target;
      target.setAttribute(PRESSED, '');
    }

    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointerup', clear, { passive: true });
    // Fires the instant the browser takes the gesture over for scrolling.
    document.addEventListener('pointercancel', clear, { passive: true });
    document.addEventListener('dragstart', clear, { passive: true });
    // Capture, so a press inside a nested scroller is released by ITS scroll too.
    document.addEventListener('scroll', clear, { passive: true, capture: true });
    window.addEventListener('blur', clear, { passive: true });

    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerup', clear);
      document.removeEventListener('pointercancel', clear);
      document.removeEventListener('dragstart', clear);
      document.removeEventListener('scroll', clear, { capture: true });
      window.removeEventListener('blur', clear);
      clear();
    };
  }, []);

  return null;
}
