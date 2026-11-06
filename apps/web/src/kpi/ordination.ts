// Ordination of beds by species composition: principal coordinates analysis (PCoA, classical
// multidimensional scaling) of the Bray-Curtis dissimilarity. Deterministic, unlike NMDS, so the same
// data always gives the same picture. Small matrices only (one row per bed).

export type Community = Record<string, Record<string, number>>; // bed -> species -> plants

export function brayCurtis(a: Record<string, number>, b: Record<string, number>): number {
  let diff = 0;
  let sum = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] ?? 0;
    const y = b[k] ?? 0;
    diff += Math.abs(x - y);
    sum += x + y;
  }
  return sum === 0 ? 0 : diff / sum;
}

/** Eigen decomposition of a symmetric matrix (cyclic Jacobi). Returns values (descending) and
 *  vectors as columns. */
export function symmetricEigen(m: number[][]): { values: number[]; vectors: number[][] } {
  const n = m.length;
  const a = m.map((r) => [...r]);
  const v: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p]![q]! ** 2;
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        const apq = a[p]![q]!;
        if (Math.abs(apq) < 1e-15) continue;
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = c * akp - s * akq;
          a[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p]![k]!;
          const aqk = a[q]![k]!;
          a[p]![k] = c * apk - s * aqk;
          a[q]![k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k]![p]!;
          const vkq = v[k]![q]!;
          v[k]![p] = c * vkp - s * vkq;
          v[k]![q] = s * vkp + c * vkq;
        }
      }
  }
  const order = a.map((r, i) => [r[i]!, i] as const).sort((x, y) => y[0] - x[0]);
  return {
    values: order.map(([val]) => val),
    vectors: v.map((row) => order.map(([, i]) => row[i]!)),
  };
}

export type Ordination = {
  points: { bed: string; x: number; y: number }[];
  /** Share of the (positive) variation shown by axes 1 and 2. */
  explained: [number, number];
};

export function pcoa(community: Community): Ordination | null {
  const beds = Object.keys(community).sort();
  const n = beds.length;
  if (n < 3) return null;
  const d = beds.map((a) => beds.map((b) => brayCurtis(community[a]!, community[b]!)));
  // Gower centring of -d^2 / 2
  const A = d.map((r) => r.map((x) => (-x * x) / 2));
  const rowMean = A.map((r) => r.reduce((s, x) => s + x, 0) / n);
  const all = rowMean.reduce((s, x) => s + x, 0) / n;
  const B = A.map((r, i) => r.map((x, j) => x - rowMean[i]! - rowMean[j]! + all));
  const { values, vectors } = symmetricEigen(B);
  const pos = values.filter((x) => x > 1e-10).reduce((s, x) => s + x, 0);
  const s1 = Math.sqrt(Math.max(values[0]!, 0));
  const s2 = Math.sqrt(Math.max(values[1]!, 0));
  return {
    points: beds.map((bed, i) => ({ bed, x: vectors[i]![0]! * s1, y: vectors[i]![1]! * s2 })),
    explained: [pos ? Math.max(values[0]!, 0) / pos : 0, pos ? Math.max(values[1]!, 0) / pos : 0],
  };
}
