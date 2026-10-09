// Габариты предельных поверхностей в осях (σ₁, σ₂, τ₁₂) — общий масштаб для 3D-сцены и срезов.
// Каждая поверхность звёздна относительно начала координат, поэтому достаточно пройти по направлениям.
export function surfaceBounds(criteria, m, options) {
  const k = [Math.max(m.s1p, m.s1m), Math.max(m.s2p, m.s2m), m.t12];
  const lo = [-m.s1m, -m.s2m, -m.t12], hi = [m.s1p, m.s2p, m.t12];
  const NA = 48, NB = 24;
  for (const c of criteria) {
    for (let a = 0; a < NA; a++) for (let b = 0; b <= NB; b++) {
      const th = (a / NA) * 2 * Math.PI, ph = (b / NB) * Math.PI;
      const d = [Math.sin(ph) * Math.cos(th) * k[0], Math.sin(ph) * Math.sin(th) * k[1], Math.cos(ph) * k[2]];
      const F = c.index(d[0], d[1], d[2], m, options);
      if (!(F > 0)) continue;
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i], d[i] / F);
        hi[i] = Math.max(hi[i], d[i] / F);
      }
    }
  }
  // Сильно вытянутый эллипсоид (Цай–Ву при |f₁₂| → 1) не должен сжимать остальные поверхности в точку.
  for (let i = 0; i < 3; i++) {
    lo[i] = Math.max(lo[i], -2.4 * k[i]);
    hi[i] = Math.min(hi[i], 2.4 * k[i]);
  }
  return { lo, hi, k };
}
