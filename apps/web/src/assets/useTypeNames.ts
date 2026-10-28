import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOrg } from '../org/context';
import { fetchAssetTypeOptions } from './editApi';

/** Asset type display name in the current language (asset_type.name_ar in Arabic). */
export function useTypeName() {
  const { i18n } = useTranslation();
  const { current } = useOrg();
  const types = useQuery({
    queryKey: ['asset-type-options', current?.organisationId],
    enabled: !!current,
    queryFn: () => fetchAssetTypeOptions(current!.organisationId),
  });
  const ar = i18n.language.startsWith('ar');
  return (code: string, fallback: string) =>
    (ar && types.data?.find((ty) => ty.code === code)?.name_ar) || fallback;
}
