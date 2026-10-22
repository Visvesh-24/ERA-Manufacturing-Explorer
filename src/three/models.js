// Reusable detailed models, drawn into any sink in plan coordinates.
import * as THREE from 'three';
import { M } from './mats.js';
import { part } from './sink.js';

let seed = 3;
export const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
export const pick = (a) => a[Math.floor(rand() * a.length)];

// Row of windows on a facade: axis 'y' → facade plane y = c (facing +y); 'x' → x = c.
export function windows(s, axis, c, a0, a1, z0, z1, step, width, lit = 0.25, o = {}) {
  const depth = 0.08;
  for (let a = a0; a + width <= a1 + 1e-3; a += step) {
    const r = rand();
    const mat = o.mat ?? (r < lit ? (o.cool && rand() < 0.4 ? M.winCool : M.winLit) : M.winDark);
    if (axis === 'y') s.box(a, c - depth / 2, z0, width, depth, z1 - z0, mat);
    else s.box(c - depth / 2, a, z0, depth, width, z1 - z0, mat);
    if (o.sill) {
      if (axis === 'y') s.box(a - 0.05, c, z0 - 0.08, width + 0.1, 0.12, 0.08, M.trim);
      else s.box(c, a - 0.05, z0 - 0.08, 0.12, width + 0.1, 0.08, M.trim);
    }
  }
}

// --- people -----------------------------------------------------------------
export function person(s, x, y, z = 0, o = {}) {
  const suit = o.suit ?? pick(M.suit);
  const skin = o.skin ?? pick(M.skin);
  s.within(x, y, z, o.rot ?? 0, (q) => {
    q.cbox(0, -0.13, 0, 0.18, 0.2, 0.85, M.pants);
    q.cbox(0, 0.13, 0, 0.18, 0.2, 0.85, M.pants);
    q.cbox(0, 0, 0.85, 0.3, 0.52, 0.62, suit);
    if (o.vest !== false) q.cbox(0, 0, 1.12, 0.32, 0.54, 0.08, M.hiVis);
    q.cbox(0, -0.33, 0.9, 0.14, 0.13, 0.55, suit);
    q.cbox(0, 0.33, 0.9, 0.14, 0.13, 0.55, suit);
    q.sphere(0, 0, 1.68, 0.17, skin, { seg: 12 });
    if (o.hat !== false) {
      q.sphere(0, 0, 1.73, 0.19, o.hat === 'white' ? M.hardhatWhite : M.hardhat, { half: true, seg: 12 });
      q.cyl(0, 0, 1.72, 0.24, 0.03, o.hat === 'white' ? M.hardhatWhite : M.hardhat, { seg: 14 });
    }
  });
}

// Animated walker with swinging legs and arms. Returns { g, update(t, speed) }.
export function walker(parent, x, y, o = {}) {
  const suit = o.suit ?? pick(M.suit);
  const skin = o.skin ?? pick(M.skin);
  const root = part(parent, x, y, 0, o.rot ?? 0);
  const limb = (py, pz, w, d, h, mat) => {
    const p = part(root.g, 0, py, pz);
    p.s.cbox(0, 0, -h, w, d, h, mat);
    return p.g;
  };
  const legL = limb(-0.13, 0.86, 0.18, 0.2, 0.85, M.pants);
  const legR = limb(0.13, 0.86, 0.18, 0.2, 0.85, M.pants);
  root.s.cbox(0, 0, 0.85, 0.3, 0.52, 0.62, suit);
  root.s.cbox(0, 0, 1.12, 0.32, 0.54, 0.08, M.hiVis);
  const armL = limb(-0.33, 1.45, 0.14, 0.13, 0.55, suit);
  const armR = limb(0.33, 1.45, 0.14, 0.13, 0.55, suit);
  root.s.sphere(0, 0, 1.68, 0.17, skin, { seg: 12 });
  if (o.hat !== false) {
    root.s.sphere(0, 0, 1.73, 0.19, M.hardhat, { half: true, seg: 12 });
    root.s.cyl(0, 0, 1.72, 0.24, 0.03, M.hardhat, { seg: 14 });
  }
  const phase = rand() * 6;
  return {
    g: root.g,
    swing(t, amt = 1) {
      const a = Math.sin(t * 7 + phase) * 0.5 * amt;
      legL.rotation.z = a;
      legR.rotation.z = -a;
      armL.rotation.z = -a * 0.8;
      armR.rotation.z = a * 0.8;
    },
  };
}

