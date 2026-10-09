// Линия уровня f(x, y) = level на прямоугольной сетке (marching squares) со сшивкой отрезков в ломаные.
// Возвращает массив ломаных [[x, y], ...]; замкнутая ломаная повторяет первую точку в конце.
export function contour(f, x0, x1, y0, y1, nx, ny, level = 1) {
  const W = nx + 1;
  const dx = (x1 - x0) / nx, dy = (y1 - y0) / ny;
  const v = new Float64Array(W * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) v[j * W + i] = f(x0 + i * dx, y0 + j * dy) - level;

  // Точка пересечения на ребре сетки. Рёбра нумеруются: 2·узел — горизонтальное, 2·узел + 1 — вертикальное.
  const pts = new Map();
  const edgePoint = (id) => {
    let p = pts.get(id);
    if (p) return p;
    const node = id >> 1, i = node % W, j = (node - i) / W;
    const a = v[node];
    if (id & 1) {
      const b = v[node + W];
      p = [x0 + i * dx, y0 + (j + a / (a - b)) * dy];
    } else {
      const b = v[node + 1];
      p = [x0 + (i + a / (a - b)) * dx, y0 + j * dy];
    }
    pts.set(id, p);
    return p;
  };

  const links = new Map();
  const link = (a, b) => {
    (links.get(a) || links.set(a, []).get(a)).push(b);
    (links.get(b) || links.set(b, []).get(b)).push(a);
  };

  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const n00 = j * W + i, n10 = n00 + 1, n01 = n00 + W, n11 = n01 + 1;
    const code = (v[n00] < 0 ? 1 : 0) | (v[n10] < 0 ? 2 : 0) | (v[n11] < 0 ? 4 : 0) | (v[n01] < 0 ? 8 : 0);
    if (code === 0 || code === 15) continue;
    const bottom = 2 * n00, left = 2 * n00 + 1, right = 2 * n10 + 1, top = 2 * n01;
    switch (code) {
      case 1: case 14: link(left, bottom); break;
      case 2: case 13: link(bottom, right); break;
      case 3: case 12: link(left, right); break;
      case 4: case 11: link(right, top); break;
      case 6: case 9: link(bottom, top); break;
      case 7: case 8: link(left, top); break;
      default: {
        // Седло: развязка по знаку в центре ячейки.
        const centerInside = v[n00] + v[n10] + v[n11] + v[n01] < 0;
        if ((code === 5) === centerInside) { link(left, top); link(bottom, right); }
        else { link(left, bottom); link(right, top); }
      }
    }
  }

  const lines = [];
  const used = new Set();
  const walk = (start) => {
    const line = [edgePoint(start)];
    used.add(start);
    let cur = start;
    for (;;) {
      const nextId = (links.get(cur) || []).find((q) => !used.has(q));
      if (nextId === undefined) break;
      used.add(nextId);
      line.push(edgePoint(nextId));
      cur = nextId;
    }
    return { line, last: cur };
  };
  // Сначала незамкнутые ломаные (начинаются на границе области), затем замкнутые.
  for (const [id, nb] of links) if (nb.length === 1 && !used.has(id)) lines.push(walk(id).line);
  for (const [id] of links) {
    if (used.has(id)) continue;
    const { line, last } = walk(id);
    if ((links.get(last) || []).includes(id)) line.push(line[0]);
    lines.push(line);
  }
  return lines;
}
