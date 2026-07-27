'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePathname, useRouter } from '@/lib/i18n/navigation';

/**
 * Search box that writes `q` into the URL of whatever page it sits on.
 *
 * Used by the shop directory and by an individual shop's own catalogue search
 * (PRD §5.1), so both stay server-rendered and shareable.
 */
export function ShopSearchBox({ placeholder }: { placeholder: string }) {
  const t = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = React.useState(params.get('q') ?? '');

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams(params.toString());
    const term = value.trim();
    if (term) next.set('q', term);
    else next.delete('q');
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-neutral-400"
          aria-hidden
        />
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          aria-label={t('search')}
          className="ps-9 pe-9"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              setValue('');
              const next = new URLSearchParams(params.toString());
              next.delete('q');
              const query = next.toString();
              router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
            }}
            aria-label={t('clear')}
            className="rounded-pill absolute inset-y-0 end-2 my-auto flex h-6 w-6 items-center justify-center text-neutral-400 hover:bg-neutral-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <Button type="submit">{t('search')}</Button>
    </form>
  );
}
