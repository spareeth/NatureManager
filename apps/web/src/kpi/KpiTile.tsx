/** A headline figure: label, value, and a line of context (and an optional caution). */
export function KpiTile({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string | number;
  sub?: string;
  warn?: string;
}) {
  return (
    <div className="rounded border p-3">
      <p className="text-sm text-gray-700">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-600">{sub}</p>}
      {warn && <p className="mt-1 text-xs text-amber-900">{warn}</p>}
    </div>
  );
}
