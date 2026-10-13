// Прогрессивное разрушение пакета при пропорциональном нагружении {σx, σy, τxy} = λ·n.
//
// Алгоритм:
//   1. Все слои — ортотропные (связующее работает). Считаем жёсткость пакета A = Σ B̄ᵢh̄ᵢ.
//   2. Находим деформации пакета, напряжения в осях каждого слоя и по выбранному критерию — нагрузку λ,
//      при которой слой разрушится, и режим разрушения.
//   3. Разрушается слой с наименьшей λ. Разрушилось волокно — слой выключается. Разрушилась матрица —
//      слой переводится на нитяную модель (E₂ = G₁₂ = ν = 0), а что происходит с уже набранными σ₂ и τ₁₂,
//      задаёт параметр matrix:
//        'brittle' — хрупкая матрица: напряжения сбрасываются до нуля, их подхватывают остальные слои;
//        'plastic' — пластичная: напряжения остаются на достигнутом уровне и дальше не растут.
//   4. Жёсткость пересчитывается, шаги 2–3 повторяются, пока пакет способен нести нагрузку.
//
// Между событиями деформации линейны по λ: ε = λ·a + b (b ≠ 0 только при «замороженных» напряжениях),
// поэтому диаграмма строится точно, без шагов по нагрузке.
// control: 'strain' — жёсткое нагружение (после разрушения слоя удерживается деформация в направлении нагрузки);
//          'load'   — мягкое нагружение (удерживается нагрузка).

import { T2, plyD, mulMV, laminateA, laminateModuli, eigSym3, transpose, dot } from './mech.js';
import { DEFAULT_OPTIONS, modeList } from './criteria.js';

const TOL = 1e-6;

// Ключ подписи режима для протокола (тексты — в словаре, mode.<ключ>). В критериях с эллипсом для матрицы
// (и для волокна при растяжении, если α > 0) условие включает сдвиг; когда разрушение вызвано в основном им,
// честнее так и написать: 'ms' — «матрица, сдвиг», 'ftShear' — «волокно, растяжение со сдвигом».
function failureLabel(mode, s, m) {
  const shear = Math.abs(s[2]) / m.t12;
  if (mode === 'mt' && shear > Math.abs(s[1]) / m.s2p) return 'ms';
  if (mode === 'mc' && shear > Math.abs(s[1]) / m.s2m) return 'ms';
  if (mode === 'ft' && shear > Math.abs(s[0]) / m.s1p) return 'ftShear';
  return mode;
}

// Показатели по режимам для слоя с напряжениями s, по убыванию.
function plyModes(ply, state, s, criterion, options) {
  if (state === 'matrix') {
    // Матрица уже разрушена: проверяется только волокно, по σ₁.
    const m = ply.material;
    return s[0] > 0 ? [{ mode: 'ft', kind: 'fiber', index: s[0] / m.s1p }]
      : s[0] < 0 ? [{ mode: 'fc', kind: 'fiber', index: -s[0] / m.s1m }] : [];
  }
  return modeList(criterion, s, ply.material, options);
}

const topIndex = (modes) => (modes.length ? modes[0].index : 0);

// При одновременном срабатывании режимов волокна и матрицы первой считается матрица:
// слой перейдёт на нитяную модель, и волокно будет проверено заново.
function governing(modes) {
  if (!modes.length) return null;
  const top = modes[0].index;
  return modes.find((q) => q.kind === 'matrix' && q.index >= top * (1 - TOL)) || modes[0];
}

