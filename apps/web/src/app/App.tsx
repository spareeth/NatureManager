import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context';
import { useOrg } from '../org/context';
import { MapPage } from '../pages/MapPage';
import { FieldPage } from '../pages/FieldPage';
import { LoginPage } from '../pages/LoginPage';
import { MembersPage } from '../pages/MembersPage';
import { AssetListPage } from '../pages/AssetListPage';
import { AssetDetailPage } from '../pages/AssetDetailPage';
import { AssetEditPage } from '../pages/AssetEditPage';
import { canEditAssets } from '../auth/canEdit';
import { OrgSwitcher } from '../components/OrgSwitcher';
import { Centered, Loading, RequireRole } from './guards';
import { NAV, visibleNav } from './nav';

const roleOf = (path: string) => NAV.find((n) => n.path === path)?.roles;

export function App() {
  const { t, i18n } = useTranslation();
  const { session, loading: authLoading, signOut } = useAuth();
  const { current, loading: orgLoading, error } = useOrg();

  if (authLoading) return <Loading />;
  if (!session) return <LoginPage />;
  if (orgLoading) return <Loading />;
  if (error)
    return (
      <Centered>
        <p role="alert">{error}</p>
      </Centered>
    );
  if (!current) {
    return (
      <Centered>
        <div className="space-y-3 text-center">
          <p>{t('org.none')}</p>
          <button type="button" onClick={() => void signOut()} className="underline">
            {t('auth.signOut')}
          </button>
        </div>
      </Centered>
    );
  }

  const toggleLanguage = () => void i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar');
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'font-semibold underline' : 'hover:underline';

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-green-800 px-4 py-2 text-white">
        <span className="font-bold">{t('app.title')}</span>
        <nav aria-label={t('nav.label')} className="flex gap-4">
          {visibleNav(current.roles).map((item) => (
            <NavLink key={item.path} to={item.path} end={item.path === '/'} className={linkClass}>
              {t(item.labelKey)}
            </NavLink>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-4">
          <OrgSwitcher />
          <span className="text-sm opacity-90" title={session.user.email}>
            {current.displayName} ({current.roles.map((r) => t(`roles.${r}`)).join(', ')})
          </span>
          <button
            type="button"
            onClick={toggleLanguage}
            className="rounded border px-2 py-1 text-sm"
          >
            {t('language.switch')}
          </button>
          <button type="button" onClick={() => void signOut()} className="text-sm underline">
            {t('auth.signOut')}
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/assets" element={<AssetListPage />} />
          <Route path="/assets/:id" element={<AssetDetailPage />} />
          <Route
            path="/assets/:id/edit"
            element={
              canEditAssets(current.roles) ? <AssetEditPage /> : <Navigate to="/assets" replace />
            }
          />
          <Route
            path="/field/*"
            element={
              <RequireRole roles={roleOf('/field')}>
                <FieldPage />
              </RequireRole>
            }
          />
          <Route
            path="/members"
            element={
              <RequireRole roles={roleOf('/members')}>
                <MembersPage />
              </RequireRole>
            }
          />
          <Route path="*" element={<MapPage />} />
        </Routes>
      </main>
    </div>
  );
}
