// Прогрессивное разрушение пакета при пропорциональном нагружении {σx, σy, τxy} = λ·n.
//
// Алгоритм:
//   1. Все слои — ортотропные (связующее работает). Считаем жёсткость пакета A = Σ B̄ᵢh̄ᵢ.
//   2. При единичной нагрузке находим деформации пакета, напряжения в осях каждого слоя
//      и по выбранному критерию — нагрузку λ, при которой слой разрушится, и режим разрушения.
//   3. Разрушается слой с наименьшей λ. Разрушилась матрица — слой переводится на нитяную модель
//      (E₂ = G₁₂ = ν = 0); разрушилось волокно — слой выключается.
//   4. Жёсткость пересчитывается, шаги 2–3 повторяются, пока пакет способен нести нагрузку.
//
// Между событиями всё линейно, поэтому диаграмма строится точно, без шагов по нагрузке.
// control: 'strain' — жёсткое нагружение (после разрушения слоя деформация удерживается, нагрузка падает);
//          'load'   — мягкое нагружение (нагрузка удерживается, деформация скачком растёт).

import { T2, plyD, mulMV, laminateA, laminateModuli, solveLoad, dot } from './mech.js';
import { MODES, DEFAULT_OPTIONS, modeList } from './criteria.js';

const TOL = 1e-6;

// Подпись режима для протокола. В критерии Хашина условия для матрицы (и для волокна при растяжении, если α > 0)
// включают сдвиг; когда разрушение вызвано в основном им, честнее так и написать.
function failureLabel(mode, s, m) {
  const shear = Math.abs(s[2]) / m.t12;
  if (mode === 'mt' && shear > Math.abs(s[1]) / m.s2p) return 'матрица, сдвиг';
  if (mode === 'mc' && shear > Math.abs(s[1]) / m.s2m) return 'матрица, сдвиг';
  if (mode === 'ft' && shear > Math.abs(s[0]) / m.s1p) return 'волокно, растяжение со сдвигом';
  return MODES[mode].label;
}

function plyCheck(ply, state, eps1, criterion, options) {
  if (state === 'failed') return null;
  const e = mulMV(T2(ply.angle), eps1);
  const s = mulMV(plyD(ply.material, state), e);
  let modes;
  if (state === 'matrix') {
    // В нитяном слое осталось одно напряжение σ₁, проверяется только волокно.
    const m = ply.material;
    modes = s[0] > 0 ? [{ mode: 'ft', kind: 'fiber', index: s[0] / m.s1p }]
      : s[0] < 0 ? [{ mode: 'fc', kind: 'fiber', index: -s[0] / m.s1m }] : [];
  } else {
    modes = modeList(criterion, s, ply.material, options);
  }
  let crit = null;
  if (modes.length) {
    const top = modes[0].index;
    // При одновременном срабатывании режимов волокна и матрицы первой считается матрица:
    // слой перейдёт на нитяную модель, и волокно будет проверено заново.
    crit = modes.find((q) => q.kind === 'matrix' && q.index >= top * (1 - TOL)) || modes[0];
  }
  return { strain: e, stress: s, modes, index: crit ? crit.index : 0, mode: crit ? crit.mode : null, kind: crit ? crit.kind : null };
}

function buildStage(plies, states, n, criterion, options) {
  const A = laminateA(plies, states);
  const sol = solveLoad(A, n);
  const stage = { states: states.slice(), A, moduli: laminateModuli(A), carries: sol.carries, eps1: sol.eps, plies: [], lamCrit: Infinity };
  if (!sol.carries) return stage;
  stage.c = dot(n, sol.eps); // податливость в направлении нагрузки
  stage.plies = plies.map((p, i) => plyCheck(p, states[i], sol.eps, criterion, options));
  for (const pc of stage.plies) if (pc && pc.index > 0) stage.lamCrit = Math.min(stage.lamCrit, 1 / pc.index);
  return stage;
}

export function simulate({ plies, load, criterion, control = 'strain', options = DEFAULT_OPTIONS }) {
  const scale = Math.max(Math.abs(load[0]), Math.abs(load[1]), Math.abs(load[2]));
  if (!plies.length || !(scale > 0)) return null;
  // Нормировка: наибольшая по модулю составляющая равна ±1, тогда λ — её величина в МПа.
  const n = load.map((v) => v / scale);
  const lead = [0, 1, 2].reduce((b, i) => (Math.abs(n[i]) > Math.abs(n[b]) ? i : b), 0);

  let states = plies.map(() => 'intact');
  let lam = 0, ctrl = 0, eps = [0, 0, 0];
  const path = [{ lam: 0, eps, stage: 0, kind: 'start' }];
  const stages = [];
  const events = [];
  let collapse = null;

  for (let it = 0; it < 2 * plies.length + 2; it++) {
    const st = buildStage(plies, states, n, criterion, options);
    const k = stages.length;
    stages.push(st);

    if (!st.carries || !Number.isFinite(st.lamCrit)) {
      const alive = states.filter((s) => s !== 'failed').length;
      collapse = { lam, eps, stage: k, reason: alive ? 'mechanism' : 'allFailed' };
      // Последняя точка пути относится уже к разрушенному пакету: при жёстком нагружении нагрузка падает до нуля,
      // при мягком образец рвётся при достигнутой нагрузке.
      if (lam > 0) path.push(control === 'strain' ? { lam: 0, eps, stage: k, kind: 'drop' } : { lam, eps, stage: k, kind: 'end' });
      break;
    }
    if (k > 0) {
      // Жёсткость упала: при мягком нагружении скачком растёт деформация, при жёстком — падает нагрузка.
      if (control === 'strain') lam = ctrl / st.c;
      eps = st.eps1.map((v) => v * lam);
      path.push({ lam, eps, stage: k, kind: control === 'strain' ? 'drop' : 'jump' });
    }
    st.lamStart = lam;
    if (st.lamCrit > lam * (1 + TOL)) {
      lam = st.lamCrit;
      eps = st.eps1.map((v) => v * lam);
      ctrl = st.c * lam;
      path.push({ lam, eps, stage: k, kind: 'load' });
    }
    st.lamEnd = lam;

    const next = states.slice();
    const failures = [];
    st.plies.forEach((pc, i) => {
      if (!pc || !(pc.index > 0) || 1 / pc.index > st.lamCrit * (1 + TOL)) return;
      next[i] = pc.kind === 'matrix' ? 'matrix' : 'failed';
      failures.push({ ply: i, mode: pc.mode, kind: pc.kind, label: failureLabel(pc.mode, pc.stress, plies[i].material), stress: pc.stress.map((v) => v * lam) });
    });
    events.push({ lam, eps, stage: k, failures, pathIndex: path.length - 1 });
    states = next;
  }

  const ultimate = path.reduce((b, p) => (p.lam > b.lam ? p : b), path[0]);
  return { n, lead, control, plies, stages, events, path, collapse, ultimate, first: events[0] || null, finalStates: states };
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
  const lamForIndex = f > 0 && b.kind !== 'load' ? b.lam : lam;
  const indices = stage.plies.map((pc) => (pc ? pc.index * lamForIndex : 0));
  return { lam, eps, stageIndex, stage, indices };
}
