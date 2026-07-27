import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware navigation primitives. Use these everywhere instead of
 * next/link and next/navigation so every link preserves the active locale.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
