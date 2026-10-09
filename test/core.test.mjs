import test from 'node:test';
import assert from 'node:assert/strict';
import { MATERIALS } from '../src/core/materials.js';
import { plyB, plyBClosedForm, laminateA, laminateModuli, eigSym3, solveLoad, T1, T2, mulMM, transpose } from '../src/core/mech.js';
import { CRITERIA, DEFAULT_OPTIONS, criterionById } from '../src/core/criteria.js';
import { simulate, sampleAt } from '../src/core/progressive.js';
import { contour } from '../src/core/contour.js';

const [glass, aramid, carbon] = MATERIALS;
const close = (a, b, rel = 1e-9, msg) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b)), msg || `${a} ≠ ${b}`);
const layup = (m, angles) => angles.map((angle) => ({ material: m, angle, h: 1 }));

test('B̄ = T2ᵀ·D·T2 совпадает с формулами конспекта', () => {
  for (const m of MATERIALS) for (const phi of [0, 17, 30, 45, 60, 90, -33, 123]) {
    const a = plyB(m, phi), b = plyBClosedForm(m, phi);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) close(a[i][j], b[i][j], 1e-10, `φ=${phi} [${i}${j}]`);
  }
});

test('T1(φ)⁻¹ = T2(φ)ᵀ', () => {
  const p = mulMM(T1(37), transpose(T2(37)));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) close(p[i][j], i === j ? 1 : 0, 1e-12);
});

test('квазиизотропный пакет [0/±45/90] изотропен в плоскости', () => {
  const A = laminateA(layup(carbon, [0, 45, -45, 90]));
  close(A[0][0], A[1][1]);
  close(A[0][2], 0, 1e-9);
  close(A[1][2], 0, 1e-9);
  close(A[2][2], (A[0][0] - A[0][1]) / 2);
  const md = laminateModuli(A);
  close(md.Ex, md.Ey);
  close(md.Gxy, md.Ex / (2 * (1 + md.nuYX)), 1e-9);
});

test('однонаправленный слой: Ex = E1, Ey = E2, Gxy = G12, ν = ν21', () => {
  const md = laminateModuli(laminateA(layup(glass, [0])));
  close(md.Ex, 60000, 1e-9);
  close(md.Ey, 13000, 1e-9);
  close(md.Gxy, 3400, 1e-9);
  close(md.nuYX, 0.3, 1e-9);
});

test('собственное разложение восстанавливает матрицу', () => {
  const A = laminateA(layup(aramid, [10, 55, -70]));
  const { values, vectors } = eigSym3(A);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const r = values.reduce((s, w, k) => s + w * vectors[k][i] * vectors[k][j], 0);
    close(r, A[i][j], 1e-9);
  }
});

test('нитяной пакет ±45 не несёт одноосное растяжение, но несёт σx = σy', () => {
  const plies = layup(carbon, [45, -45]);
  const A = laminateA(plies, ['matrix', 'matrix']);
  assert.equal(solveLoad(A, [1, 0, 0]).carries, false);
  assert.equal(solveLoad(A, [1, 1, 0]).carries, true);
  assert.equal(solveLoad(A, [0, 0, 1]).carries, true);
});

test('все критерии дают F = 1 при одноосных прочностях', () => {
  for (const m of MATERIALS) for (const c of CRITERIA) {
    const pts = [[m.s1p, 0, 0], [-m.s1m, 0, 0], [0, m.s2p, 0], [0, -m.s2m, 0], [0, 0, m.t12], [0, 0, -m.t12]];
    const own = ['ft', 'fc', 'mt', 'mc', 'ms', 'ms'];
    pts.forEach((p, k) => {
      // Критерий максимальных деформаций проверяется по «своему» режиму: пуассонова деформация
      // может исчерпать ε̄₂ раньше, чем σ₁ достигнет σ̄₁ (у стеклопластика так и происходит).
      const F = c.id === 'maxStrain' ? c.modes(p[0], p[1], p[2], m, DEFAULT_OPTIONS)[own[k]] : c.index(p[0], p[1], p[2], m, DEFAULT_OPTIONS);
      close(F, 1, 1e-9, `${c.id} ${m.id} ${p}`);
    });
  }
});

test('макс. деформаций: у стеклопластика поперечная деформация срабатывает раньше σ̄₁', () => {
  const c = criterionById('maxStrain');
  assert.ok(c.index(glass.s1p, 0, 0, glass, DEFAULT_OPTIONS) > 1);
  close(c.index(carbon.s1p, 0, 0, carbon, DEFAULT_OPTIONS), 1, 1e-9);
});

