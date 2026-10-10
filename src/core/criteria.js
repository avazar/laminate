// Критерии прочности однонаправленного слоя при плоском напряжённом состоянии.
//
// Для каждого критерия считается показатель разрушения F(σ₁, σ₂, τ₁₂): F = 1 на предельной поверхности,
// F < 1 — слой цел. F определён как величина, обратная запасу: если все напряжения умножить на 1/F,
// точка попадёт на поверхность. Поэтому F линейно растёт при пропорциональном нагружении
// (для критериев с линейными членами — Хоффмана, Цая–Ву, Хашина при сжатии матрицы — это не то же самое,
// что значение левой части критерия).
//
// Прочности: s1p = σ̄₁⁺, s1m = σ̄₁⁻, s2p = σ̄₂⁺, s2m = σ̄₂⁻, t12 = τ̄₁₂.

import { nu12 } from './mech.js';

export const MODES = {
  ft: { kind: 'fiber' }, // волокно, растяжение
  fc: { kind: 'fiber' }, // волокно, сжатие
  mt: { kind: 'matrix' }, // матрица, растяжение поперёк волокон
  mc: { kind: 'matrix' }, // матрица, сжатие поперёк волокон
  ms: { kind: 'matrix' }, // матрица, сдвиг
  int: { kind: null }, // сочетание напряжений
};

export const DEFAULT_OPTIONS = {
  f12: -0.5, // нормированный коэффициент взаимодействия Цая–Ву: F₁₂ = f₁₂·√(F₁₁F₂₂)
  hashinAlpha: 1, // вклад сдвига в разрушение волокна при растяжении (1 — Хашин 1980, 0 — Хашин–Ротем)
  hashinSt: null, // прочность на поперечный сдвиг τ̄₂₃; null — принять σ̄₂⁻/2
};

// Положительный корень a·λ² + b·λ = 1, записанный сразу для F = 1/λ.
const quadIndex = (a, b) => (b + Math.sqrt(b * b + 4 * a)) / 2;

const pos = (x, limit) => (x > 0 ? x / limit : 0);

function maxStressModes(s1, s2, t, m) {
  return {
    ft: pos(s1, m.s1p), fc: pos(-s1, m.s1m),
    mt: pos(s2, m.s2p), mc: pos(-s2, m.s2m),
    ms: Math.abs(t) / m.t12,
  };
}

// Предельные деформации приняты из линейной диаграммы: ε̄₁ = σ̄₁/E₁ и т. д.
// Тогда условие ε₁ ≤ ε̄₁⁺ в напряжениях: σ₁ − ν₂₁σ₂ ≤ σ̄₁⁺, а ε₂ ≤ ε̄₂⁺: σ₂ − ν₁₂σ₁ ≤ σ̄₂⁺.
function maxStrainModes(s1, s2, t, m) {
  const e1 = s1 - m.nu21 * s2;
  const e2 = s2 - nu12(m) * s1;
  return {
    ft: pos(e1, m.s1p), fc: pos(-e1, m.s1m),
    mt: pos(e2, m.s2p), mc: pos(-e2, m.s2m),
    ms: Math.abs(t) / m.t12,
  };
}

// Аппроксимационный критерий по В. В. Васильеву: волокно и матрица проверяются раздельно.
// Волокно — по максимальным напряжениям; матрица — полиномом второй степени F(σ₂, τ₁₂) = 1:
//   σ₂(1/σ̄₂⁺ − 1/σ̄₂⁻) + σ₂²/(σ̄₂⁺σ̄₂⁻) + (τ₁₂/τ̄₁₂)² = 1.
const vasilievMatrix = (s2, t, m) => quadIndex((s2 * s2) / (m.s2p * m.s2m) + (t / m.t12) ** 2, s2 * (1 / m.s2p - 1 / m.s2m));

function vasilievModes(s1, s2, t, m) {
  const matrix = vasilievMatrix(s2, t, m);
  // Условие для матрицы одно; по знаку σ₂ оно только подписывается как растяжение или сжатие.
  return { ft: pos(s1, m.s1p), fc: pos(-s1, m.s1m), mt: s2 >= 0 ? matrix : 0, mc: s2 < 0 ? matrix : 0 };
}

