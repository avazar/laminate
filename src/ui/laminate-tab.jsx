// Вкладка «Пакет»: укладка, нагрузка, прогрессивное разрушение и диаграмма деформирования.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { MODAL_CRITERIA, DEFAULT_OPTIONS, criterionById } from '../core/criteria.js';
import { materialById } from '../core/materials.js';
import { simulate, sampleAt } from '../core/progressive.js';
import { Tex, Num, Panel, Gutter, Segmented, StatusIcon, fmt, fmtAngle, fmtAuto, niceTicks, tickDigits, linear, useSize, clamp } from './common.jsx';
import { StackView } from './stack-view.jsx';

const LOAD = [
  { tex: '\\sigma_x', name: 'σx' },
  { tex: '\\sigma_y', name: 'σy' },
  { tex: '\\tau_{xy}', name: 'τxy' },
];
const STRAIN = [
  { tex: '\\varepsilon_x', name: 'εx', color: 'var(--series-1)' },
  { tex: '\\varepsilon_y', name: 'εy', color: 'var(--series-2)', dash: '9 6' },
  { tex: '\\gamma_{xy}', name: 'γxy', color: 'var(--series-3)', dash: '2 6' },
];
const VESSEL_ANGLE = (Math.atan(Math.SQRT2) * 180) / Math.PI;
const LAYUPS = [
  { label: '[0]', angles: [0] },
  { label: '[0/90]', angles: [0, 90] },
  { label: '[±45]', angles: [45, -45] },
  { label: '[0/±45/90]', angles: [0, 45, -45, 90] },
  { label: '[0₂/±45]', angles: [0, 0, 45, -45] },
  // Равновесный угол нитяной модели для сосуда давления: tg²φ = σy/σx = 2, φ = arctg √2 ≈ 54,74°.
  // Угол хранится точно: пара нитяных слоёв ±φ несёт только нагрузку с отношением tg²φ, и при 55° ровно
  // такая же пара под нагрузкой 1 : 2 после разрушения матрицы — механизм.
  { label: '[±54,7]', angles: [VESSEL_ANGLE, -VESSEL_ANGLE], title: 'Равновесный угол для сосуда давления: tg²φ = 2' },
];
const LOADS = [
  { label: 'растяжение x', load: [1, 0, 0] },
  { label: 'сжатие x', load: [-1, 0, 0] },
  { label: 'растяжение y', load: [0, 1, 0] },
  { label: 'сдвиг', load: [0, 0, 1] },
  { label: 'двухосное 1 : 1', load: [1, 1, 0] },
  { label: 'сосуд 1 : 2', load: [0.5, 1, 0] },
];
const STATE_TEXT = { intact: 'цел', matrix: 'нитяная модель', failed: 'разрушен' };
const STATE_ICON = { intact: 'ok', matrix: 'matrix', failed: 'fiber' };
const MAX_PLIES = 16;

let nextId = 1;
export const makePly = (materialId, angle, h = 0.2) => ({ id: `p${Date.now().toString(36)}${nextId++}`, materialId, angle, h });
const angleText = fmtAngle;

function layupCode(plies) {
  const out = [];
  for (let i = 0; i < plies.length; i++) {
    const a = plies[i].angle, b = plies[i + 1] && plies[i + 1].angle;
    if (a > 0 && b === -a) { out.push(`±${angleText(a)}`); i++; } else out.push(angleText(a));
  }
  return `[${out.join('/')}]`;
}

