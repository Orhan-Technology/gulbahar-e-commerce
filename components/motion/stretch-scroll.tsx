'use client';

import * as React from 'react';

import { usePrefersReducedMotion } from '@/components/custom/stat-card';
import { cn } from '@/lib/utils';

/**
 * Android 12 overscroll stretch, as a wrapper (PRD §10.6, revised).
 *
 * The reference recording's scroll is the one thing a web build usually gives
 * away: a native list answers a pull at its end by STRETCHING, and a web page
 * just stops. This restores that answer without touching how scrolling itself
 * behaves — every listener is passive, nothing is ever preventDefault'd, and the
 * effect is purely a transform painted on top of the browser's own scroll.
 *
 * The physics, in the order they are felt:
 *
 *   RESISTANCE  s = k · (1 − 1/(1 + pull/D)). Diminishing returns, so the first
 *   40px of pull give most of the movement and the next 400 give very little.
 *   That curve is what makes it read as rubber rather than as a slider — a
 *   linear mapping feels like dragging the page and immediately looks wrong.
 *   k is the asymptote (7%) and the hard cap is 6%, reached at ~3600px of pull,
 *   which in practice means the cap is a safety rail rather than a destination.
 *
 *   SHAPE  scaleY(1 + s) with transform-origin ON THE EDGE BEING PULLED, so the
 *   content grows AWAY from the anchored edge exactly as a stretched sheet
 *   would. The paired scaleX(1 − s/3) is what separates stretch from zoom:
 *   without it the content simply gets bigger, and the eye reads a scale
 *   animation instead of a material under tension.
 *
 *   RELEASE  a spring, not a curve. ζ ≈ 0.62 and ω ≈ 18.4 rad/s, which settles
 *   in ~350ms with a single small overshoot — the overshoot is the point, and
 *   it is the reason this is integrated per-frame rather than handed to a CSS
 *   transition whose easing would have to fake it.
 *
 *   FLING  arriving at a bound fast is its own event, with no touch involved:
 *   velocity is tracked from scroll positions, and crossing the threshold
 *   injects that velocity into the spring from rest. The spring then does the
 *   whole bounce — out and back — which is why the impulse is capped at the
 *   value whose peak displacement is 3%, half the drag cap.
 *
 * It removes itself where it would be wrong rather than fighting: under
 * prefers-reduced-motion, and on Safari and iOS, which rubber-band the scroller
 * natively and would show both effects at once.
 */

type Edge = 'top' | 'bottom';

/* -------------------------------------------------------------------------- */
/* Physics                                                                     */

/** Asymptote of the resistance curve — pull forever and you approach 7%. */
const CURVE_CEILING = 0.07;
/** Pull, in px, at which the curve has spent half its range. */
const CURVE_HALFWAY = 600;
/** Hard cap on the stretch, whatever the curve says. */
const MAX_STRETCH = 0.06;
/** Cross-axis narrowing is a third of the main-axis growth. */
const CROSS_AXIS_RATIO = 3;

/*
 * ζ = 23/(2√340) ≈ 0.62 and ω = √340 ≈ 18.4 rad/s: one overshoot of about 8% of
 * the release displacement, settled (to 2%) in 4/ζω ≈ 348ms.
 *
 * ζ was the number worth spending time on. At 0.72 the settle time is the same
 * but the overshoot is 4%, which is arithmetically present and visually absent —
 * it measures as a bounce and looks like a plain ease-out. 0.62 is the point
 * where it becomes something you can see without becoming something that wobbles.
 */
const SPRING_STIFFNESS = 340;
const SPRING_DAMPING = 23;
/** Below both of these the spring is visually finished and is snapped to rest. */
const REST_STRETCH = 0.0002;
const REST_VELOCITY = 0.004;

