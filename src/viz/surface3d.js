// Трёхмерная сцена: предельные поверхности в осях (σ₁, σ₂, τ₁₂).
// Оси сцены: x = σ₁, y = τ₁₂ (вверх), z = −σ₂. Каждая ось нормирована на свою прочность,
// иначе тело было бы иглой: σ̄₁ на порядки больше σ̄₂ и τ̄₁₂.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import katex from 'katex';
import { governingMode } from '../core/criteria.js';
import { contour } from '../core/contour.js';

const L = { x: 1.7, y: 0.95, z: 1.15 }; // видимые полуразмеры по осям при напряжении, равном прочности
const N = 64; // разбиение грани куба, из которого «надувается» поверхность

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const tex = (s) => katex.renderToString(s, { throwOnError: false, output: 'html' });
const AXIS_LABELS = ['\\sigma_1', '\\sigma_2', '\\tau_{12}'].map(tex);
const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function frameOf(m) {
  const k = { s1: Math.max(m.s1p, m.s1m), s2: Math.max(m.s2p, m.s2m), t: m.t12 };
  return {
    k,
    toScene: (s1, s2, t) => [(s1 / k.s1) * L.x, (t / k.t) * L.y, (-s2 / k.s2) * L.z],
    stress: (x, y, z) => [(x / L.x) * k.s1, (-z / L.z) * k.s2, (y / L.y) * k.t],
  };
}

// Поверхность r(d) = d / F(d): по каждому направлению d откладывается запас 1/F.
function buildGeometry(criterion, m, o, frame) {
  const { k } = frame;
  const G = (x, y, z) => criterion.index((x / L.x) * k.s1, (-z / L.z) * k.s2, (y / L.y) * k.t, m, o);
  const per = (N + 1) * (N + 1);
  const pos = new Float32Array(6 * per * 3), nor = new Float32Array(6 * per * 3);
  const modes = new Array(6 * per);
  const index = [];
  const faces = [
    (a, b) => [1, a, b], (a, b) => [-1, a, b], (a, b) => [a, 1, b],
    (a, b) => [a, -1, b], (a, b) => [a, b, 1], (a, b) => [a, b, -1],
  ];
  let v = 0;
  faces.forEach((face, f) => {
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      // tan выравнивает сетку: без него ячейки у углов куба мельче, чем в центре грани
      const d = face(Math.tan(((2 * i) / N - 1) * (Math.PI / 4)), Math.tan(((2 * j) / N - 1) * (Math.PI / 4)));
      const len = Math.hypot(d[0], d[1], d[2]);
      const F = G(d[0] / len, d[1] / len, d[2] / len);
      const r = 1 / (F * len);
      const p = [d[0] * r, d[1] * r, d[2] * r];
      // нормаль — градиент F (численно)
      const h = 1e-3 * Math.hypot(p[0], p[1], p[2]);
      let n = [
        G(p[0] + h, p[1], p[2]) - G(p[0] - h, p[1], p[2]),
        G(p[0], p[1] + h, p[2]) - G(p[0], p[1] - h, p[2]),
        G(p[0], p[1], p[2] + h) - G(p[0], p[1], p[2] - h),
      ];
      const nl = Math.hypot(n[0], n[1], n[2]) || 1;
      n = n.map((q) => q / nl);
      pos.set(p, v * 3);
      nor.set(n, v * 3);
      const s = frame.stress(p[0], p[1], p[2]);
      modes[v] = governingMode(criterion, s[0], s[1], s[2], m, o);
      v++;
    }
    const base = f * per;
    // Порядок обхода треугольников — наружу. Половина граней куба параметризована «зеркально»,
    // поэтому ориентация проверяется по средней ячейке грани.
    const at = (q) => [pos[q * 3], pos[q * 3 + 1], pos[q * 3 + 2]];
    const mid = base + (N >> 1) * (N + 1) + (N >> 1);
    const p0 = at(mid), p1 = at(mid + 1), p2 = at(mid + N + 2);
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const outward = (e1[1] * e2[2] - e1[2] * e2[1]) * p0[0] + (e1[2] * e2[0] - e1[0] * e2[2]) * p0[1] + (e1[0] * e2[1] - e1[1] * e2[0]) * p0[2] > 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = base + j * (N + 1) + i, b = a + 1, c = a + N + 1, d2 = c + 1;
      if (outward) index.push(a, b, d2, a, d2, c);
      else index.push(a, d2, b, a, c, d2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(6 * per * 3), 3));
  g.setIndex(index);
  g.computeBoundingBox();
  g.userData.modes = modes;
  return g;
}

