import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { phoneTabs, type NavItem } from './nav';

// The header menu on every screen size: Map, Field app and Work orders as tabs; everything else
// (other pages, project, organisation, user, language, sign out) under "More".
export function PhoneMenu({ items, extra }: { items: NavItem[]; extra: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const panel = useRef<HTMLDivElement>(null);
  const { tabs, more } = phoneTabs(items);
  // Close on a tap outside, or when a page is chosen.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-12 flex-1 items-center justify-center border-e border-white/40 px-1.5 text-center text-sm whitespace-nowrap sm:flex-none sm:px-4 sm:text-base ${
      isActive ? 'bg-white/15 font-semibold underline' : ''
    }`;
  const moreActive = more.some((i) =>
    i.path === '/' ? location.pathname === '/' : location.pathname.startsWith(i.path),
  );

  return (
    <div className="relative min-w-0 flex-1 sm:flex-none" ref={panel}>
      <nav aria-label={t('nav.label')} className="flex h-full">
        {tabs.map((i) => (
          <NavLink key={i.path} to={i.path} end={i.path === '/'} className={tab}>
            {t(i.labelKey)}
          </NavLink>
        ))}
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((o) => !o)}
          className={`flex min-h-12 flex-1 items-center justify-center px-1.5 text-sm whitespace-nowrap sm:flex-none sm:px-4 sm:text-base ${open || moreActive ? 'bg-white/15 font-semibold' : ''}`}
        >
          {t('nav.more')} {open ? '▴' : '▾'}
        </button>
      </nav>
      {open && (
        <div
          role="menu"
          aria-label={t('nav.more')}
          className="absolute end-0 top-full z-[2000] w-screen sm:w-80 max-h-[75vh] overflow-auto bg-green-900 pb-2 text-white shadow-lg"
        >
          {more.map((i) => (
            <NavLink
              key={i.path}
              to={i.path}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex min-h-12 items-center border-b border-white/20 px-4 ${isActive ? 'bg-white/15 font-semibold' : ''}`
              }
            >
              {t(i.labelKey)}
            </NavLink>
          ))}
          <div className="flex flex-wrap items-center gap-3 px-4 pt-3">{extra}</div>
        </div>
      )}
    </div>
  );
}
