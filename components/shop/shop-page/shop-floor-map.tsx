import { getLocale, getTranslations } from 'next-intl/server';

import { FloorMap } from '@/components/shop/floor-map';
import { mallMap } from '@/lib/db/queries/mall';
import { siteSettings } from '@/lib/db/queries/settings';
import { formatNumber, formatUnitNumber } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

/**
 * This shop's floor, on its own About tab (Prompt C11).
 *
 * THE SAME MAP AS /floors, not a second drawing of it. C8 shipped a schematic
 * here because the real plan did not exist yet; keeping the schematic now would
 * mean two pictures of one building that could disagree — and the neighbours
 * were exactly what the schematic could not honestly show.
 *
 * `compact` because it sits in a 320px column beside the shop's story, and the
 * legend belongs on the page whose subject is the map.
 */
export async function ShopFloorMap({
  floor,
  unitNumber,
}: {
  floor: number;
  unitNumber: string | null;
}) {
  const locale = await getLocale();
  const t = await getTranslations('shopPage.about');

  const [floors, settings] = await Promise.all([mallMap(), siteSettings()]);
  const target = floors.find((entry) => entry.floor === floor);
  if (!target) return null;

  const unit = Number(unitNumber);

  return (
    <figure className="rounded-card border-border bg-card space-y-3 border p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold">
          {t('planTitle', { floor: formatNumber(floor, locale) })}
        </span>
        <Link
          href={`/floors?floor=${floor}`}
          className="text-primary text-xs font-medium hover:underline"
        >
          {t('planLink')}
        </Link>
      </figcaption>

      <FloorMap
        floor={target}
        highlightUnit={Number.isNaN(unit) ? null : unit}
        now={new Date()}
        mallHours={settings.hours}
        compact
      />

      <p className="text-muted-foreground text-xs">
        {t('planHint', {
          floor: formatNumber(floor, locale),
          unit: formatUnitNumber(unitNumber, locale),
        })}
      </p>
    </figure>
  );
}
