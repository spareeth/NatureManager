import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOrg } from '../org/context';
import { saveParam, type Param } from './api';

/** The coefficients behind the figures, with source and an Unverified badge. Managers and curators
 *  edit them; the page recalculates. */
export function ParamsPanel({ params, module }: { params: Record<string, Param>; module: string }) {
  const { t } = useTranslation();
  const { current } = useOrg();
  const qc = useQueryClient();
  const canEdit = !!current?.roles.some((r) => r === 'manager' || r === 'curator');
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      saveParam(current!.organisationId, module, key, value),
    onSuccess: () => {
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['kpi'] });
    },
  });
  const [err, setErr] = useState<string | null>(null);

  return (
    <section className="space-y-2" aria-labelledby="params-h" data-testid="params">
      <h2 id="params-h" className="text-lg font-semibold">
        {t('kpi.params')}
      </h2>
      <p className="text-sm text-gray-700">{t('kpi.paramsHelp')}</p>
      <ul className="space-y-2">
        {Object.entries(params).map(([k, p]) => {
          const key = k.split('.').slice(1).join('.');
          return (
            <li key={k} className="rounded border p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">
                  {t(`kpi.param.${key}`, { defaultValue: key })}
                </span>
                {p.unit && <span className="text-gray-600">({p.unit})</span>}
                {!p.verified && (
                  <span className="rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-900">
                    {t('kpi.unverified')}
                  </span>
                )}
                {canEdit && editing !== k && (
                  <button
                    type="button"
                    className="ms-auto underline"
                    onClick={() => {
                      setEditing(k);
                      setErr(null);
                      setText(JSON.stringify(p.value));
                    }}
                  >
                    {t('kpi.edit')}
                  </button>
                )}
              </div>
              {editing === k ? (
                <div className="mt-1 space-y-1">
                  <textarea
                    aria-label={key}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="block min-h-16 w-full rounded border p-1 font-mono text-xs"
                    dir="ltr"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded bg-green-800 px-3 py-1 text-white"
                      onClick={() => {
                        try {
                          save.mutate({ key, value: JSON.parse(text) });
                        } catch {
                          setErr(t('kpi.badValue'));
                        }
                      }}
                    >
                      {t('kpi.save')}
                    </button>
                    <button type="button" className="underline" onClick={() => setEditing(null)}>
                      {t('kpi.cancel')}
                    </button>
                  </div>
                  {(err || save.error) && (
                    <p role="alert" className="text-red-800">
                      {err ?? (save.error as Error).message}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-1 font-mono text-xs break-all" dir="ltr">
                  {typeof p.value === 'object' ? JSON.stringify(p.value) : String(p.value)}
                </p>
              )}
              {p.source && <p className="mt-1 text-xs text-gray-600">{p.source}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