// --- landscape ---------------------------------------------------------------
export function tree(s, x, y, r = 1.4) {
  s.cyl(x, y, 0, 0.18 * r, 2.2 * r, M.trunk, { seg: 8, rTop: 0.12 * r });
  s.sphere(x, y, 2.6 * r, 1.25 * r, M.leafA, { seg: 12, sy: 0.9 });
  s.sphere(x + 0.35 * r, y - 0.3 * r, 3.3 * r, 0.9 * r, M.leafB, { seg: 12 });
  s.sphere(x - 0.4 * r, y + 0.25 * r, 3.05 * r, 0.75 * r, M.leafB, { seg: 10 });
}
export function shrub(s, x, y, r = 0.6) {
  s.sphere(x, y, r * 0.6, r, M.leafA, { seg: 10, sy: 0.7 });
}

export function lampPost(s, x, y, h = 7, rot = 0) {
  s.cyl(x, y, 0, 0.12, h, M.darkSteel, { seg: 10 });
  s.within(x, y, h, rot, (q) => {
    q.cbox(0.7, 0, -0.05, 1.6, 0.18, 0.12, M.darkSteel);
    q.cbox(1.3, 0, -0.18, 0.7, 0.4, 0.14, M.darkSteel);
    q.cbox(1.3, 0, -0.22, 0.6, 0.32, 0.04, M.lampHead, { cast: false });
  });
}

export function fence(s, pts, h = 2.2, mat = M.glass) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    const ang = Math.atan2(by - ay, bx - ax);
    s.within(ax, ay, 0, ang, (q) => {
      q.box(0, -0.02, 0.15, len, 0.04, h - 0.25, mat, { cast: false });
      q.box(0, -0.05, h - 0.08, len, 0.1, 0.08, M.steel);
      const n = Math.max(1, Math.round(len / 2.5));
      for (let k = 0; k <= n; k++) q.cbox((len * k) / n, 0, 0, 0.1, 0.1, h, M.steel);
    });
  }
}

export function bollard(s, x, y) {
  s.cyl(x, y, 0, 0.14, 0.9, M.yellow, { seg: 10 });
  s.cyl(x, y, 0.62, 0.15, 0.1, M.darkSteel, { seg: 10 });
}
export function cone(s, x, y) {
  s.cyl(x, y, 0, 0.22, 0.7, M.orange, { seg: 12, rTop: 0.04 });
  s.cyl(x, y, 0.3, 0.16, 0.12, M.white, { seg: 12, rTop: 0.12 });
}

// --- vehicles (local frame heads +x; place with s.within(x, y, 0, rot)) -------
function wheelsAt(s, xs, y0, y1, r, z = 0) {
  for (const x of xs) {
    s.cyl(x, y0, z + r, r, 0.4, M.rubber, { axis: 'y', seg: 18 });
    s.cyl(x, y1, z + r, r, 0.4, M.rubber, { axis: 'y', seg: 18 });
    s.cyl(x, y1 + 0.02, z + r, r * 0.5, 0.42, M.chrome, { axis: 'y', seg: 12 });
  }
}

