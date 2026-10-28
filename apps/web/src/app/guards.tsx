import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useOrg } from '../org/context';
import { canSee, type NavItem } from './nav';

/** Renders children only if the current role set may see the route. */
export function RequireRole({ roles, children }: Pick<NavItem, 'roles'> & { children: ReactNode }) {
  const { current } = useOrg();
  if (!current || !canSee({ roles }, current.roles)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 text-gray-700">
      {children}
    </div>
  );
}

export function Loading() {
  const { t } = useTranslation();
  return <Centered>{t('common.loading')}</Centered>;
}