// Нагрузка, при которой слой с напряжениями s(λ) = λ·sa + sb достигнет предельной поверхности, начиная с lam0.
// over — насколько слой перегружен уже при lam0 (нужно, когда после перераспределения перегружено несколько слоёв).
function firstFailure(ply, state, sa, sb, lam0, criterion, options) {
  const at = (lam) => [lam * sa[0] + sb[0], lam * sa[1] + sb[1], lam * sa[2] + sb[2]];
  if (sb[0] === 0 && sb[1] === 0 && sb[2] === 0) {
    // Пропорциональное нагружение слоя: показатель растёт линейно, корень известен сразу.
    const g = governing(plyModes(ply, state, sa, criterion, options));
    return g ? { lam: 1 / g.index, mode: g.mode, kind: g.kind, over: g.index * lam0 } : null;
  }
  const F = (lam) => topIndex(plyModes(ply, state, at(lam), criterion, options));
  const F0 = F(lam0);
  if (F0 >= 1 - 1e-9) {
    const g = governing(plyModes(ply, state, at(lam0), criterion, options));
    return { lam: lam0, mode: g.mode, kind: g.kind, over: F0 };
  }
  // Область прочности выпукла, поэтому на луче точка выхода из неё единственная: вилка и деление пополам.
  let lo = lam0, hi = lam0 + Math.max(lam0, 1);
  for (let n = 0; F(hi) < 1; n++) {
    if (n > 80) return null;
    lo = hi;
    hi = lam0 + (hi - lam0) * 2;
  }
  for (let i = 0; i < 200 && hi - lo > 1e-14 * hi; i++) {
    const mid = (lo + hi) / 2;
    if (F(mid) < 1) lo = mid; else hi = mid;
  }
  const g = governing(plyModes(ply, state, at(hi), criterion, options));
  return { lam: hi, mode: g.mode, kind: g.kind, over: 0 };
}

// Решение A·ε + R = λ·n относительно ε = λ·a + b; R — вклад «замороженных» напряжений слоёв.
// Жёсткость нитяных слоёв может быть вырожденной. Тогда в направлениях нулевой жёсткости равновесие
// должно выполняться само: если нагрузка туда не действует, пакет работает как обычно ('regular');
// если действует, равновесие возможно при единственной нагрузке lam0, и пакет течёт вдоль flow ('flow');
// иначе нести нагрузку нечем ('mechanism').
function solveAffine(A, n, R) {
  const { values, vectors } = eigSym3(A);
  const wmax = Math.max(...values.map(Math.abs));
  const a = [0, 0, 0], b = [0, 0, 0], nullVecs = [];
  for (let k = 0; k < 3; k++) {
    if (wmax > 0 && values[k] > 1e-9 * wmax) {
      const pn = dot(vectors[k], n) / values[k], pr = dot(vectors[k], R) / values[k];
      for (let i = 0; i < 3; i++) { a[i] += pn * vectors[k][i]; b[i] -= pr * vectors[k][i]; }
    } else nullVecs.push(vectors[k]);
  }
  const g = nullVecs.map((v) => dot(v, n)), q = nullVecs.map((v) => dot(v, R));
  const scaleR = Math.max(1, Math.hypot(R[0], R[1], R[2]));
  const tolN = 1e-7 * Math.hypot(n[0], n[1], n[2]);
  const base = { a, b, c: dot(n, a), nullVecs };
  if (g.every((v) => Math.abs(v) <= tolN)) {
    return q.every((v) => Math.abs(v) <= 1e-7 * scaleR) ? { kind: 'regular', ...base } : { kind: 'mechanism', ...base };
  }
  const gg = g.reduce((s, v) => s + v * v, 0);
  const lam0 = g.reduce((s, v, k) => s + v * q[k], 0) / gg;
  const miss = Math.hypot(...g.map((v, k) => lam0 * v - q[k]));
  if (miss > 1e-7 * Math.max(scaleR, Math.abs(lam0)) || !(lam0 > 1e-9 * scaleR)) return { kind: 'mechanism', ...base };
  // Направление течения: то из направлений нулевой жёсткости, на котором нагрузка совершает работу.
  const flow = [0, 0, 0];
  nullVecs.forEach((v, k) => { for (let i = 0; i < 3; i++) flow[i] += (g[k] / Math.sqrt(gg)) * v[i]; });
  return { kind: 'flow', lam0, flow, ...base };
}

function buildStage(plies, states, resid, n, epsNow, keepNull) {
  const A = laminateA(plies, states);
  const H = plies.reduce((s, p) => s + p.h, 0);
  const R = [0, 0, 0];
  plies.forEach((p, i) => {
    if (states[i] !== 'matrix' || !resid[i]) return;
    const r = mulMV(transpose(T2(p.angle)), resid[i]); // напряжения слоя в осях пакета
    for (let j = 0; j < 3; j++) R[j] += (r[j] * p.h) / H;
  });
  const sol = solveAffine(A, n, R);
  if (keepNull) {
    // Составляющая деформации вдоль направлений нулевой жёсткости сохраняется: её ничто не возвращает.
    for (const v of sol.nullVecs) { const pe = dot(v, epsNow); for (let i = 0; i < 3; i++) sol.b[i] += pe * v[i]; }
  }
  const stage = {
    states: states.slice(), A, moduli: laminateModuli(A), kind: sol.kind, carries: sol.kind !== 'mechanism',
    a: sol.a, b: sol.b, c: sol.c, lam0: sol.lam0, flow: sol.flow, plies: [], lamCrit: Infinity,
  };
  if (!stage.carries) return stage;
  stage.plies = plies.map((p, i) => {
    if (states[i] === 'failed') return null;
    const t2 = T2(p.angle), D = plyD(p.material, states[i]);
    const ea = mulMV(t2, sol.a), eb = mulMV(t2, sol.b);
    const sa = mulMV(D, ea), sb = mulMV(D, eb);
    if (states[i] === 'matrix' && resid[i]) for (let j = 0; j < 3; j++) sb[j] += resid[i][j];
    return { state: states[i], ea, eb, sa, sb };
  });
  return stage;
}