export function truck(s, { len = 9.6, cab = M.blue, trailer = M.white, stripe = M.blue, w = 2.6, open = false } = {}) {
  // trailer (open: rear doors swung back for loading at a dock)
  if (open) {
    s.box(0, 0, 1.15, len, 0.08, 3.2, trailer);
    s.box(0, w - 0.08, 1.15, len, 0.08, 3.2, trailer);
    s.box(0, 0, 4.27, len, w, 0.08, trailer);
    s.box(len - 0.08, 0, 1.15, 0.08, w, 3.2, trailer);
    s.box(0, 0.08, 1.15, len, w - 0.16, 0.05, M.wood);
    s.box(0.3, 0.08, 1.2, len - 0.4, w - 0.16, 3.05, M.dockDark, { cast: false });
  } else s.box(0, 0, 1.15, len, w, 3.2, trailer);
  s.box(0.3, w - 0.02, 3.6, len - 0.6, 0.04, 0.22, stripe);
  s.box(0.3, -0.02, 3.6, len - 0.6, 0.04, 0.22, stripe);
  s.box(0, 0.1, 0.95, len, w - 0.2, 0.2, M.darkSteel);
  if (!open) {
    s.box(-0.05, 0.15, 1.3, 0.06, w - 0.3, 2.9, M.offWhite);
    s.box(-0.07, w / 2 - 0.03, 1.3, 0.04, 0.06, 2.9, M.darkSteel);
  }
  s.box(-0.1, 0.2, 1.05, 0.12, 0.3, 0.12, M.beaconRed, { cast: false });
  s.box(-0.1, w - 0.5, 1.05, 0.12, 0.3, 0.12, M.beaconRed, { cast: false });
  wheelsAt(s, [1.0, 2.3], -0.02, w - 0.38, 0.55);
  s.box(len - 3.2, 0.2, 0.5, 0.25, 0.2, 0.7, M.darkSteel);
  // cab
  const cx = len + 0.15;
  s.box(cx, 0.1, 0.55, 0.9, w - 0.2, 0.5, M.darkSteel);
  s.box(cx, 0.15, 0.7, 2.9, w - 0.3, 2.3, cab);
  s.box(cx + 0.4, 0.2, 3.0, 2.2, w - 0.4, 0.45, cab);
  s.box(cx + 2.88, 0.35, 1.9, 0.05, w - 0.7, 1.0, M.winDark);
  s.box(cx + 1.8, w - 0.17, 1.9, 0.9, 0.04, 0.8, M.winDark);
  s.box(cx + 1.8, 0.13, 1.9, 0.9, 0.04, 0.8, M.winDark);
  s.box(cx + 2.9, 0.25, 0.75, 0.08, w - 0.5, 0.25, M.chrome);
  s.box(cx + 2.92, 0.3, 1.15, 0.05, 0.35, 0.2, M.lampHead, { cast: false });
  s.box(cx + 2.92, w - 0.65, 1.15, 0.05, 0.35, 0.2, M.lampHead, { cast: false });
  s.box(cx + 0.6, -0.08, 1.2, 1.1, 0.15, 0.35, M.chrome);
  s.box(cx + 2.4, -0.25, 2.2, 0.1, 0.12, 0.5, M.darkSteel);
  s.box(cx + 2.4, w + 0.13, 2.2, 0.1, 0.12, 0.5, M.darkSteel);
  wheelsAt(s, [cx + 0.6, cx + 2.2], -0.02, w - 0.38, 0.55);
}

export function van(s, { body = M.white, stripe = M.teal } = {}) {
  s.box(0, 0, 0.45, 4.4, 2.1, 2.1, body);
  s.box(0.2, 2.08, 1.2, 4, 0.04, 0.3, stripe);
  s.box(0.2, -0.02, 1.2, 4, 0.04, 0.3, stripe);
  s.box(4.4, 0.05, 0.45, 1.3, 2.0, 1.25, body);
  s.box(4.4, 0.1, 1.7, 0.7, 1.9, 0.55, body);
  s.box(5.05, 0.2, 1.4, 0.55, 1.7, 0.55, M.winDark, { tilt: 0 });
  s.box(5.68, 0.25, 0.75, 0.04, 0.35, 0.18, M.lampHead, { cast: false });
  s.box(5.68, 1.4, 0.75, 0.04, 0.35, 0.18, M.lampHead, { cast: false });
  s.box(5.6, 0.15, 0.45, 0.12, 1.7, 0.22, M.darkSteel);
  wheelsAt(s, [0.9, 4.6], -0.02, 1.72, 0.42);
}

