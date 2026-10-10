// Картинка пакета в косоугольной проекции: слои разнесены по высоте, штриховка показывает направление волокон.
// Ось x пакета горизонтальна (как на схеме нагружения), ось y уходит вправо-вверх; первый слой списка — верхний.
import { useRef } from 'preact/hooks';
import { useSize, fmtAngle } from './common.jsx';
import { tr } from '../i18n.js';

const KX = 0.5, KY = 0.4; // проекция единичного отрезка оси y на экран

// Отрезок прямой, проходящей через p0 вдоль d, внутри квадрата [−½, ½]².
function clipToSquare(p0, d) {
  let t0 = -Infinity, t1 = Infinity;
  for (let i = 0; i < 2; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (Math.abs(p0[i]) > 0.5) return null; continue; }
    const a = (-0.5 - p0[i]) / d[i], b = (0.5 - p0[i]) / d[i];
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  return t1 - t0 > 0.04 ? [[p0[0] + d[0] * t0, p0[1] + d[1] * t0], [p0[0] + d[0] * t1, p0[1] + d[1] * t1]] : null;
}

function fibers(angle, count, shift = 0) {
  const a = (angle * Math.PI) / 180;
  const d = [Math.cos(a), Math.sin(a)], n = [-Math.sin(a), Math.cos(a)];
  const out = [];
  for (let k = -count; k <= count; k++) {
    const t = ((k + shift) / count) * 0.68;
    const seg = clipToSquare([n[0] * t, n[1] * t], d);
    if (seg) out.push(seg);
  }
  return out;
}

export function StackView({ plies, states, critical, hover, onHover, rem }) {
  const ref = useRef(null);
  const { w, h } = useSize(ref);
  const N = plies.length;
  const labelW = 3.2 * rem, footH = 1.9 * rem;
  const availH = h - footH - 0.6 * rem;
  let S = Math.min((w - labelW - 1.2 * rem) / (1 + KX), availH / (KY + 0.13 * Math.max(N - 1, 0)));
  S = Math.max(S, 24);
  const thick = Math.min(0.04 * S, 0.45 * rem);
  const gap = N > 1 ? Math.min(0.34 * S, (availH - KY * S - thick) / (N - 1)) : 0;
  const totalH = KY * S + thick + gap * (N - 1);
  const x0 = (w - labelW - (1 + KX) * S) / 2 + 0.3 * rem; // левый край нижней кромки слоя
  const y0 = (availH - totalH) / 2 + 0.3 * rem + KY * S; // нижняя кромка верхнего слоя
  const P = (x, y, level) => [x0 + (x + 0.5) * S + (y + 0.5) * KX * S, y0 + level * gap - (y + 0.5) * KY * S];
  const pts = (arr) => arr.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const hmax = Math.max(...plies.map((p) => p.h), 1e-9);
  const ax = [x0, h - 0.75 * rem];

  return (
    <div class="stack" ref={ref}>
      {w > 60 && h > 60 && (
        <svg width={w} height={h} class="stack-svg" role="img" aria-label={tr('stack.aria')}>
          <defs>
            <marker id="stack-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 1L9 5L0 9z" class="arrow-head" />
            </marker>
          </defs>
          {/* рисуем снизу вверх, чтобы верхние слои перекрывали нижние */}
          {plies.map((_, idx) => N - 1 - idx).map((i) => {
            const ply = plies[i], state = states[i];
            const c = [P(-0.5, -0.5, i), P(0.5, -0.5, i), P(0.5, 0.5, i), P(-0.5, 0.5, i)];
            const t = thick * (0.5 + 0.5 * (ply.h / hmax));
            const down = (p) => [p[0], p[1] + t];
            const cls = `ply ply-${state} mat-${ply.material.id} ${critical === i ? 'is-critical' : ''} ${hover === i ? 'is-hover' : ''}`;
            const label = P(0.5, 0.5, i); // правый верхний угол слоя виден всегда, подпись ставится рядом с ним
            return (
              <g key={ply.id} class={cls} onPointerEnter={() => onHover(i)} onPointerLeave={() => onHover(null)}>
                <polygon class="ply-side" points={pts([c[0], c[1], down(c[1]), down(c[0])])} />
                <polygon class="ply-side ply-side-2" points={pts([c[1], c[2], down(c[2]), down(c[1])])} />
                <polygon class="ply-face" points={pts(c)} />
                {fibers(ply.angle, 6).map((s, k) => {
                  const a = P(s[0][0], s[0][1], i), b = P(s[1][0], s[1][1], i);
                  if (state === 'failed') {
                    // разорванное волокно: зазор посередине
                    const m1 = [a[0] + (b[0] - a[0]) * 0.43, a[1] + (b[1] - a[1]) * 0.43], m2 = [a[0] + (b[0] - a[0]) * 0.57, a[1] + (b[1] - a[1]) * 0.57];
                    return <g key={k}><line class="fiber" x1={a[0]} y1={a[1]} x2={m1[0]} y2={m1[1]} /><line class="fiber" x1={m2[0]} y1={m2[1]} x2={b[0]} y2={b[1]} /></g>;
                  }
                  return <line key={k} class="fiber" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
                })}
                {state === 'matrix' && fibers(ply.angle, 6, 0.5).map((s, k) => {
                  // трещины в связующем идут вдоль волокон, между ними
                  const a = P(s[0][0], s[0][1], i), b = P(s[1][0], s[1][1], i);
                  return <line key={'c' + k} class="crack" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
                })}
                {/* вспышка в момент разрушения: key по состоянию создаёт элемент заново, и анимация проигрывается */}
                {state !== 'intact' && <polygon key={state} class="ply-burst" points={pts(c)} />}
                {(gap >= 0.95 * rem || N === 1) && <text class="ply-label" x={label[0] + 0.45 * rem} y={label[1] + 0.45 * rem} dy="0.34em">{fmtAngle(ply.angle)}°</text>}
              </g>
            );
          })}
          <g class="stack-axes">
            <line x1={ax[0]} y1={ax[1]} x2={ax[0] + 2.4 * rem} y2={ax[1]} marker-end="url(#stack-arrow)" />
            <line x1={ax[0]} y1={ax[1]} x2={ax[0] + 2.4 * rem * KX * 1.1} y2={ax[1] - 2.4 * rem * KY * 1.1} marker-end="url(#stack-arrow)" />
            <text x={ax[0] + 2.75 * rem} y={ax[1]} dy="0.32em">x</text>
            <text x={ax[0] + 2.4 * rem * KX * 1.1 + 0.4 * rem} y={ax[1] - 2.4 * rem * KY * 1.1} dy="0.1em">y</text>
          </g>
        </svg>
      )}
    </div>
  );
}
