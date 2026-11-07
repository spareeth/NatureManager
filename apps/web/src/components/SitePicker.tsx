import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOrg } from '../org/context';
import { useCurrentSite } from '../org/useSite';
import { setSiteChoice, UPCOMING_SITES } from '../org/siteChoice';

/** Project picker in the header: the organisation's sites, plus projects that are not set up yet
 *  (shown, not selectable). */
export function SitePicker({ large = false }: { large?: boolean }) {
  const { t } = useTranslation();
  const { current } = useOrg();
  const { site, sites } = useCurrentSite();
  const queryClient = useQueryClient();
  if (!current || !sites) return null;
  const upcoming = UPCOMING_SITES.filter((u) => !sites.some((s) => s.code === u.code));
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className={large ? '' : 'sr-only'}>{t('site.project')}</span>
      <select
        aria-label={t('site.project')}
        value={site?.id ?? ''}
        onChange={(e) => {
          setSiteChoice(current.organisationId, e.target.value);
          // Site-scoped screens reload for the new project.
          void queryClient.invalidateQueries();
        }}
        className={`rounded border border-white/40 bg-green-900 text-white ${large ? 'min-h-12 px-2' : 'px-2 py-1'}`}
      >
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        {upcoming.map((u) => (
          <option key={u.code} value={`upcoming-${u.code}`} disabled>
            {t('site.comingSoon', { name: u.name })}
          </option>
        ))}
      </select>
    </label>
  );
}
