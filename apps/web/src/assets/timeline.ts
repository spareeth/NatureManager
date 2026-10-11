import type { TFunction } from 'i18next';

export type TimelineEvent = {
  at: string;
  kind: 'created' | 'status' | 'condition' | 'moved' | 'edited' | 'photo';
  by: string | null;
  data: Record<string, unknown>;
};

const num = (v: unknown) => (v == null ? '?' : Number(v).toFixed(2));

/** One line of text for a timeline event. Photos are rendered separately as thumbnails. */
export function describeEvent(e: TimelineEvent, t: TFunction): string {
  const d = e.data;
  switch (e.kind) {
    case 'created':
      return t('timeline.created');
    case 'status': {
      const base = t('timeline.status', {
        from: t(`status.${String(d.from)}`),
        to: t(`status.${String(d.to)}`),
      });
      return d.reason ? `${base}: ${String(d.reason)}` : base;
    }
    case 'condition':
      return t('timeline.condition', { from: d.from ?? '?', to: d.to ?? '?' });
    case 'moved': {
      const from = d.from as { x?: unknown; y?: unknown } | undefined;
      const to = d.to as { x?: unknown; y?: unknown } | undefined;
      return t('timeline.moved', {
        from: `${num(from?.x)}, ${num(from?.y)}`,
        to: `${num(to?.x)}, ${num(to?.y)}`,
        source: d.position_source
          ? `(${t(`position.${String(d.position_source)}`)}${d.accuracy_m != null ? `, ±${String(d.accuracy_m)} m` : ''})`
          : '',
      }).trim();
    }
    case 'edited':
      return t('timeline.edited', {
        fields: ((d.fields as string[]) ?? []).map((f) => t(`field.${f}`, f)).join(', '),
      });
    case 'photo':
      return d.caption
        ? t('timeline.photoCaption', { caption: String(d.caption) })
        : t('timeline.photo');
  }
}
