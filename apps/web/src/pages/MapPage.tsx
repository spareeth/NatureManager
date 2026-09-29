import { useTranslation } from 'react-i18next';
import { LeafletMap } from '../components/LeafletMap';

export function MapPage() {
  const { t } = useTranslation();
  return (
    <section className="flex h-full flex-col">
      <h1 className="sr-only">{t('map.heading')}</h1>
      <LeafletMap className="min-h-0 flex-1" />
    </section>
  );
}
