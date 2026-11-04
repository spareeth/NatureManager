import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';
import { qrUrl } from '../labels/qrPayload';

/** The asset's permanent QR code as an image, with its code and a PNG download (managers).
 *  The same code is printed on the label fixed to the tree. */
export function AssetQr({ assetId, tagCode }: { assetId: string; tagCode: string }) {
  const { t } = useTranslation();
  const code = useQuery({
    queryKey: ['asset-qr', assetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('asset')
        .select('qr_code')
        .eq('id', assetId)
        .single();
      if (error) throw new Error(error.message);
      return data.qr_code as string;
    },
  });
  const [png, setPng] = useState<string | null>(null);
  useEffect(() => {
    if (!code.data) return;
    let live = true;
    void QRCode.toDataURL(qrUrl(code.data), {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 480,
    }).then((d) => live && setPng(d));
    return () => {
      live = false;
    };
  }, [code.data]);

  if (!code.data) return null;
  return (
    <section
      aria-labelledby="asset-qr-h"
      className="rounded border bg-white p-3"
      data-testid="asset-qr"
    >
      <h2 id="asset-qr-h" className="font-semibold">
        {t('assets.qr.heading')}
      </h2>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        {png && (
          <img src={png} alt={t('assets.qr.alt', { code: code.data })} className="h-40 w-40" />
        )}
        <div className="space-y-2 text-sm">
          <p className="font-mono text-2xl font-semibold tracking-wider" dir="ltr">
            {code.data}
          </p>
          <p className="font-mono text-xs break-all text-gray-600" dir="ltr">
            {qrUrl(code.data)}
          </p>
          <p className="text-gray-700">{t('assets.qr.help')}</p>
          {png && (
            <a
              href={png}
              download={`qr_${code.data}_${tagCode}.png`}
              className="inline-block rounded border px-3 py-1"
            >
              {t('assets.qr.download')}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