test('F — обратный запас: точка σ/F лежит на поверхности', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (const m of MATERIALS) for (const c of CRITERIA) for (let k = 0; k < 200; k++) {
    const s = [rnd() * m.s1p, rnd() * m.s2m, rnd() * m.t12];
    const F = c.index(s[0], s[1], s[2], m, DEFAULT_OPTIONS);
    assert.ok(F > 0 && Number.isFinite(F));
    close(c.index(s[0] / F, s[1] / F, s[2] / F, m, DEFAULT_OPTIONS), 1, 1e-9, `${c.id} ${m.id}`);
    // Для полиномиальных критериев левая часть в точке поверхности равна 1.
    close(c.index((2 * s[0]) / F, (2 * s[1]) / F, (2 * s[2]) / F, m, DEFAULT_OPTIONS), 2, 1e-9);
  }
});

test('аппроксимационный критерий: волокно — по σ₁, матрица — эллипс в плоскости σ₂–τ₁₂', () => {
  const c = criterionById('vasiliev');
  for (const m of MATERIALS) {
    const lhs = (s2, t) => s2 * (1 / m.s2p - 1 / m.s2m) + (s2 * s2) / (m.s2p * m.s2m) + (t / m.t12) ** 2;
    // точки с F = 1 удовлетворяют условию для матрицы
    for (const [s2, t] of [[0.6 * m.s2p, 0.5 * m.t12], [-0.7 * m.s2m, 0.4 * m.t12], [-0.2 * m.s2m, -m.t12]]) {
      const F = c.index(0, s2, t, m, DEFAULT_OPTIONS);
      close(lhs(s2 / F, t / F), 1, 1e-12);
    }
    // наибольшая прочность на сдвиг — при σ₂ = −(σ̄₂⁻ − σ̄₂⁺)/2 и равна τ̄₁₂(σ̄₂⁺ + σ̄₂⁻)/(2√(σ̄₂⁺σ̄₂⁻))
    const tmax = (m.t12 * (m.s2p + m.s2m)) / (2 * Math.sqrt(m.s2p * m.s2m));
    close(c.index(0, -(m.s2m - m.s2p) / 2, tmax, m, DEFAULT_OPTIONS), 1, 1e-12);
    assert.ok(tmax > m.t12);
    // σ₁ на условие для матрицы не влияет, а волокно проверяется только по σ₁
    const a = c.modes(0.5 * m.s1p, 0.5 * m.s2p, 0.5 * m.t12, m, DEFAULT_OPTIONS), b = c.modes(-0.5 * m.s1m, 0.5 * m.s2p, 0.5 * m.t12, m, DEFAULT_OPTIONS);
    close(a.mt, b.mt, 1e-15);
    close(c.modes(m.s1p, 0, 0.9 * m.t12, m, DEFAULT_OPTIONS).ft, 1, 1e-12);
  }
});

test('Хашин с τ̄₂₃ ≠ σ̄₂⁻/2 сохраняет прочность на поперечное сжатие', () => {
  const o = { ...DEFAULT_OPTIONS, hashinSt: 60 };
  close(criterionById('hashin').index(0, -carbon.s2m, 0, carbon, o), 1, 1e-12);
});

const run = (plies, load, crit = 'maxStress', control = 'strain') =>
  simulate({ plies, load, criterion: criterionById(crit), control, options: DEFAULT_OPTIONS });

test('слой 0° при растяжении вдоль волокон рвётся при σ̄₁⁺', () => {
  const r = run(layup(carbon, [0]), [1, 0, 0]);
  close(r.ultimate.lam, 2000, 1e-9);
  assert.equal(r.events[0].failures[0].mode, 'ft');
  assert.equal(r.collapse.reason, 'allFailed');
  close(r.ultimate.eps[0], 2000 / 140000, 1e-9);
});

test('слой 90°: разрушение матрицы при σ̄₂⁺, после него нести нагрузку нечем', () => {
  const r = run(layup(carbon, [90]), [1, 0, 0]);
  close(r.ultimate.lam, 50, 1e-9);
  assert.equal(r.events[0].failures[0].kind, 'matrix');
  assert.equal(r.collapse.reason, 'mechanism');
});