export function car(s, { body = M.white } = {}) {
  s.box(0, 0, 0.32, 3.8, 1.8, 0.7, body);
  s.box(0.9, 0.08, 1.0, 1.9, 1.64, 0.6, body);
  s.box(2.78, 0.15, 1.02, 0.06, 1.5, 0.52, M.winDark);
  s.box(0.86, 0.15, 1.02, 0.06, 1.5, 0.52, M.winDark);
  s.box(1.0, 1.7, 1.05, 1.7, 0.06, 0.45, M.winDark);
  s.box(1.0, 0.04, 1.05, 1.7, 0.06, 0.45, M.winDark);
  s.box(3.78, 0.2, 0.6, 0.05, 0.35, 0.14, M.lampHead, { cast: false });
  s.box(3.78, 1.25, 0.6, 0.05, 0.35, 0.14, M.lampHead, { cast: false });
  s.box(-0.04, 0.2, 0.65, 0.05, 0.35, 0.12, M.beaconRed, { cast: false });
  s.box(-0.04, 1.25, 0.65, 0.05, 0.35, 0.12, M.beaconRed, { cast: false });
  wheelsAt(s, [0.75, 3.05], -0.02, 1.42, 0.34);
}

// Forklift with liftable forks. Faces -x (forks at -x). Returns { forks } when in a GroupSink part.
export function forklift(parent, x, y, rot = 0, o = {}) {
  const root = part(parent, x, y, 0, rot);
  const s = root.s;
  s.box(0, 0, 0.35, 2.0, 1.25, 0.75, M.yellow);
  s.box(1.5, 0, 0.35, 0.6, 1.25, 1.0, M.darkSteel);
  s.box(0.3, 0.15, 1.1, 0.7, 0.95, 0.15, M.rubber);
  s.box(0.9, 0.3, 1.1, 0.4, 0.65, 0.6, M.rubber);
  for (const [px, py] of [[0.15, 0.08], [0.15, 1.07], [1.55, 0.08], [1.55, 1.07]]) s.box(px, py, 1.1, 0.08, 0.08, 1.35, M.darkSteel);
  s.box(0.1, 0, 2.45, 1.6, 1.25, 0.06, M.darkSteel);
  s.cyl(1.7, 0.62, 2.55, 0.08, 0.1, M.beacon, { seg: 8 });
  wheelsAt(s, [0.35, 1.6], -0.05, 0.9, 0.32);
  // mast
  s.box(-0.25, 0.15, 0.1, 0.12, 0.12, 2.8, M.darkSteel);
  s.box(-0.25, 0.98, 0.1, 0.12, 0.12, 2.8, M.darkSteel);
  s.box(-0.25, 0.15, 2.8, 0.12, 0.95, 0.1, M.darkSteel);
  const forks = part(root.g, -0.3, 0, 0.12);
  forks.s.box(-0.05, 0.12, 0, 0.1, 1.0, 0.9, M.darkSteel);
  forks.s.box(-1.25, 0.25, 0, 1.2, 0.12, 0.06, M.steel);
  forks.s.box(-1.25, 0.88, 0, 1.2, 0.12, 0.06, M.steel);
  if (o.load !== false) {
    forks.s.box(-1.35, 0.05, 0.06, 1.25, 1.15, 0.14, M.wood);
    forks.s.box(-1.3, 0.1, 0.2, 1.15, 1.05, o.loadH ?? 0.9, o.wrap ? M.wrapFilm : M.cardboard);
  }
  if (o.driver !== false) person(s, 0.85, 0.62, 0.55, { rot: Math.PI, suit: M.suit[3] });
  return { g: root.g, forks: forks.g };
}

// --- storage & goods --------------------------------------------------------
export function pallet(s, x, y, z = 0, w = 1.2, d = 1.2) {
  s.box(x, y, z + 0.04, w, d, 0.04, M.wood);
  for (const k of [0, 0.5, 1]) s.box(x + (w - 0.12) * k, y, z, 0.12, d, 0.06, M.wood);
  s.box(x, y, z + 0.09, w, d, 0.04, M.wood);
}

export function cartons(s, x, y, layers, { z = 0, w = 2.4, wrap = false } = {}) {
  pallet(s, x, y, z, w, w);
  const h = layers * 0.6;
  if (wrap) {
    s.box(x + 0.08, y + 0.08, z + 0.13, w - 0.16, w - 0.16, h, M.cardboard);
    s.box(x + 0.05, y + 0.05, z + 0.13, w - 0.1, w - 0.1, h + 0.03, M.wrapFilm, { cast: false });
    return;
  }
  const n = 2;
  const c = (w - 0.2) / n;
  for (let l = 0; l < layers; l++) {
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if (l === layers - 1 && rand() < 0.15) continue;
        s.box(x + 0.1 + i * c + 0.02, y + 0.1 + j * c + 0.02, z + 0.13 + l * 0.6, c - 0.04, c - 0.04, 0.58, M.cardboard);
      }
  }
}

