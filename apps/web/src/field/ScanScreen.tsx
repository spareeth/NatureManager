import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { assetByCode } from '../labels/api';
import { useOrg } from '../org/context';
import { RequestForm } from '../work/RequestForm';
import { PriorityTag, StatusPill } from '../work/badges';
import { fetchScan, moveJob, type ScanJob } from './api';
import { parseScan } from './scan';
import { Scanner } from './Scanner';

const BTN =
  'inline-flex min-h-12 items-center justify-center rounded-lg px-4 text-lg font-semibold';

/** Scan a tag (FR-FLD-02): open the asset, start its open job or raise a request. */
export function ScanScreen() {
  const { t } = useTranslation();
  const { current } = useOrg();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const code = params.get('code');
  const [typed, setTyped] = useState('');
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setCode = (c: string | null) => {
    setReporting(false);
    setError(null);
    setParams(c ? { code: c } : {}, { replace: true });
  };
  const found = useQuery({
    queryKey: ['field-scan', code, current?.organisationId],
    enabled: !!code,
    queryFn: async () => {
      const hit = await assetByCode(code!, current?.organisationId);
      return hit ? fetchScan(hit.id) : null;
    },
  });

  const start = async (job: ScanJob) => {
    setBusy(true);
    setError(null);
    try {
      if (job.status === 'scheduled' || job.status === 'on_hold')
        await moveJob(job.id, 'in_progress');
      navigate(`/field/jobs/${job.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-xl space-y-4 p-3 pb-24 text-base">
      <div className="flex items-center gap-2">
        <Link to="/field" className="inline-flex min-h-12 items-center text-green-900 underline">
          ‹ {t('fieldApp.myDay')}
        </Link>
        <h1 className="ms-auto text-xl font-semibold">{t('fieldApp.scan')}</h1>
      </div>

      {!code && (
        <>
          <Scanner onCode={(text) => setCode(parseScan(text))} />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (typed.trim()) setCode(parseScan(typed));
            }}
          >
            <input
              aria-label={t('fieldApp.typeCode')}
              placeholder={t('fieldApp.typeCode')}
              dir="ltr"
              className="min-h-12 min-w-0 flex-1 rounded border-2 px-2 text-lg"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            <button type="submit" className={`${BTN} border-2`}>
              {t('fieldApp.find')}
            </button>
          </form>
        </>
      )}

      {code && found.isPending && <p>{t('common.loading')}</p>}
      {code && found.error && (
        <p role="alert" className="text-red-700">
          {found.error.message}
        </p>
      )}
      {code && found.data === null && (
        <div className="rounded-lg border-2 border-amber-600 bg-amber-50 p-3">
          <p className="font-semibold">{t('scan.notFoundTitle')}</p>
          <p>
            {t('scan.notFound')}{' '}
            <span className="font-mono" dir="ltr">
              {code}
            </span>
          </p>
        </div>
      )}

      {found.data && (
        <article aria-labelledby="scan-asset" className="space-y-3 rounded-lg border-2 p-3">
          <header>
            <h2 id="scan-asset" className="font-mono text-2xl font-bold" dir="ltr">
              {found.data.tag_code}
            </h2>
            <p className="text-lg">
              {found.data.scientific_name && <em>{found.data.scientific_name}</em>}
              {found.data.name && ` ${found.data.name}`}
            </p>
            <p className="text-gray-700">
              {found.data.location_code ?? '-'} · {t(`status.${found.data.status}`)}
            </p>
          </header>
          <Link to={`/assets/${found.data.id}`} className={`${BTN} w-full border-2`}>
            {t('fieldApp.openAsset')}
          </Link>

          <section aria-labelledby="scan-jobs">
            <h3 id="scan-jobs" className="font-semibold">
              {t('fieldApp.openJobs')} ({found.data.jobs.length})
            </h3>
            {found.data.jobs.length === 0 && (
              <p className="text-gray-700">{t('fieldApp.noOpenJobs')}</p>
            )}
            <ul className="mt-2 space-y-2">
              {found.data.jobs.map((j) => (
                <li key={j.id} className="rounded border-2 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityTag priority={j.priority} />
                    <StatusPill status={j.status} />
                    <span className="text-sm text-gray-700">{j.number}</span>
                  </div>
                  <p className="mt-1 text-lg">{j.title}</p>
                  <div className="mt-2 flex gap-2">
                    {j.mine && ['scheduled', 'on_hold', 'in_progress'].includes(j.status) ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void start(j)}
                        className={`${BTN} flex-1 bg-green-800 text-white disabled:opacity-50`}
                      >
                        {j.status === 'in_progress'
                          ? t('fieldApp.continueJob')
                          : t('fieldApp.start')}
                      </button>
                    ) : (
                      <Link to={`/field/jobs/${j.id}`} className={`${BTN} flex-1 border-2`}>
                        {t('fieldApp.viewJob')}
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}

          {reporting ? (
            <RequestForm
              orgId={found.data.organisation_id}
              siteId={found.data.site_id}
              asset={{
                id: found.data.id,
                tag_code: found.data.tag_code,
                location_id: found.data.location_id,
                lon: found.data.lon ?? undefined,
                lat: found.data.lat ?? undefined,
              }}
              onCancel={() => setReporting(false)}
              onDone={(wo) => navigate(`/field/jobs/${wo.id}`)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setReporting(true)}
              className={`${BTN} w-full border-2 border-amber-700`}
            >
              {t('wo.report')}
            </button>
          )}
        </article>
      )}

      {code && (
        <button
          type="button"
          onClick={() => setCode(null)}
          className={`${BTN} w-full bg-green-800 text-white`}
        >
          {t('fieldApp.scanAgain')}
        </button>
      )}
    </section>
  );
}
