import { useTranslation } from 'react-i18next';

export function FieldPage() {
  const { t } = useTranslation();
  return (
    <section className="p-4">
      <h1 className="text-xl font-semibold">{t('field.heading')}</h1>
      <p className="mt-2 text-gray-600">{t('field.placeholder')}</p>
    </section>
  );
}