function hashinModes(s1, s2, t, m, o) {
  const sh = t / m.t12;
  const st = o.hashinSt || m.s2m / 2;
  const out = { ft: 0, fc: 0, mt: 0, mc: 0 };
  if (s1 > 0) out.ft = Math.sqrt((s1 / m.s1p) ** 2 + o.hashinAlpha * sh * sh);
  else out.fc = -s1 / m.s1m;
  if (s2 >= 0) out.mt = Math.sqrt((s2 / m.s2p) ** 2 + sh * sh);
  else {
    const a = (s2 / (2 * st)) ** 2 + sh * sh;
    const b = ((m.s2m / (2 * st)) ** 2 - 1) * (s2 / m.s2m);
    out.mc = quadIndex(a, b);
  }
  return out;
}

function tsaiHill(s1, s2, t, m) {
  const X = s1 >= 0 ? m.s1p : m.s1m;
  const Y = s2 >= 0 ? m.s2p : m.s2m;
  const q = (s1 / X) ** 2 - (s1 * s2) / (X * X) + (s2 / Y) ** 2 + (t / m.t12) ** 2;
  return Math.sqrt(Math.max(q, 0));
}

function polynomial(s1, s2, t, m, f12norm) {
  const F1 = 1 / m.s1p - 1 / m.s1m, F2 = 1 / m.s2p - 1 / m.s2m;
  const F11 = 1 / (m.s1p * m.s1m), F22 = 1 / (m.s2p * m.s2m), F66 = 1 / (m.t12 * m.t12);
  // f12norm === null — критерий Хоффмана: 2F₁₂ = −F₁₁
  const F12 = f12norm === null ? -F11 / 2 : f12norm * Math.sqrt(F11 * F22);
  const a = F11 * s1 * s1 + F22 * s2 * s2 + F66 * t * t + 2 * F12 * s1 * s2;
  const b = F1 * s1 + F2 * s2;
  return quadIndex(Math.max(a, 0), b);
}

const maxOf = (o) => {
  let best = 0;
  for (const k in o) if (o[k] > best) best = o[k];
  return best;
};

