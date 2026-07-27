import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n/navigation';

export default async function LocaleNotFound() {
  const t = await getTranslations('errors');

  return (
    <div className="space-y-3 p-8">
      <h1 className="text-2xl font-bold">{t('notFoundTitle')}</h1>
      <p className="opacity-70">{t('notFoundBody')}</p>
      <Link href="/" className="text-sm underline">
        {t('backHome')}
      </Link>
    </div>
  );
}
