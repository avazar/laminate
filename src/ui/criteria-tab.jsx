// Вкладка «Слой»: предельные поверхности критериев и их срезы.
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { CRITERIA, criterionById, MODES } from '../core/criteria.js';
import { MATERIALS, PROPS, materialById } from '../core/materials.js';
import { surfaceBounds } from '../core/bounds.js';
import { contour } from '../core/contour.js';
import { SurfaceView } from '../viz/surface3d.js';
import { Tex, Num, Panel, StatusIcon, fmt, niceTicks, tickDigits, linear, useSize, clamp } from './common.jsx';

const AXES = [
  { tex: '\\sigma_1', name: 'σ₁' },
  { tex: '\\sigma_2', name: 'σ₂' },
  { tex: '\\tau_{12}', name: 'τ₁₂' },
];
const PLANES = [
  { key: 's1s2', ax: 0, ay: 1, fixed: 2 },
  { key: 's1t', ax: 0, ay: 2, fixed: 1 },
  { key: 's2t', ax: 1, ay: 2, fixed: 0 },
];
// Вторичное кодирование для критериев, цвета которых ближе друг к другу: штрих.
export const DASH = { maxStrain: '9 6', tsaiHill: '2 6', hoffman: '14 5 2 5' };

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function linePath(lines, sx, sy) {
  let d = '';
  for (const line of lines) {
    if (line.length < 2) continue;
    d += 'M' + line.map((p) => `${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`).join('L');
    const a = line[0], b = line[line.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) d += 'Z';
  }
  return d;
}

function SectionPlot({ plane, lines, list, focusId, range, probe, setProbe, rem }) {
  const ref = useRef(null);
  const { w, h } = useSize(ref);
  const { ax, ay, fixed } = plane;
  const mL = 3.9 * rem, mR = 0.9 * rem, mT = 0.7 * rem, mB = 2.1 * rem;
  const ready = w > mL + mR + 40 && h > mT + mB + 40;
  const sx = linear(range.lo[ax], range.hi[ax], mL, w - mR);
  const sy = linear(range.lo[ay], range.hi[ay], h - mB, mT);
  const tx = niceTicks(range.lo[ax], range.hi[ax], Math.max(3, Math.round((w - mL - mR) / (5.2 * rem))));
  const ty = niceTicks(range.lo[ay], range.hi[ay], Math.max(3, Math.round((h - mT - mB) / (2.6 * rem))));
  const paths = useMemo(() => (ready ? list.map((it) => ({ ...it, d: linePath(lines[it.criterion.id] || [], sx, sy) })) : []), [lines, list, w, h, rem, range]);

  const drag = (e) => {
    const r = ref.current.getBoundingClientRect();
    const next = probe.slice();
    next[ax] = clamp(sx.invert(e.clientX - r.left), range.lo[ax], range.hi[ax]);
    next[ay] = clamp(sy.invert(e.clientY - r.top), range.lo[ay], range.hi[ay]);
    setProbe(next);
  };
  const px = sx(probe[ax]), py = sy(probe[ay]);
  const stepFixed = niceTicks(range.lo[fixed], range.hi[fixed], 200).step;

  return (
    <div class="section">
      <div class="section-head">
        <span class="section-title"><Tex>{`${AXES[ax].tex}\\;\\text{–}\\;${AXES[ay].tex}`}</Tex></span>
        <label class="section-fixed">
          <span>при <Tex>{AXES[fixed].tex}</Tex> =</span>
          <input
            type="range" id={`fixed-${plane.key}`} min={range.lo[fixed]} max={range.hi[fixed]} step={stepFixed} value={probe[fixed]}
            aria-label={`${AXES[fixed].name}, МПа`}
            onInput={(e) => { const next = probe.slice(); next[fixed] = parseFloat(e.target.value); setProbe(next); }}
          />
          <output class="mono">{fmt(probe[fixed], 0)} МПа</output>
        </label>
      </div>
      <div class="plot" ref={ref}>
        {ready && (
          <svg
            width={w} height={h} class="plot-svg section-svg" role="img"
            aria-label={`Срез предельных поверхностей плоскостью ${AXES[fixed].name} = ${fmt(probe[fixed])} МПа`}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag(e); }}
            onPointerMove={(e) => { if (e.buttons & 1 || e.pointerType === 'touch') drag(e); }}
          >
            {tx.ticks.map((v) => <line key={'gx' + v} class="grid" x1={sx(v)} x2={sx(v)} y1={mT} y2={h - mB} />)}
            {ty.ticks.map((v) => <line key={'gy' + v} class="grid" x1={mL} x2={w - mR} y1={sy(v)} y2={sy(v)} />)}
            <line class="axis" x1={sx(0)} x2={sx(0)} y1={mT} y2={h - mB} />
            <line class="axis" x1={mL} x2={w - mR} y1={sy(0)} y2={sy(0)} />
            {tx.ticks.map((v) => <text key={'tx' + v} class="tick" x={sx(v)} y={h - mB + 1.15 * rem} text-anchor="middle">{fmt(v, tickDigits(tx.step))}</text>)}
            {ty.ticks.map((v) => <text key={'ty' + v} class="tick" x={mL - 0.45 * rem} y={sy(v)} dy="0.34em" text-anchor="end">{fmt(v, tickDigits(ty.step))}</text>)}
            {paths.filter((p) => p.criterion.id === focusId).map((p) => <path key="fill" d={p.d} fill={p.color} fill-opacity="0.09" fill-rule="evenodd" stroke="none" />)}
            {paths.map((p) => (
              <path
                key={p.criterion.id} d={p.d} fill="none" stroke={p.color} stroke-width={p.criterion.id === focusId ? 0.2 * rem : 0.14 * rem}
                stroke-dasharray={DASH[p.criterion.id]} stroke-linejoin="round" stroke-linecap="round"
              />
            ))}
            <line class="cross" x1={px} x2={px} y1={mT} y2={h - mB} />
            <line class="cross" x1={mL} x2={w - mR} y1={py} y2={py} />
            <circle class="probe" cx={px} cy={py} r={0.42 * rem} />
          </svg>
        )}
        <span class="axis-title axis-title-x"><Tex>{AXES[ax].tex}</Tex>, МПа</span>
        <span class="axis-title axis-title-y"><Tex>{AXES[ay].tex}</Tex>, МПа</span>
      </div>
    </div>
  );
}

