import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

type MessageTree = { [key: string]: string | MessageTree };

const isTree = (value: unknown): value is MessageTree =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Deep-merges a locale's messages over the Dari base so a partially translated
 * locale falls back key-by-key instead of losing whole nested groups
 * (PRD §11 fallback chain: ps → fa, en → fa).
 */
function deepMerge(base: MessageTree, override: MessageTree): MessageTree {
  const out: MessageTree = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    out[key] = isTree(value) && isTree(existing) ? deepMerge(existing, value) : value;
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const base = (await import('../../messages/fa.json')).default as MessageTree;
  const messages =
    locale === 'fa'
      ? base
      : deepMerge(base, (await import(`../../messages/${locale}.json`)).default as MessageTree);

  return {
    locale,
    messages,
    timeZone: 'Asia/Kabul',
  };
});
