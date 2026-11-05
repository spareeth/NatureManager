import { Navigate, Route, Routes } from 'react-router-dom';
import { db } from '../offline/db';
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
import { ScanPage } from '../pages/ScanPage';
import { TaxonListPage } from '../pages/TaxonListPage';
import { TaxonDetailPage } from '../pages/TaxonDetailPage';
import { ControlPointsPage } from '../pages/ControlPointsPage';
import { WorkPage } from '../pages/WorkPage';
import { WorkOrderPage } from '../pages/WorkOrderPage';
import { BasemapsPage } from '../pages/BasemapsPage';
import { RequestsPage } from '../pages/RequestsPage';
import { RequestDetailPage } from '../pages/RequestDetailPage';
import { PlanPage } from '../pages/PlanPage';
import { SopEditorPage } from '../pages/SopEditorPage';
import { canEditAssets } from '../auth/canEdit';
import { OrgSwitcher } from '../components/OrgSwitcher';
import { Centered, Loading, RequireRole } from './guards';
import { NAV, visibleNav } from './nav';
import { PhoneMenu } from './PhoneMenu';
import { BrandLockup } from '../components/BrandLockup';
import { SitePicker } from '../components/SitePicker';

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
  const signOutNow = () =>
    void (async () => {
      // Unsent field changes are lost on sign-out (the offline store is cleared).
      const waiting = await db.outbox.count().catch(() => 0);
      if (waiting && !window.confirm(t('fieldApp.signOutPending', { count: waiting }))) return;
      await signOut();
    })();
  const userControls = (
    <>
      <SitePicker large />
      <OrgSwitcher />
      <span className="w-full text-sm opacity-90" title={session.user.email}>
        {current.displayName} ({current.roles.map((r) => t(`roles.${r}`)).join(', ')})
      </span>
      <button
        type="button"
        onClick={toggleLanguage}
        className="min-h-12 rounded border px-3 text-sm"
      >
        {t('language.switch')}
      </button>
      <button type="button" onClick={signOutNow} className="min-h-12 px-2 text-sm underline">
        {t('auth.signOut')}
      </button>
    </>
  );

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-stretch bg-green-800 text-white">
        <span className="flex items-center ps-3 pe-2 text-base font-bold whitespace-nowrap sm:px-4 sm:text-xl">
          {t('app.title')}
        </span>
        <PhoneMenu items={visibleNav(current.roles)} extra={userControls} />
      </header>
      <main className="min-h-0 flex-1">
        <Routes>
          <Route path="/" element={<MapPage />} />
          <Route path="/a/:code" element={<ScanPage />} />
          <Route path="/q/:code" element={<ScanPage />} />
          <Route path="/assets" element={<AssetListPage />} />
          <Route path="/taxa" element={<TaxonListPage />} />
          <Route path="/work" element={<WorkPage />} />
          <Route path="/work/:id" element={<WorkOrderPage />} />
          <Route path="/taxa/:id" element={<TaxonDetailPage />} />
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
            path="/basemaps"
            element={
              <RequireRole roles={roleOf('/basemaps')}>
                <BasemapsPage />
              </RequireRole>
            }
          />
          <Route path="/requests" element={<RequestsPage />} />
          <Route path="/requests/:id" element={<RequestDetailPage />} />
          <Route
            path="/plan"
            element={
              <RequireRole roles={roleOf('/plan')}>
                <PlanPage />
              </RequireRole>
            }
          />
          <Route
            path="/plan/sops/:id"
            element={
              <RequireRole roles={roleOf('/plan')}>
                <SopEditorPage />
              </RequireRole>
            }
          />
          <Route
            path="/control-points"
            element={
              <RequireRole roles={roleOf('/control-points')}>
                <ControlPointsPage />
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
      <footer className="flex justify-end bg-green-800 px-3 py-1">
        <BrandLockup height={18} />
      </footer>
    </div>
  );
}