export function simulate({ plies, load, criterion, control = 'strain', matrix = 'brittle', options = DEFAULT_OPTIONS }) {
  const scale = Math.max(Math.abs(load[0]), Math.abs(load[1]), Math.abs(load[2]));
  if (!plies.length || !(scale > 0)) return null;
  // Нормировка: наибольшая по модулю составляющая равна ±1, тогда λ — её величина в МПа.
  const n = load.map((v) => v / scale);
  const lead = [0, 1, 2].reduce((b, i) => (Math.abs(n[i]) > Math.abs(n[b]) ? i : b), 0);
  const plastic = matrix === 'plastic';

  let states = plies.map(() => 'intact');
  const resid = plies.map(() => null); // «замороженные» напряжения слоёв с разрушенной пластичной матрицей
  let lam = 0, ctrl = 0, eps = [0, 0, 0];
  const path = [{ lam: 0, eps, stage: 0, kind: 'start' }];
  const stages = [];
  const events = [];
  let collapse = null;
  const strainAt = (st, l) => [l * st.a[0] + st.b[0], l * st.a[1] + st.b[1], l * st.a[2] + st.b[2]];
  const differs = (l, e) => Math.abs(l - lam) > 1e-9 * Math.max(1, Math.abs(lam)) || e.some((v, j) => Math.abs(v - eps[j]) > 1e-12);

  for (let it = 0; it < 2 * plies.length + 2; it++) {
    const st = buildStage(plies, states, resid, n, eps, plastic);
    const k = stages.length;
    stages.push(st);

    if (st.kind === 'mechanism') {
      const alive = states.filter((s) => s !== 'failed').length;
      collapse = { lam, eps, stage: k, reason: alive ? 'mechanism' : 'allFailed' };
      // Последняя точка пути относится уже к разрушенному пакету: при жёстком нагружении нагрузка падает до нуля,
      // при мягком образец рвётся при достигнутой нагрузке.
      if (lam > 0) path.push(control === 'strain' ? { lam: 0, eps, stage: k, kind: 'drop' } : { lam, eps, stage: k, kind: 'end' });
      break;
    }
    if (st.kind === 'flow') {
      // Пластическое течение: равновесие возможно только при нагрузке lam0, деформация растёт вдоль st.flow.
      if (control === 'load' && st.lam0 < lam * (1 - TOL)) {
        collapse = { lam, eps, stage: k, reason: 'mechanism' };
        path.push({ lam, eps, stage: k, kind: 'end' });
        break;
      }
      const work = dot(n, st.flow); // > 0 по построению
      let e0 = strainAt(st, st.lam0);
      const lag = (ctrl - dot(n, e0)) / work; // при жёстком нагружении деформация управления не убывает
      if (lag > 0) e0 = e0.map((v, j) => v + lag * st.flow[j]);
      if (differs(st.lam0, e0)) path.push({ lam: st.lam0, eps: e0, stage: k, kind: control === 'strain' ? 'drop' : 'jump' });
      lam = st.lam0;
      // Площадка на диаграмме условной длины: по модели она не заканчивается. Длина отмеряется по наибольшей
      // составляющей деформации, потому что направление течения может быть почти перпендикулярно нагрузке.
      const more = Math.max(0.4 * Math.max(...e0.map(Math.abs)), 0.004) / Math.max(...st.flow.map(Math.abs));
      eps = e0.map((v, j) => v + more * st.flow[j]);
      path.push({ lam, eps, stage: k, kind: 'flow' });
      collapse = { lam, eps, stage: k, reason: 'flow' };
      break;
    }

    if (k > 0) {
      // Жёсткость упала: при мягком нагружении скачком растёт деформация, при жёстком — падает нагрузка.
      // С пластичной матрицей после её разрушения ничего не меняется скачком, и точка перехода не нужна.
      const l1 = control === 'strain' ? Math.max(0, (ctrl - dot(n, st.b)) / st.c) : lam;
      const e1 = strainAt(st, l1);
      if (differs(l1, e1)) path.push({ lam: l1, eps: e1, stage: k, kind: control === 'strain' ? 'drop' : 'jump' });
      lam = l1;
      eps = e1;
    }
    st.lamStart = lam;
    const firsts = st.plies.map((pc, i) => pc && firstFailure(plies[i], pc.state, pc.sa, pc.sb, lam, criterion, options));
    for (const f of firsts) if (f && f.lam < st.lamCrit) st.lamCrit = f.lam;
    if (!Number.isFinite(st.lamCrit)) {
      collapse = { lam, eps, stage: k, reason: 'mechanism' };
      if (lam > 0) path.push(control === 'strain' ? { lam: 0, eps, stage: k, kind: 'drop' } : { lam, eps, stage: k, kind: 'end' });
      break;
    }
    const immediate = st.lamCrit <= lam * (1 + TOL);
    if (!immediate) {
      lam = st.lamCrit;
      eps = strainAt(st, lam);
      ctrl = dot(n, eps);
      path.push({ lam, eps, stage: k, kind: 'load' });
    }
    st.lamEnd = lam;

    // Если после перераспределения перегружено сразу несколько слоёв, первым разрушается самый перегруженный.
    const limit = (immediate ? lam : st.lamCrit) * (1 + TOL);
    const worst = immediate ? Math.max(...firsts.map((f) => (f && f.lam <= limit ? f.over : 0))) : 0;
    const next = states.slice();
    const failures = [];
    firsts.forEach((f, i) => {
      if (!f || f.lam > limit || (immediate && f.over < worst * (1 - TOL))) return;
      const pc = st.plies[i], m = plies[i].material;
      const stress = pc.sa.map((v, j) => v * lam + pc.sb[j]);
      if (f.kind === 'matrix') {
        next[i] = 'matrix';
        if (plastic) {
          // Напряжения слоя остаются теми же, дальше растёт только σ₁ = E₁ε₁.
          const strain = pc.ea.map((v, j) => v * lam + pc.eb[j]);
          const net = mulMV(plyD(m, 'matrix'), strain);
          resid[i] = stress.map((v, j) => v - net[j]);
        }
      } else {
        next[i] = 'failed';
        resid[i] = null;
      }
      failures.push({ ply: i, mode: f.mode, kind: f.kind, label: failureLabel(f.mode, stress, m), stress });
    });
    events.push({ lam, eps, stage: k, failures, pathIndex: path.length - 1 });
    states = next;
  }

  const ultimate = path.reduce((b, p) => (p.lam > b.lam ? p : b), path[0]);
  return { n, lead, control, matrix: plastic ? 'plastic' : 'brittle', criterion, options, plies, stages, events, path, collapse, ultimate, first: events[0] || null, finalStates: states };
}

