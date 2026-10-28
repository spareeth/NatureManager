import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { assetByCode } from '../labels/api';
import { useOrg } from '../org/context';

/** QR target: /a/<tag> (or an existing Code 128 barcode) opens the asset (FR-AST-05). */
export function ScanPage() {
  const { code = '' } = useParams<{ code: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { current, switchOrg } = useOrg();
  const found = useQuery({
    queryKey: ['asset-by-code', code, current?.organisationId],
    queryFn: () => assetByCode(code, current?.organisationId),
  });

  useEffect(() => {
    const a = found.data;
    if (!a) return;
    if (current && a.organisation_id !== current.organisationId) switchOrg(a.organisation_id);
    navigate(`/assets/${a.id}`, { replace: true });
  }, [found.data, current, switchOrg, navigate]);

  if (found.isPending || found.data) return <p className="p-4">{t('common.loading')}</p>;
  return (
    <section className="p-4">
      <h1 className="text-xl font-semibold">{t('scan.notFoundTitle')}</h1>
      <p className="mt-2">
        {t('scan.notFound')}{' '}
        <span className="font-mono" dir="ltr">
          {code}
        </span>
      </p>
      {found.error && (
        <p role="alert" className="mt-2 text-red-700">
          {found.error.message}
        </p>
      )}
      <Link to={`/assets?q=${encodeURIComponent(code)}`} className="mt-3 inline-block underline">
        {t('scan.search')}
      </Link>
    </section>
  );
}