function MaterialPicker({ materials, materialId, setMaterialId, setMaterials }) {
  const m = materialById(materials, materialId);
  const base = MATERIALS.find((q) => q.id === m.id);
  const changed = PROPS.some((p) => m[p.key] !== base[p.key]);
  const setProp = (key, v) => setMaterials(materials.map((q) => (q.id === m.id ? { ...q, [key]: v } : q)));
  return (
    <Panel title="Материал слоя" aside={changed && <button type="button" class="link-btn" onClick={() => setMaterials(materials.map((q) => (q.id === m.id ? { ...base } : q)))}>как в таблице</button>}>
      <div class="mat-cards" role="group" aria-label="Материал">
        {materials.map((q) => (
          <button type="button" key={q.id} class={`mat-card mat-${q.id}`} aria-pressed={q.id === m.id} onClick={() => setMaterialId(q.id)}>
            <span class="mat-swatch" aria-hidden="true" />
            <span class="mat-name">{q.name}</span>
          </button>
        ))}
      </div>
      <div class="props">
        {PROPS.map((p) => (
          <label class="prop" key={p.key} title={p.label}>
            <Tex>{p.tex}</Tex>
            <Num id={`prop-${p.key}`} value={m[p.key]} step={p.key === 'nu21' ? 0.01 : p.unit === 'ГПа' ? 0.5 : 10} min={p.key === 'nu21' ? 0 : 0.1} max={p.key === 'nu21' ? 0.49 : undefined} onChange={(v) => setProp(p.key, v)} label={p.label} />
            <span class="unit">{p.unit}</span>
          </label>
        ))}
      </div>
    </Panel>
  );
}

