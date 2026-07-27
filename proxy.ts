import createMiddleware from 'next-intl/middleware';
import { routing } from './lib/i18n/routing';

/**
 * Locale routing. Next 16 renamed the `middleware` file convention to `proxy`;
 * the default export contract is unchanged, so next-intl's createMiddleware
 * still slots in directly.
 */
export default createMiddleware(routing);

export const config = {
  // Everything except API routes, Next internals, and static files.
  matcher: ['/((?!api|_next|_vercel|uploads|.*\\..*).*)'],
};
