// Механика слоя и пакета при плоском напряжённом состоянии.
// Обозначения — как в конспекте: оси слоя 1-2, оси пакета x-y, угол армирования φ,
// векторы {σ₁, σ₂, τ₁₂}, {ε₁, ε₂, γ₁₂}; ν₂₁ — «большой» коэффициент Пуассона (E₁ν₁₂ = E₂ν₂₁).
// Все напряжения и жёсткости внутри — в МПа, модули материала хранятся в ГПа.

const GPA = 1000;
const rad = (deg) => (deg * Math.PI) / 180;

export const nu12 = (m) => (m.nu21 * m.E2) / m.E1;

export const zeros3 = () => [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

export function mulMV(M, v) {
  return [
    M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
    M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
    M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
  ];
}

export function mulMM(A, B) {
  const C = zeros3();
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  }
  return C;
}

export const transpose = (M) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => M[j][i]));
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Матрица жёсткости слоя [D] в осях 1-2.
// state: 'intact' — ортотропный слой; 'matrix' — связующее разрушено, нитяная модель (E₂ = G₁₂ = ν = 0);
// 'failed' — волокно разрушено, слой не работает.
export function plyD(m, state = 'intact') {
  if (state === 'failed') return zeros3();
  const E1 = m.E1 * GPA;
  if (state === 'matrix') return [[E1, 0, 0], [0, 0, 0], [0, 0, 0]];
  const n12 = nu12(m);
  const k = 1 - n12 * m.nu21;
  const E1b = E1 / k;
  const E2b = (m.E2 * GPA) / k;
  return [[E1b, E1b * n12, 0], [E2b * m.nu21, E2b, 0], [0, 0, m.G12 * GPA]];
}

// {σ₁, σ₂, τ₁₂} = [T1]{σx, σy, τxy}
export function T1(phiDeg) {
  const c = Math.cos(rad(phiDeg)), s = Math.sin(rad(phiDeg));
  return [[c * c, s * s, 2 * c * s], [s * s, c * c, -2 * c * s], [-c * s, c * s, c * c - s * s]];
}

// {ε₁, ε₂, γ₁₂} = [T2]{εx, εy, γxy}
export function T2(phiDeg) {
  const c = Math.cos(rad(phiDeg)), s = Math.sin(rad(phiDeg));
  return [[c * c, s * s, c * s], [s * s, c * c, -c * s], [-2 * c * s, 2 * c * s, c * c - s * s]];
}

// Жёсткость слоя в осях пакета: [B̄] = [T1]⁻¹[D][T2] = [T2]ᵀ[D][T2]
export function plyB(m, phiDeg, state = 'intact') {
  const t2 = T2(phiDeg);
  return mulMM(transpose(t2), mulMM(plyD(m, state), t2));
}

// То же по формулам конспекта (с исправленным знаком в B̄₂₄) — для сверки и показа студентам.
export function plyBClosedForm(m, phiDeg) {
  const c = Math.cos(rad(phiDeg)), s = Math.sin(rad(phiDeg));
  const n12 = nu12(m);
  const k = 1 - n12 * m.nu21;
  const E1 = (m.E1 * GPA) / k, E2 = (m.E2 * GPA) / k, G = m.G12 * GPA;
  const E12 = E1 * n12 + 2 * G;
  const c2 = c * c, s2 = s * s;
  const B11 = E1 * c2 * c2 + E2 * s2 * s2 + 2 * E12 * c2 * s2;
  const B22 = E1 * s2 * s2 + E2 * c2 * c2 + 2 * E12 * c2 * s2;
  const B12 = E1 * n12 + (E1 + E2 - 2 * E12) * c2 * s2;
  const B14 = (E1 * c2 - E2 * s2 - E12 * (c2 - s2)) * c * s;
  const B24 = (E1 * s2 - E2 * c2 + E12 * (c2 - s2)) * c * s;
  const B44 = (E1 + E2 - 2 * E1 * n12) * c2 * s2 + G * (c2 - s2) ** 2;
  return [[B11, B12, B14], [B12, B22, B24], [B14, B24, B44]];
}

// Жёсткость пакета: A = Σ B̄ᵢ·h̄ᵢ, h̄ᵢ — относительная толщина слоя.
export function laminateA(plies, states) {
  const H = plies.reduce((a, p) => a + p.h, 0);
  const A = zeros3();
  plies.forEach((p, i) => {
    const B = plyB(p.material, p.angle, states ? states[i] : 'intact');
    const hb = p.h / H;
    for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) A[r][q] += B[r][q] * hb;
  });
  return A;
}

// Собственные значения и векторы симметричной матрицы 3×3 (метод Якоби).
export function eigSym3(M) {
  const a = M.map((r) => r.slice());
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 60; sweep++) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    const diag = Math.abs(a[0][0]) + Math.abs(a[1][1]) + Math.abs(a[2][2]);
    if (off <= 1e-15 * diag) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], vectors: [0, 1, 2].map((j) => [v[0][j], v[1][j], v[2][j]]) };
}

// Решение A·ε = n для (возможно) вырожденной жёсткости.
// Пакет из «нитяных» слоёв может быть механизмом: если нагрузка имеет составляющую
// вдоль направления с нулевой жёсткостью, нести её нечем — carries = false.
export function solveLoad(A, n) {
  const { values, vectors } = eigSym3(A);
  const wmax = Math.max(...values.map(Math.abs));
  const nn = Math.hypot(n[0], n[1], n[2]);
  const eps = [0, 0, 0];
  if (!(wmax > 0)) return { carries: false, eps };
  for (let k = 0; k < 3; k++) {
    const proj = dot(vectors[k], n);
    if (values[k] > 1e-9 * wmax) {
      for (let i = 0; i < 3; i++) eps[i] += (proj / values[k]) * vectors[k][i];
    } else if (Math.abs(proj) > 1e-7 * nn) {
      return { carries: false, eps: [0, 0, 0] };
    }
  }
  return { carries: true, eps };
}

// Технические постоянные пакета. Модуль в направлении нагрузки n: E = 1/(nᵀA⁻¹n); если пакет — механизм, то 0.
export function laminateModuli(A) {
  const along = (n) => {
    const r = solveLoad(A, n);
    return r.carries ? { E: 1 / dot(n, r.eps), eps: r.eps } : { E: 0, eps: [0, 0, 0] };
  };
  const x = along([1, 0, 0]), y = along([0, 1, 0]), g = along([0, 0, 1]);
  return {
    Ex: x.E, Ey: y.E, Gxy: g.E,
    nuYX: x.E ? -x.eps[1] / x.eps[0] : 0, // поперечная деформация при растяжении вдоль x
    nuXY: y.E ? -y.eps[0] / y.eps[1] : 0,
  };
}