export function palletPile(s, x, y, n) {
  for (let i = 0; i < n; i++) pallet(s, x, y, i * 0.14, 1.2, 1.2);
}

export function container(s, x, y, z, mat, len = 6, rot = 0) {
  s.within(x, y, z, rot, (q) => {
    q.box(0, 0, 0, len, 2.4, 2.5, mat);
    q.box(len - 0.02, 0.1, 0.1, 0.06, 2.2, 2.3, M.darkSteel);
    q.box(len + 0.02, 0.6, 0.3, 0.05, 0.06, 1.9, M.steel);
    q.box(len + 0.02, 1.75, 0.3, 0.05, 0.06, 1.9, M.steel);
    for (const cx of [0, len - 0.18]) for (const cy of [0, 2.22]) q.box(cx, cy, 0, 0.18, 0.18, 2.5, M.darkSteel);
  });
}

export function drum(s, cx, cy, z, mat, r = 0.32, h = 0.9) {
  s.cyl(cx, cy, z, r, h, mat, { seg: 16 });
  s.cyl(cx, cy, z + h * 0.33, r + 0.015, 0.04, M.darkSteel, { seg: 16 });
  s.cyl(cx, cy, z + h * 0.66, r + 0.015, 0.04, M.darkSteel, { seg: 16 });
  s.cyl(cx, cy, z + h, r * 0.9, 0.03, M.steel, { seg: 16 });
}

// Pallet racking along x, bays 2.8 wide, facing +y.
export function rack(s, x, y, len, levels = 3, depth = 1.4) {
  const bays = Math.round(len / 2.8);
  for (let b = 0; b <= bays; b++) {
    s.box(x + b * 2.8 - 0.05, y, 0, 0.1, 0.1, levels * 1.9, M.rackBlue);
    s.box(x + b * 2.8 - 0.05, y + depth - 0.1, 0, 0.1, 0.1, levels * 1.9, M.rackBlue);
  }
  for (let lv = 0; lv < levels; lv++) {
    const z = lv * 1.9 + 0.15;
    s.box(x, y, z, len, 0.1, 0.12, M.rackOrange);
    s.box(x, y + depth - 0.1, z, len, 0.1, 0.12, M.rackOrange);
    for (let b = 0; b < bays; b++) {
      if (rand() < 0.15) continue;
      const lay = rand() < 0.5 ? 1 : 2;
      cartons(s, x + b * 2.8 + 0.25, y + 0.05, lay, { z: z + 0.12, w: 1.3, wrap: rand() < 0.3 });
      if (rand() < 0.8) cartons(s, x + b * 2.8 + 1.5, y + 0.05, rand() < 0.5 ? 1 : 2, { z: z + 0.12, w: 1.1 });
    }
  }
}

// Shelving with bins along x, facing +y.
export function shelf(s, x, y, z, len, depth, h, levels, mats) {
  const step = h / levels;
  for (const px of [x, x + len - 0.06]) {
    s.box(px, y, z, 0.06, 0.06, h, M.darkSteel);
    s.box(px, y + depth - 0.06, z, 0.06, 0.06, h, M.darkSteel);
  }
  for (let lv = 0; lv <= levels; lv++) {
    const zz = z + lv * step;
    s.box(x, y, zz, len, depth, 0.04, M.darkSteel);
    if (lv === levels) break;
    for (let k = 0.08; k + 0.42 <= len; k += 0.48) {
      if (rand() < 0.1) continue;
      const hh = Math.min(step - 0.1, 0.22 + rand() * 0.3);
      s.box(x + k, y + 0.06, zz + 0.04, 0.42, depth - 0.12, hh, pick(mats));
    }
  }
}

