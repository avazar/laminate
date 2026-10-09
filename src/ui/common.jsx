import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import katex from 'katex';

// ---------- формулы ----------
const texCache = new Map();
export function Tex({ children, block, class: cls }) {
  const key = (block ? 'B' : 'I') + children;
  let html = texCache.get(key);
  if (!html) {
    html = katex.renderToString(children, { displayMode: !!block, throwOnError: false, output: 'html', strict: false });
    texCache.set(key, html);
  }
  return <span class={`tex ${block ? 'tex-block' : ''} ${cls || ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

// ---------- числа ----------
// Русская запись: десятичная запятая, настоящий минус.
export function fmt(v, digits = 0) {
  if (!Number.isFinite(v)) return '—';
  const r = Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v;
  return r.toFixed(digits).replace('-', '−').replace('.', ',');
}
// Столько знаков, чтобы было около трёх значащих цифр.
export function fmtAuto(v) {
  const a = Math.abs(v);
  return fmt(v, a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3);
}
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---------- оси графиков ----------
export function niceTicks(min, max, target = 6) {
  const span = max - min;
  if (!(span > 0)) return { ticks: [min], step: 1 };
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw);
  const ticks = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return { ticks, step };
}
// Сколько знаков после запятой нужно, чтобы шаг сетки записался без округления.
export function tickDigits(step) {
  for (let d = 0; d < 6; d++) {
    const s = step * 10 ** d;
    if (Math.abs(s - Math.round(s)) < 1e-6 * s) return d;
  }
  return 6;
}
export function linear(d0, d1, r0, r1) {
  const k = (r1 - r0) / (d1 - d0);
  const f = (v) => r0 + (v - d0) * k;
  f.invert = (p) => d0 + (p - r0) / k;
  return f;
}

// ---------- хуки ----------
export function useSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return size;
}

export function loadStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch (e) {
    return fallback;
  }
}
export function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* хранилище недоступно — работаем без него */ }
}

// ---------- элементы управления ----------
export function Num({ id, value, onChange, step = 1, min, max, digits, class: cls, label }) {
  const show = (v) => (digits === undefined ? String(v) : String(+v.toFixed(digits)));
  const [text, setText] = useState(show(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) { last.current = value; setText(show(value)); }
  }, [value]);
  return (
    <input
      id={id} type="number" class={`num ${cls || ''}`} value={text} step={step} min={min} max={max} aria-label={label}
      onInput={(e) => {
        setText(e.target.value);
        let v = parseFloat(e.target.value);
        if (!Number.isFinite(v)) return;
        if (min !== undefined) v = Math.max(min, v);
        if (max !== undefined) v = Math.min(max, v);
        last.current = v;
        onChange(v);
      }}
      onBlur={() => setText(show(last.current))}
    />
  );
}

export function Segmented({ options, value, onChange, label, class: cls }) {
  return (
    <div class={`seg ${cls || ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={o.value} class="seg-btn" aria-pressed={o.value === value} onClick={() => onChange(o.value)} title={o.title}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Panel({ title, aside, children, class: cls }) {
  return (
    <section class={`panel ${cls || ''}`}>
      {title && (
        <header class="panel-head">
          <h2>{title}</h2>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

// Ручка на границе боковой колонки: сворачивает её и разворачивает обратно.
// Стрелка смотрит туда, куда уедет панель; у свёрнутой — обратно.
export function Gutter({ side, hidden, onToggle }) {
  const name = side === 'left' ? 'левую' : 'правую';
  const key = side === 'left' ? '[' : ']';
  const pointsLeft = (side === 'left') !== hidden;
  return (
    <button
      type="button" class={`gutter gutter-${side}`} aria-expanded={!hidden} onClick={onToggle}
      aria-label={`${hidden ? 'Показать' : 'Свернуть'} ${name} панель`} title={`${hidden ? 'Показать' : 'Свернуть'} ${name} панель — клавиша ${key}`}
    >
      <span class="gutter-grip">
        <svg viewBox="0 0 10 10" aria-hidden="true"><path d={pointsLeft ? 'M6.5 1.5L3 5l3.5 3.5' : 'M3.5 1.5L7 5 3.5 8.5'} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </span>
    </button>
  );
}

// Значок состояния: статус никогда не передаётся одним цветом.
export function StatusIcon({ kind }) {
  if (kind === 'ok') return <svg class="ico ico-ok" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>;
  if (kind === 'matrix') return <svg class="ico ico-matrix" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l3 4-2 2 4 4M9 3l1.5 3L13 7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" /></svg>;
  return <svg class="ico ico-fiber" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>;
}
