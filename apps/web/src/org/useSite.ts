import { useQuery } from '@tanstack/react-query';
import { fetchSites } from '../map/api';
import { useOrg } from './context';
import { cachedRead } from '../offline/cache';

/** The current organisation's site (the first by code; a site picker comes with the second site). */
export function useCurrentSite() {
  const { current } = useOrg();
  const orgId = current?.organisationId;
  const sites = useQuery({
    queryKey: ['sites', orgId],
    enabled: !!orgId,
    queryFn: () => cachedRead(`sites:${orgId}`, () => fetchSites(orgId!)),
  });
  return {
    site: sites.data?.[0],
    sites: sites.data,
    isPending: sites.isPending,
    error: sites.error,
  };
}
