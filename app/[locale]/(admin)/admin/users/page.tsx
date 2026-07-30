import { Suspense } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Users } from 'lucide-react';

import { UserRowActions } from '@/components/admin/user-row-actions';
import { EmptyState } from '@/components/custom/empty-state';
import { SearchBox } from '@/components/custom/search-box';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { requireAdmin } from '@/lib/auth/guards';
import { pickLocale } from '@/lib/db/localized';
import { adminUserCounts, adminUsers } from '@/lib/db/queries/admin';
import { formatDate, formatNumber, formatPhone } from '@/lib/format';
import { Link } from '@/lib/i18n/navigation';

type Query = { role?: 'customer' | 'shopkeeper' | 'admin'; q?: string };

/** User management (PRD §7.5). */
export default async function AdminUsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const admin = await requireAdmin(locale);
  const t = await getTranslations('adminUsers');

  const counts = await adminUserCounts();

  const chips = [
    { key: 'all', href: '/admin/users', count: counts.all, active: !query.role },
    ...(['customer', 'shopkeeper', 'admin'] as const).map((role) => ({
      key: role,
      href: `/admin/users?role=${role}`,
      count: counts[role],
      active: query.role === role,
    })),
  ];

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-lg font-bold">{t('title')}</h1>
        <p className="text-muted-foreground max-w-prose text-sm">{t('intro')}</p>
      </div>

      <SearchBox placeholder={t('searchPlaceholder')} />

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Link
            key={chip.key}
            href={chip.href}
            className={`rounded-pill flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium ${
              chip.active
                ? 'border-primary bg-primary-50 text-primary'
                : 'border-border bg-card hover:border-primary'
            }`}
          >
            {t(`roles.${chip.key}`)}
            <Badge variant={chip.active ? 'default' : 'secondary'}>
              {formatNumber(chip.count, locale)}
            </Badge>
          </Link>
        ))}
      </div>

      <Suspense key={`${query.role ?? 'all'}-${query.q ?? ''}`} fallback={<UserListSkeleton />}>
        <UserList locale={locale} query={query} selfId={admin.id} />
      </Suspense>
    </div>
  );
}

async function UserList({
  locale,
  query,
  selfId,
}: {
  locale: string;
  query: Query;
  selfId: string;
}) {
  const t = await getTranslations('adminUsers');
  const rows = await adminUsers({ role: query.role, search: query.q });

  if (rows.length === 0) {
    return (
      <EmptyState
        illustration={<Users className="h-7 w-7" />}
        title={t('emptyTitle')}
        description={t('emptyBody')}
      />
    );
  }

  return (
    <div className="rounded-card border-border bg-card overflow-x-auto border">
      <table className="w-full min-w-2xl text-sm">
        <thead>
          <tr className="text-muted-foreground border-border border-b text-xs">
            <th className="p-3 text-start font-normal">{t('colName')}</th>
            <th className="p-3 text-start font-normal">{t('colPhone')}</th>
            <th className="p-3 text-start font-normal">{t('colRole')}</th>
            <th className="p-3 text-start font-normal">{t('colShop')}</th>
            <th className="p-3 text-start font-normal">{t('colOrders')}</th>
            <th className="p-3 text-start font-normal">{t('colJoined')}</th>
            <th className="p-3 text-end font-normal">{t('colActions')}</th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {rows.map((user) => (
            <tr key={user.id} className={user.active ? 'hover:bg-neutral-50' : 'bg-neutral-50/60'}>
              <td className="p-3">
                <span className="font-medium">{user.name}</span>
                {!user.active && (
                  <Badge variant="destructive" className="ms-2">
                    {t('inactive')}
                  </Badge>
                )}
                {user.id === selfId && (
                  <Badge variant="outline" className="ms-2">
                    {t('you')}
                  </Badge>
                )}
              </td>
              <td className="p-3" dir="ltr">
                {formatPhone(user.phone, locale)}
              </td>
              <td className="p-3">
                <Badge
                  variant={
                    user.role === 'admin'
                      ? 'default'
                      : user.role === 'shopkeeper'
                        ? 'secondary'
                        : 'outline'
                  }
                >
                  {t(`roles.${user.role}`)}
                </Badge>
              </td>
              <td className="p-3 text-xs">
                {user.shopName ? pickLocale(user.shopName, locale) : '—'}
              </td>
              <td className="p-3 text-xs">{formatNumber(user.orderCount, locale)}</td>
              <td className="text-muted-foreground p-3 text-xs">
                {formatDate(user.createdAt, locale, 'short')}
              </td>
              <td className="p-3 text-end">
                <UserRowActions userId={user.id} active={user.active} isSelf={user.id === selfId} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserListSkeleton() {
  return (
    <div className="rounded-card border-border bg-card space-y-2 border p-3">
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="h-8 w-full" />
      ))}
    </div>
  );
}
