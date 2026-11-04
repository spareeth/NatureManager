import { useState } from 'react';

// Terra and Expo City Dubai logos together, once per header (style guide, "Logos and partner
// branding"): Terra on the left, a thin vertical rule, then Expo City Dubai, aligned on their centres.
// Official artwork only, from public/brand/ (see README there). Until the files are added, the names
// are shown as text.
const FILES = {
  white: { terra: '/brand/terra-white.png', ecd: '/brand/ecd-white.png' },
  colour: { terra: '/brand/terra-colour.png', ecd: '/brand/ecd-colour.png' },
};

function Logo({ src, alt, height }: { src: string; alt: string; height: number }) {
  const [missing, setMissing] = useState(false);
  if (missing) return <span className="font-semibold whitespace-nowrap">{alt}</span>;
  return (
    <img
      src={src}
      alt={alt}
      style={{ height, minHeight: 20 }}
      className="w-auto"
      onError={() => setMissing(true)}
    />
  );
}

export function BrandLockup({
  variant = 'white',
  height = 28,
}: {
  variant?: 'white' | 'colour';
  height?: number;
}) {
  const f = FILES[variant];
  const rule = variant === 'white' ? 'bg-white/60' : 'bg-[#14312c]/40';
  return (
    <span className="flex items-center gap-3" dir="ltr" data-testid="brand-lockup">
      <Logo src={f.terra} alt="Terra" height={height} />
      <span aria-hidden className={`w-px self-stretch ${rule}`} />
      {/* The Expo City Dubai artwork has more space around it; a little taller keeps the two balanced. */}
      <Logo src={f.ecd} alt="Expo City Dubai" height={Math.round(height * 1.35)} />
    </span>
  );
}