// Названия и пояснения к критериям — в словаре src/i18n.js, ключи crit.<id>.*
export const CRITERIA = [
  {
    id: 'maxStress', modal: true,
    modes: maxStressModes,
    index: (s1, s2, t, m) => Math.max(s1 > 0 ? s1 / m.s1p : -s1 / m.s1m, s2 > 0 ? s2 / m.s2p : -s2 / m.s2m, Math.abs(t) / m.t12),
    tex: [
      '-\\bar\\sigma_1^{-}\\le\\sigma_1\\le\\bar\\sigma_1^{+}',
      '-\\bar\\sigma_2^{-}\\le\\sigma_2\\le\\bar\\sigma_2^{+}',
      '|\\tau_{12}|\\le\\bar\\tau_{12}',
    ],
  },
  {
    id: 'vasiliev', modal: true,
    modes: vasilievModes,
    index: (s1, s2, t, m) => Math.max(s1 > 0 ? s1 / m.s1p : -s1 / m.s1m, vasilievMatrix(s2, t, m)),
    tex: [
      '\\sigma_1\\le\\bar\\sigma_1^{+}\\ \\ (\\sigma_1>0),\\qquad |\\sigma_1|\\le\\bar\\sigma_1^{-}\\ \\ (\\sigma_1<0)',
      '\\sigma_2\\left(\\dfrac{1}{\\bar\\sigma_2^{+}}-\\dfrac{1}{\\bar\\sigma_2^{-}}\\right)+\\dfrac{\\sigma_2^{2}}{\\bar\\sigma_2^{+}\\bar\\sigma_2^{-}}+\\left(\\dfrac{\\tau_{12}}{\\bar\\tau_{12}}\\right)^{2}=1',
    ],
  },
  {
    id: 'tsaiWu', modal: false,
    index: (s1, s2, t, m, o) => polynomial(s1, s2, t, m, o.f12),
    tex: [
      'F_1\\sigma_1+F_2\\sigma_2+F_{11}\\sigma_1^2+F_{22}\\sigma_2^2+F_{66}\\tau_{12}^2+2F_{12}\\sigma_1\\sigma_2=1',
      'F_1=\\dfrac{1}{\\bar\\sigma_1^{+}}-\\dfrac{1}{\\bar\\sigma_1^{-}},\\quad F_{11}=\\dfrac{1}{\\bar\\sigma_1^{+}\\bar\\sigma_1^{-}},\\quad F_{66}=\\dfrac{1}{\\bar\\tau_{12}^{\\,2}}',
      'F_{12}=f_{12}\\sqrt{F_{11}F_{22}},\\quad -1<f_{12}<1',
    ],
  },
  {
    id: 'hashin', modal: true,
    modes: hashinModes,
    index: (s1, s2, t, m, o) => maxOf(hashinModes(s1, s2, t, m, o)),
    tex: [
      '\\sigma_1>0:\\ \\left(\\dfrac{\\sigma_1}{\\bar\\sigma_1^{+}}\\right)^{2}+\\alpha\\left(\\dfrac{\\tau_{12}}{\\bar\\tau_{12}}\\right)^{2}=1\\qquad \\sigma_1<0:\\ |\\sigma_1|=\\bar\\sigma_1^{-}',
      '\\sigma_2>0:\\ \\left(\\dfrac{\\sigma_2}{\\bar\\sigma_2^{+}}\\right)^{2}+\\left(\\dfrac{\\tau_{12}}{\\bar\\tau_{12}}\\right)^{2}=1',
      '\\sigma_2<0:\\ \\left(\\dfrac{\\sigma_2}{2\\bar\\tau_{23}}\\right)^{2}+\\left[\\left(\\dfrac{\\bar\\sigma_2^{-}}{2\\bar\\tau_{23}}\\right)^{2}-1\\right]\\dfrac{\\sigma_2}{\\bar\\sigma_2^{-}}+\\left(\\dfrac{\\tau_{12}}{\\bar\\tau_{12}}\\right)^{2}=1',
    ],
  },
  {
    id: 'maxStrain', modal: true,
    modes: maxStrainModes,
    index: (s1, s2, t, m) => maxOf(maxStrainModes(s1, s2, t, m)),
    tex: [
      '-\\bar\\varepsilon_1^{-}\\le\\varepsilon_1\\le\\bar\\varepsilon_1^{+},\\quad -\\bar\\varepsilon_2^{-}\\le\\varepsilon_2\\le\\bar\\varepsilon_2^{+},\\quad |\\gamma_{12}|\\le\\bar\\gamma_{12}',
      '\\varepsilon_1=\\dfrac{\\sigma_1}{E_1}-\\nu_{12}\\dfrac{\\sigma_2}{E_2},\\qquad \\bar\\varepsilon_1^{\\pm}=\\dfrac{\\bar\\sigma_1^{\\pm}}{E_1}',
    ],
  },
  {
    id: 'tsaiHill', modal: false,
    index: tsaiHill,
    tex: [
      '\\left(\\dfrac{\\sigma_1}{\\bar\\sigma_1}\\right)^{2}-\\dfrac{\\sigma_1\\sigma_2}{\\bar\\sigma_1^{\\,2}}+\\left(\\dfrac{\\sigma_2}{\\bar\\sigma_2}\\right)^{2}+\\left(\\dfrac{\\tau_{12}}{\\bar\\tau_{12}}\\right)^{2}=1',
    ],
  },
  {
    id: 'hoffman', modal: false,
    index: (s1, s2, t, m) => polynomial(s1, s2, t, m, null),
    tex: [
      'F_1\\sigma_1+F_2\\sigma_2+F_{11}\\sigma_1^2+F_{22}\\sigma_2^2+F_{66}\\tau_{12}^2-F_{11}\\sigma_1\\sigma_2=1',
    ],
  },
];

export const criterionById = (id) => CRITERIA.find((c) => c.id === id);
export const MODAL_CRITERIA = CRITERIA.filter((c) => c.modal);

// Показатели по режимам для режимного критерия, отсортированные по убыванию.
export function modeList(criterion, s, m, o) {
  const r = criterion.modes(s[0], s[1], s[2], m, o);
  return Object.keys(r).filter((k) => r[k] > 0).map((k) => ({ mode: k, kind: MODES[k].kind, index: r[k] }))
    .sort((a, b) => b.index - a.index);
}

// Определяющий режим в точке — для раскраски поверхности.
export function governingMode(criterion, s1, s2, t, m, o) {
  if (!criterion.modal) return 'int';
  const r = criterion.modes(s1, s2, t, m, o);
  let best = 'ms', v = -1;
  for (const k in r) if (r[k] > v) { v = r[k]; best = k; }
  return best;
}
