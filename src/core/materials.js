// Типовые свойства однонаправленных слоёв. Модули в ГПа, прочности в МПа.
// Обозначения прочностей: s1p = σ̄₁⁺, s1m = σ̄₁⁻, s2p = σ̄₂⁺, s2m = σ̄₂⁻, t12 = τ̄₁₂.
// Названия материалов и свойств — в словаре src/i18n.js (ключи mat.<id>.* и prop.<key>).
export const MATERIALS = [
  { id: 'glass', vf: 0.65, rho: 2.1, E1: 60, E2: 13, G12: 3.4, nu21: 0.3, s1p: 1800, s1m: 650, s2p: 40, s2m: 90, t12: 50 },
  { id: 'aramid', vf: 0.6, rho: 1.32, E1: 95, E2: 5.1, G12: 1.8, nu21: 0.34, s1p: 2500, s1m: 300, s2p: 30, s2m: 130, t12: 30 },
  { id: 'carbon', vf: 0.62, rho: 1.55, E1: 140, E2: 11, G12: 5.5, nu21: 0.27, s1p: 2000, s1m: 1200, s2p: 50, s2m: 170, t12: 70 },
];

// unit — ключ единицы измерения в словаре: 'GPa', 'MPa' или пусто для безразмерной величины
export const PROPS = [
  { key: 'E1', tex: 'E_1', unit: 'GPa' },
  { key: 'E2', tex: 'E_2', unit: 'GPa' },
  { key: 'G12', tex: 'G_{12}', unit: 'GPa' },
  { key: 'nu21', tex: '\\nu_{21}', unit: '' },
  { key: 's1p', tex: '\\bar\\sigma_1^{+}', unit: 'MPa' },
  { key: 's1m', tex: '\\bar\\sigma_1^{-}', unit: 'MPa' },
  { key: 's2p', tex: '\\bar\\sigma_2^{+}', unit: 'MPa' },
  { key: 's2m', tex: '\\bar\\sigma_2^{-}', unit: 'MPa' },
  { key: 't12', tex: '\\bar\\tau_{12}', unit: 'MPa' },
];

export const materialById = (list, id) => list.find((m) => m.id === id) || list[0];