// Состояние пакета в произвольной точке диаграммы: pos ∈ [0, path.length − 1].
export function sampleAt(result, pos) {
  const { path, stages } = result;
  const p = Math.min(Math.max(pos, 0), path.length - 1);
  const i = Math.min(Math.floor(p), path.length - 2);
  const f = path.length > 1 ? p - i : 0;
  const a = path[Math.max(i, 0)], b = path[Math.min(i + 1, path.length - 1)];
  const lam = a.lam + (b.lam - a.lam) * f;
  const eps = a.eps.map((v, j) => v + (b.eps[j] - v) * f);
  // На участках скачка и срыва действует уже новое состояние слоёв.
  const stageIndex = f > 0 ? b.stage : a.stage;
  const stage = stages[stageIndex];
  // Внутри срыва и скачка промежуточные точки условны: показатели слоёв берутся для конца перехода.
  const l = f > 0 && b.kind !== 'load' ? b.lam : lam;
  const indices = stage.plies.map((pc, j) => (pc
    ? topIndex(plyModes(result.plies[j], pc.state, [l * pc.sa[0] + pc.sb[0], l * pc.sa[1] + pc.sb[1], l * pc.sa[2] + pc.sb[2]], result.criterion, result.options))
    : 0));
  return { lam, eps, stageIndex, stage, indices };
}
