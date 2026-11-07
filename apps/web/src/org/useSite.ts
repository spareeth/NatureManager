import { useQuery } from '@tanstack/react-query';
import { fetchSites } from '../map/api';
import { useOrg } from './context';
import { cachedRead } from '../offline/cache';
import { pickSite, useSiteChoice } from './siteChoice';

/** The current project (site) of the organisation: the one picked in the header, else the first by code. */
export function useCurrentSite() {
  const { current } = useOrg();
  const orgId = current?.organisationId;
  const sites = useQuery({
    queryKey: ['sites', orgId],
    enabled: !!orgId,
    queryFn: () => cachedRead(`sites:${orgId}`, () => fetchSites(orgId!)),
  });
  const chosen = useSiteChoice(orgId);
  return {
    site: pickSite(sites.data, chosen),
    sites: sites.data,
    isPending: sites.isPending,
    error: sites.error,
  };
}