// ---------- укладка ----------
function LayupEditor({ plies, setPlies, materials, hover, onHover }) {
  const update = (id, patch) => setPlies(plies.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const lastMat = plies.length ? plies[plies.length - 1].materialId : materials[0].id;
  const full = plies.length >= MAX_PLIES;
  return (
    <Panel title="Укладка" aside={<span class="layup-code mono">{layupCode(plies)}</span>} class="panel-grow">
      <div class="chips" role="group" aria-label="Готовые укладки">
        {LAYUPS.map((l) => <button type="button" class="chip" key={l.label} title={l.title} onClick={() => setPlies(l.angles.map((a) => makePly(lastMat, a)))}>{l.label}</button>)}
      </div>
      <div class="ply-table" role="table" aria-label="Слои пакета">
        <div class="ply-row ply-head" role="row"><span>№</span><span>φ, °</span><span>материал</span><span>h, мм</span><span /></div>
        {plies.map((p, i) => (
          <div class={`ply-row ${hover === i ? 'is-hover' : ''}`} role="row" key={p.id} onPointerEnter={() => onHover(i)} onPointerLeave={() => onHover(null)}>
            <span class="ply-n mono">{i + 1}</span>
            <Num id={`angle-${p.id}`} value={p.angle} step={5} min={-90} max={90} digits={2} onChange={(v) => update(p.id, { angle: Math.round(v * 100) / 100 })} label={`Угол армирования слоя ${i + 1}`} />
            <div class="mat-seg" role="group" aria-label={`Материал слоя ${i + 1}`}>
              {materials.map((m) => (
                <button type="button" key={m.id} class={`mat-chip mat-${m.id}`} aria-pressed={m.id === p.materialId} title={m.name} onClick={() => update(p.id, { materialId: m.id })}>{m.short}</button>
              ))}
            </div>
            <Num id={`h-${p.id}`} value={p.h} step={0.05} min={0.01} max={10} digits={3} onChange={(v) => update(p.id, { h: v })} label={`Толщина слоя ${i + 1}, мм`} />
            <button type="button" class="icon-btn" aria-label={`Удалить слой ${i + 1}`} disabled={plies.length === 1} onClick={() => setPlies(plies.filter((q) => q.id !== p.id))}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
            </button>
          </div>
        ))}
      </div>
      <div class="row-btns">
        <button type="button" class="ghost-btn" disabled={full} onClick={() => setPlies([...plies, makePly(lastMat, 0)])}>+ слой</button>
        <button type="button" class="ghost-btn" disabled={plies.length + 2 > MAX_PLIES} onClick={() => setPlies([...plies, makePly(lastMat, 45), makePly(lastMat, -45)])}>+ пара ±45°</button>
        <button type="button" class="ghost-btn" disabled={plies.length * 2 > MAX_PLIES} title="Дописать слои в обратном порядке" onClick={() => setPlies([...plies, ...plies.slice().reverse().map((p) => makePly(p.materialId, p.angle, p.h))])}>симметрично</button>
      </div>
    </Panel>
  );
}

// ---------- нагрузка ----------
function LoadGlyph({ load }) {
  const s = Math.max(...load.map(Math.abs), 1e-9);
  const n = load.map((v) => v / s);
  const A = 30; // половина стороны пластины в единицах viewBox
  const arrows = [];
  const push = (x1, y1, x2, y2, key) => arrows.push(<line key={key} x1={x1} y1={y1} x2={x2} y2={y2} marker-end="url(#load-arrow)" />);
  // нормальные напряжения: стрелки наружу — растяжение, внутрь — сжатие
  [[n[0], 1, 0], [n[1], 0, -1]].forEach(([v, dx, dy], k) => {
    if (Math.abs(v) < 0.02) return;
    const len = 8 + 16 * Math.abs(v);
    for (const side of [1, -1]) for (const off of [-18, 0, 18]) {
      const bx = side * dx * (A + 4) + (dx ? 0 : off), by = side * dy * (A + 4) + (dy ? 0 : off);
      const ex = bx + side * dx * len, ey = by + side * dy * len;
      if (v > 0) push(bx, by, ex, ey, `n${k}${side}${off}`); else push(ex, ey, bx, by, `n${k}${side}${off}`);
    }
  });
  // касательные: вдоль кромок, положительный сдвиг — по правилу знаков τxy
  if (Math.abs(n[2]) > 0.02) {
    const g = Math.sign(n[2]), len = 10 + 14 * Math.abs(n[2]), d = A + 5;
    push(-len * g, -d, len * g, -d, 't0');
    push(len * g, d, -len * g, d, 't1');
    push(d, len * g, d, -len * g, 't2');
    push(-d, -len * g, -d, len * g, 't3');
  }
  return (
    <svg class="load-glyph" viewBox="-66 -66 132 132" role="img" aria-label="Схема нагружения пластины">
      <defs><marker id="load-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto"><path d="M0 1L9 5L0 9z" class="arrow-head" /></marker></defs>
      <rect class="plate" x={-A} y={-A} width={2 * A} height={2 * A} />
      <g class="load-arrows">{arrows}</g>
      <text class="glyph-axis" x={A - 4} y={A - 5} text-anchor="end">x →</text>
    </svg>
  );
}

function LoadEditor({ load, setLoad }) {
  return (
    <Panel title="Нагрузка" aside={<span class="head-hint">соотношение составляющих</span>}>
      <div class="load-box">
        <LoadGlyph load={load} />
        <div class="load-sliders">
          {LOAD.map((l, i) => (
            <label class="param" key={l.name}>
              <span class="param-name"><Tex>{l.tex}</Tex></span>
              <input type="range" id={`load-${i}`} min="-1" max="1" step="0.05" value={load[i]} aria-label={l.name} onInput={(e) => { const next = load.slice(); next[i] = parseFloat(e.target.value); setLoad(next); }} />
              <output class="mono">{fmt(load[i], 2)}</output>
            </label>
          ))}
        </div>
      </div>
      <div class="chips" role="group" aria-label="Типовые нагружения">
        {LOADS.map((l) => <button type="button" class="chip" key={l.label} aria-pressed={l.load.every((v, i) => v === load[i])} onClick={() => setLoad(l.load)}>{l.label}</button>)}
      </div>
    </Panel>
  );
}

// ---------- диаграмма деформирования ----------
function EventMark({ x, y, n, kind, done, r, onClick }) {
  const shape = kind === 'fiber'
    ? <rect x={x - r} y={y - r} width={2 * r} height={2 * r} transform={`rotate(45 ${x} ${y})`} />
    : <circle cx={x} cy={y} r={r * 1.08} />;
  return (
    <g class={`event-mark event-${kind} ${done ? 'is-done' : ''}`} onPointerDown={(e) => { e.stopPropagation(); onClick(); }}>
      {shape}
      <text x={x} y={y} dy="0.35em" text-anchor="middle">{n}</text>
    </g>
  );
}

function Diagram({ result, pos, setPos, show, rem }) {
  const ref = useRef(null);
  const { w, h } = useSize(ref);
  const { path, lead, n } = result;
  const sign = Math.sign(n[lead]) || 1;
  const mL = 4.4 * rem, mR = 1.4 * rem, mT = 1.2 * rem, mB = 2.6 * rem;
  const ready = w > mL + mR + 60 && h > mT + mB + 60;
  const comps = [0, 1, 2].filter((j) => show[j] && path.some((p) => Math.abs(p.eps[j]) > 1e-12));

  const geo = useMemo(() => {
    let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
    for (const p of path) {
      for (const j of comps) { x0 = Math.min(x0, p.eps[j] * 100); x1 = Math.max(x1, p.eps[j] * 100); }
      y0 = Math.min(y0, p.lam * sign); y1 = Math.max(y1, p.lam * sign);
    }
    if (x1 - x0 < 1e-9) { x1 = 1; }
    const px = (x1 - x0) * 0.06, py = (y1 - y0) * 0.09;
    return { x0: x0 - (x0 < 0 ? px : 0), x1: x1 + (x1 > 0 ? px : 0), y0: y0 - (y0 < 0 ? py : 0), y1: y1 + (y1 > 0 ? py : 0) };
  }, [result, comps.join()]);

  const sx = linear(geo.x0, geo.x1, mL, w - mR);
  const sy = linear(geo.y0, geo.y1, h - mB, mT);
  const tx = niceTicks(geo.x0, geo.x1, Math.max(3, Math.round((w - mL - mR) / (6 * rem))));
  const ty = niceTicks(geo.y0, geo.y1, Math.max(3, Math.round((h - mT - mB) / (3 * rem))));
  const pt = (p, j) => [sx(p.eps[j] * 100), sy(p.lam * sign)];
  const cur = sampleAt(result, pos);
  const d = (j, upto) => {
    const k = Math.floor(upto);
    const pts = path.slice(0, k + 1).map((p) => pt(p, j));
    if (upto > k && k + 1 < path.length) pts.push([sx(cur.eps[j] * 100), sy(cur.lam * sign)]);
    return 'M' + pts.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('L');
  };

  // Перетаскивание: бегунок встаёт в ближайшую точку ведущей кривой.
  const scrub = (e) => {
    const r = ref.current.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let best = 0, bd = Infinity;
    for (let i = 0; i + 1 < path.length; i++) {
      const a = pt(path[i], lead), b = pt(path[i + 1], lead);
      const vx = b[0] - a[0], vy = b[1] - a[1];
      const L2 = vx * vx + vy * vy;
      const t = L2 > 0 ? clamp(((mx - a[0]) * vx + (my - a[1]) * vy) / L2, 0, 1) : 0;
      const dd = (a[0] + vx * t - mx) ** 2 + (a[1] + vy * t - my) ** 2;
      if (dd < bd) { bd = dd; best = i + t; }
    }
    setPos(best);
  };

  const r = 0.62 * rem;
  return (
    <div class="plot diagram" ref={ref}>
      {ready && (
        <svg
          width={w} height={h} class="plot-svg diagram-svg" role="img" aria-label="Диаграмма деформирования пакета"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); scrub(e); }}
          onPointerMove={(e) => { if (e.buttons & 1 || e.pointerType === 'touch') scrub(e); }}
        >
          {tx.ticks.map((v) => <line key={'gx' + v} class="grid" x1={sx(v)} x2={sx(v)} y1={mT} y2={h - mB} />)}
          {ty.ticks.map((v) => <line key={'gy' + v} class="grid" x1={mL} x2={w - mR} y1={sy(v)} y2={sy(v)} />)}
          <line class="axis" x1={sx(0)} x2={sx(0)} y1={mT} y2={h - mB} />
          <line class="axis" x1={mL} x2={w - mR} y1={sy(0)} y2={sy(0)} />
          {tx.ticks.map((v) => <text key={'tx' + v} class="tick" x={sx(v)} y={h - mB + 1.25 * rem} text-anchor="middle">{fmt(v, tickDigits(tx.step))}</text>)}
          {ty.ticks.map((v) => <text key={'ty' + v} class="tick" x={mL - 0.5 * rem} y={sy(v)} dy="0.34em" text-anchor="end">{fmt(v, tickDigits(ty.step))}</text>)}
          {comps.map((j) => <path key={'g' + j} class="curve-ghost" d={d(j, path.length - 1)} stroke={STRAIN[j].color} stroke-dasharray={STRAIN[j].dash} />)}
          {comps.map((j) => (
            <path key={'c' + j} class="curve" d={d(j, pos)} stroke={STRAIN[j].color} stroke-width={j === lead ? 0.24 * rem : 0.16 * rem} stroke-dasharray={j === lead ? undefined : STRAIN[j].dash} />
          ))}
          {result.collapse && (() => {
            const q = [sx(result.collapse.eps[lead] * 100), sy(result.collapse.lam * sign)];
            const k = 0.5 * rem;
            return <path class="rupture" d={`M${q[0] - k} ${q[1] - k}L${q[0] + k} ${q[1] + k}M${q[0] + k} ${q[1] - k}L${q[0] - k} ${q[1] + k}`} />;
          })()}
          {result.events.map((ev, i) => {
            const q = pt(path[ev.pathIndex], lead);
            const kind = ev.failures.some((f) => f.kind === 'fiber') ? 'fiber' : 'matrix';
            return <EventMark key={i} x={q[0]} y={q[1]} n={i + 1} kind={kind} r={r} done={pos >= ev.pathIndex - 1e-6} onClick={() => setPos(ev.pathIndex)} />;
          })}
          {comps.map((j) => <circle key={'h' + j} class="playhead" cx={sx(cur.eps[j] * 100)} cy={sy(cur.lam * sign)} r={(j === lead ? 0.42 : 0.3) * rem} fill={STRAIN[j].color} />)}
        </svg>
      )}
      <span class="axis-title axis-title-x">деформация, %</span>
      <span class="axis-title axis-title-y"><Tex>{LOAD[lead].tex}</Tex>, МПа</span>
    </div>
  );
}

