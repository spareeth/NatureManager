import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchAssetDetail } from '../assets/api';
import { AssetForm } from '../assets/AssetForm';
import { useOrg } from '../org/context';

export function AssetEditPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { current } = useOrg();
  const asset = useQuery({
    queryKey: ['asset', id],
    enabled: !!id,
    queryFn: () => fetchAssetDetail(id!),
  });

  if (asset.isPending) return <p className="p-4">{t('common.loading')}</p>;
  if (asset.error)
    return (
      <p role="alert" className="p-4 text-red-700">
        {asset.error.message}
      </p>
    );
  if (!asset.data || !current) return <p className="p-4">{t('assets.notFound')}</p>;

  return (
    <section className="mx-auto max-w-xl p-4">
      <Link to={`/assets/${id}`} className="text-sm underline">
        {t('edit.backToAsset')}
      </Link>
      <h1 className="mb-3 mt-2 text-xl font-semibold">
        {t('form.editTitle')}{' '}
        <span className="font-mono" dir="ltr">
          {asset.data.tag_code}
        </span>
      </h1>
      <AssetForm
        orgId={current.organisationId}
        siteId={asset.data.site_id}
        asset={asset.data}
        onCancel={() => navigate(`/assets/${id}`)}
        onSaved={async () => {
          await queryClient.invalidateQueries();
          navigate(`/assets/${id}`);
        }}
      />
    </section>
  );
}
