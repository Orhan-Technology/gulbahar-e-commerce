'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePathname, useRouter } from '@/lib/i18n/navigation';

const OPTIONS = ['newest', 'price_asc', 'price_desc', 'rating'] as const;

/**
 * Sort control (PRD §5.1). Writes to the URL like the filters do, so a sorted
 * view is shareable and the grid stays server-rendered.
 */
export function SortSelect() {
  const t = useTranslations('filters.sort');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const current = params.get('sort') ?? 'newest';

  return (
    <Select
      value={current}
      onValueChange={(value) => {
        const next = new URLSearchParams(params.toString());
        if (value === 'newest') next.delete('sort');
        else next.set('sort', value);
        next.delete('page');
        const query = next.toString();
        router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
      }}
    >
      <SelectTrigger className="w-44" aria-label={t('label')}>
        <SelectValue placeholder={t('label')} />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((option) => (
          <SelectItem key={option} value={option}>
            {t(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
