import { NavLink, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPage } from '../pages/MapPage';
import { FieldPage } from '../pages/FieldPage';

export function App() {
  const { t, i18n } = useTranslation();
  const toggleLanguage = () => void i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar');
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'font-semibold underline' : 'hover:underline';

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-6 bg-green-800 px-4 py-2 text-white">
        <span className="font-bold">{t('app.title')}</span>
        <nav className="flex gap-4">
          <NavLink to="/" end className={linkClass}>
            {t('nav.map')}
          </NavLink>
          <NavLink to="/field" className={linkClass}>
            {t('nav.field')}
          </NavLink>
        </nav>
        <button
          type="button"
          onClick={toggleLanguage}
          className="ms-auto rounded border px-2 py-1 text-sm"
        >
          {t('language.switch')}
        </button>
      </header>
      <main className="min-h-0 flex-1">
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/field/*" element={<FieldPage />} />
        </Routes>
      </main>
    </div>
  );
}
