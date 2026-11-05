import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchWoMedia, signedMediaUrl, type WoMedia } from './media';

/** Photos and voice notes of a work order (for example sent with a request). */
export function WoAttachments({
  woId,
  kinds = ['photo', 'audio'],
}: {
  woId: string;
  kinds?: WoMedia['kind'][];
}) {
  const { t } = useTranslation();
  const media = useQuery({ queryKey: ['wo-media', woId], queryFn: () => fetchWoMedia(woId) });
  const rows = (media.data ?? []).filter((m) => kinds.includes(m.kind));
  if (!rows.length) return null;
  return (
    <section
      aria-labelledby={`att-${woId}`}
      className="rounded border p-3"
      data-testid="wo-attachments"
    >
      <h2 id={`att-${woId}`} className="font-semibold">
        {t('wo.attachmentsTitle')}
      </h2>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {rows.map((m) => (
          <MediaItem key={m.id} m={m} />
        ))}
      </div>
    </section>
  );
}

export function MediaItem({ m }: { m: Pick<WoMedia, 'bucket' | 'path' | 'kind' | 'caption'> }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void signedMediaUrl(m.bucket, m.path).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [m.bucket, m.path]);
  if (!url) return <span className="inline-block h-24 w-24 rounded bg-gray-100" />;
  return m.kind === 'photo' ? (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt={m.caption ?? ''} className="h-24 w-24 rounded object-cover" />
    </a>
  ) : (
    <audio controls src={url} aria-label={t('voice.note')} className="max-w-full" />
  );
}
