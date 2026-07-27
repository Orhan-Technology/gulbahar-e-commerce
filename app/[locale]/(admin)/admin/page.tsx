import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';

export default async function AdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">{t('admin.heading')}</h1>
      <p className="opacity-70">{t('admin.placeholder')}</p>
      <Link href="/" className="text-sm underline">
        {t('errors.backHome')}
      </Link>
    </div>
  );
}
