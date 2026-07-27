/**
 * Demo-mode gate (PRD §9.3).
 *
 * The presenter tools — notification log, control panel, role swap — are powerful
 * enough that they must not exist outside a demo build: the role swap in particular
 * signs anyone in as anyone with no credential at all.
 *
 * So the flag is checked in THREE places, and each is load-bearing:
 *
 *   1. The layout, so the UI is absent rather than merely hidden.
 *   2. Every demo server action, because an action is reachable by anyone who knows
 *      its id whether or not a button renders.
 *   3. The `demo` auth provider's authorize(), which is the last line before a
 *      session is minted.
 *
 * Read from the environment on each call rather than captured at module load, so
 * flipping it in .env takes effect on the next request without a rebuild.
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}

/** Throws in production-ish builds; demo actions call this before doing anything. */
export function assertDemoMode(): void {
  if (!isDemoMode()) throw new Error('Demo mode is disabled');
}

/**
 * Order statuses in walkthrough order, so the scrubber can step either way
 * (PRD §9.3). `rejected` is absent deliberately: it is terminal and off the happy
 * path, so scrubbing through it would misrepresent the flow.
 */
export const DEMO_STATUS_SEQUENCE = ['placed', 'accepted', 'ready', 'fulfilled'] as const;

export type DemoScrubStatus = (typeof DEMO_STATUS_SEQUENCE)[number];

/** The four screens the walkthrough lingers on (PRD §10.8). */
export const QUALITY_BAR_SCREENS = [
  { key: 'home', href: '/' },
  { key: 'product', href: '/products' },
  { key: 'dashboard', href: '/dashboard' },
  { key: 'revenue', href: '/admin/revenue' },
] as const;