export function desk(s, x, y, z, { rot = 0, person: who = true, screen = true } = {}) {
  s.within(x, y, z, rot, (q) => {
    q.box(0, 0, 0.72, 1.6, 0.8, 0.05, M.desk);
    for (const [px, py] of [[0.05, 0.05], [1.5, 0.05], [0.05, 0.7], [1.5, 0.7]]) q.box(px, py, 0, 0.05, 0.05, 0.72, M.darkSteel);
    if (screen) {
      q.box(0.55, 0.12, 0.77, 0.5, 0.05, 0.38, M.darkSteel);
      q.box(0.58, 0.18, 0.8, 0.44, 0.02, 0.32, M.screen, { cast: false });
      q.box(0.75, 0.15, 0.77, 0.1, 0.1, 0.06, M.darkSteel);
    }
    q.box(0.55, 1.0, 0, 0.5, 0.5, 0.45, M.navy);
    q.box(0.55, 1.42, 0.45, 0.5, 0.08, 0.5, M.navy);
    if (who) person(q, 0.8, 1.15, 0, { rot: -Math.PI / 2, hat: false, vest: false });
  });
}

export function serverRack(s, x, y, z, h = 2.2) {
  s.box(x, y, z, 0.7, 1.0, h, M.serverBody);
  for (let k = 0; k < 9; k++) {
    const zz = z + 0.2 + (k * (h - 0.4)) / 9;
    s.box(x + 0.08, y + 1.0, zz, 0.54, 0.02, 0.12, M.darkSteel);
    s.box(x + 0.1 + (k % 3) * 0.12, y + 1.02, zz + 0.04, 0.05, 0.02, 0.04, k % 2 ? M.ledGreen : M.ledBlue, { cast: false });
  }
}

export function lockers(s, x, y, len, h = 1.9) {
  s.box(x, y, 0, len, 0.5, h, M.cladBlue);
  for (let k = 0.45; k < len; k += 0.45) s.box(x + k - 0.01, y + 0.5, 0.05, 0.02, 0.02, h - 0.1, M.darkSteel);
  for (let k = 0.2; k < len; k += 0.45) s.box(x + k, y + 0.5, h - 0.35, 0.08, 0.02, 0.03, M.chrome);
}

export function tank(s, cx, cy, r, h, { mat = M.tank } = {}) {
  s.cyl(cx, cy, 0, r, h, mat, { seg: 40 });
  s.sphere(cx, cy, h, r, mat, { half: true, seg: 32, sy: 0.25 });
  for (const f of [0.25, 0.5, 0.75]) s.cyl(cx, cy, h * f, r + 0.04, 0.12, M.tankDark, { seg: 40 });
  s.cyl(cx, cy, h + r * 0.25 - 0.05, 0.4, 0.25, M.steel, { seg: 12 });
  // caged ladder
  const ang = Math.PI * 0.25;
  const lx = cx + Math.cos(ang) * (r + 0.25);
  const ly = cy + Math.sin(ang) * (r + 0.25);
  s.cyl(lx, ly, 0, 0.05, h + 0.6, M.steel, { seg: 6 });
  s.cyl(lx + 0.25, ly - 0.25, 0, 0.05, h + 0.6, M.steel, { seg: 6 });
  for (let z = 0.4; z < h; z += 0.45) s.cbox(lx + 0.12, ly - 0.12, z, 0.05, 0.4, 0.04, M.steel, { rot: -ang });
  s.cyl(cx, cy, h + r * 0.25, r * 0.95, 0.06, M.steel, { seg: 40, open: true });
}

export function hvac(s, x, y, z, w = 4, d = 3, h = 1.6) {
  s.box(x, y, z, w, d, h, M.wallMid);
  s.box(x + 0.1, y + d - 0.02, z + 0.2, w - 0.2, 0.04, h - 0.4, M.darkSteel);
  for (let k = 0.3; k < w - 0.2; k += 0.25) s.box(x + k, y + d, z + 0.25, 0.04, 0.03, h - 0.5, M.steel);
}

// Spinning fan disc for a part sink (blades rotate about local vertical axis).
export function fanBlades(s, r = 0.8, mat = M.steel) {
  for (let i = 0; i < 4; i++) {
    const g = new THREE.BoxGeometry(r * 2, 0.04, 0.22);
    g.rotateY((i * Math.PI) / 4);
    s.geo(g, mat, { cast: false });
  }
  s.cyl(0, 0, -0.05, 0.16, 0.12, M.darkSteel, { seg: 10 });
}

export function blobShadow(s, cx, cy, rx, ry = rx) {
  s.plane(cx - rx, cy - ry, cx + rx, cy + ry, 0.03, M.blobShadow);
}