/** px/s at which an arrival starts to register as a fling at all. */
const FLING_MIN_SPEED = 900;
/** px/s at which a fling is at full strength. */
const FLING_FULL_SPEED = 4200;
/**
 * Peak stretch of a spring released from rest with velocity v is
 * v · e^(−ζ·atan(√(1−ζ²)/ζ)/√(1−ζ²)) / ω√(1−ζ²), which is v · 0.0339 for the
 * constants above. 0.88 is therefore the impulse whose bounce tops out at 3% —
 * half the drag cap, because nobody chose to make this one happen.
 */
const FLING_MAX_IMPULSE = 0.88;

/** A wheel has no "end", so stillness stands in for one. */
const WHEEL_IDLE = 90;
/** deltaMode 1 reports lines; 16px is the conventional stand-in. */
const WHEEL_LINE = 16;
/** Longest frame the integrator will accept, so a stall cannot explode it. */
const MAX_FRAME = 0.032;

function resistance(pull: number): number {
  if (pull <= 0) return 0;
  return Math.min(MAX_STRETCH, CURVE_CEILING * (1 - 1 / (1 + pull / CURVE_HALFWAY)));
}

/**
 * True where the browser already bounces the scroller itself.
 *
 * Safari — desktop and iOS alike — rubber-bands the document natively and does
 * not honour `overscroll-behavior` for it, so running this as well would show
 * two overscroll effects stacked on one gesture. Both signals are checked: the
 * vendor string catches Safari proper, and touch + a -webkit-only property
 * catches the iOS WebView engines that report someone else's vendor while still
 * being WebKit underneath.
 */
function hasNativeOverscroll(): boolean {
  const apple = /apple/i.test(navigator.vendor);
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const webkit = typeof CSS !== 'undefined' && CSS.supports('-webkit-touch-callout', 'none');
  return apple || (touch && webkit);
}

export interface StretchScrollProps {
  children: React.ReactNode;
  /**
   * Stretch the DOCUMENT scroller rather than this element.
   *
   * The wrapper then scrolls nothing itself — it exists only to carry the
   * transform — so it must contain everything that should stretch and nothing
   * that must not. Sticky headers and fixed bars belong OUTSIDE it: a transform
   * makes an element the containing block for fixed descendants, which would
   * turn a fixed tab bar into one that scrolls away.
   */
  root?: boolean;
  /** Outer element. In non-root mode this is the scroll container. */
  className?: string;
  /** Inner element — the one that actually carries the transform. */
  contentClassName?: string;
}

