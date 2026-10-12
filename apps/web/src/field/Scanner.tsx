import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Back camera QR/barcode reader (@zxing/browser, loaded on demand). Calls onCode once per scan. */
export function Scanner({ onCode }: { onCode: (text: string) => void }) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(onCode);
  useEffect(() => {
    done.current = onCode;
  }, [onCode]);

  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled || !video.current) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          video.current,
          (result, _err, c) => {
            if (!result) return;
            c.stop();
            done.current(result.getText());
          },
        );
        if (cancelled) controls.stop();
        else stop = () => controls.stop();
      } catch (e) {
        if (!cancelled) setError((e as Error).message || t('scan.noCamera'));
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [t]);

  return (
    <div>
      <video
        ref={video}
        muted
        playsInline
        aria-label={t('scan.camera')}
        className="aspect-square w-full rounded-lg bg-black object-cover"
      />
      {error && (
        <p role="alert" className="mt-2 text-red-700">
          {t('scan.noCamera')} ({error})
        </p>
      )}
    </div>
  );
}
