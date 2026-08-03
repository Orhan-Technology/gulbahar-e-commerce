import { getTranslations } from 'next-intl/server';

import { ChipScroller } from '@/components/dashboard/chip-scroller';
import { pressable } from '@/components/motion/pressable';
import { Link } from '@/lib/i18n/navigation';
import { SHOP_REPORTS, type ShopReportKey } from '@/lib/shop-reports';
import { cn } from '@/lib/utils';

/**
 * The reports tab bar (Prompt C10).
 *
 * LINKS, so each report is a URL a shopkeeper can bookmark or send to whoever
 * does their pricing. Client-side tabs would have made all five reports' SQL
 * run on every visit and left "the products nobody buys" without an address.
 *
 * The range travels WITH the tab. A shopkeeper who has just set ninety days and
 * then opens the stock report expects ninety days; losing the window on every
 * tab change is the small thing that makes a console feel like it is fighting
 * you.
 */
export async function ReportTabs({
  active,
  range,
}: {
  active: ShopReportKey;
  range: string;
}) {
  const t = await getTranslations('shopReports.tabs');

  return (
    <ChipScroller
      // Same fix as the catalogue chips: at 390px «زمان سفارش‌ها» is the fifth
      // tab in a row that shows three, so opening it directly left the bar
      // looking like nothing was selected. See chip-scroller.tsx.
      className="border-border -mx-4 border-b px-4 sm:mx-0 sm:px-0"
    >
      <nav aria-label={t('label')} data-report-tabs className="flex gap-1">
        {SHOP_REPORTS.map((report) => {
          const isActive = report === active;
          return (
            <Link
              key={report}
              href={
                report === 'overview'
                  ? `/dashboard/reports?range=${range}`
                  : `/dashboard/reports?report=${report}&range=${range}`
              }
              scroll={false}
              aria-current={isActive ? 'page' : undefined}
              data-chip-active={isActive}
              data-report={report}
              className={cn(
                pressable,
                'shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-[color,border-color,scale] duration-150 ease-out',
                isActive
                  ? 'border-primary text-primary font-bold'
                  : 'hover:text-foreground border-transparent text-neutral-600',
              )}
            >
              {t(report)}
            </Link>
          );
        })}
      </nav>
    </ChipScroller>
  );
}
