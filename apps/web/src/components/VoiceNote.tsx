import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const MAX_SECONDS = 120;

const canRecord = () =>
  typeof window !== 'undefined' &&
  'MediaRecorder' in window &&
  !!navigator.mediaDevices?.getUserMedia;

/** Record one voice note (up to 2 minutes) with the microphone; play it back or delete it. */
export function VoiceNote({
  value,
  onChange,
}: {
  value: Blob | null;
  onChange: (b: Blob | null) => void;
}) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const url = useMemo(() => (value ? URL.createObjectURL(value) : null), [value]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      rec.current?.stream.getTracks().forEach((tr) => tr.stop());
    },
    [],
  );

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    if (rec.current?.state === 'recording') rec.current.stop();
    setRecording(false);
  };
  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        onChange(new Blob(chunks, { type: r.mimeType || 'audio/webm' }));
      };
      rec.current = r;
      r.start();
      setSeconds(0);
      setRecording(true);
      timer.current = setInterval(
        () =>
          setSeconds((s) => {
            if (s + 1 >= MAX_SECONDS) stop();
            return s + 1;
          }),
        1000,
      );
    } catch (e) {
      setError((e as Error).message || t('voice.noMic'));
    }
  };

  if (!canRecord()) return <p className="text-sm text-gray-600">{t('voice.unsupported')}</p>;
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <div className="space-y-1">
      {!value && !recording && (
        <button
          type="button"
          onClick={() => void start()}
          className="min-h-12 rounded border-2 border-red-700 px-3 text-red-800 sm:min-h-0 sm:py-1"
        >
          ● {t('voice.record')}
        </button>
      )}
      {recording && (
        <button
          type="button"
          onClick={stop}
          className="min-h-12 rounded bg-red-700 px-3 text-white sm:min-h-0 sm:py-1"
          aria-live="polite"
        >
          ■ {t('voice.stop')} ({clock} / 2:00)
        </button>
      )}
      {value && url && (
        <div className="flex flex-wrap items-center gap-2">
          <audio controls src={url} className="max-w-full" aria-label={t('voice.note')} />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="min-h-12 underline sm:min-h-0"
          >
            {t('voice.delete')}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {t('voice.noMic')} ({error})
        </p>
      )}
    </div>
  );
}
