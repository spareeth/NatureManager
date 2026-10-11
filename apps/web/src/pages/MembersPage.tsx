import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useOrg } from '../org/context';

export function MembersPage() {
  const { t } = useTranslation();
  const { current } = useOrg();
  const orgId = current?.organisationId;

  const query = useQuery({
    queryKey: ['members', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('membership')
        .select('user_id, display_name, roles, active, team:team_id (name)')
        .eq('organisation_id', orgId!)
        .order('display_name');
      if (error) throw new Error(error.message);
      return data;
    },
  });

  return (
    <section className="p-4">
      <h1 className="text-xl font-semibold">{t('members.heading')}</h1>
      {query.isPending && <p className="mt-2 text-gray-600">{t('common.loading')}</p>}
      {query.error && (
        <p role="alert" className="mt-2 text-red-700">
          {query.error.message}
        </p>
      )}
      {query.data && (
        <table className="mt-4 w-full max-w-3xl text-start text-sm">
          <thead>
            <tr className="border-b text-gray-600">
              <th className="py-2 text-start">{t('members.name')}</th>
              <th className="py-2 text-start">{t('members.roles')}</th>
              <th className="py-2 text-start">{t('members.team')}</th>
            </tr>
          </thead>
          <tbody>
            {query.data.map((m) => (
              <tr key={m.user_id} className="border-b">
                <td className="py-2">{m.display_name}</td>
                <td className="py-2">{m.roles.map((r) => t(`roles.${r}`)).join(', ')}</td>
                <td className="py-2">{m.team?.name ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