function CriterionRow({ item, focus, visible, F, onToggle, onFocus, options, setOptions, m }) {
  const c = item.criterion;
  const failed = F >= 1;
  return (
    <li class={`crit ${focus ? 'is-focus' : ''} ${visible ? '' : 'is-off'}`}>
      <div class="crit-row">
        <label class="crit-toggle" title={visible ? 'Скрыть' : 'Показать'}>
          <input type="checkbox" id={`show-${c.id}`} checked={visible} onChange={onToggle} aria-label={`Показывать критерий ${c.name}`} />
          <svg class="crit-key" viewBox="0 0 34 14" aria-hidden="true">
            <line x1="2" x2="32" y1="7" y2="7" stroke={item.color} stroke-width="3.4" stroke-linecap="round" stroke-dasharray={DASH[c.id] ? DASH[c.id].split(' ').map((q) => q / 1.7).join(' ') : undefined} />
          </svg>
        </label>
        <button type="button" class="crit-name" aria-expanded={focus} onClick={onFocus}>{c.name}</button>
        <span class={`crit-verdict ${failed ? 'is-failed' : ''}`} title={`Запас прочности 1/F = ${fmt(1 / F, 2)}`}>
          <span class="meter" aria-hidden="true"><span class="meter-fill" style={{ width: `${Math.min(F / 1.5, 1) * 100}%`, background: item.color }} /><span class="meter-one" /></span>
          <span class="mono crit-f">{fmt(F, 2)}</span>
          <StatusIcon kind={failed ? 'fiber' : 'ok'} />
        </span>
      </div>
      {focus && (
        <div class="crit-body">
          {c.tex.map((t, i) => <div class="crit-tex" key={i}><Tex block>{t}</Tex></div>)}
          <p class="note">{c.note}</p>
          {c.id === 'maxStrain' && <p class="note">Предельные деформации взяты из линейного закона, <Tex>{'\\bar\\varepsilon=\\bar\\sigma/E'}</Tex>. У стеклопластика из таблицы поперечная деформация <Tex>{'\\nu_{21}\\varepsilon_1'}</Tex> исчерпывает <Tex>{'\\bar\\varepsilon_2'}</Tex> раньше, чем <Tex>{'\\sigma_1'}</Tex> достигает <Tex>{'\\bar\\sigma_1'}</Tex>.</p>}
          {c.id === 'tsaiWu' && (
            <label class="param">
              <span><Tex>{'f_{12}'}</Tex> =</span>
              <input type="range" id="opt-f12" min="-0.95" max="0.95" step="0.05" value={options.f12} onInput={(e) => setOptions({ ...options, f12: parseFloat(e.target.value) })} aria-label="Коэффициент взаимодействия f12" />
              <output class="mono">{fmt(options.f12, 2)}</output>
            </label>
          )}
          {c.id === 'hashin' && (
            <div class="params">
              <label class="param">
                <span><Tex>{'\\alpha'}</Tex> =</span>
                <input type="range" id="opt-alpha" min="0" max="1" step="0.1" value={options.hashinAlpha} onInput={(e) => setOptions({ ...options, hashinAlpha: parseFloat(e.target.value) })} aria-label="Вклад сдвига в разрушение волокна" />
                <output class="mono">{fmt(options.hashinAlpha, 1)}</output>
              </label>
              <label class="param">
                <span><Tex>{'\\bar\\tau_{23}'}</Tex> =</span>
                <input type="range" id="opt-st" min={Math.round(m.s2m * 0.25)} max={Math.round(m.s2m)} step="1" value={options.hashinSt || m.s2m / 2} onInput={(e) => setOptions({ ...options, hashinSt: parseFloat(e.target.value) })} aria-label="Прочность на поперечный сдвиг" />
                <output class="mono">{fmt(options.hashinSt || m.s2m / 2, 0)} МПа</output>
              </label>
              <p class="note">α = 1 — Хашин (1980), α = 0 — Хашин–Ротем. <Tex>{'\\bar\\tau_{23}'}</Tex> в таблице нет; по умолчанию <Tex>{'\\bar\\sigma_2^{-}/2'}</Tex>, тогда условие сжатия матрицы — эллипс.</p>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

const MODE_LEGEND = ['ft', 'fc', 'mt', 'mc', 'ms'];

export function CriteriaTab({ active, materials, setMaterials, options, setOptions, state, setState, rem, theme }) {
  const set = (patch) => setState((s) => ({ ...s, ...patch }));
  const m = materialById(materials, state.materialId);
  const o = options;
  const list = useMemo(
    () => CRITERIA.filter((c) => state.visible[c.id]).map((c) => ({ criterion: c, color: cssVar(`--c-${c.id}`) })),
    [state.visible, theme],
  );
  const all = useMemo(() => CRITERIA.map((c) => ({ criterion: c, color: cssVar(`--c-${c.id}`) })), [theme]);
  const focusId = state.visible[state.focusId] ? state.focusId : (list[0] && list[0].criterion.id);
  const bounds = useMemo(() => surfaceBounds(list.map((q) => q.criterion), m, o), [list, m, o]);
  const range = useMemo(() => ({ lo: bounds.lo.map((v) => v * 1.1), hi: bounds.hi.map((v) => v * 1.1) }), [bounds]);
  const probe = state.probe.map((v, i) => clamp(v, range.lo[i], range.hi[i]));

  const sectionOf = (plane) => {
    const { ax, ay, fixed } = plane;
    const out = {};
    for (const { criterion: c } of list) {
      const f = fixed === 2 ? (x, y) => c.index(x, y, probe[2], m, o) : fixed === 1 ? (x, y) => c.index(x, probe[1], y, m, o) : (x, y) => c.index(probe[0], x, y, m, o);
      out[c.id] = contour(f, range.lo[ax], range.hi[ax], range.lo[ay], range.hi[ay], 150, 110);
    }
    return out;
  };
  const sec0 = useMemo(() => sectionOf(PLANES[0]), [list, m, o, range, probe[2]]);
  const sec1 = useMemo(() => sectionOf(PLANES[1]), [list, m, o, range, probe[1]]);
  const sec2 = useMemo(() => sectionOf(PLANES[2]), [list, m, o, range, probe[0]]);
  const sections = useMemo(() => ({ s1s2: sec0, s1t: sec1, s2t: sec2 }), [sec0, sec1, sec2]);

  const indices = useMemo(() => Object.fromEntries(CRITERIA.map((c) => [c.id, c.index(probe[0], probe[1], probe[2], m, o)])), [probe[0], probe[1], probe[2], m, o]);

  const sceneRef = useRef(null);
  const view = useRef(null);
  useEffect(() => {
    view.current = new SurfaceView(sceneRef.current);
    view.current.onAutoRotateStop = () => setState((s) => ({ ...s, autoRotate: false }));
    return () => view.current.dispose();
  }, []);
  useEffect(() => { view.current.setActive(active); }, [active]);
  useEffect(() => { view.current.setAutoRotate(state.autoRotate && active); }, [state.autoRotate, active]);
  useEffect(() => {
    view.current.update({
      m, options: o, list, focusId, colorByMode: state.colorByMode, topo: state.topo, bounds, sections, probe,
      probeFailed: focusId ? indices[focusId] >= 1 : false, theme,
    });
  }, [m, o, list, focusId, state.colorByMode, state.topo, bounds, sections, theme, probe[0], probe[1], probe[2]]);

  const focus = focusId && criterionById(focusId);
  const setProbe = (p) => set({ probe: p });
  const pickMaterial = (id) => {
    const q = materialById(materials, id);
    set({ materialId: id, probe: [0.45 * q.s1p, 0.4 * q.s2p, 0.35 * q.t12] });
    setOptions({ ...o, hashinSt: null });
  };

  return (
    <div class="tab tab-criteria" hidden={!active}>
      <div class="col col-left">
        <MaterialPicker materials={materials} materialId={state.materialId} setMaterialId={pickMaterial} setMaterials={setMaterials} />
        <Panel title="Критерии прочности" aside={<span class="head-hint">показатель <Tex>F</Tex> в точке</span>} class="panel-grow">
          <ul class="crit-list">
            {all.map((item) => (
              <CriterionRow
                key={item.criterion.id} item={item} m={m} options={o} setOptions={setOptions}
                visible={!!state.visible[item.criterion.id]} focus={item.criterion.id === focusId} F={indices[item.criterion.id]}
                onToggle={() => set({ visible: { ...state.visible, [item.criterion.id]: !state.visible[item.criterion.id] } })}
                onFocus={() => set({ focusId: item.criterion.id, visible: { ...state.visible, [item.criterion.id]: true } })}
              />
            ))}
          </ul>
          <p class="note foot-note"><Tex>F=1</Tex> — точка на предельной поверхности, <Tex>1/F</Tex> — запас прочности при пропорциональном нагружении.</p>
        </Panel>
      </div>

      <div class="col col-scene">
        <div class="scene-wrap">
          <div class="scene-head">
            <div>
              <h2 class="scene-title">Поверхность прочности</h2>
              <p class="scene-sub">{m.name}{focus ? ` · критерий ${focus.name}` : ''}</p>
            </div>
            <div class="scene-tools">
              <label class="check"><input type="checkbox" id="opt-modes" checked={state.colorByMode} onChange={() => set({ colorByMode: !state.colorByMode })} />режимы разрушения</label>
              <label class="check"><input type="checkbox" id="opt-topo" checked={state.topo} onChange={() => set({ topo: !state.topo })} />горизонтали</label>
              <label class="check"><input type="checkbox" id="opt-rotate" checked={state.autoRotate} onChange={() => set({ autoRotate: !state.autoRotate })} />вращение</label>
              <button type="button" class="ghost-btn" onClick={() => view.current.resetView()}>исходный вид</button>
            </div>
          </div>
          <div class="scene" ref={sceneRef} />
          <div class="scene-foot">
            {focus && focus.modal && state.colorByMode ? (
              <ul class="legend">
                {MODE_LEGEND.map((k) => <li key={k}><span class="swatch" style={{ background: `var(--mode-${k})` }} />{MODES[k].label}</li>)}
              </ul>
            ) : (
              <ul class="legend">
                {list.map((it) => (
                  <li key={it.criterion.id}>
                    <svg class="crit-key" viewBox="0 0 34 14" aria-hidden="true"><line x1="2" x2="32" y1="7" y2="7" stroke={it.color} stroke-width="3.4" stroke-linecap="round" stroke-dasharray={DASH[it.criterion.id] ? DASH[it.criterion.id].split(' ').map((q) => q / 1.7).join(' ') : undefined} /></svg>
                    {it.criterion.short}
                  </li>
                ))}
              </ul>
            )}
            <span class="scene-hint">оси нормированы на прочности · мышь — поворот, колесо — масштаб</span>
          </div>
        </div>
      </div>

      <div class="col col-sections">
        <div class="probe-bar" title="Точку можно перетаскивать на срезах: каждый срез проходит через неё">
          <span class="probe-bar-title">Точка, МПа</span>
          {AXES.map((a, i) => (
            <label class="probe-field" key={a.tex}>
              <Tex>{a.tex}</Tex>
              <Num id={`probe-${i}`} value={Math.round(probe[i])} step={i === 0 ? 50 : 5} min={Math.ceil(range.lo[i])} max={Math.floor(range.hi[i])} onChange={(v) => { const p = probe.slice(); p[i] = v; setProbe(p); }} label={`${a.name}, МПа`} />
            </label>
          ))}
        </div>
        {PLANES.map((plane) => (
          <SectionPlot key={plane.key} plane={plane} lines={sections[plane.key]} list={list} focusId={focusId} range={range} probe={probe} setProbe={setProbe} rem={rem} />
        ))}
      </div>
    </div>
  );
}