// ---------- воспроизведение ----------
function usePlayback(result) {
  const last = result ? result.path.length - 1 : 0;
  const [pos, setPos] = useState(last);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  // длина пути в координатах ведущей кривой, нормированных на размах: скорость бегунка на экране постоянна
  const cum = useMemo(() => {
    if (!result) return [0];
    const { path, lead } = result;
    const xs = path.map((p) => p.eps[lead]), ys = path.map((p) => p.lam);
    const dx = Math.max(...xs) - Math.min(...xs) || 1, dy = Math.max(...ys) - Math.min(...ys) || 1;
    const out = [0];
    for (let i = 1; i < path.length; i++) out.push(out[i - 1] + Math.hypot((xs[i] - xs[i - 1]) / dx, (ys[i] - ys[i - 1]) / dy));
    return out;
  }, [result]);
  const toU = (p) => {
    const i = Math.min(Math.floor(p), cum.length - 2);
    return cum.length < 2 ? 0 : (cum[i] + (cum[i + 1] - cum[i]) * (p - i)) / cum[cum.length - 1];
  };
  const toPos = (u) => {
    const target = u * cum[cum.length - 1];
    for (let i = 0; i + 1 < cum.length; i++) if (target <= cum[i + 1]) return i + (cum[i + 1] > cum[i] ? (target - cum[i]) / (cum[i + 1] - cum[i]) : 0);
    return cum.length - 1;
  };
  useEffect(() => { setPos(last); setPlaying(false); }, [result]);
  useEffect(() => {
    if (!playing) return undefined;
    let raf, prev = performance.now(), u = toU(pos);
    if (u >= 1) u = 0;
    const tick = (now) => {
      u += ((now - prev) / 1000) * (speed / 9); // весь опыт — около девяти секунд
      prev = now;
      if (u >= 1) { setPos(last); setPlaying(false); return; }
      setPos(toPos(u));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, result]);
  return { pos, setPos: (p) => { setPlaying(false); setPos(clamp(p, 0, last)); }, playing, setPlaying, speed, setSpeed, toU, toPos, last };
}

function Transport({ pb, result }) {
  const stops = [0, ...result.events.map((e) => e.pathIndex), pb.last];
  const jump = (dir) => {
    const next = dir > 0 ? stops.find((s) => s > pb.pos + 1e-6) : stops.slice().reverse().find((s) => s < pb.pos - 1e-6);
    pb.setPos(next === undefined ? (dir > 0 ? pb.last : 0) : next);
  };
  return (
    <div class="transport">
      <button type="button" class="icon-btn" aria-label="К предыдущему событию" onClick={() => jump(-1)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3v10M13 3L6 8l7 5z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" /></svg></button>
      <button type="button" class="play-btn" aria-label={pb.playing ? 'Пауза' : 'Провести испытание'} onClick={() => pb.setPlaying(!pb.playing)}>
        {pb.playing
          ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3v10M11.5 3v10" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" /></svg>
          : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.5l9 5.5-9 5.5z" fill="currentColor" /></svg>}
        <span>{pb.playing ? 'пауза' : 'испытать'}</span>
      </button>
      <button type="button" class="icon-btn" aria-label="К следующему событию" onClick={() => jump(1)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M12 3v10M3 3l7 5-7 5z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" /></svg></button>
      <input type="range" id="scrub" class="scrub" min="0" max="1" step="0.001" value={pb.toU(pb.pos)} aria-label="Положение на диаграмме" onInput={(e) => pb.setPos(pb.toPos(parseFloat(e.target.value)))} />
      <Segmented label="Скорость" value={pb.speed} onChange={pb.setSpeed} options={[{ value: 0.4, label: '0,4×' }, { value: 1, label: '1×' }, { value: 2.5, label: '2,5×' }]} />
    </div>
  );
}

// ---------- сводка и журнал ----------
function plyName(result, i) {
  const p = result.plies[i];
  return `слой ${i + 1} (${angleText(p.angle)}°, ${p.material.short})`;
}

function Stat({ label, value, unit, sub }) {
  return (
    <div class="stat">
      <span class="stat-label">{label}</span>
      <span class="stat-value">{value}<span class="stat-unit">{unit}</span></span>
      <span class="stat-sub">{sub}</span>
    </div>
  );
}

function EventLog({ result, pos, setPos }) {
  const { events, collapse, lead, n } = result;
  const sign = Math.sign(n[lead]) || 1;
  return (
    <ol class="log">
      {events.map((ev, i) => {
        const kind = ev.failures.some((f) => f.kind === 'fiber') ? 'fiber' : 'matrix';
        const done = pos >= ev.pathIndex - 1e-6;
        return (
          <li key={i} class={`log-item ${done ? 'is-done' : ''}`}>
            <button type="button" class="log-btn" onClick={() => setPos(ev.pathIndex)}>
              <span class={`log-n event-${kind}`}>{i + 1}</span>
              <span class="log-text">
                <span class="log-where mono">{LOAD[lead].name} = {fmt(ev.lam * sign, 0)} МПа · {STRAIN[lead].name} = {fmt(ev.eps[lead] * 100, 2)} %</span>
                {ev.failures.map((f, k) => (
                  <span class="log-what" key={k}>
                    <StatusIcon kind={f.kind === 'fiber' ? 'fiber' : 'matrix'} />
                    {plyName(result, f.ply)} — {f.label}{f.kind === 'matrix' ? ' → нитяная модель' : ' → слой выключен'}
                  </span>
                ))}
              </span>
            </button>
          </li>
        );
      })}
      {collapse && (
        <li class={`log-item log-final ${pos >= result.path.length - 1 - 1e-6 ? 'is-done' : ''}`}>
          <span class="log-n event-final">✕</span>
          <span class="log-text">
            <span class="log-what">{collapse.reason === 'allFailed'
              ? 'Все слои разрушены — несущая способность исчерпана.'
              : 'Оставшиеся нитяные слои образуют механизм: нести эту нагрузку нечем.'}</span>
          </span>
        </li>
      )}
    </ol>
  );
}

function StiffnessMeters({ now, initial }) {
  const rows = [['E_x', 'Ex'], ['E_y', 'Ey'], ['G_{xy}', 'Gxy']];
  return (
    <div class="stiff">
      {rows.map(([t, key]) => {
        const part = initial[key] > 0 ? now[key] / initial[key] : 0;
        return (
          <div class="stiff-row" key={key}>
            <Tex>{t}</Tex>
            <span class="meter meter-wide" aria-hidden="true"><span class="meter-fill" style={{ width: `${clamp(part, 0, 1) * 100}%` }} /></span>
            <span class="mono stiff-val">{fmtAuto(now[key] / 1000)} <span class="unit">ГПа</span></span>
            <span class="mono stiff-pct">{fmt(part * 100, 0)} %</span>
          </div>
        );
      })}
    </div>
  );
}

export function LaminateTab({ active, materials, state, setState, rem, panels }) {
  const set = (patch) => setState((s) => ({ ...s, ...patch }));
  const [hover, setHover] = useState(null);
  const plies = useMemo(
    () => state.plies.map((p) => ({ id: p.id, angle: p.angle, h: p.h, material: materialById(materials, p.materialId) })),
    [state.plies, materials],
  );
  const criterion = criterionById(state.criterionId) || MODAL_CRITERIA[0];
  // У расчёта пакета свой α, не связанный с ползунком на вкладке «Слой». По умолчанию 0: волокно рвётся только
  // по σ₁, и сдвиг не выключает слой целиком. τ̄₂₃ для каждого материала принимается равной σ̄₂⁻/2.
  const simOptions = useMemo(() => ({ ...DEFAULT_OPTIONS, hashinAlpha: state.hashinAlpha ? 1 : 0, hashinSt: null }), [state.hashinAlpha]);
  const result = useMemo(
    () => simulate({ plies, load: state.load, criterion, control: state.control, options: simOptions }),
    [plies, state.load, criterion, state.control, simOptions],
  );
  const pb = usePlayback(result);
  // Пробел запускает и останавливает испытание, если фокус не в поле ввода и не на кнопке.
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.code !== 'Space' || /^(INPUT|BUTTON|SELECT|TEXTAREA)$/.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      pb.setPlaying(!pb.playing);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, pb.playing]);

  const tabClass = `tab tab-laminate ${panels.hideLeft ? 'hide-left' : ''} ${panels.hideRight ? 'hide-right' : ''}`;
  const left = (
    <>
    <div class="col col-left">
      <LayupEditor plies={state.plies} setPlies={(p) => set({ plies: p })} materials={materials} hover={hover} onHover={setHover} />
      <LoadEditor load={state.load} setLoad={(l) => set({ load: l })} />
      <Panel title="Расчёт">
        <div class="field">
          <span class="field-label">критерий</span>
          <Segmented class="seg-grid" label="Критерий разрушения слоя" value={criterion.id} onChange={(v) => set({ criterionId: v })} options={MODAL_CRITERIA.map((c) => ({ value: c.id, label: c.short }))} />
        </div>
        {criterion.id === 'hashin' && (
          <div class="field">
            <span class="field-label">сдвиг в условии для волокна, <Tex>{'\\alpha'}</Tex></span>
            <Segmented
              label="Параметр α критерия Хашина" value={state.hashinAlpha ? 1 : 0} onChange={(v) => set({ hashinAlpha: v })}
              options={[
                { value: 0, label: '0', title: 'Хашин–Ротем: волокно рвётся только по σ₁' },
                { value: 1, label: '1', title: 'Хашин (1980): сдвиг участвует в разрушении волокна, и слой может выключиться от сдвига' },
              ]}
            />
          </div>
        )}
        <div class="field">
          <span class="field-label">нагружение</span>
          <Segmented label="Режим нагружения" value={state.control} onChange={(v) => set({ control: v })} options={[{ value: 'strain', label: 'жёсткое', title: 'Задаётся деформация' }, { value: 'load', label: 'мягкое', title: 'Задаётся нагрузка' }]} />
        </div>
        <p class="note">{state.control === 'strain'
          ? 'Захваты машины задают деформацию: слой разрушился — нагрузка срывается, затем растёт по новой жёсткости.'
          : 'Задаётся сила: слой разрушился — деформация растёт скачком при той же нагрузке.'}</p>
      </Panel>
    </div>
    <Gutter side="left" hidden={panels.hideLeft} onToggle={() => panels.toggle('hideLeft')} />
    </>
  );

  if (!result) {
    return (
      <div class={tabClass} hidden={!active}>
        {left}
        <div class="col col-mid col-main"><div class="empty">Задайте нагрузку: хотя бы одна составляющая должна быть ненулевой.</div></div>
      </div>
    );
  }

  const { lead, n, first, ultimate, stages } = result;
  const sign = Math.sign(n[lead]) || 1;
  const cur = sampleAt(result, pb.pos);
  const states = cur.stage.states;
  let critical = null;
  cur.indices.forEach((F, i) => { if (F > 0 && (critical === null || F > cur.indices[critical])) critical = i; });
  const m0 = stages[0].moduli;

  return (
    <div class={tabClass} hidden={!active}>
      {left}
      <div class="col col-mid col-main">
        <div class="stats">
          <Stat label="Первое разрушение" value={first ? fmt(first.lam * sign, 0) : '—'} unit="МПа" sub={first ? `${plyName(result, first.failures[0].ply)}${first.failures.length > 1 ? ' и др.' : ''}: ${first.failures[0].kind === 'fiber' ? 'волокно' : 'матрица'}` : ''} />
          <Stat label="Предел прочности" value={fmt(ultimate.lam * sign, 0)} unit="МПа" sub={`${STRAIN[lead].name} = ${fmt(ultimate.eps[lead] * 100, 2)} %`} />
          <Stat label="Начальный модуль" value={fmtAuto((lead === 2 ? m0.Gxy : lead === 1 ? m0.Ey : m0.Ex) / 1000)} unit="ГПа" sub={`Ex ${fmtAuto(m0.Ex / 1000)} · Ey ${fmtAuto(m0.Ey / 1000)} · Gxy ${fmtAuto(m0.Gxy / 1000)} · νyx ${fmt(m0.nuYX, 2)}`} />
          <Stat label="Точка на диаграмме" value={fmt(cur.lam * sign, 0)} unit="МПа" sub={`εx ${fmt(cur.eps[0] * 100, 2)} % · εy ${fmt(cur.eps[1] * 100, 2)} % · γxy ${fmt(cur.eps[2] * 100, 2)} %`} />
        </div>
        <div class="diagram-wrap">
          <div class="diagram-head">
            <h2>Диаграмма деформирования</h2>
            <ul class="legend">
              {STRAIN.map((s, j) => (
                <li key={s.name}>
                  <label class="check">
                    <input type="checkbox" id={`show-eps-${j}`} checked={state.show[j]} disabled={j === lead} onChange={() => set({ show: state.show.map((v, k) => (k === j ? !v : v)) })} />
                    <svg class="crit-key" viewBox="0 0 34 14" aria-hidden="true"><line x1="2" x2="32" y1="7" y2="7" stroke={s.color} stroke-width="3.4" stroke-linecap="round" stroke-dasharray={j === lead || !s.dash ? undefined : s.dash.split(' ').map((q) => q / 1.7).join(' ')} /></svg>
                    <Tex>{s.tex}</Tex>
                  </label>
                </li>
              ))}
              <li class="legend-marks"><span class="log-n event-matrix">1</span> матрица <span class="log-n event-fiber">2</span> волокно</li>
            </ul>
          </div>
          <Diagram result={result} pos={pb.pos} setPos={pb.setPos} show={state.show.map((v, j) => v || j === lead)} rem={rem} />
          <Transport pb={pb} result={result} />
        </div>
        <Panel title="Протокол испытания" class="log-panel">
          <EventLog result={result} pos={pb.pos} setPos={pb.setPos} />
        </Panel>
      </div>
      <Gutter side="right" hidden={panels.hideRight} onToggle={() => panels.toggle('hideRight')} />
      <div class="col col-end col-right">
        <Panel title="Пакет" aside={<span class="head-hint">{plies.length} сл. · {fmt(plies.reduce((a, p) => a + p.h, 0), 2)} мм</span>} class="stack-panel">
          <StackView plies={plies} states={states} critical={critical} hover={hover} onHover={setHover} rem={rem} />
        </Panel>
        <Panel title="Состояние слоёв" aside={<span class="head-hint">показатель <Tex>F</Tex></span>} class="panel-grow">
          <ul class="ply-states">
            {plies.map((p, i) => {
              const F = cur.indices[i] || 0;
              return (
                <li key={p.id} class={`ply-state state-${states[i]} ${critical === i ? 'is-critical' : ''} ${hover === i ? 'is-hover' : ''}`} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                  <span class="mono ply-n">{i + 1}</span>
                  <span class="mono ply-angle">{angleText(p.angle)}°</span>
                  <span class={`mat-chip mat-${p.material.id} is-static`}>{p.material.short}</span>
                  <span class="ply-status" key={states[i]}><StatusIcon kind={STATE_ICON[states[i]]} />{STATE_TEXT[states[i]]}</span>
                  <span class="meter" aria-hidden="true"><span class="meter-fill" style={{ width: `${clamp(F, 0, 1) * 100}%` }} /></span>
                  <span class="mono crit-f">{states[i] === 'failed' || !cur.stage.carries ? '—' : fmt(F, 2)}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title="Жёсткость пакета">
          <StiffnessMeters now={cur.stage.moduli} initial={m0} />
        </Panel>
      </div>
    </div>
  );
}