test('сжатие и сдвиг однонаправленного слоя', () => {
  close(run(layup(glass, [0]), [-1, 0, 0]).ultimate.lam, 650, 1e-9);
  close(run(layup(glass, [0]), [0, 0, 1]).ultimate.lam, 50, 1e-9);
  close(run(layup(glass, [0]), [0, -3, 0]).ultimate.lam, 90, 1e-9);
});

test('перекрёстный пакет [0/90]: сначала матрица 90°, предел — волокно 0° при σ̄₁⁺·h̄', () => {
  for (const control of ['strain', 'load']) for (const crit of ['maxStress', 'vasiliev', 'maxStrain', 'hashin']) {
    const r = run(layup(carbon, [0, 90]), [1, 0, 0], crit, control);
    assert.equal(r.first.failures[0].ply, 1);
    assert.equal(r.first.failures[0].kind, 'matrix');
    assert.ok(r.first.lam < r.ultimate.lam);
    // По деформациям волокно 0° рвётся при ε₁ = ε̄₁⁺, когда σ₁ чуть выше σ̄₁⁺ (поперечная деформация стеснена слоем 90°).
    close(r.ultimate.lam, 1000, crit === 'maxStrain' ? 1e-2 : 1e-9, `${crit} ${control}: ${r.ultimate.lam}`);
    assert.ok(r.collapse);
  }
});

test('[±45] при растяжении: матрица, затем механизм', () => {
  const r = run(layup(carbon, [45, -45]), [1, 0, 0], 'hashin');
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].failures.length, 2);
  assert.equal(r.collapse.reason, 'mechanism');
});

test('квазиизотропный пакет: расчёт завершается, нагрузка и деформация управления монотонны', () => {
  for (const control of ['strain', 'load']) for (const load of [[1, 0, 0], [-1, 0, 0], [1, 1, 0], [0, 0, 1], [1, -0.5, 0.3]]) {
    const r = run(layup(carbon, [0, 45, -45, 90]), load, 'hashin', control);
    assert.ok(r.collapse, 'нет исчерпания несущей способности');
    assert.ok(r.events.length >= 2);
    const mono = r.path.map((p) => (control === 'load' ? p.lam : p.eps[0] * r.n[0] + p.eps[1] * r.n[1] + p.eps[2] * r.n[2]));
    for (let i = 1; i < mono.length; i++) assert.ok(mono[i] >= mono[i - 1] * (1 - 1e-9) - 1e-12, `${control} ${load}: шаг ${i}`);
    const mid = sampleAt(r, (r.path.length - 1) / 2);
    assert.ok(Number.isFinite(mid.lam));
  }
});

test('Хашин: при α = 1 сдвиг выключает слои 0° и 45° целиком, при α = 0 — только матрицу', () => {
  const plies = layup(carbon, [0, 45, -45, 90]);
  const at = (hashinAlpha) => simulate({ plies, load: [1, 0, 0.5], criterion: criterionById('hashin'), control: 'strain', options: { ...DEFAULT_OPTIONS, hashinAlpha } });
  const a0 = at(0), a1 = at(1);
  close(a0.ultimate.lam, 667, 2e-3);
  close(a1.ultimate.lam, 397, 2e-3);
  assert.ok(a0.events.some((e) => e.failures.some((f) => f.ply === 0 && f.kind === 'matrix')));
  assert.ok(a1.events.some((e) => e.failures.some((f) => f.ply === 0 && f.kind === 'fiber' && f.stress[0] < 0.6 * carbon.s1p)));
  // При одноосном растяжении α на результат не влияет.
  const u = (hashinAlpha) => simulate({ plies, load: [1, 0, 0], criterion: criterionById('hashin'), options: { ...DEFAULT_OPTIONS, hashinAlpha } }).ultimate.lam;
  close(u(0), u(1), 1e-12);
});

test('гибридный пакет считается', () => {
  const plies = [{ material: carbon, angle: 0, h: 1 }, { material: glass, angle: 90, h: 2 }, { material: aramid, angle: 45, h: 1 }, { material: aramid, angle: -45, h: 1 }];
  const r = run(plies, [1, 0.5, 0], 'maxStrain', 'load');
  assert.ok(r.ultimate.lam > 0 && r.collapse);
});

test('изолиния: окружность', () => {
  const lines = contour((x, y) => Math.hypot(x, y), -2, 2, -2, 2, 80, 80, 1);
  assert.equal(lines.length, 1);
  const l = lines[0];
  assert.deepEqual(l[0], l[l.length - 1]);
  for (const [x, y] of l) close(Math.hypot(x, y), 1, 2e-3);
});