export function StretchScroll({
  children,
  root = false,
  className,
  contentClassName,
}: StretchScrollProps) {
  const outerRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const prefersReduced = usePrefersReducedMotion();

  React.useEffect(() => {
    if (prefersReduced) return;

    const outerEl = outerRef.current;
    const contentEl = contentRef.current;
    if (!outerEl || !contentEl) return;
    if (hasNativeOverscroll()) return;

    /*
     * Rebound, not used directly. The handlers below are function DECLARATIONS,
     * which hoist above the null check, so TypeScript will not carry the
     * narrowing into them and every `.style` write reads as possibly-null.
     * Assigning after the guard gives them a non-null type to close over.
     */
    const outer = outerEl;
    const content = contentEl;

    const scroller: HTMLElement = root
      ? ((document.scrollingElement as HTMLElement | null) ?? document.documentElement)
      : outer;
    const target: EventTarget = root ? window : outer;

    let mode: 'idle' | 'drag' | 'spring' = 'idle';
    let edge: Edge = 'top';
    let pull = 0;
    let stretch = 0;
    let velocity = 0;

    let frame = 0;
    let lastFrameAt = 0;

    /*
     * Scroll geometry is CACHED rather than measured per event. The drag path
     * runs at touch frequency and writes a transform every frame; reading
     * scrollHeight in the same handler would force a synchronous layout on a
     * subtree that has a pending transform — the classic thrash, and the one
     * thing that would actually cost frames here.
     */
    let scrollTop = 0;
    let scrollMax = 0;

    function measure() {
      scrollTop = scroller.scrollTop;
      scrollMax = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    }

    const atTop = () => scrollTop <= 1;
    const atBottom = () => scrollTop >= scrollMax - 1;

    /* ---------------------------------------------------------------- */
    /* Painting                                                          */

    function paint() {
      /*
       * `=== 0`, not `<= 0`. The spring crosses zero on its way to rest, and a
       * `<= 0` guard threw the whole overshoot away: the content snapped to
       * identity at the crossing and the rebound — the one part of this that
       * reads as a physical material rather than as an easing curve — was
       * computed every frame and never drawn. A negative stretch is a valid
       * frame, and scaleY < 1 with scaleX > 1 is exactly the right shape for it.
       */
      if (stretch === 0) {
        content.style.transform = '';
        content.style.transformOrigin = '';
        return;
      }
      content.style.transformOrigin = edge === 'top' ? '50% 0%' : '50% 100%';
      content.style.transform = `scaleY(${1 + stretch}) scaleX(${1 - stretch / CROSS_AXIS_RATIO})`;
    }

    function activate() {
      content.style.willChange = 'transform';
      /*
       * A transformed box still contributes to its scroll container's
       * SCROLLABLE OVERFLOW, so a 6% stretch on a long page silently adds 6% of
       * its height to the scroll range and the scrollbar thumb visibly shrinks
       * mid-gesture. Clipping the untransformed outer element removes that
       * contribution, and clips nothing anyone can see: the content only ever
       * grows past the edge OPPOSITE the one being looked at.
       *
       * Only while active — the storefront's card hover deliberately overflows
       * its row, and that must keep working the rest of the time.
       */
      if (root) outer.style.overflow = 'clip';
    }

    function deactivate() {
      content.style.willChange = '';
      if (root) outer.style.overflow = '';
    }

    function stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    }

    function tick(now: number) {
      const dt = Math.min(MAX_FRAME, (now - lastFrameAt) / 1000);
      lastFrameAt = now;

      if (mode === 'drag') {
        stretch = resistance(pull);
      } else if (mode === 'spring') {
        // Semi-implicit Euler: velocity first, then position. Stable at these
        // constants for any frame the cap above allows.
        velocity += (-SPRING_STIFFNESS * stretch - SPRING_DAMPING * velocity) * dt;
        stretch += velocity * dt;
        if (Math.abs(stretch) < REST_STRETCH && Math.abs(velocity) < REST_VELOCITY) {
          stretch = 0;
          velocity = 0;
          mode = 'idle';
        }
      }

      paint();

      if (mode === 'idle') {
        deactivate();
        stop();
        return;
      }
      frame = requestAnimationFrame(tick);
    }

    function run() {
      if (frame) return;
      lastFrameAt = performance.now();
      activate();
      frame = requestAnimationFrame(tick);
    }

    /* ---------------------------------------------------------------- */
    /* Gestures                                                          */

    function beginDrag(which: Edge, initial: number) {
      // The edge is LATCHED here and not re-read until release. In a scroll
      // container the stretch grows scrollHeight, so "am I still at the bottom"
      // flips to false mid-pull and the gesture would abandon itself.
      edge = which;
      pull = initial;
      mode = 'drag';
      velocity = 0;
      run();
    }

    function release() {
      if (mode !== 'drag') return;
      pull = 0;
      velocity = 0;
      mode = 'spring';
      run();
    }

    let touching = false;
    let lastY = 0;

    function onTouchStart(event: TouchEvent) {
      if (event.touches.length !== 1) return;
      touching = true;
      lastY = event.touches[0].clientY;
      measure();
    }

    function onTouchMove(event: TouchEvent) {
      if (!touching || event.touches.length !== 1) return;
      const y = event.touches[0].clientY;
      const dy = y - lastY;
      lastY = y;
      if (dy === 0) return;

      if (mode === 'drag') {
        pull = Math.max(0, pull + (edge === 'top' ? dy : -dy));
        return;
      }
      // Finger moving down at the top, or up at the bottom, is a pull.
      if (dy > 0 && atTop()) beginDrag('top', dy);
      else if (dy < 0 && atBottom()) beginDrag('bottom', -dy);
    }

    function onTouchEnd() {
      touching = false;
      release();
    }

    let wheelIdle = 0;

    function onWheel(event: WheelEvent) {
      if (touching) return;
      const scale =
        event.deltaMode === 1 ? WHEEL_LINE : event.deltaMode === 2 ? window.innerHeight : 1;
      const dy = event.deltaY * scale;
      if (dy === 0) return;

      if (mode === 'drag') {
        pull = Math.max(0, pull + (edge === 'top' ? -dy : dy));
      } else if (dy < 0 && atTop()) {
        beginDrag('top', -dy);
      } else if (dy > 0 && atBottom()) {
        beginDrag('bottom', dy);
      } else {
        return;
      }

      clearTimeout(wheelIdle);
      wheelIdle = window.setTimeout(release, WHEEL_IDLE);
    }

    /* ---------------------------------------------------------------- */
    /* Fling — velocity at the moment of arrival, no touch involved      */

    let lastScrollTop = 0;
    let lastScrollAt = 0;
    let wasAtTop = false;
    let wasAtBottom = false;

    function onScroll() {
      const previous = lastScrollTop;
      const now = performance.now();
      measure();

      const elapsed = now - lastScrollAt;
      const speed = elapsed > 0 ? ((scrollTop - previous) / elapsed) * 1000 : 0;
      lastScrollTop = scrollTop;
      lastScrollAt = now;

      const top = atTop();
      const bottom = atBottom();

      // Only a fresh arrival counts, and only when nothing else is driving the
      // stretch — a wheel pull reaches the bound first and already owns it.
      if (mode === 'idle') {
        if (top && !wasAtTop && speed <= -FLING_MIN_SPEED) fling('top', -speed);
        else if (bottom && !wasAtBottom && speed >= FLING_MIN_SPEED) fling('bottom', speed);
      }

      wasAtTop = top;
      wasAtBottom = bottom;
    }

    function fling(which: Edge, speed: number) {
      const range = FLING_FULL_SPEED - FLING_MIN_SPEED;
      const strength = Math.min(1, (speed - FLING_MIN_SPEED) / range);
      edge = which;
      stretch = 0;
      velocity = strength * FLING_MAX_IMPULSE;
      mode = 'spring';
      run();
    }

    /* ---------------------------------------------------------------- */

    const passive = { passive: true } as const;
    measure();
    lastScrollTop = scrollTop;
    lastScrollAt = performance.now();
    wasAtTop = atTop();
    wasAtBottom = atBottom();

    target.addEventListener('scroll', onScroll, passive);
    target.addEventListener('wheel', onWheel as EventListener, passive);
    target.addEventListener('touchstart', onTouchStart as EventListener, passive);
    target.addEventListener('touchmove', onTouchMove as EventListener, passive);
    target.addEventListener('touchend', onTouchEnd, passive);
    target.addEventListener('touchcancel', onTouchEnd, passive);
    window.addEventListener('resize', measure, passive);

    return () => {
      target.removeEventListener('scroll', onScroll);
      target.removeEventListener('wheel', onWheel as EventListener);
      target.removeEventListener('touchstart', onTouchStart as EventListener);
      target.removeEventListener('touchmove', onTouchMove as EventListener);
      target.removeEventListener('touchend', onTouchEnd);
      target.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('resize', measure);
      clearTimeout(wheelIdle);
      stop();
      stretch = 0;
      paint();
      deactivate();
    };
  }, [root, prefersReduced]);

  return (
    <div
      ref={outerRef}
      className={cn(
        // The browser's own glow / pull-to-refresh would otherwise answer the
        // same gesture. In root mode the equivalent lives on <html>, since a
        // wrapper cannot disable an effect owned by the viewport.
        !root && 'overflow-y-auto overscroll-y-none',
        className,
      )}
    >
      <div ref={contentRef} className={contentClassName}>
        {children}
      </div>
    </div>
  );
}
