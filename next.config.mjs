import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Local filesystem only — no remote patterns, no CDN (PRD §12.4).
    formats: ['image/webp'],
  },
};

export default withNextIntl(nextConfig);
