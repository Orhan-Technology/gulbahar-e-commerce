import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Link } from '@/lib/i18n/navigation';

export default async function HomePage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">{t('storefront.heading')}</h1>
      <p className="opacity-70">{t('storefront.placeholder')}</p>
      <LocaleSwitcher />
      <nav className="flex flex-wrap gap-3 pt-4 text-sm underline">
        <Link href="/dashboard">{t('dashboard.heading')}</Link>
        <Link href="/admin">{t('admin.heading')}</Link>
      </nav>
    </div>
  );
}
