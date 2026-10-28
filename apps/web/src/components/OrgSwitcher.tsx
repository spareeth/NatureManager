import { useTranslation } from 'react-i18next';
import { useOrg } from '../org/context';

export function OrgSwitcher() {
  const { t } = useTranslation();
  const { memberships, current, switchOrg } = useOrg();
  if (!current) return null;
  if (memberships.length < 2) {
    return <span className="text-sm opacity-90">{current.organisationName}</span>;
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">{t('org.switch')}</span>
      <select
        value={current.organisationId}
        onChange={(e) => switchOrg(e.target.value)}
        className="rounded bg-green-900 px-2 py-1 text-white"
      >
        {memberships.map((m) => (
          <option key={m.organisationId} value={m.organisationId}>
            {m.organisationName}
          </option>
        ))}
      </select>
    </label>
  );
}
