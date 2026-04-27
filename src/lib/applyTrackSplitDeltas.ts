const EPS = 1e-9;

/**
 * Resizes the split *after* track `i` (between i and i+1). Cumulative `dPix` from a drag
 * starting width snapshot.
 *
 * - **Positive** `dPix` (e.g. pointer right): `w[i]` gains; we take from `i+1`, then `i+2…` as
 *   needed, then `i+1` is at m.
 * - **Negative** `dPix` (e.g. pointer left / up): `w[i+1]` gains (split moves *left/up* for the
 *   vertical line at this index). We take from `i` first, then from **i−1, i−2, …** so room in
 *   tracks to the *left* is used when `w[i]` is already at the minimum, then if still needed
 *   from `i+2, i+3, …` (pair-only would stop too early: corner could not move into a large
 *   top-left). Sum is always preserved.
 */
export function applyAxisPixelDelta(
  widths: number[],
  i: number,
  dPix: number,
  mPx: number
): number[] {
  const n = widths.length;
  if (i < 0 || i >= n - 1 || dPix > -EPS && dPix < EPS) {
    return widths.slice();
  }
  const out = widths.slice();
  const m = Math.max(0, mPx);
  if (dPix > 0) {
    let rem = dPix;
    const can0 = out[i + 1] - m;
    if (can0 > EPS) {
      const t0 = Math.min(can0, rem);
      out[i] += t0;
      out[i + 1] -= t0;
      rem -= t0;
    }
    let k = i + 2;
    while (rem > EPS && k < n) {
      const can = out[k] - m;
      if (can < EPS) {
        k += 1;
        continue;
      }
      const t = Math.min(can, rem);
      out[i] += t;
      out[k] -= t;
      rem -= t;
    }
  } else {
    let rem = -dPix; // w[i+1] must grow by this much (split moves to shrink "before" the line)
    const can0 = out[i] - m;
    if (can0 > EPS) {
      const t0 = Math.min(can0, rem);
      out[i] -= t0;
      out[i + 1] += t0;
      rem -= t0;
    }
    let kL = i - 1;
    while (rem > EPS && kL >= 0) {
      const can = out[kL] - m;
      if (can < EPS) {
        kL -= 1;
        continue;
      }
      const t = Math.min(can, rem);
      out[kL] -= t;
      out[i + 1] += t;
      rem -= t;
    }
    let kR = i + 2;
    while (rem > EPS && kR < n) {
      const can = out[kR] - m;
      if (can < EPS) {
        kR += 1;
        continue;
      }
      const t = Math.min(can, rem);
      out[kR] -= t;
      out[i + 1] += t;
      rem -= t;
    }
  }
  return out;
}

export function renormalizeToSum(verts: number[], targetSum: number): number[] {
  const s = verts.reduce((a, v) => a + v, 0);
  if (s < EPS) return verts.map(() => targetSum / Math.max(1, verts.length));
  return verts.map((v) => (v * targetSum) / s);
}