// Поверхности режимных критериев составлены из кусков с рёбрами между ними. Чтобы ребро не превращалось
// в «пилу», сетка строится по широте и долготе, а её вершины подтягиваются к линиям смены режима;
// каждый треугольник получает свой режим и свои нормали, поэтому грани остаются плоскими, а рёбра — чёткими.
const NT = 144, NP = 72;
function buildModalGeometry(criterion, m, o, frame) {
  const { k } = frame;
  const G = (x, y, z) => criterion.index((x / L.x) * k.s1, (-z / L.z) * k.s2, (y / L.y) * k.t, m, o);
  const modeAt = (p) => {
    const s = frame.stress(p[0], p[1], p[2]);
    return governingMode(criterion, s[0], s[1], s[2], m, o);
  };
  const onSurface = (d) => { const F = G(d[0], d[1], d[2]); return [d[0] / F, d[1] / F, d[2] / F]; };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  const count = NT * (NP + 1);
  const dirs = new Array(count), pos = new Array(count), modes = new Array(count);
  const snapped = new Uint8Array(count);
  for (let j = 0; j <= NP; j++) for (let i = 0; i < NT; i++) {
    const th = (2 * Math.PI * i) / NT, ph = (Math.PI * j) / NP;
    const v = j * NT + i;
    dirs[v] = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
    pos[v] = onSurface(dirs[v]);
    modes[v] = modeAt(pos[v]);
  }
  const id = (i, j) => j * NT + ((i + NT) % NT);
  const snap = (a, b) => {
    if (modes[a] === modes[b]) return;
    let lo = 0, hi = 1;
    for (let it = 0; it < 18; it++) {
      const mid = (lo + hi) / 2;
      if (modeAt(onSurface(mix(dirs[a], dirs[b], mid))) === modes[a]) lo = mid; else hi = mid;
    }
    const t = (lo + hi) / 2;
    const target = t < 0.5 ? a : b;
    const row = Math.floor(target / NT);
    if (snapped[target] || row === 0 || row === NP) return; // полюса общие для всего ряда — их не двигаем
    pos[target] = onSurface(mix(dirs[a], dirs[b], t));
    snapped[target] = 1;
  };
  for (let j = 1; j < NP; j++) for (let i = 0; i < NT; i++) snap(id(i, j), id(i + 1, j));
  for (let j = 0; j < NP; j++) for (let i = 0; i < NT; i++) snap(id(i, j), id(i, j + 1));

  const P = [], Nn = [], triModes = [];
  const grad = (q) => {
    const h = 1e-4 * Math.hypot(q[0], q[1], q[2]);
    const n = [G(q[0] + h, q[1], q[2]) - G(q[0] - h, q[1], q[2]), G(q[0], q[1] + h, q[2]) - G(q[0], q[1] - h, q[2]), G(q[0], q[1], q[2] + h) - G(q[0], q[1], q[2] - h)];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  };
  const emit = (a, b, c) => {
    let pa = pos[a], pb = pos[b], pc = pos[c];
    const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (Math.hypot(cr[0], cr[1], cr[2]) < 1e-12) return;
    if (cr[0] * pa[0] + cr[1] * pa[1] + cr[2] * pa[2] < 0) [pb, pc] = [pc, pb]; // обход — наружу
    const cen = onSurface([(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3]);
    const mode = modeAt(cen);
    for (const v of [pa, pb, pc]) {
      // нормаль берётся чуть внутри треугольника, чтобы не захватить режим соседней грани
      const n = grad(onSurface(mix(v, cen, 0.25)));
      P.push(v[0], v[1], v[2]);
      Nn.push(n[0], n[1], n[2]);
      triModes.push(mode);
    }
  };
  for (let j = 0; j < NP; j++) for (let i = 0; i < NT; i++) {
    const a = id(i, j), b = id(i + 1, j), c = id(i, j + 1), d = id(i + 1, j + 1);
    // диагональ ячейки кладётся вдоль ребра, если на нём лежат противоположные вершины
    if (snapped[b] && snapped[c] && !(snapped[a] && snapped[d])) { emit(a, b, c); emit(b, d, c); } else { emit(a, b, d); emit(a, d, c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(P.length), 3));
  g.computeBoundingBox();
  g.userData.modes = triModes;
  return g;
}

function paint(geometry, colorOf) {
  const col = geometry.getAttribute('color');
  const modes = geometry.userData.modes;
  const c = new THREE.Color();
  for (let i = 0; i < modes.length; i++) {
    c.set(colorOf(modes[i]));
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}

export class SurfaceView {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);
    this.labels = document.createElement('div');
    this.labels.className = 'scene-labels';
    container.appendChild(this.labels);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
    this.camera.position.set(4.2, 2.9, 5.2);
    this.scene.add(this.camera);
    // Основной свет закреплён на камере: форма читается под любым ракурсом.
    this.key = new THREE.DirectionalLight(0xffffff, 1.5);
    this.key.position.set(-0.6, 0.9, 1);
    this.key.target.position.set(0, 0, -1);
    this.camera.add(this.key, this.key.target);
    // Рассеянного света много: цвета режимов на затенённых гранях должны оставаться узнаваемыми.
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xaab4be, 2.5);
    this.scene.add(this.hemi);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.8;
    this.controls.autoRotateSpeed = 0.7;
    this.controls.addEventListener('start', () => { if (this.controls.autoRotate) { this.controls.autoRotate = false; this.onAutoRotateStop && this.onAutoRotateStop(); } });
    this.controls.addEventListener('change', () => { this.dirty = true; });

    // Поверхности, срезы и горизонтали строятся в нормированных осях и лежат в группе world. Когда нормирование
    // выключено, группа сжимается по осям до реальных соотношений прочностей. Оси, засечки и точка живут отдельно,
    // в мировых координатах, иначе стрелки и шарики сплющились бы вместе с телом.
    this.groups = { surfaces: new THREE.Group(), lines: new THREE.Group(), topo: new THREE.Group(), cross: new THREE.Group(), frame: new THREE.Group(), ball: new THREE.Group() };
    this.world = new THREE.Group();
    this.world.add(this.groups.surfaces, this.groups.lines, this.groups.topo, this.groups.cross);
    this.scene.add(this.world, this.groups.frame, this.groups.ball);
    this.sc = new THREE.Vector3(1, 1, 1); // текущий масштаб world по осям сцены
    this.anim = null;
    this.geometries = new Map();
    this.fatMaterials = new Set();
    this.labelItems = [];
    this.state = {};
    this.active = true;
    this.dirty = true;
    this.size = { w: 0, h: 0 };

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (!this.active || !this.size.w) return;
      if (this.anim) this.stepAnimation(performance.now());
      const moved = this.controls.update();
      if (moved || this.dirty) {
        this.dirty = false;
        this.renderer.render(this.scene, this.camera);
        this.placeLabels();
      }
    };
    loop();
  }

  resize() {
    const r = this.container.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) { this.size = { w: 0, h: 0 }; return; }
    this.size = { w: r.width, h: r.height };
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
    this.fatMaterials.forEach((mat) => mat.resolution.set(r.width, r.height));
    if (this.fitted) this.fit(false);
    this.dirty = true;
  }

  setActive(on) { this.active = on; if (on) { this.resize(); this.dirty = true; } }
  setAutoRotate(on) { this.controls.autoRotate = on; this.dirty = true; }

  fatLine(points, color, width, opts = {}) {
    const geo = new LineGeometry();
    geo.setPositions(points);
    const mat = new LineMaterial({ color, linewidth: width, transparent: true, opacity: opts.opacity ?? 1, depthTest: opts.depthTest ?? true, dashed: !!opts.dash, dashSize: opts.dash ? opts.dash[0] : 1, gapSize: opts.dash ? opts.dash[1] : 0 });
    mat.resolution.set(this.size.w || 1, this.size.h || 1);
    this.fatMaterials.add(mat);
    const line = new Line2(geo, mat);
    if (opts.dash) line.computeLineDistances();
    line.renderOrder = opts.order ?? 2;
    return line;
  }

  clear(group) {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child.material) { this.fatMaterials.delete(child.material); child.material.dispose(); }
      if (child.geometry && !child.userData.sharedGeometry) child.geometry.dispose();
    }
  }

  // Масштаб группы world: единица при нормировании; без него все оси приводятся к общему масштабу в МПа,
  // так что наибольшая прочность сохраняет свой размер на сцене, а остальные оси сжимаются.
  scaleFor(normalize, frame) {
    if (normalize) return new THREE.Vector3(1, 1, 1);
    const { k } = frame;
    const K = Math.max(k.s1, k.s2, k.t);
    return new THREE.Vector3(k.s1 / K, (k.t / K) * (L.x / L.y), (k.s2 / K) * (L.x / L.z));
  }

  setScale(v) {
    this.sc.copy(v);
    this.world.scale.copy(v);
  }

  // Плавный переход между нормированным и реальным видом. Интерполяция геометрическая:
  // масштаб меняется в десятки раз, и линейная выглядела бы как рывок в начале.
  stepAnimation(now) {
    const { from, to, t0, dur } = this.anim;
    const t = Math.min(1, (now - t0) / dur);
    const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    this.setScale(new THREE.Vector3(from.x * (to.x / from.x) ** e, from.y * (to.y / from.y) ** e, from.z * (to.z / from.z) ** e));
    if (t >= 1) this.anim = null;
    this.rebuildOverlay();
    this.placeBall();
    this.fit(false);
  }

  // p: { m, options, list: [{ criterion, color }], focusId, colorByMode, normalize, bounds, sections, probe, probeFailed, topo, theme }
  update(p) {
    const prev = this.state;
    this.state = p;
    const frame = frameOf(p.m);
    this.frame = frame;
    const physKey = JSON.stringify([p.m, p.options]);
    const physChanged = physKey !== this.physKey;
    this.physKey = physKey;
    const ids = p.list.map((q) => q.criterion.id).join();
    const themeChanged = p.theme !== prev.theme;
    const surfChanged = physChanged || themeChanged || ids !== this.idsKey || p.focusId !== prev.focusId || p.colorByMode !== prev.colorByMode;
    if (surfChanged) {
      this.idsKey = ids;
      this.rebuildSurfaces(p, frame);
    }
    // масштаб осей: первый показ и смена материала — сразу, переключение галочки — плавно
    const target = this.scaleFor(p.normalize, frame);
    let scaleJumped = false;
    if (prev.normalize !== undefined && p.normalize !== prev.normalize && !reducedMotion) {
      this.anim = { from: this.sc.clone(), to: target, t0: performance.now(), dur: 800 };
    } else if (!this.anim && !this.sc.equals(target)) {
      this.setScale(target);
      scaleJumped = true;
    } else if (this.anim) {
      this.anim.to = target;
    }
    const boundsKey = JSON.stringify(p.bounds);
    if (boundsKey !== this.boundsKey || themeChanged || scaleJumped) {
      const first = !this.boundsKey;
      this.boundsKey = boundsKey;
      this.rebuildFrame(p, frame);
      this.fit(first);
    }
    if (surfChanged || p.topo !== prev.topo || boundsKey !== this.topoBoundsKey) {
      this.topoBoundsKey = boundsKey;
      this.rebuildTopo(p, frame);
    }
    if (surfChanged || p.sections !== prev.sections) this.rebuildSections(p, frame);
    this.rebuildProbe(p, frame);
    this.dirty = true;
  }

  rebuildSurfaces(p, frame) {
    this.clear(this.groups.surfaces);
    const modeColor = { ft: cssVar('--mode-ft'), fc: cssVar('--mode-fc'), mt: cssVar('--mode-mt'), mc: cssVar('--mode-mc'), ms: cssVar('--mode-ms') };
    for (const item of p.list) {
      const { criterion } = item;
      // Геометрия пересчитывается, только если изменилось то, от чего зависит именно этот критерий.
      const o = p.options;
      const key = JSON.stringify([p.m, criterion.id === 'tsaiWu' ? o.f12 : criterion.id === 'hashin' ? [o.hashinAlpha, o.hashinSt] : 0]);
      let entry = this.geometries.get(criterion.id);
      if (!entry || entry.key !== key) {
        if (entry) entry.geo.dispose();
        entry = { key, geo: (criterion.modal ? buildModalGeometry : buildGeometry)(criterion, p.m, o, frame) };
        this.geometries.set(criterion.id, entry);
      }
      const { geo } = entry;
      const focus = criterion.id === p.focusId;
      const byMode = focus && p.colorByMode && criterion.modal;
      paint(geo, byMode ? (mode) => modeColor[mode] : () => item.color);
      const mat = focus
        ? new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
        : new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.17, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.sharedGeometry = true;
      mesh.renderOrder = focus ? 0 : 1;
      this.groups.surfaces.add(mesh);
    }
  }

  // Горизонтали τ₁₂ = const на выделенной поверхности — как на топографической карте.
  rebuildTopo(p, frame) {
    this.clear(this.groups.topo);
    const item = p.list.find((q) => q.criterion.id === p.focusId);
    if (!item || !p.topo) return;
    const { lo, hi } = p.bounds;
    const pts = [];
    const levels = 9;
    for (let l = 0; l < levels; l++) {
      const t = frame.k.t * (-1 + (2 * (l + 0.5)) / levels) * 0.98;
      const lines = contour((x, y) => item.criterion.index(x, y, t, p.m, p.options), lo[0] * 1.02, hi[0] * 1.02, lo[1] * 1.02, hi[1] * 1.02, 96, 72);
      for (const line of lines) for (let i = 0; i + 1 < line.length; i++) {
        pts.push(...frame.toScene(line[i][0], line[i][1], t), ...frame.toScene(line[i + 1][0], line[i + 1][1], t));
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({ color: cssVar('--scene-topo'), transparent: true, opacity: 0.38 });
    this.groups.topo.add(new THREE.LineSegments(geo, mat));
  }

  rebuildSections(p, frame) {
    this.clear(this.groups.lines);
    const place = {
      s1s2: (a, b) => frame.toScene(a, b, p.probe[2]),
      s1t: (a, b) => frame.toScene(a, p.probe[1], b),
      s2t: (a, b) => frame.toScene(p.probe[0], a, b),
    };
    for (const item of p.list) {
      const focus = item.criterion.id === p.focusId;
      for (const key of Object.keys(place)) {
        const lines = (p.sections[key] || {})[item.criterion.id] || [];
        for (const line of lines) {
          if (line.length < 2) continue;
          const pts = [];
          for (const q of line) pts.push(...place[key](q[0], q[1]));
          this.groups.lines.add(this.fatLine(pts, item.color, focus ? 3.2 : 2.2, { order: 3 }));
        }
      }
    }
  }

  // Габаритный ящик в нормированных осях; всё, что рисуется в мировых координатах, строит rebuildOverlay.
  rebuildFrame(p, frame) {
    const { lo, hi } = p.bounds;
    const pad = 1.14;
    const a = frame.toScene(lo[0] * pad, lo[1] * pad, lo[2] * pad), b = frame.toScene(hi[0] * pad, hi[1] * pad, hi[2] * pad);
    const min = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
    const max = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
    // Положительные концы осей выводятся за тело, даже когда прочность на растяжение мала по сравнению со сжатием.
    max[0] = Math.max(max[0], 0.8 * L.x);
    max[1] = Math.max(max[1], 0.8 * L.y);
    min[2] = Math.min(min[2], -0.8 * L.z);
    this.box = { min, max };
    this.rebuildOverlay();
  }

  toWorld(v) { return [v[0] * this.sc.x, v[1] * this.sc.y, v[2] * this.sc.z]; }

  // Оси, сетка пола, засечки прочностей и подписи — в мировых координатах, с учётом текущего масштаба осей.
  rebuildOverlay() {
    const p = this.state, frame = this.frame;
    if (!this.box || !frame) return;
    this.clear(this.groups.frame);
    this.labels.textContent = '';
    this.labelItems = [];
    const ink = cssVar('--scene-axis'), faint = cssVar('--scene-cage');
    const lo = this.toWorld(this.box.min), hi = this.toWorld(this.box.max);
    // Без нормирования тело становится иглой; оси при этом не должны выродиться в точки.
    const TIP = 0.42, TAIL = 0.24;
    const x0 = Math.min(lo[0], -TAIL), x1 = Math.max(hi[0], TIP);
    const y0 = Math.min(lo[1], -TAIL), y1 = Math.max(hi[1], TIP);
    const zPlus = Math.max(hi[2], TAIL), zMinus = Math.min(lo[2], -TIP); // σ₂ растёт в сторону −z
    // в габарит для камеры входят и подписи у концов осей
    this.worldBox = { min: [x0, y0, zMinus - 0.25], max: [x1 + 0.3, y1 + 0.25, zPlus] };

    // сетка «пола» с квадратными ячейками: одинаковый шаг по обеим осям в координатах сцены
    const floor = [];
    const step = (x1 - x0) / 8;
    for (let i = 0; i <= 8; i++) floor.push(x0 + i * step, y0, zMinus, x0 + i * step, y0, zPlus);
    for (let z = zMinus; z < zPlus - 1e-9; z += step) floor.push(x0, y0, z, x1, y0, z);
    floor.push(x0, y0, zPlus, x1, y0, zPlus);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(floor, 3));
    this.groups.frame.add(new THREE.LineSegments(fg, new THREE.LineBasicMaterial({ color: faint, transparent: true, opacity: 0.7 })));

    // оси через начало координат
    const axes = [
      { from: [x0, 0, 0], to: [x1, 0, 0], label: AXIS_LABELS[0] },
      { from: [0, 0, zPlus], to: [0, 0, zMinus], label: AXIS_LABELS[1] },
      { from: [0, y0, 0], to: [0, y1, 0], label: AXIS_LABELS[2] },
    ];
    for (const ax of axes) {
      this.groups.frame.add(this.fatLine([...ax.from, ...ax.to], ink, 1.6, { order: 2 }));
      const dir = new THREE.Vector3(...ax.to).sub(new THREE.Vector3(...ax.from)).normalize();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.13, 16), new THREE.MeshBasicMaterial({ color: ink }));
      cone.position.set(...ax.to);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this.groups.frame.add(cone);
      this.addLabel(new THREE.Vector3(...ax.to).addScaledVector(dir, 0.16), ax.label, 'scene-axis-label');
    }
    // засечки прочностей
    const m = p.m;
    const marks = [
      [[m.s1p, 0, 0], m.s1p], [[-m.s1m, 0, 0], -m.s1m], [[0, m.s2p, 0], m.s2p],
      [[0, -m.s2m, 0], -m.s2m], [[0, 0, m.t12], m.t12], [[0, 0, -m.t12], -m.t12],
    ];
    for (const [s, value] of marks) {
      const pos = this.toWorld(frame.toScene(...s));
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), new THREE.MeshBasicMaterial({ color: ink }));
      dot.position.set(...pos);
      this.groups.frame.add(dot);
      this.addLabel(new THREE.Vector3(...pos), String(value).replace('-', '−'), 'scene-tick-label');
    }
    this.dirty = true;
  }

  addLabel(position, html, cls) {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    this.labels.appendChild(el);
    this.labelItems.push({ el, position, w: el.offsetWidth, h: el.offsetHeight });
  }

  // Подписи ставятся по проекции своих точек. Если подписи наезжают друг на друга (без нормирования засечки
  // σ₂ и τ₁₂ собираются у начала координат), остаётся та, что добавлена раньше: сначала оси, затем засечки.
  placeLabels() {
    const v = new THREE.Vector3();
    const placed = [];
    for (const { el, position, w, h } of this.labelItems) {
      v.copy(position).project(this.camera);
      const x = ((v.x + 1) / 2) * this.size.w, y = ((1 - v.y) / 2) * this.size.h;
      const rect = [x - w / 2 - 2, y - h / 2 - 2, x + w / 2 + 2, y + h / 2 + 2];
      const hidden = v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05
        || placed.some((q) => rect[0] < q[2] && rect[2] > q[0] && rect[1] < q[3] && rect[3] > q[1]);
      el.style.display = hidden ? 'none' : '';
      if (hidden) continue;
      placed.push(rect);
      el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
    }
  }

  // Перекрестие через точку — в нормированных осях (сжимается вместе с телом), сам шарик — в мировых.
  rebuildProbe(p, frame) {
    this.clear(this.groups.cross);
    const c = frame.toScene(...p.probe);
    const { min, max } = this.box;
    const color = p.probeFailed ? cssVar('--fiber') : cssVar('--scene-axis');
    const cross = [min[0], c[1], c[2], max[0], c[1], c[2], c[0], min[1], c[2], c[0], max[1], c[2], c[0], c[1], min[2], c[0], c[1], max[2]];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(cross, 3));
    this.groups.cross.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 })));
    this.placeBall();
  }

  placeBall() {
    const p = this.state;
    if (!p.probe || !this.frame) return;
    this.clear(this.groups.ball);
    const c = this.toWorld(this.frame.toScene(...p.probe));
    const color = p.probeFailed ? cssVar('--fiber') : cssVar('--scene-axis');
    // на тонком теле (без нормирования) шарик меньше, чтобы не закрывать его
    const k = Math.max(0.4, Math.min(1, 2.5 * Math.min(this.sc.x, this.sc.y, this.sc.z)));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.055 * k, 24, 16), new THREE.MeshBasicMaterial({ color }));
    ball.position.set(...c);
    ball.renderOrder = 5;
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.075 * k, 24, 16), new THREE.MeshBasicMaterial({ color: cssVar('--surface'), side: THREE.BackSide }));
    halo.position.set(...c);
    this.groups.ball.add(ball, halo);
    this.dirty = true;
  }

  // Камера ставится так, чтобы габаритный ящик (уже в мировых координатах) целиком помещался в кадр.
  fit(resetView) {
    if (!this.worldBox) return;
    this.fitted = true;
    const { min, max } = this.worldBox;
    const center = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    const radius = 0.5 * Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const dist = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 0.9;
    const dir = resetView ? new THREE.Vector3(0.5, 0.46, 0.73).normalize() : this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(dir, dist);
    // без нормирования тело тонкое — разрешаем подойти к нему ближе
    this.controls.minDistance = dist * (this.state.normalize === false ? 0.14 : 0.45);
    this.controls.maxDistance = dist * 2.2;
    this.dirty = true;
  }

  resetView() { this.fit(true); }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    Object.values(this.groups).forEach((g) => this.clear(g));
    this.geometries.forEach((e) => e.geo.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.remove();
  }
}
