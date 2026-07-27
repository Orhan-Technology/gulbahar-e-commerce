import type { Config } from 'tailwindcss';

/**
 * Every value here resolves to a CSS variable from app/globals.css (PRD §10.2).
 *
 * fontSize and boxShadow are REPLACED rather than extended, which closes those
 * scales: text-4xl and shadow-2xl simply do not exist. shadcn's shadow-sm/md/lg
 * are aliased onto our two elevation levels so vendored component code cannot
 * introduce a third.
 *
 * Spacing keeps Tailwind's default scale — it is already a 4px base scale and a
 * superset of the PRD's 4/8/12/16/24/32/48/64. shadcn primitives depend on the
 * intermediate steps (h-9, gap-1.5, size-4), so narrowing it would break them.
 * The PRD's actual rule — no arbitrary values — is what matters and still holds.
 */

const withAlpha = (variable: string) => `hsl(var(${variable}) / <alpha-value>)`;

const scale = (name: string, steps: readonly number[]) =>
  Object.fromEntries(steps.map((step) => [step, withAlpha(`--${name}-${step}`)]));

const FULL_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const NEUTRAL_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          ...scale('primary', FULL_STEPS),
          DEFAULT: withAlpha('--primary-700'),
          foreground: withAlpha('--primary-50'),
        },
        accent: {
          ...scale('accent', FULL_STEPS),
          DEFAULT: withAlpha('--accent-600'),
          /* Gold at 38% lightness is dark enough to carry white text. */
          foreground: withAlpha('--accent-50'),
        },
        neutral: scale('neutral', NEUTRAL_STEPS),

        success: {
          DEFAULT: withAlpha('--success'),
          fg: withAlpha('--success-fg'),
          bg: withAlpha('--success-bg'),
          border: withAlpha('--success-border'),
        },
        warning: {
          DEFAULT: withAlpha('--warning'),
          fg: withAlpha('--warning-fg'),
          bg: withAlpha('--warning-bg'),
          border: withAlpha('--warning-border'),
        },
        danger: {
          DEFAULT: withAlpha('--danger'),
          fg: withAlpha('--danger-fg'),
          bg: withAlpha('--danger-bg'),
          border: withAlpha('--danger-border'),
        },

        background: withAlpha('--background'),
        foreground: withAlpha('--foreground'),
        card: {
          DEFAULT: withAlpha('--card'),
          foreground: withAlpha('--card-foreground'),
        },
        overlay: {
          DEFAULT: withAlpha('--overlay'),
          foreground: withAlpha('--overlay-foreground'),
        },
        scrim: withAlpha('--scrim'),
        border: withAlpha('--border'),
        input: withAlpha('--input'),
        ring: withAlpha('--ring'),

        /*
         * shadcn aliases. Its primitives reference bg-muted / bg-popover /
         * bg-destructive / bg-secondary; pointing them at our neutrals keeps
         * vendored code working without a second palette.
         *
         * Note: shadcn also uses `accent` for subtle hover backgrounds, but
         * `accent` is our gold. Hover usages are rewritten to `muted` when a
         * component is added — we own the code (PRD §10.4).
         */
        muted: {
          DEFAULT: withAlpha('--neutral-100'),
          foreground: withAlpha('--neutral-500'),
        },
        secondary: {
          DEFAULT: withAlpha('--neutral-100'),
          foreground: withAlpha('--neutral-800'),
        },
        popover: {
          DEFAULT: withAlpha('--overlay'),
          foreground: withAlpha('--overlay-foreground'),
        },
        destructive: {
          DEFAULT: withAlpha('--danger'),
          foreground: withAlpha('--danger-fg'),
        },
      },

      fontFamily: {
        sans: ['var(--font-app)', 'system-ui', 'sans-serif'],
        latin: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        arabic: ['var(--font-vazirmatn)', 'system-ui', 'sans-serif'],
      },

      borderRadius: {
        card: 'var(--radius-card)',
        control: 'var(--radius-control)',
        pill: 'var(--radius-pill)',
        /* shadcn's rounded-md / -lg / -sm all land on the control radius. */
        sm: 'var(--radius-control)',
        md: 'var(--radius-control)',
        lg: 'var(--radius-card)',
      },

      keyframes: {
        /* Wishlist heart: one satisfying pop, no bounce loop (PRD §10.6). */
        'heart-pop': {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.35)' },
          '70%': { transform: 'scale(0.94)' },
          '100%': { transform: 'scale(1)' },
        },
        /* New action-queue items slide in (PRD §6.1, §10.6). */
        'queue-in': {
          '0%': { opacity: '0', transform: 'translateY(-6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        /* Skeleton shimmer — direction is flipped for RTL in globals. */
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'heart-pop': 'heart-pop 280ms ease-out',
        'queue-in': 'queue-in 200ms ease-out',
        'fade-in': 'fade-in 150ms ease-out',
      },

      transitionDuration: {
        /* Nothing over 300ms (PRD §10.6). */
        fast: '150ms',
        base: '200ms',
        slow: '300ms',
      },
    },

    /* Closed scales — replaced, not extended. */
    fontSize: {
      xs: ['var(--text-xs)', { lineHeight: '1.125rem' }],
      sm: ['var(--text-sm)', { lineHeight: '1.375rem' }],
      base: ['var(--text-base)', { lineHeight: '1.625rem' }],
      lg: ['var(--text-lg)', { lineHeight: '1.875rem' }],
      xl: ['var(--text-xl)', { lineHeight: '2.125rem' }],
      '2xl': ['var(--text-2xl)', { lineHeight: '2.5rem' }],
      '3xl': ['var(--text-3xl)', { lineHeight: '3rem' }],
    },
    boxShadow: {
      none: 'none',
      card: 'var(--shadow-card)',
      overlay: 'var(--shadow-overlay)',
      /* Aliases so vendored shadcn code stays on the two-level system. */
      sm: 'var(--shadow-card)',
      DEFAULT: 'var(--shadow-card)',
      md: 'var(--shadow-card)',
      lg: 'var(--shadow-overlay)',
      xl: 'var(--shadow-overlay)',
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
