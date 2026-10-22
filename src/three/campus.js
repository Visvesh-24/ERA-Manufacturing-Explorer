// The manufacturing campus, built in plan coordinates (x, y on the ground, z up).
// Static geometry is merged per sector and material; anything that moves is a
// small group hierarchy whose pivots sit exactly where the joints are.
import * as THREE from 'three';
import { Builder, part } from './sink.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, textures, fading } from './mats.js';
import * as K from './models.js';
import { sectors } from '../data.js';
import { buildLine } from './line.js';

export const HQ_GAP = 6.5;
const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// 0→1→0 envelope inside a run phase p, with ramp fraction r
const env = (p, r = 0.15) => (p < 0 ? 0 : Math.min(smooth(clamp01(p / r)), smooth(clamp01((1 - p) / r))));

export function buildCampus(engine) {
  const { scene, tickers } = engine;
  const root = new THREE.Group();
  scene.add(root);
  const dyn = new THREE.Group();
  root.add(dyn);
  const B = new Builder();
  const machines = {};
  const mini = [];
  const lights = [];
  const fades = {};
  const sectorOf = {}; // object uuid → { sector, spot }

  const addMachine = (id, dur, update) => (machines[id] ||= []).push({ dur, update, t0: -1 });
  const ambient = (fn) => tickers.push(fn);
  const miniBox = (x0, y0, x1, y1, h, kind = 'b') => mini.push({ x0, y0, x1, y1, h, kind });
  const tagPart = (g, sector, spot) => {
    g.userData.sector = sector;
    g.userData.spot = spot;
  };
  // materials for a building whose outer walls fade away when it opens
  const shell = (name) => {
    const mats = {};
    const get = (key) => (mats[key] ||= fading(M[key]));
    fades[name] = { mats, value: 1, target: 1 };
    return get;
  };

  // =====================================================================
  // ground, roads, pads
  B.tagged('', (b) => {
    b.plane(-260, -260, 480, 380, -0.05, M.ground);
    b.plane(204, -80, 212, 200, 0.01, M.asphalt);
    b.plane(-60, 154, 290, 162, 0.012, M.asphalt);
    for (let y = -80; y < 200; y += 6) if (y < 153 || y > 163) b.plane(207.88, y, 208.12, y + 3, 0.03, M.lineWhite);
    for (let x = -60; x < 290; x += 6) if (x < 203 || x > 213) b.plane(x, 157.88, x + 3, 158.12, 0.03, M.lineWhite);
    for (const x of [204.2, 211.8]) b.plane(x - 0.06, -80, x + 0.06, 200, 0.025, M.lineWhite);
    for (const y of [154.2, 161.8]) b.plane(-60, y - 0.06, 290, y + 0.06, 0.025, M.lineWhite);
    // site pad with a raised curb
    b.plane(0, 0, 200, 150, 0.02, M.pad);
    const curb = (x, y, w, d) => b.box(x, y, 0, w, d, 0.18, M.offWhite, { cast: false });
    curb(-0.3, -0.3, 200.6, 0.3);
    curb(-0.3, 0, 0.3, 150.3);
    curb(0, 150, 110, 0.3);
    curb(126, 150, 74.3, 0.3);
    curb(200, 0, 0.3, 2);
    curb(200, 31, 0.3, 3);
    curb(200, 47, 0.3, 103.3);
    // aprons and yards
    b.plane(190, 2, 204, 31, 0.035, M.apron);
    b.plane(198, 34, 204, 47, 0.035, M.apron);
    b.plane(110, 146, 126, 154, 0.035, M.apron);
    b.plane(100, 2, 147, 29, 0.035, M.apron);
    b.plane(170, 48, 200, 90, 0.035, M.apron);
    b.plane(1, 49, 40, 90, 0.035, M.apron);
    b.plane(43, 95, 97, 148, 0.03, M.asphalt);
    // parking stalls
    for (const y0 of [99, 125]) {
      for (let x = 44; x <= 96; x += 2.6) {
        b.plane(x - 0.06, y0, x + 0.06, y0 + 4.6, 0.045, M.lineWhite);
        b.plane(x - 0.06, y0 + 8.4, x + 0.06, y0 + 13, 0.045, M.lineWhite);
      }
    }
    // walkways: yellow edge lines and crossings
    const walk = (x0, y0, x1, y1) => b.plane(Math.min(x0, x1) - 0.08, Math.min(y0, y1) - 0.08, Math.max(x0, x1) + 0.08, Math.max(y0, y1) + 0.08, 0.05, M.lineYellow);
    walk(42, 90.6, 128, 90.6);
    walk(42, 92.4, 128, 92.4);
    walk(118, 92, 118, 146);
    walk(120, 92, 120, 146);
    for (let x = 110.5; x < 126; x += 1.2) b.plane(x, 147, x + 0.6, 150.6, 0.05, M.lineWhite);
    for (let y = 2.5; y < 30; y += 1.2) b.plane(200.6, y, 203.4, y + 0.6, 0.05, M.lineWhite);
    // lawns
    b.plane(131, 95, 199, 148, 0.06, M.grass);
    b.plane(2, 131, 42, 148, 0.06, M.grass);
    b.box(130.8, 94.8, 0, 68.4, 0.25, 0.22, M.offWhite, { cast: false });
    b.box(130.8, 148, 0, 68.4, 0.25, 0.22, M.offWhite, { cast: false });
    // off-site pads and links
    b.plane(218, -48, 252, -10, 0.025, M.pad);
    b.plane(212, -31, 218, -24, 0.03, M.apron);
    b.plane(218, 88, 254, 122, 0.025, M.pad);
    b.plane(212, 101, 218, 108, 0.03, M.apron);
  });

  // supply routes: glowing ribbons with travelling packets
  const routes = [
    [[232, -27], [207, -27], [207, 9], [204.5, 9]],
    [[204.5, 21], [209.6, 21], [209.6, 104.5], [228, 104.5]],
  ];
  const routeMeshes = [];
  for (const r of routes) {
    for (let i = 0; i < r.length - 1; i++) {
      const [ax, ay] = r[i];
      const [bx, by] = r[i + 1];
      const len = Math.hypot(bx - ax, by - ay);
      const g = new THREE.PlaneGeometry(len, 0.9);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setX(k, (uv.getX(k) * len) / 5);
      g.rotateX(-Math.PI / 2);
      g.rotateY(-Math.atan2(by - ay, bx - ax));
      g.translate((ax + bx) / 2, 0.08, (ay + by) / 2);
      const m = new THREE.Mesh(g, M.route);
      m.renderOrder = 2;
      root.add(m);
      routeMeshes.push(m);
      const base = new THREE.Mesh(g.clone(), M.routeBase);
      base.scale.set(1, 1, 1);
      root.add(base);
    }
  }
  {
    const pk = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 12, 8), M.packet, 10);
    root.add(pk);
    const lens = routes.map((r) => r.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - r[i][0], p[1] - r[i][1]), 0));
    const at = (r, d) => {
      for (let i = 0; i < r.length - 1; i++) {
        const l = Math.hypot(r[i + 1][0] - r[i][0], r[i + 1][1] - r[i][1]);
        if (d <= l) return [r[i][0] + ((r[i + 1][0] - r[i][0]) * d) / l, r[i][1] + ((r[i + 1][1] - r[i][1]) * d) / l];
        d -= l;
      }
      return r[r.length - 1];
    };
    const mtx = new THREE.Matrix4();
    ambient((t) => {
      M.route.map.offset.x = -t * 0.6;
      let n = 0;
      routes.forEach((r, ri) => {
        for (let k = 0; k < 5; k++) {
          const d = ((t * 9 + (k * lens[ri]) / 5) % lens[ri]);
          const [x, y] = at(r, d);
          mtx.makeTranslation(x, 0.55 + Math.sin(t * 4 + k) * 0.08, y);
          pk.setMatrixAt(n++, mtx);
        }
      });
      pk.instanceMatrix.needsUpdate = true;
    });
  }

  // =====================================================================
  // CHEMICALS & GASES
  B.tagged('chemicals', (b) => {
    const curbM = M.darkSteel;
    b.box(2, 2, 0, 28, 0.4, 0.9, curbM);
    b.box(2, 2.4, 0, 0.4, 26.6, 0.9, curbM);
    b.box(2.4, 28.6, 0, 27.6, 0.4, 0.9, curbM);
    b.box(29.6, 2.4, 0, 0.4, 26.2, 0.9, curbM);
    b.plane(2.4, 2.4, 29.6, 28.6, 0.05, M.apron);
    K.tank(b, 9, 9, 4.5, 12);
    K.tank(b, 21, 9, 4.5, 12);
    K.tank(b, 9, 21.5, 3.5, 9);
    // pipe rack linking tanks to the plant
    for (const x of [7, 13, 19, 25, 31, 37]) {
      b.box(x, 13.6, 0, 0.25, 0.25, 6.2, M.steel);
      b.box(x, 15.4, 0, 0.25, 0.25, 6.2, M.steel);
      b.box(x, 13.6, 6.0, 0.25, 2.05, 0.25, M.steel);
    }
    for (const [dy, mat] of [[14, M.blue], [14.6, M.green], [15.2, M.tankDark]]) b.cyl(4, dy, 6.45, 0.22, 40, mat, { axis: 'x', seg: 10 });
    b.box(44, 13.4, 0, 0.3, 2.4, 6.4, M.steel);
    // drum shed
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) K.drum(b, 17 + i * 2.6, 19.5 + j * 2.6, 0, j % 2 ? M.blue : M.green, 0.55, 1.5);
    for (const [px, py] of [[15.6, 17.6], [27.4, 17.6], [15.6, 27.2], [27.4, 27.2]]) b.box(px, py, 0, 0.3, 0.3, 4.2, M.steel);
    b.box(15, 17, 4.2, 13.4, 11, 0.35, M.roof);
    // industrial gases: bulk tank, vaporizer, cylinder cage
    b.cyl(35.5, 6, 2, 2.4, 13, M.tank, { seg: 32 });
    b.sphere(35.5, 6, 15, 2.4, M.tank, { half: true, seg: 28, sy: 0.5 });
    b.sphere(35.5, 6, 2, 2.4, M.tank, { seg: 28, sy: 0.5 });
    for (const [lx, ly] of [[34, 4.5], [37, 4.5], [34, 7.5], [37, 7.5]]) b.box(lx - 0.15, ly - 0.15, 0, 0.3, 0.3, 2.4, M.steel);
    b.box(31.5, 10, 0, 8, 2.6, 0.3, M.darkSteel);
    for (let k = 0; k < 6; k++) {
      b.box(32 + k * 1.2, 10.5, 0.3, 0.8, 1.6, 3.4, M.offWhite);
      for (let f = 0; f < 4; f++) b.box(32 + k * 1.2 + 0.1 + f * 0.2, 10.3, 0.4, 0.04, 2.0, 3.2, M.steel);
    }
    const cyCols = [M.blue, M.green, M.orange, M.slate];
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 4; j++) {
        b.cyl(32 + i * 1.5, 16.5 + j * 2.1, 0, 0.42, 2.1, cyCols[j], { seg: 14 });
        b.sphere(32 + i * 1.5, 16.5 + j * 2.1, 2.1, 0.42, cyCols[j], { half: true, seg: 12 });
        b.cyl(32 + i * 1.5, 16.5 + j * 2.1, 2.45, 0.12, 0.3, M.steel, { seg: 8 });
      }
    K.fence(b, [[31, 25], [39.5, 25], [39.5, 15], [31, 15]], 2.8);
    // clarifier basins (arms are animated below)
    for (const cx of [10, 25]) {
      b.cyl(cx, 37.5, 0, 6.2, 1.4, M.wallMid, { seg: 48 });
      b.cyl(cx, 37.5, 1.38, 6.25, 0.12, M.trim, { seg: 48, open: true });
      b.cyl(cx, 37.5, 1.2, 5.8, 0.05, M.water, { seg: 48 });
      b.cyl(cx, 37.5, 0, 0.6, 2.3, M.steel, { seg: 12 });
    }
    b.box(3.5, 37.2, 1.5, 28, 0.6, 0.1, M.steel);
    b.box(33, 32, 0, 6, 8, 3.6, M.wall);
    b.box(32.8, 31.8, 3.6, 6.4, 8.4, 0.3, M.roof);
    b.box(34, 39.96, 0, 1.4, 0.1, 2.3, M.door);
    K.windows(b, 'x', 39.02, 33, 39.4, 1.6, 2.7, 1.6, 1, 0.5);
    K.person(b, 31.5, 30.2, 0, { suit: M.suit[1] });
    K.person(b, 27.6, 29.8, 0, { rot: 2 });
  });
  miniBox(2, 2, 40, 44, 8, 't');
  const clarArms = [];
  for (const cx of [10, 25]) {
    const p = part(dyn, cx, 37.5, 1.5);
    p.s.box(-0.25, -0.35, 0.1, 6, 0.7, 0.25, M.steel);
    p.s.box(-6, -0.2, 0.1, 6, 0.4, 0.15, M.steel);
    p.s.box(5.4, -0.35, 0.35, 0.3, 0.7, 0.8, M.yellow);
    for (let k = 1; k < 6; k++) p.s.box(k - 0.04, -0.5, 0.35, 0.08, 1.0, 0.5, M.steel);
    clarArms.push(p.g);
    tagPart(p.g, 'chemicals', 'water');
  }
  let clarSpeed = 0.06;
  addMachine('clarifier', 6, (p) => {
    clarSpeed = 0.06 + env(p, 0.2) * 1.2;
  });
  ambient((t, dt) => {
    for (const a of clarArms) a.rotation.y += clarSpeed * dt;
    M.water.map.offset.set(t * 0.02, t * 0.013);
  });

  // =====================================================================
  // ENERGY & UTILITIES
  B.tagged('energy', (b) => {
    for (const y of [5, 14]) {
      b.box(47, y, 0, 6, 5, 4, M.gray);
      for (let k = 0.5; k < 5; k += 0.55) b.box(53, y + k, 0.4, 0.5, 0.12, 3.2, M.slate);
      for (let k = 0.5; k < 5; k += 0.55) b.box(46.5, y + k, 0.4, 0.5, 0.12, 3.2, M.slate);
      for (const dx of [1.2, 3, 4.8]) {
        b.cyl(47 + dx, y + 2.5, 4, 0.28, 1.8, M.orange, { seg: 10 });
        for (let r = 0; r < 4; r++) b.cyl(47 + dx, y + 2.5, 4.2 + r * 0.38, 0.42, 0.08, M.orange, { seg: 10 });
      }
      b.box(48.5, y + 1, 4, 3, 3, 0.4, M.darkSteel);
    }
    for (const y of [6, 21]) {
      for (const x of [58, 64]) {
        b.box(x - 0.2, y - 0.2, 0, 0.4, 0.4, 9, M.steel);
        for (let z = 1; z < 9; z += 1.6) b.cbox(x, y, z, 0.08, 0.5, 1.6, M.steel, { tilt: 0.7 });
      }
      b.box(57.8, y - 0.2, 8.8, 6.4, 0.4, 0.4, M.steel);
      for (const x of [59.5, 61, 62.5]) {
        b.cyl(x, y, 7.6, 0.18, 1.1, M.offWhite, { seg: 8 });
        for (let r = 0; r < 4; r++) b.cyl(x, y, 7.7 + r * 0.25, 0.3, 0.06, M.offWhite, { seg: 8 });
      }
    }
    for (const x of [59.5, 61, 62.5]) b.cyl(x, 13.5, 7.65, 0.05, 15, M.chrome, { axis: 'y', seg: 6 });
    b.box(55, 22.5, 0, 9, 2.2, 2.6, M.wallMid);
    K.windows(b, 'y', 24.72, 55.5, 63.5, 1.2, 2.2, 1.6, 1.0, 0.6, { cool: true });
    K.fence(b, [[44, 26], [66, 26], [66, 2], [44, 2], [44, 26]], 2.6);
    b.plane(44, 2, 66, 26, 0.04, M.apron);
    for (let x = 45; x < 66; x += 1.4) for (let y = 3; y < 26; y += 1.4) if ((x + y) % 2.8 < 1.4) b.plane(x, y, x + 0.18, y + 0.18, 0.05, M.lineWhite);
    // meter bank
    for (let i = 0; i < 6; i++) {
      b.box(70.5 + i * 2.2, 26, 0, 1.8, 1.2, 2.6, M.slate);
      b.box(70.8 + i * 2.2, 27.2, 1.2, 1.2, 0.05, 0.9, M.screen, { cast: false });
      b.box(70.8 + i * 2.2, 27.2, 0.4, 1.2, 0.05, 0.12, M.ledGreen, { cast: false });
    }
    // stack
    b.cyl(95.5, 8, 0, 2.2, 1.2, M.darkSteel, { seg: 24 });
    b.cyl(95.5, 8, 1.2, 1.8, 30.8, M.tank, { seg: 32, rTop: 1.5 });
    for (const z of [24, 28]) b.cyl(95.5, 8, z, 1.68, 2, M.amber, { seg: 32, rTop: 1.62 });
    b.cyl(95.5, 8, 31.6, 1.6, 0.5, M.darkSteel, { seg: 32 });
    for (let z = 3; z < 31; z += 1.2) b.cbox(97.2, 8, z, 0.08, 0.6, 0.06, M.steel);
    b.box(97.15, 7.7, 1, 0.08, 0.08, 30, M.steel);
    b.box(97.15, 8.25, 1, 0.08, 0.08, 30, M.steel);
    b.cyl(95.5, 8, 32.1, 0.2, 0.3, M.beaconRed, { seg: 8, cast: false });
  });
  // boiler & compressor house (shell fades when opened)
  {
    const sm = shell('plant');
    B.tagged('energy', (b) => {
      b.box(70, 4, 0, 22, 0.4, 10, M.wallInner);
      b.box(70, 4.4, 0, 0.4, 19.6, 10, M.wallInner);
      b.plane(70.4, 4.4, 92, 24, 0.06, M.epoxy);
      for (const [z, mat] of [[6.4, M.red], [7.4, M.blue]]) b.cyl(70.6, 5, z, 0.25, 21, mat, { axis: 'x', seg: 10 });
      for (const y of [6.5, 13]) {
        b.box(72, y, 0, 8, 4, 0.4, M.darkSteel);
        b.cyl(72.2, y + 2, 2.4, 1.9, 7.4, M.red, { axis: 'x', seg: 28 });
        b.cyl(79.8, y + 2, 2.4, 1.95, 0.4, M.darkSteel, { axis: 'x', seg: 28 });
        b.box(79.9, y + 1.2, 1.6, 0.9, 1.6, 1.6, M.gray);
        b.cyl(76, y + 2, 4.3, 0.35, 3.5, M.steel, { seg: 12 });
        b.box(73, y + 3.9, 0.6, 1.2, 0.08, 0.8, M.screen, { cast: false });
      }
      b.cyl(89.2, 17.8, 0, 1, 4.6, M.tank, { seg: 20 });
      b.sphere(89.2, 17.8, 4.6, 1, M.tank, { half: true, seg: 16 });
      K.person(b, 81.5, 19.5, 0, { suit: M.suit[3], rot: 0.6 });
    });
    B.tagged('energy', (b) => {
      b.box(70, 23.7, 0, 22, 0.3, 10, sm('clad'));
      b.box(91.7, 4, 0, 0.3, 19.7, 10, sm('clad'));
      b.box(69.8, 3.8, 10, 22.4, 20.4, 0.4, sm('roof'));
      for (let x = 71; x < 91; x += 2) b.box(x, 24.0, 6.8, 1.2, 0.06, 1.8, sm('darkSteel'));
      b.box(74, 24.0, 0, 5, 0.06, 5, sm('shutter'));
      b.box(70, 24.0, 9.4, 22, 0.1, 0.6, sm('trim'));
      b.box(92.0, 4, 9.4, 0.1, 20, 0.6, sm('trim'));
      for (const [x, y] of [[74, 8], [84, 16]]) K.hvac(b, x, y, 10.4, 3.4, 2.6, 1.4);
    });
    fades.plant.tag = 'energy';
  }
  miniBox(70, 4, 92, 24, 10);
  miniBox(44, 2, 66, 26, 3, 'u');
  // compressors (dynamic: fans spin and pipe glows when started)
  const compFans = [];
  const airMat = M.blue.clone();
  airMat.emissive = new THREE.Color('#5fb4ff');
  airMat.emissiveIntensity = 0;
  {
    const s = part(dyn, 0, 0, 0).s;
    for (const y of [6.5, 11.5]) {
      s.box(83, y, 0, 4, 3, 2.6, M.blue);
      s.box(83.2, y + 3, 0.3, 3.6, 0.05, 1.6, M.darkSteel);
      const f = part(dyn, 85, y + 1.5, 2.65);
      K.fanBlades(f.s, 1.0);
      compFans.push(f.g);
      tagPart(f.g, 'energy', 'compressors');
    }
    s.cyl(85, 8, 2.6, 0.18, 2.4, airMat, { seg: 10 });
    s.cyl(85, 13, 2.6, 0.18, 2.4, airMat, { seg: 10 });
    s.cyl(85, 8, 5, 0.18, 4.2, airMat, { axis: 'x', seg: 10 });
    s.cyl(89.2, 12.9, 5, 0.18, 9.8, airMat, { axis: 'y', seg: 10 });
    s.cyl(91.6, 17.8, 5, 0.18, 4.8, airMat, { axis: 'x', seg: 10 });
    s.cyl(94, 26, 5, 0.18, 16.4, airMat, { axis: 'y', seg: 10 });
    for (const y of [20, 26]) s.box(93.85, y, 0, 0.3, 0.3, 5, M.steel);
  }
  const gauge = part(dyn, 87.6, 15.2, 3.2);
  gauge.s.cyl(0, 0, -0.05, 0.45, 0.1, M.white, { axis: 'y', seg: 20 });
  const needle = part(gauge.g, 0, 0.08, 0);
  needle.s.cbox(0, 0, 0, 0.04, 0.03, 0.38, M.red);
  let compSpeed = 0;
  addMachine('compressor', 6, (p) => {
    const e = env(p, 0.15);
    compSpeed = e * 22;
    airMat.emissiveIntensity = e * (0.35 + Math.sin(performance.now() / 120) * 0.12);
    needle.g.rotation.z = -1.2 + e * 2.2;
  });
  needle.g.rotation.z = -1.2;
  ambient((t, dt) => compFans.forEach((f) => (f.rotation.y += (0.4 + compSpeed) * dt)));

  // =====================================================================
  // FREIGHT: container yard, warehouse, docks, parcel room
  const cmats = M.container;
  B.tagged('freight', (b) => {
    const stack = (x, y, n) => {
      for (let i = 0; i < n; i++) K.container(b, x, y, i * 2.55, K.pick(cmats));
    };
    for (const y of [3, 6.6, 10.2]) for (const x of [102, 109, 116]) stack(x, y, 1 + Math.floor(K.rand() * 3));
    for (const y of [17, 20.4, 23.8]) for (const x of [102, 109, 116]) stack(x, y, 1 + Math.floor(K.rand() * 3));
    for (const y of [3.6, 7.2, 10.8, 21.6, 25]) stack(139.5, y, 1 + Math.floor(K.rand() * 3));
    for (let x = 101; x < 146; x += 3) b.plane(x, 15.2, x + 1.6, 15.5, 0.05, M.lineYellow);
    K.person(b, 137.4, 23.6, 0, { suit: M.suit[3], rot: Math.PI });
    K.lampPost(b, 124, 4, 9, Math.PI / 2);
    K.lampPost(b, 147, 28, 9, -Math.PI * 0.75);
  });
  miniBox(102, 3, 146, 27.4, 5, 'c');
  // reach stacker: boom pivots at the cab, container hangs from the boom tip
  {
    const rs = part(dyn, 130, 16.8, 0);
    tagPart(rs.g, 'freight', 'containers');
    const s = rs.s;
    s.box(0, 0, 0.6, 6.4, 3.2, 1.4, M.yellow);
    s.box(4.6, 0.2, 2.0, 1.8, 2.8, 2.0, M.yellow);
    s.box(6.38, 0.5, 2.6, 0.05, 2.2, 1.2, M.winDark);
    s.box(4.7, 0.18, 2.6, 1.4, 0.05, 1.1, M.winDark);
    s.box(5.0, 0.2, 4.0, 1.6, 2.8, 0.1, M.darkSteel);
    s.box(6.5, 1.0, 0.6, 0.2, 1.2, 0.5, M.darkSteel);
    for (const x of [1, 5.2]) {
      s.cyl(x, -0.05, 0.75, 0.75, 0.6, M.rubber, { axis: 'y', seg: 18 });
      s.cyl(x, 3.25, 0.75, 0.75, 0.6, M.rubber, { axis: 'y', seg: 18 });
    }
    s.cyl(5.8, 1.6, 4.15, 0.12, 0.3, M.beacon, { seg: 8 });
    const boom = part(rs.g, 4.2, 1.6, 2.4);
    boom.s.box(-6.4, -0.45, -0.45, 6.8, 0.9, 0.9, M.amber);
    boom.s.box(-6.6, -0.3, -0.3, 0.6, 0.6, 0.6, M.darkSteel);
    const spreader = part(boom.g, -6.3, 0, -0.5);
    spreader.s.box(-3.2, -1.3, -0.35, 6.4, 2.6, 0.3, M.darkSteel);
    K.container(spreader.s, -3, -1.2, -2.95, cmats[0]);
    const base = -0.18;
    boom.g.rotation.z = base;
    spreader.g.rotation.z = -base;
    addMachine('reach', 6.5, (p) => {
      const e = env(p, 0.3);
      boom.g.rotation.z = base - e * 0.32;
      spreader.g.rotation.z = -boom.g.rotation.z;
      rs.g.position.x = 130 + Math.sin(clamp01(p) * Math.PI) * 1.2 * (p < 0 ? 0 : 1);
    });
  }

  // warehouse
  {
    const sm = shell('ware');
    B.tagged('freight', (b) => {
      b.box(150, 2, 0, 40, 0.4, 10, M.wallInner);
      b.box(150, 2.4, 0, 0.4, 27.6, 10, M.wallInner);
      b.plane(150.4, 2.4, 190, 30, 0.06, M.epoxy);
      for (const y of [4.6, 10.6, 16.6]) K.rack(b, 152, y, 25.2, 3, 1.4);
      for (const y of [4.6, 10.6, 16.6]) K.rack(b, 152, y + 1.5, 25.2, 3, 1.4);
      for (let y = 3.4; y < 29; y += 6) b.plane(151, y, 189, y + 0.12, 0.07, M.lineYellow);
      // dispatch office (glass)
      // dispatch office by the personnel door
      b.box(150.8, 22.4, 0, 7, 7, 0.1, M.desk);
      K.desk(b, 152.0, 23.4, 0, { rot: 0 });
      K.desk(b, 154.6, 23.4, 0, { rot: 0 });
      b.box(157.72, 22.4, 0, 0.08, 7, 3, M.glass);
      b.box(150.8, 22.4, 0, 7, 0.08, 3, M.glass);
      b.box(150.8, 22.4, 3, 7, 7.3, 0.12, M.wallMid);
      K.cartons(b, 180, 4.6, 2);
      K.cartons(b, 183, 4.6, 3, { wrap: true });
      K.cartons(b, 180, 16.6, 1);
      K.person(b, 186.5, 19.6, 0, { rot: 1.2 });
      K.person(b, 178.5, 9.3, 0, { rot: -0.4 });
    });
    B.tagged('freight', (b) => {
      b.box(150, 29.7, 0, 40, 0.3, 10, sm('clad'));
      b.box(189.7, 2, 0, 0.3, 27.7, 10, sm('clad'));
      b.box(149.8, 1.8, 10, 40.4, 28.4, 0.45, sm('roof'));
      b.box(150, 30.0, 9.4, 40, 0.12, 0.6, sm('trim'));
      b.box(190.0, 2, 9.4, 0.12, 28, 0.6, sm('trim'));
      for (let i = 0; i < 5; i++) b.box(152, 3.6 + i * 5.2, 10.5, 36, 3.2, 0.25, sm('solar'));
      [[3.6, 7.6], [9.6, 13.6], [15.6, 19.6], [21.6, 25.6]].forEach(([a, c], i) => {
        b.box(190.0, a - 0.5, 0, 0.5, c - a + 1, 5.0, sm('darkSteel'));
        b.box(190.3, a, 1.0, 0.25, c - a, 3.5, sm('dockDark'));
        b.box(190.3, a + 1.2, 5.2, 0.3, c - a - 2.4, 0.3, i === 3 ? sm('ledGreen') : sm('amber'));
        b.box(190.5, a - 0.6, 0, 0.6, 0.35, 1.2, sm('yellow'));
        b.box(190.5, c + 0.25, 0, 0.6, 0.35, 1.2, sm('yellow'));
      });
      b.box(153, 30.0, 0, 1.2, 0.08, 2.4, sm('door'));
      b.box(163.2, 30.0, 0, 6, 0.08, 4.6, sm('dockDark'));
      b.box(163.0, 30.0, 4.6, 6.4, 0.3, 0.5, sm('darkSteel'));
      K.windows(b, 'y', 30.05, 170, 188, 6.5, 7.8, 2.4, 1.8, 0.6, { mat: sm('winDark') });
    });
  }
  miniBox(150, 2, 190, 30, 10);
  // trucks at the docks
  B.tagged('freight', (b) => {
    b.within(190.6, 4.3, 0, 0, (q) => K.truck(q, { len: 9.6 }));
    b.within(190.6, 10.3, 0, 0, (q) => K.truck(q, { len: 9.6, cab: M.slate }));
    b.within(190.6, 22.3, 0, 0, (q) => K.truck(q, { len: 9.6, cab: M.teal, open: true }));
    K.person(b, 192, 28.2, 0, { rot: 0.5 });
    K.lampPost(b, 201, 1, 9, Math.PI * 0.6);
    K.lampPost(b, 201, 31.5, 9, -Math.PI * 0.6);
    for (const x of [192, 196, 200]) K.bollard(b, x, 30.6);
  });
  {
    const tk = part(dyn, 190.6, 16.3, 0);
    tagPart(tk.g, 'freight', 'docks');
    K.truck(tk.s, { len: 9.6, cab: M.amber, stripe: M.orange });
    addMachine('dock', 7, (p) => {
      // pull out across the road, pause, then back in
      const out = p < 0 ? 0 : p < 0.45 ? smooth(p / 0.45) : p < 0.55 ? 1 : smooth(1 - (p - 0.55) / 0.45);
      tk.g.position.x = 190.6 + out * 13;
    });
  }
  // parcel room
  B.tagged('freight', (b) => {
    b.box(176, 34, 0, 22, 10, 5, M.wall);
    b.box(175.8, 33.8, 5, 22.4, 10.4, 0.3, M.roof);
    for (const x of [179, 189]) {
      b.box(x, 43.98, 0, 5, 0.06, 3.6, M.shutter);
      b.box(x - 0.2, 43.95, 3.6, 5.4, 0.12, 0.3, M.darkSteel);
    }
    b.box(186, 43.98, 0, 1.4, 0.06, 2.4, M.door);
    b.box(176, 43.98, 4.4, 22, 0.1, 0.4, M.trim);
    K.windows(b, 'x', 198.03, 35, 43, 2, 3.6, 1.8, 1.2, 0.7);
    for (let i = 0; i < 3; i++) {
      b.box(177 + i * 1.6, 44.8, 0, 1.3, 1.3, 1.7, M.glass);
      b.box(177.2 + i * 1.6, 45, 0, 0.9, 0.9, 0.7, M.cardboard);
      b.box(177.25 + i * 1.6, 45.05, 0.7, 0.8, 0.8, 0.45, M.cardboard);
    }
    b.within(186, 44.8, 0, 0, (q) => K.van(q, { stripe: M.orange }));
    K.person(b, 184.5, 46.6, 0, { rot: 0.3 });
  });
  miniBox(176, 34, 198, 44, 5);

  // =====================================================================
  // PRODUCTION HALL (open roof): the assembly line itself is built in line.js
  openHall(44, 34, 126, 88, 11, { doors: [['y0', 56, 63, 4.8]], gaps: [['x1', 37.6, 41.0, 1.4]] });
  B.tagged('mro', (b) => {
    b.box(106, 46, 0, 19.4, 0.3, 3, M.wallInner);
    b.box(106, 46.3, 0, 0.3, 41.1, 3, M.wallInner);
    b.plane(106.3, 46.3, 125.4, 87.4, 0.07, M.apron);
    K.shelf(b, 108, 48.5, 0, 15, 1.2, 3, 4, [M.blue, M.red, M.amber, M.teal, M.slate, M.white]);
    K.shelf(b, 108, 52.4, 0, 15, 1.2, 3, 4, [M.blue, M.red, M.amber, M.teal, M.slate, M.white]);
    // lubricant station
    b.box(113, 60, 0, 9, 1.8, 0.3, M.darkSteel);
    const lub = [M.green, M.blue, M.amber, M.blue, M.red];
    lub.forEach((m, i) => K.drum(b, 114 + i * 1.7, 60.9, 0.3, m, 0.6, 1.4));
    for (let i = 0; i < 5; i++) b.cyl(114 + i * 1.7, 60.9, 1.7, 0.06, 0.8, M.steel, { seg: 6 });
    // belts rack
    b.box(107.4, 67.4, 0, 4.6, 0.3, 3, M.wood);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const g = new THREE.TorusGeometry(0.45, 0.06, 6, 20);
      g.translate(108.3 + i * 1.4, 0.9 + j * 1.2, 67.8);
      b.geo(g, M.rubber);
    }
    // workbench, tools
    b.box(114, 72, 0, 8, 2.4, 1.0, M.steel);
    b.box(114, 72, 1.0, 8, 2.4, 0.08, M.wood);
    b.box(115, 72.5, 1.08, 1, 0.8, 0.5, M.slate);
    b.box(119, 72.6, 1.08, 2, 1, 0.3, M.red);
    b.box(114, 71.7, 1.1, 8, 0.1, 2, M.darkSteel);
    for (let k = 0; k < 10; k++) b.box(114.4 + k * 0.75, 71.8, 1.9 + (k % 3) * 0.3, 0.1, 0.05, 0.5, M.chrome);
    b.box(108, 78, 0, 2, 1.2, 2.2, M.red);
    b.box(110.4, 78, 0, 2, 1.2, 2.2, M.red);
    for (let k = 0; k < 4; k++) b.box(108.05, 79.2, 0.3 + k * 0.5, 1.9, 0.03, 0.04, M.chrome);
    K.cartons(b, 114, 80, 1, { w: 2 });
    K.person(b, 111, 57.5, 0, { rot: 0.4 });
  });
  B.tagged('uniforms', (b) => {
    b.box(44.6, 66, 0, 17.4, 0.3, 3, M.wallInner);
    b.box(61.6, 66.3, 0, 0.3, 21.1, 1.2, M.wallInner);
    b.plane(44.6, 66.3, 61.6, 87.4, 0.07, M.epoxy);
    K.lockers(b, 46, 66.4, 14);
    b.box(47, 71.5, 0, 12, 0.6, 0.45, M.wood);
    K.lockers(b, 46, 75.5, 12);
    b.box(46, 76.0, 0, 12, 0.1, 1.9, M.cladBlue);
    // garment rail with hanging workwear
    b.box(47, 80.4, 0, 0.1, 0.1, 2.4, M.steel);
    b.box(58, 80.4, 0, 0.1, 0.1, 2.4, M.steel);
    b.cyl(47, 80.45, 2.3, 0.04, 11.1, M.chrome, { axis: 'x', seg: 6 });
    for (let k = 0; k < 18; k++) {
      const m = k % 4 === 1 ? M.hiVis : k % 3 ? M.blue : M.navy;
      b.box(47.4 + k * 0.58, 80.25, 1.1, 0.42, 0.4, 1.15, m);
    }
    b.box(57.6, 82.8, 0.25, 1.8, 1.2, 1.1, M.slate);
    b.box(57.75, 82.9, 1.35, 1.5, 1, 0.3, M.offWhite);
    K.person(b, 50, 84, 0, { hat: false, rot: 1 });
    K.person(b, 53, 73.5, 0, { hat: false, rot: -0.6, vest: false });
  });
  B.tagged('cleaning', (b) => {
    b.box(63, 76, 0, 9, 0.3, 3, M.wallInner);
    b.box(63, 76.3, 0, 0.3, 11.1, 3, M.wallInner);
    b.box(71.6, 76.3, 0, 0.3, 11.1, 1.2, M.wallInner);
    b.plane(63.3, 76.3, 71.6, 87.4, 0.07, M.epoxy);
    K.shelf(b, 64, 77, 0, 6, 1.0, 2.4, 3, [M.white, M.blue, M.teal, M.offWhite]);
    b.box(65, 81, 0, 2, 1.2, 1.2, M.blue);
    b.box(65.2, 81.1, 1.2, 0.8, 0.8, 0.5, M.white);
    b.cyl(69.5, 82, 0, 0.45, 0.8, M.yellow, { seg: 14 });
    b.cyl(69.5, 82, 0.8, 0.03, 1.4, M.chrome, { seg: 6 });
    K.person(b, 70.5, 84.5, 0, { suit: M.suit[1], hat: 'white', rot: 2.4 });
    b.cbox(74, 89.6, 0, 3.2, 1.8, 0.04, M.rubber, { cast: false });
    b.cbox(74, 89.6, 0.04, 2.8, 0.15, 0.01, M.amber, { cast: false });
  });
  B.tagged('labor', (b) => {
    b.box(80, 70.4, 0.5, 10, 0.2, 2.6, M.white);
    b.box(80.2, 70.6, 0, 0.12, 0.12, 0.5, M.steel);
    b.box(89.7, 70.6, 0, 0.12, 0.12, 0.5, M.steel);
    const cols = [M.amber, M.teal, M.blue];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) b.box(80.6 + i * 1.9, 70.62, 0.9 + j * 0.7, 1.2, 0.03, 0.45, cols[(i + j) % 3], { cast: false });
    [[81, 74.5], [83.2, 75.6], [85.6, 74.8], [88, 75.8], [90, 74.4]].forEach(([x, y]) => K.person(b, x, y, 0, { rot: -Math.PI / 2 + (K.rand() - 0.5) }));
    K.person(b, 86, 78, 0, { suit: M.suit[4], hat: 'white', rot: -Math.PI / 2 });
  });
  miniBox(44, 34, 126, 88, 11, 'h');
  // overhead gantry crane rolling along the hall
  {
    const crane = part(dyn, 60, 34.6, 9.4);
    crane.s.box(-0.5, 0, 0, 1, 52.8, 0.8, M.yellow);
    crane.s.box(-0.7, 0, -0.3, 1.4, 1.2, 1.2, M.darkSteel);
    crane.s.box(-0.7, 51.6, -0.3, 1.4, 1.2, 1.2, M.darkSteel);
    const trolley = part(crane.g, 0, 20, -0.4);
    trolley.s.box(-0.8, -0.8, -0.4, 1.6, 1.6, 0.5, M.darkSteel);
    trolley.s.cyl(0, 0, -3.4, 0.03, 3, M.chrome, { seg: 4 });
    trolley.s.box(-0.3, -0.3, -3.8, 0.6, 0.6, 0.4, M.yellow);
    ambient((t) => {
      crane.g.position.x = 75 + Math.sin(t * 0.07) * 26;
      trolley.g.position.z = 26 + Math.sin(t * 0.11) * 18;
    });
  }
  // scrubber
  {
    const sc = part(dyn, 64, 62.4, 0);
    tagPart(sc.g, 'cleaning', 'floorcare');
    sc.s.box(0, 0, 0.2, 2.4, 1.5, 0.9, M.amber);
    sc.s.box(1.4, 0.2, 1.1, 0.8, 1.1, 0.25, M.rubber);
    sc.s.box(2.2, 0.3, 1.1, 0.12, 0.9, 0.8, M.darkSteel);
    sc.s.cyl(-0.05, 0.75, 0.1, 0.5, 0.2, M.darkSteel, { seg: 16 });
    sc.s.cyl(0.8, 1.6, 0.3, 0.2, 0.15, M.rubber, { axis: 'y', seg: 12 });
    sc.s.cyl(0.8, -0.1, 0.3, 0.2, 0.15, M.rubber, { axis: 'y', seg: 12 });
    K.person(sc.s, 1.6, 0.75, 0.9, { suit: M.suit[1], hat: 'white' });
    sc.s.cyl(2.0, 0.75, 1.95, 0.08, 0.15, M.beacon, { seg: 8 });
    const wet = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.4), new THREE.MeshStandardMaterial({ color: '#bfe0ff', roughness: 0.02, metalness: 0.6, transparent: true, opacity: 0 }));
    wet.rotation.x = -Math.PI / 2;
    wet.position.set(64, 0.09, 63.15);
    dyn.add(wet);
    addMachine('scrubber', 9, (p) => {
      const d = p < 0 ? 0 : p < 0.5 ? smooth(p / 0.5) : smooth(1 - (p - 0.5) / 0.5);
      sc.g.position.x = 64 + d * 30;
      sc.g.rotation.y = p >= 0.5 ? Math.PI : 0;
      if (p >= 0.5) sc.g.position.x += 2.4;
      const len = Math.max(0.01, d * 30);
      wet.scale.x = len;
      wet.position.x = 64 + len / 2;
      wet.material.opacity = p < 0 ? 0 : 0.55 * env(p, 0.1);
    });
  }
  // vending machine (item drops when started)
  {
    B.tagged('mro', (b) => {
      b.box(107.6, 59.8, 0, 2.4, 1.6, 3.4, M.darkSteel);
      b.box(107.85, 61.38, 1.2, 1.9, 0.05, 2, M.glass);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) b.box(107.95 + c * 0.45, 60.9, 1.35 + r * 0.45, 0.3, 0.35, 0.25, [M.amber, M.blue, M.white, M.red][(r + c) % 4]);
      b.box(108.2, 61.39, 0.3, 1.2, 0.04, 0.6, M.dockDark);
      b.box(109.5, 61.39, 2.4, 0.35, 0.04, 0.5, M.screen, { cast: false });
    });
    const item = part(dyn, 108.8, 61.0, 2.2);
    item.s.box(-0.15, -0.15, 0, 0.3, 0.3, 0.25, M.amber);
    item.g.visible = false;
    tagPart(item.g, 'mro', 'vending');
    addMachine('vending', 3, (p) => {
      item.g.visible = p >= 0;
      const f = clamp01(p / 0.6);
      item.g.position.y = 2.2 - f * f * 1.7;
      item.g.position.z = 61.0 + (p > 0.6 ? (p - 0.6) * 1.2 : 0);
    });
  }

  // =====================================================================
  // PACKAGING HALL (open) + pallet yard
  openHall(130, 34, 170, 88, 9, { doors: [['y0', 163.7, 168.7, 4.8]], gaps: [['x0', 37.9, 40.7, 2.0]] });
  B.tagged('packaging', (b) => {
    b.box(131, 41.6, 0, 3, 3, 1.6, M.sheet);
    for (let z = 0.2; z < 1.6; z += 0.12) b.box(131, 41.58, z, 3, 0.04, 0.02, M.cardboard, { cast: false });
    // corrugated store
    for (const [x, y] of [[133, 50.5], [137, 50.5], [141, 50.5], [145, 50.5], [133, 55.5], [137, 55.5], [141, 55.5]]) {
      const hh = 1.4 + K.rand() * 1.4;
      K.pallet(b, x, y, 0, 3.2, 3.2);
      b.box(x + 0.1, y + 0.1, 0.13, 3, 3, hh, M.sheet);
      for (let z = 0.3; z < hh; z += 0.18) b.box(x + 0.08, y + 0.08, 0.13 + z, 3.04, 3.04, 0.02, M.cardboard, { cast: false });
    }
    // stretch film rolls and strapping coils on pallets by the wrapper
    for (const [px, py] of [[151.2, 50.4], [153.0, 50.4], [151.2, 52.2]]) {
      K.pallet(b, px, py, 0, 1.3, 1.3);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) b.cyl(px + 0.2 + i * 0.3, py + 0.2 + j * 0.3, 0.13, 0.13, 0.5, M.filmRoll, { seg: 12 });
    }
    K.pallet(b, 155.0, 50.4, 0, 1.3, 1.3);
    for (let k = 0; k < 3; k++) {
      const g = new THREE.TorusGeometry(0.42, 0.1, 8, 20);
      g.rotateX(Math.PI / 2);
      g.translate(155.65, 0.24 + k * 0.2, 51.05);
      b.geo(g, M.rubber);
    }
    b.box(152, 62, 0, 14, 3, 1, M.desk);
    b.box(153, 62.6, 1, 1.4, 1.4, 1, M.cardboard);
    b.box(155.4, 62.8, 1, 1, 1, 0.7, M.cardboard);
    b.box(158, 62.5, 1, 1.8, 1.6, 0.5, M.sheet);
    b.box(161, 62.8, 1, 1.2, 0.6, 0.6, M.screen);
    K.person(b, 156, 65.6, 0, { suit: M.suit[4], hat: 'white', rot: -Math.PI / 2 });
    // containers & totes
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const x = 133 + i * 3;
      const y = 74 + j * 3;
      b.box(x, y, 0, 2.4, 2.4, 0.3, M.darkSteel);
      b.box(x + 0.1, y + 0.1, 0.3, 2.2, 2.2, 2, M.offWhite);
      for (const zz of [0.9, 1.6, 2.3]) b.box(x + 0.05, y + 0.05, zz, 2.3, 2.3, 0.05, M.steel, { cast: false });
      b.cyl(x + 1.2, y + 1.2, 2.3, 0.3, 0.1, M.blue, { seg: 10 });
    }
    for (let i = 0; i < 5; i++) K.drum(b, 143.5 + i * 1.3, 75, 0, M.blue, 0.55, 1.3);
    for (let i = 0; i < 4; i++) K.drum(b, 143.5 + i * 1.3, 77, 0, M.green, 0.55, 1.3);
    // pallet yard
    [[173, 50, 7], [176, 50, 5], [179, 50, 8], [173, 53.4, 6], [176, 53.4, 4]].forEach(([x, y, n]) => K.palletPile(b, x, y, n));
    [[182, 50, 3, true], [185, 50, 2], [188, 50, 3], [182, 53.4, 2, true], [185, 53.4, 3], [191, 50, 2, true], [173, 58, 2], [176, 58, 3, true], [180.4, 61, 2], [184, 61, 1], [188, 58, 3], [192, 58, 2]].forEach(([x, y, l, w]) => K.cartons(b, x, y, l, { wrap: w }));
    K.person(b, 186, 66, 0, { rot: 0.8 });
  });
  B.tagged('facility', (b) => {
    b.box(196, 78.5, 0, 1.2, 8.5, 2.2, M.slate);
    for (const y of [79.5, 82.5, 85.5]) {
      b.box(195.95, y, 1.2, 0.05, 0.6, 0.4, M.screen, { cast: false });
      b.box(195.95, y + 0.8, 1.6, 0.05, 0.2, 0.2, M.ledGreen, { cast: false });
    }
    for (const y of [79, 82, 85]) b.plane(188.5, y - 0.1, 195.5, y + 0.05, 0.06, M.lineYellow);
  });
  B.tagged('', (b) => {
    K.lampPost(b, 199, 66, 8, Math.PI);
  });
  miniBox(130, 34, 170, 88, 9, 'h');
  // the connected line: production → packaging → outbound
  buildLine({ B, dyn, ambient, tagPart });

  // =====================================================================
  // WASTE & RECYCLING
  B.tagged('waste', (b) => {
    b.box(3, 53, 0, 10, 8, 3.2, M.gray);
    b.box(4, 54, 3.2, 5, 6, 1.6, M.darkSteel);
    b.box(3, 61.0, 2.4, 10, 0.06, 0.3, M.amber);
    b.box(10, 61.02, 0.8, 1.2, 0.05, 0.8, M.screen, { cast: false });
    b.box(13.2, 53.4, 0, 13.8, 6.6, 3.4, M.green);
    for (let x = 14; x < 27; x += 1.3) b.box(x, 60.0, 0.3, 0.12, 0.06, 2.8, M.darkSteel);
    b.box(13.2, 53.4, 3.4, 13.8, 6.6, 0.15, M.darkSteel);
    b.box(3, 65, 0, 7, 6, 4.2, M.blue);
    b.box(3.6, 65.6, 4.2, 5.8, 4.8, 1.2, M.steel);
    b.box(9.8, 66.5, 2.2, 0.05, 1.0, 0.8, M.screen, { cast: false });
    for (let i = 0; i < 3; i++) {
      const x = 13 + i * 2.4;
      b.box(x, 66, 0, 2.2, 3.4, 2.2, M.sheet);
      for (const z of [0.7, 1.5]) b.box(x - 0.02, 65.98, z, 2.24, 3.44, 0.05, M.rubber, { cast: false });
    }
    [[23, M.green], [28.5, M.blue], [34, M.gray]].forEach(([x, m]) => {
      b.box(x, 64, 0.15, 4.5, 3, 2.1, m);
      b.box(x - 0.1, 63.9, 2.25, 4.7, 3.2, 0.12, M.darkSteel, { tilt: 0 });
      b.box(x + 1.4, 67.0, 0.8, 1.7, 0.05, 0.8, M.white, { cast: false });
      for (const dx of [0.4, 4.1]) b.cyl(x + dx, 64.6, 0.15, 0.15, 0.12, M.rubber, { axis: 'y', seg: 10 });
    });
    // hook-lift truck with roll-off container
    b.within(18, 78, 0, 0, (q) => {
      q.box(0, 0.1, 0.6, 12, 2.6, 0.45, M.darkSteel);
      q.box(0.3, 0.1, 1.05, 11, 2.6, 2.5, M.gray);
      for (let x = 1; x < 11; x += 1.2) q.box(0.3 + x, 2.71, 1.1, 0.12, 0.05, 2.4, M.darkSteel);
      q.box(12.1, 0.2, 0.5, 2.9, 2.4, 2.9, M.green);
      q.box(14.98, 0.4, 1.9, 0.05, 2.0, 1.0, M.winDark);
      q.box(15.0, 0.3, 0.75, 0.05, 0.4, 0.2, M.lampHead, { cast: false });
      q.box(15.0, 2.2, 0.75, 0.05, 0.4, 0.2, M.lampHead, { cast: false });
      for (const x of [1.5, 3, 13.4]) {
        q.cyl(x, 0.0, 0.55, 0.55, 0.4, M.rubber, { axis: 'y', seg: 16 });
        q.cyl(x, 2.8, 0.55, 0.55, 0.4, M.rubber, { axis: 'y', seg: 16 });
      }
    });
    b.box(3, 78, 0, 6, 8, 3, M.yellow);
    b.box(3.5, 85.98, 0.4, 5, 0.05, 2.2, M.orange);
    b.box(5.4, 86.0, 2.0, 1.2, 0.04, 0.8, M.rubber, { cast: false });
    K.person(b, 20, 74, 0, { suit: M.suit[1], rot: 0.5 });
    K.person(b, 10, 62.6, 0, { rot: -1 });
    K.lampPost(b, 38, 50, 8, Math.PI * 0.75);
  });
  miniBox(3, 53, 36, 86, 3, 'w');
  // compactor ram
  {
    const ram = part(dyn, 11, 57.3, 0.6);
    ram.s.box(-1.4, -2.3, 0, 1.4, 4.6, 2.0, M.steel);
    ram.s.box(-4, -0.25, 0.8, 2.6, 0.5, 0.5, M.chrome);
    tagPart(ram.g, 'waste', 'compactor');
    addMachine('compactor', 6, (p) => {
      const cyc = p < 0 ? 0 : (1 - Math.cos(clamp01(p) * Math.PI * 6)) / 2;
      ram.g.position.x = 11 + cyc * 2.0;
    });
  }
  // baler press + bale ejection
  {
    const press = part(dyn, 6.5, 68, 3.8);
    press.s.box(-2.5, -2, 0, 5, 4, 0.4, M.amber);
    press.s.cyl(0, 0, 0.4, 0.25, 2, M.chrome, { seg: 10 });
    tagPart(press.g, 'waste', 'baler');
    const bale = part(dyn, 8.2, 66.3, 0);
    bale.s.box(0, 0, 0, 2.2, 3.4, 2.0, M.sheet);
    for (const z of [0.6, 1.4]) bale.s.box(-0.02, -0.02, z, 2.24, 3.44, 0.05, M.rubber, { cast: false });
    bale.g.visible = false;
    addMachine('baler', 6, (p) => {
      const down = p < 0 ? 0 : p < 0.5 ? (1 - Math.cos(clamp01(p / 0.5) * Math.PI * 4)) / 2 : 0;
      press.g.position.y = 3.8 - down * 2.4;
      bale.g.visible = p >= 0.5;
      bale.g.position.x = 8.2 + (p >= 0.5 ? smooth(clamp01((p - 0.5) / 0.35)) * 2.6 : 0);
    });
  }

  // =====================================================================
  // OFFICE TOWER: floors lift apart when opened
  const hqFloors = [];
  {
    const floorBuild = (f, fn) => {
      const g = new THREE.Group();
      root.add(g);
      const fb = new Builder();
      const z = f * 5;
      fb.tagged(fn.tag, (b) => {
        if (f < 5) {
          b.box(6, 98, z, 32, 26, 0.4, M.wallMid);
          b.plane(6.4, 98.4, 38, 124, z + 0.42, M.epoxy);
          b.box(6, 98, z + 0.4, 32, 0.4, 4.6, M.wallInner);
          b.box(6, 98.4, z + 0.4, 0.4, 25.6, 4.6, M.wallInner);
          K.windows(b, 'y', 98.42, 8, 36, z + 1.6, z + 4.2, 2.4, 1.8, 0.0);
          K.windows(b, 'x', 6.42, 100, 122, z + 1.6, z + 4.2, 2.4, 1.8, 0.0);
        }
        fn(b, z + 0.42);
      });
      for (const m of fb.flush(g)) m.receiveShadow = false;
      g.userData.floor = f;
      hqFloors.push(g);
      return g;
    };
    const F0 = (b, z) => {
      for (const y of [100.5, 104, 107.5, 111]) K.shelf(b, 9, y, z, 20, 1.4, 3.2, 4, [M.cardboard, M.white, M.offWhite]);
      b.box(32, 112, z, 1.6, 1.2, 2, M.navy);
      b.box(34.2, 112, z, 1.6, 1.2, 2, M.navy);
      b.box(32.3, 113.21, z + 1.6, 1, 0.03, 0.1, M.steel);
      b.box(34.5, 113.21, z + 1.6, 1, 0.03, 0.1, M.steel);
      b.box(20, 118, z, 6, 1.4, 1.1, M.desk);
      K.person(b, 22, 116.4, z, { hat: false, vest: false, suit: M.suit[4], rot: Math.PI / 2 });
      K.person(b, 30, 116, z, { hat: false, vest: false });
    };
    F0.tag = 'records';
    const F1 = (b, z) => {
      K.shelf(b, 8.5, 100.5, z, 10, 1.2, 3.2, 4, [M.white, M.blue, M.amber, M.teal, M.cardboard]);
      b.box(29.5, 99, z, 7, 1.6, 1.0, M.desk);
      b.box(34.8, 99, z + 1.0, 1.6, 1.6, 1.8, M.white);
      b.cyl(31, 99.8, z + 1.0, 0.35, 0.9, M.glass, { seg: 12 });
      for (const y of [111, 116]) for (const x of [9, 13, 17, 21]) K.desk(b, x, y, z, { person: K.rand() < 0.6 });
      K.person(b, 29, 105, z, { hat: false, vest: false, rot: 1 });
    };
    F1.tag = 'office';
    const F2 = (b, z) => {
      for (const y of [111, 116]) for (const x of [9, 13, 17]) K.desk(b, x, y, z, { person: K.rand() < 0.7 });
      b.box(26, 110, z + 0.7, 9, 4, 0.06, M.desk);
      for (const [x, y] of [[26.4, 110.4], [34.4, 110.4], [26.4, 113.4], [34.4, 113.4]]) b.box(x, y, z, 0.15, 0.15, 0.7, M.darkSteel);
      for (let i = 0; i < 4; i++) {
        K.person(b, 27.5 + i * 2, 109.2, z, { hat: false, vest: false, rot: Math.PI / 2 });
        K.person(b, 27.5 + i * 2, 114.8, z, { hat: false, vest: false, rot: -Math.PI / 2 });
      }
      b.box(28, 98.42, z + 1.2, 6, 0.05, 2.6, M.screen, { cast: false });
      for (let i = 0; i < 5; i++) b.box(9 + i * 2, 99, z, 1.6, 1.0, 2.4, M.slate);
    };
    F2.tag = 'insurance';
    const F3 = (b, z) => {
      for (const y of [100.6, 105]) for (let i = 0; i < 7; i++) K.serverRack(b, 8.6 + i * 1.5, y, z, 2.6);
      b.box(20.5, 100.6, z, 2, 1.1, 2.6, M.white);
      for (let k = 0; k < 6; k++) b.box(20.7, 101.71, z + 0.4 + k * 0.35, 1.6, 0.03, 0.15, M.steel);
      for (const x of [27, 31]) K.desk(b, x, 101, z, {});
      for (const y of [112, 116.5]) for (const x of [9, 13, 17, 21]) K.desk(b, x, y, z, { person: K.rand() < 0.6 });
      b.plane(8, 99.5, 23, 107, z + 0.01, M.darkSteel);
    };
    F3.tag = 'it';
    const F4 = (b, z) => {
      b.box(9, 100.5, z, 2.6, 1.2, 3.4, M.serverBody);
      b.box(12, 100.5, z, 1.6, 1.2, 3.4, M.serverBody);
      for (let k = 0; k < 10; k++) b.box(9.2 + (k % 5) * 0.45, 101.71, z + 0.8 + Math.floor(k / 5) * 1.0, 0.15, 0.03, 0.1, M.ledGreen, { cast: false });
      b.box(21, 98.42, z + 1.2, 10, 0.05, 2.6, M.screen, { cast: false });
      b.box(19, 109, z + 0.7, 14, 6, 0.06, M.desk);
      for (const [x, y] of [[19.4, 109.4], [32.4, 109.4], [19.4, 114.4], [32.4, 114.4]]) b.box(x, y, z, 0.15, 0.15, 0.7, M.darkSteel);
      b.cyl(26, 112, z + 0.76, 0.5, 0.12, M.darkSteel, { seg: 16 });
      for (let i = 0; i < 5; i++) {
        K.person(b, 20.5 + i * 2.7, 107.8, z, { hat: false, vest: false, rot: Math.PI / 2 });
        if (i % 2) K.person(b, 20.5 + i * 2.7, 116.2, z, { hat: false, vest: false, rot: -Math.PI / 2 });
      }
    };
    F4.tag = 'telecom';
    const ROOF = (b) => {
      b.box(6, 98, 25, 32, 26, 0.5, M.roof);
      b.box(6, 98, 25.5, 32, 0.3, 0.8, M.trim);
      b.box(6, 98, 25.5, 0.3, 26, 0.8, M.trim);
      b.box(6, 123.7, 25.5, 32, 0.3, 0.8, M.trim);
      b.box(37.7, 98, 25.5, 0.3, 26, 0.8, M.trim);
      K.hvac(b, 11, 101, 25.5, 5, 4, 1.8);
      K.hvac(b, 18, 101, 25.5, 5, 4, 1.8);
      b.cyl(32, 104, 25.5, 0.25, 12, M.steel, { seg: 10 });
      for (const z of [29, 32, 35]) b.cbox(32, 104, z, 1.6, 0.1, 0.1, M.steel);
      b.box(31.5, 104.5, 30.5, 0.3, 0.3, 1.6, M.white);
      b.box(32.5, 103.2, 32.5, 0.3, 0.3, 1.6, M.white);
      const dish = new THREE.SphereGeometry(0.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3);
      dish.rotateZ(Math.PI / 2);
      dish.translate(33, 30.5, 104);
      b.geo(dish, M.white);
      b.cyl(32, 104, 37.4, 0.18, 0.3, M.beaconRed, { seg: 8, cast: false });
    };
    ROOF.tag = 'telecom';
    [F0, F1, F2, F3, F4, ROOF].forEach((fn, i) => floorBuild(i, fn));
    // HQ roof fans
    const fans = [];
    for (const x of [13.5, 20.5]) {
      const f = part(hqFloors[5], x, 103, 27.35);
      K.fanBlades(f.s, 1.3);
      fans.push(f.g);
    }
    ambient((t, dt) => fans.forEach((f) => (f.rotation.y += dt * 5)));
    // copier on the office floor
    {
      const z = 5.42;
      const g = hqFloors[1];
      const cs = part(g, 0, 0, 0).s;
      cs.box(24, 101.5, z, 3.2, 2.2, 1.9, M.white);
      cs.box(24, 101.5, z + 1.9, 3.2, 2.2, 0.25, M.slate);
      cs.box(24.4, 103.71, z + 1.3, 1.2, 0.03, 0.4, M.screen, { cast: false });
      const sheets = [];
      for (let k = 0; k < 3; k++) {
        const pg = part(g, 27.2, 102.1, z + 1.4 + k * 0.03);
        pg.s.box(0, 0, 0, 1.2, 1.0, 0.02, M.white, { cast: false });
        pg.g.visible = false;
        sheets.push(pg.g);
      }
      addMachine('copier', 4, (p) => {
        sheets.forEach((sh, k) => {
          const q = clamp01((p - k * 0.2) / 0.4);
          sh.visible = p >= 0 && q > 0;
          sh.position.x = 27.2 + q * 1.4;
        });
      });
    }
    // facade (fades when the tower opens)
    const sm = shell('hq');
    B.tagged('it', (b) => {
      b.box(6, 123.75, 0, 32, 0.25, 25, sm('wall'));
      b.box(37.75, 98, 0, 0.25, 26, 25, sm('wall'));
      for (let f = 0; f < 5; f++) {
        const z = f * 5;
        for (let x = 7; x + 1.2 <= 37.4; x += 1.6) b.box(x, 124.0, z + 1.3, 1.2, 0.06, 2.6, K.rand() < 0.35 ? sm('winLit') : sm('winDark'));
        for (let y = 99; y + 1.2 <= 123.4; y += 1.6) b.box(38.0, y, z + 1.3, 0.06, 1.2, 2.6, K.rand() < 0.35 ? sm('winLit') : sm('winDark'));
        b.box(6, 124.0, z + 4.75, 32, 0.12, 0.25, sm('trim'));
        b.box(38.0, 98, z + 4.75, 0.12, 26, 0.25, sm('trim'));
      }
      b.box(20, 124.05, 0, 5, 0.06, 3, sm('glass'));
    });
    B.tagged('records', (b) => {
      b.box(19.6, 124, 2.8, 5.8, 2.2, 0.35, M.amber);
      b.box(19.8, 125.9, 0, 0.15, 0.15, 2.8, M.steel);
      b.box(25.05, 125.9, 0, 0.15, 0.15, 2.8, M.steel);
      b.box(40, 118, 0, 1.4, 2, 2.2, M.slate);
      b.box(41.42, 118.4, 1.4, 0.03, 1.2, 0.4, M.ledGreen, { cast: false });
      b.within(8, 127, 0, 0, (q) => K.van(q, { stripe: M.blue }));
      b.within(18, 127, 0, 0, (q) => K.van(q, { stripe: M.orange }));
      K.person(b, 26, 129, 0, { suit: M.suit[4], rot: 2 });
      K.person(b, 15.6, 125.4, 0, { hat: false, vest: false });
      [[4, 134], [10, 140], [17, 136], [26, 142], [34, 135], [39, 145], [5, 146]].forEach(([x, y], i) => K.tree(b, x, y, i % 2 ? 1.1 : 1.4));
      for (let x = 8; x < 40; x += 4) K.shrub(b, x, 131.5, 0.55);
      K.lampPost(b, 30, 127.5, 6, Math.PI);
    });
  }
  miniBox(6, 98, 38, 124, 25);

  // =====================================================================
  // PARKING
  B.tagged('', (b) => {
    const bodies = [M.white, M.slate, M.blue, M.gray, M.red, M.white, M.navy];
    for (const [y0, rot] of [[99.6, Math.PI / 2], [108.4, -Math.PI / 2], [125.6, Math.PI / 2], [134.4, -Math.PI / 2]]) {
      for (let x = 44.4; x < 96; x += 2.6) {
        if (K.rand() < 0.38) continue;
        if (rot > 0) b.within(x + 1.8, y0, 0, rot, (q) => K.car(q, { body: K.pick(bodies) }));
        else b.within(x, y0 + 3.8, 0, rot, (q) => K.car(q, { body: K.pick(bodies) }));
      }
    }
    for (const [x, y] of [[56, 117], [84, 117], [56, 143], [84, 143]]) K.lampPost(b, x, y, 7.5, Math.PI / 4);
  });
  miniBox(43, 95, 97, 148, 0.5, 'p');

  // =====================================================================
  // STAFFING OFFICE, TURNSTILES, GATEHOUSE
  B.tagged('labor', (b) => {
    b.box(101, 98, 0.5, 12, 6, 2.9, M.white);
    b.box(100.8, 97.8, 3.4, 12.4, 6.4, 0.2, M.wallMid);
    K.windows(b, 'y', 104.03, 102, 112, 1.6, 2.8, 2, 1.4, 0.7);
    b.box(106, 104.0, 0.5, 1.2, 0.06, 2.3, M.door);
    b.box(101, 104.0, 3.0, 12, 0.08, 0.3, M.amber);
    b.box(105.6, 104, 0, 2, 1.2, 0.5, M.steel);
    for (const x of [101.5, 112.2]) for (const y of [98.3, 103.4]) b.box(x, y, 0, 0.3, 0.3, 0.5, M.darkSteel);
    [[114.5, 100], [116, 101.5], [114.8, 103]].forEach(([x, y]) => K.person(b, x, y, 0, { hat: false, rot: Math.PI }));
  });
  miniBox(101, 98, 113, 104, 3.4);
  B.tagged('security', (b) => {
    K.fence(b, [[100, 126], [109.6, 126]], 2.2);
    K.fence(b, [[118.8, 126], [128, 126]], 2.2);
    for (let x = 110; x <= 118; x += 2) {
      b.box(x, 125.6, 0, 0.6, 0.8, 1.15, M.steel);
      b.box(x + 0.15, 126.41, 0.95, 0.3, 0.02, 0.1, M.ledGreen, { cast: false });
    }
    b.box(103, 136, 0, 7, 7, 3.6, M.trim);
    K.windows(b, 'y', 143.03, 103.6, 109.6, 1.2, 3.0, 2, 1.6, 0.9);
    K.windows(b, 'x', 110.03, 136.6, 142.6, 1.2, 3.0, 2, 1.6, 0.9);
    b.box(104, 143.0, 0, 1.2, 0.06, 2.4, M.door);
    b.box(102.4, 135.4, 3.6, 8.2, 8.2, 0.45, M.navy);
    K.person(b, 108, 144.2, 0, { suit: M.suit[5], hat: false, vest: false, rot: Math.PI / 2 });
    b.box(111, 145, 0, 0.6, 0.6, 1.2, M.darkSteel);
    for (let i = 0; i < 6; i++) b.box(111.6 + i * 2.1, 145.15, 1, 2.1, 0.3, 0.22, i % 2 ? M.white : M.amber);
    const cam = (x, y, h, rot) => {
      b.cyl(x, y, 0, 0.1, h, M.darkSteel, { seg: 8 });
      b.within(x, y, h, rot, (q) => {
        q.cbox(0.35, 0, 0, 0.8, 0.3, 0.3, M.white);
        q.cbox(0.78, 0, 0, 0.06, 0.2, 0.2, M.winDark);
        q.cbox(0.2, 0, 0.18, 0.06, 0.06, 0.06, M.beaconRed, { cast: false });
      });
    };
    cam(99, 126, 7.6, Math.PI / 4);
    cam(127, 91, 7.6, Math.PI * 0.75);
    cam(199, 32, 7.6, -Math.PI * 0.75);
    cam(42, 93, 7.6, Math.PI / 4);
    b.within(117, 132, 0, Math.PI / 2, (q) => {
      K.car(q, { body: M.white });
      q.box(1.4, 0.3, 1.62, 0.9, 1.2, 0.18, M.beacon, { cast: false });
    });
    K.lampPost(b, 126, 148, 6.5, Math.PI * 1.25);
  });
  miniBox(103, 136, 110, 143, 4);
  // shift-change walkers through the turnstiles
  {
    const ws = [];
    [[111, 0], [113, 0.12], [115, 0.24], [117, 0.06], [112, 0.32]].forEach(([x, d]) => {
      const w = walker(dyn, x, 131, -Math.PI / 2);
      ws.push({ w, d, x });
      tagPart(w.g, 'security', 'access');
    });
    addMachine('turnstile', 7, (p, t) => {
      for (const { w, d } of ws) {
        const q = clamp01((p - d) / 0.55);
        const moving = p >= 0 && q > 0 && q < 1;
        w.g.position.z = 131 - smooth(q) * 13;
        w.g.visible = !(p >= 0 && q >= 1);
        w.swing(t, moving ? 1 : 0);
      }
    });
  }

  // =====================================================================
  // GROUNDS
  B.tagged('facility', (b) => {
    [[134, 98], [140, 104], [134, 132], [146, 142], [160, 98], [186, 100], [194, 112], [190, 140], [178, 146], [150, 128], [162, 138], [198, 128], [138, 116], [184, 118], [196, 97], [170, 101], [143, 124], [189, 129]].forEach(([x, y], i) => K.tree(b, x, y, i % 3 ? 1.2 : 1.6));
    const pond = new THREE.CircleGeometry(1, 48);
    pond.rotateX(-Math.PI / 2);
    pond.scale(9, 1, 6);
    pond.translate(174, 0.09, 126);
    b.geo(pond, M.water, { cast: false });
    const rim = new THREE.RingGeometry(1, 1.08, 48);
    rim.rotateX(-Math.PI / 2);
    rim.scale(9, 1, 6);
    rim.translate(174, 0.1, 126);
    b.geo(rim, M.offWhite, { cast: false });
    b.plane(131, 119.2, 165, 120.8, 0.08, M.apron);
    b.box(166, 119.6, 0, 3, 0.8, 0.45, M.wood);
    b.box(166, 120.3, 0.45, 3, 0.15, 0.6, M.wood);
    K.person(b, 160, 121.4, 0, { hat: false, vest: false });
    K.person(b, 167, 117.4, 0, { hat: false, vest: false, rot: 1.2 });
    for (const x of [50, 62, 78, 90, 102, 114, 136, 150, 164]) {
      b.box(x, 88.2, 0, 0.7, 0.5, 0.45, M.darkSteel);
      b.box(x + 0.2, 88.71, 0.15, 0.3, 0.02, 0.1, M.amber, { cast: false });
    }
    b.within(134, 90.4, 0, 0, (q) => K.van(q, { stripe: M.green }));
    b.within(46, 90.2, 0, 0, (q) => K.van(q, { stripe: M.blue }));
    K.person(b, 141, 92.2, 0, { suit: M.suit[1] });
    for (let x = 133; x < 198; x += 5) K.shrub(b, x, 94.2, 0.6);
    K.lampPost(b, 160, 120, 5.5, 0);
  });
  // mower leaves stripes as it goes
  {
    const mw = part(dyn, 146, 107.2, 0);
    tagPart(mw.g, 'facility', 'grounds');
    mw.s.box(0, 0, 0.25, 2.2, 1.8, 0.8, M.green);
    mw.s.box(1.4, 0.3, 1.05, 0.6, 1.2, 0.5, M.rubber);
    mw.s.box(-0.2, -0.1, 0.1, 2.6, 2.0, 0.2, M.darkSteel);
    for (const x of [0.4, 1.7]) {
      mw.s.cyl(x, -0.1, 0.35, 0.35, 0.25, M.rubber, { axis: 'y', seg: 12 });
      mw.s.cyl(x, 1.9, 0.35, 0.35, 0.25, M.rubber, { axis: 'y', seg: 12 });
    }
    K.person(mw.s, 1.6, 0.9, 0.9, { suit: M.suit[1] });
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), new THREE.MeshStandardMaterial({ color: '#7fd8a8', roughness: 1, transparent: true, opacity: 0 }));
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(146, 0.1, 108.1);
    dyn.add(stripe);
    addMachine('mower', 9, (p) => {
      const d = p < 0 ? 0 : p < 0.5 ? smooth(p / 0.5) : smooth(1 - (p - 0.5) / 0.5);
      mw.g.position.x = 146 + d * 26 + (p >= 0.5 ? 2.2 : 0);
      mw.g.rotation.y = p >= 0.5 ? Math.PI : 0;
      mw.g.position.z = 107.2 + (p >= 0.5 ? 2 : 0);
      const len = Math.max(0.01, (p < 0 ? 0 : p < 0.5 ? d : 1) * 26);
      stripe.scale.x = len;
      stripe.position.x = 146 + len / 2;
      stripe.material.opacity = p < 0 ? Math.max(0, stripe.material.opacity - 0.01) : 0.35;
    });
  }

  // =====================================================================
  // OFF-SITE: suppliers & customers
  B.tagged('', (b) => {
    b.box(224, -44, 0, 12, 9, 6, M.clad);
    b.box(223.8, -44.2, 6, 12.4, 9.4, 0.3, M.roof);
    for (const x of [226, 231]) b.box(x, -35.02, 0, 4, 0.06, 4, M.shutter);
    b.box(239, -44, 0, 9, 8, 4.5, M.wall);
    b.box(238.8, -44.2, 4.5, 9.4, 8.4, 0.3, M.roof);
    K.windows(b, 'y', -35.97, 239.6, 247.6, 1.6, 3.2, 1.6, 1.1, 0.6);
    K.container(b, 222, -30, 0, M.container[0]);
    K.container(b, 222, -30, 2.55, M.container[2]);
    K.container(b, 229, -30, 0, M.container[1]);
    b.within(238, -31, 0, 0, (q) => K.truck(q, { len: 8.6, cab: M.teal }));
    b.box(222, 92, 0, 10, 8, 5, M.wall);
    b.box(221.8, 91.8, 5, 10.4, 8.4, 0.3, M.roof);
    K.windows(b, 'y', 100.03, 223, 231, 1.4, 3.4, 1.6, 1.2, 0.8);
    b.box(222, 100, 2.8, 10, 1, 0.35, M.amber);
    b.box(236, 91, 0, 14, 10, 6.5, M.clad);
    b.box(235.8, 90.8, 6.5, 14.4, 10.4, 0.3, M.roof);
    for (const x of [238, 243.5]) b.box(x, 101.02, 0, 4, 0.06, 4, M.shutter);
    b.box(224, 106, 0, 7, 6, 3.4, M.wall);
    K.windows(b, 'y', 112.03, 224.6, 230.6, 1, 2.6, 1.4, 1, 0.8);
    b.within(236, 108, 0, 0, (q) => K.truck(q, { len: 8.6 }));
    [[234, 116], [246, 117], [220, 116]].forEach(([x, y]) => K.tree(b, x, y, 1.2));
    K.lampPost(b, 220, -12, 7, -Math.PI / 4);
    K.lampPost(b, 220, 90, 7, Math.PI / 4);
  });
  miniBox(222, -44, 248, -27, 5, 'o');
  miniBox(222, 91, 250, 112, 5, 'o');

  // =====================================================================
  // TRAFFIC & AMBIENT LIFE
  {
    const t1 = part(dyn, 207.4, -80, 0, Math.PI / 2);
    K.truck(t1.s, { len: 8.6, cab: M.amber, stripe: M.orange });
    const t2 = part(dyn, -60, 154.8, 0);
    K.truck(t2.s, { len: 7.6 });
    const v1 = part(dyn, -60, 155, 0);
    K.van(v1.s, { stripe: M.orange });
    const c1 = part(dyn, 300, 161, 0, Math.PI);
    K.car(c1.s, { body: M.red });
    ambient((t) => {
      t1.g.position.z = -90 + ((t * 7) % 290);
      t2.g.position.x = -70 + ((t * 8.5 + 340) % 360);
      v1.g.position.x = -70 + ((t * 8.5 + 160) % 360);
      c1.g.position.x = 300 - ((t * 10) % 370);
    });
  }
  // security guard patrolling the gate perimeter
  {
    const g = K.walker(dyn, 98.8, 143.6, { suit: M.suit[5], hat: false });
    tagPart(g.g, 'security', 'patrol');
    ambient((t) => {
      const len = 15.2;
      const d = (t * 1.1) % (len * 2);
      const fwd = d < len;
      g.g.position.z = 143.6 - (fwd ? d : len * 2 - d);
      g.g.rotation.y = fwd ? Math.PI / 2 : -Math.PI / 2;
      g.swing(t, 0.9);
    });
  }
  // walkers along the front walkway and the lawn path
  {
    const loops = [
      [[45, 91.5], [126, 91.5]],
      [[126, 91.5], [45, 91.5]],
      [[119, 94], [119, 144]],
      [[132, 120], [164, 120]],
      [[60, 118], [90, 118]],
    ];
    loops.forEach((pts, i) => {
      const w = walker(dyn, pts[0][0], pts[0][1], 0);
      const len = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
      const ang = Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]);
      ambient((t) => {
        const d = (t * 1.3 + i * 17) % (len * 2);
        const fwd = d < len;
        const s = fwd ? d : len * 2 - d;
        w.g.position.x = pts[0][0] + Math.cos(ang) * s;
        w.g.position.z = pts[0][1] + Math.sin(ang) * s;
        w.g.rotation.y = -(fwd ? ang : ang + Math.PI);
        w.swing(t, 1);
      });
    });
  }
  // smoke from the stack
  {
    const mat = new THREE.SpriteMaterial({ map: textures.smoke, transparent: true, depthWrite: false, opacity: 0.5, color: '#ffffff' });
    const puffs = [];
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(mat.clone());
      root.add(sp);
      puffs.push({ sp, off: i / 14 });
    }
    ambient((t) => {
      for (const p of puffs) {
        const a = (t * 0.12 + p.off) % 1;
        p.sp.position.set(95.5 + a * 9 + Math.sin(a * 6 + p.off * 9) * 0.8, 32.6 + a * 16, 8 + a * 3);
        const s = 2 + a * 9;
        p.sp.scale.set(s, s, s);
        p.sp.material.opacity = (1 - a) * Math.min(1, a * 6) * 0.45;
      }
    });
  }
  // beacons and LEDs
  ambient((t) => {
    M.beacon.emissiveIntensity = 0.2 + Math.max(0, Math.sin(t * 3)) * 0.7;
    M.beaconRed.emissiveIntensity = 0.2 + (Math.sin(t * 2.2) > 0.6 ? 0.8 : 0);
    M.ledGreen.emissiveIntensity = 0.3 + (Math.sin(t * 9.1) > 0 ? 0.3 : 0);
    M.ledBlue.emissiveIntensity = 0.3 + (Math.sin(t * 7.3 + 1) > 0 ? 0.3 : 0);
  });

  // =====================================================================
  // review areas (selected sector, ERA review lens)
  const areas = {};
  for (const s of sectors) {
    const [x0, y0, x1, y1] = s.focus;
    const g = new THREE.Group();
    const whole = x1 - x0 > 150;
    if (!whole) {
      const fill = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), M.area);
      fill.rotation.x = -Math.PI / 2;
      fill.position.set((x0 + x1) / 2, 0.13, (y0 + y1) / 2);
      g.add(fill);
    }
    const t = whole ? 0.5 : 0.35;
    for (const [ax, ay, w, d] of [[x0, y0, x1 - x0, t], [x0, y1 - t, x1 - x0, t], [x0, y0, t, y1 - y0], [x1 - t, y0, t, y1 - y0]]) {
      const e = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.areaEdge);
      e.rotation.x = -Math.PI / 2;
      e.position.set(ax + w / 2, 0.15, ay + d / 2);
      g.add(e);
    }
    g.visible = false;
    g.renderOrder = 3;
    root.add(g);
    areas[s.id] = g;
  }

  // =====================================================================
  // merge each moving part's plain meshes by material (pivot groups stay intact)
  const mergeChildren = (group) => {
    const buckets = new Map();
    for (const c of [...group.children]) {
      if (c.isMesh && !c.isInstancedMesh && c.geometry && !c.userData.keep) {
        const key = `${c.material.uuid}|${c.castShadow}`;
        if (!buckets.has(key)) buckets.set(key, { mat: c.material, cast: c.castShadow, list: [] });
        buckets.get(key).list.push(c);
      }
    }
    for (const { mat, cast, list } of buckets.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        m.updateMatrix();
        let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        return g.applyMatrix4(m.matrix);
      });
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      for (const m of list) {
        group.remove(m);
        m.geometry.dispose();
      }
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    for (const c of group.children) if (c.isGroup) mergeChildren(c);
  };
  for (const c of dyn.children) if (c.isGroup) mergeChildren(c);
  for (const f of hqFloors) for (const c of f.children) if (c.isGroup) mergeChildren(c);

  const staticMeshes = B.flush(root);
  const pickables = staticMeshes.filter((m) => sectors.some((s) => s.id === m.userData.tag));
  for (const m of pickables) m.userData.sector = m.userData.tag;
  for (const f of hqFloors) for (const m of f.children) if (m.userData.tag) {
    m.userData.sector = m.userData.tag;
    pickables.push(m);
  }
  dyn.traverse((o) => {
    if (o.isMesh) {
      let p = o;
      while (p && !p.userData.sector) p = p.parent;
      if (p) pickables.push(o);
    }
  });
  for (const [name, f] of Object.entries(fades)) {
    f.meshes = staticMeshes.filter((m) => Object.values(f.mats).includes(m.material));
  }

  // machine runner (runs on real time so it works while ambient motion is paused)
  let fadeNow = 0;
  ambient((t, dt, now) => {
    const real = fadeNow ? Math.min(0.25, now - fadeNow) : 1 / 60;
    fadeNow = now;
    for (const list of Object.values(machines))
      for (const m of list) {
        let p = -1;
        if (m.t0 >= 0) {
          p = (now - m.t0) / m.dur;
          if (p > 1) {
            m.t0 = -1;
            p = -1;
          }
        }
        m.update(p, now, m.t0 >= 0 ? Math.max(dt, 1 / 60) : dt);
      }
    // building openings
    for (const f of Object.values(fades)) {
      f.value += (f.target - f.value) * (1 - Math.exp(-real * 6));
      const o = Math.max(0, f.value);
      for (const m of Object.values(f.mats)) m.opacity = o * (m.userData.baseOpacity ?? 1);
      for (const mesh of f.meshes) {
        mesh.visible = o > 0.02;
        mesh.castShadow = o > 0.6;
      }
    }
  });
  for (const f of Object.values(fades)) for (const m of Object.values(f.mats)) m.userData.baseOpacity = m.opacity;

  // cutaway: floors above the one in focus rise out of the way
  const RISE = 70;
  let focusFloor = 99;
  for (const g of hqFloors) g.userData.lift = 0;
  let lastNow = 0;
  ambient((t, dt, now) => {
    const real = lastNow ? Math.min(0.25, now - lastNow) : 1 / 60;
    lastNow = now;
    const k = 1 - Math.exp(-real * 5);
    for (const g of hqFloors) {
      const target = g.userData.floor > focusFloor ? 1 : 0;
      g.userData.lift += (target - g.userData.lift) * k;
      if (Math.abs(target - g.userData.lift) < 0.001) g.userData.lift = target;
      g.position.y = g.userData.lift * RISE;
      g.visible = g.userData.lift < 0.97;
    }
  });

  return {
    pickables,
    areas,
    mini,
    lights,
    focusFloor: () => focusFloor,
    floorOffset: (f) => (f == null ? 0 : (hqFloors[f]?.userData.lift || 0) * RISE),
    run(id) {
      const now = performance.now() / 1000;
      for (const m of machines[id] || []) m.t0 = now;
    },
    open(set, floor = 99) {
      for (const [name, f] of Object.entries(fades)) f.target = set.has(name) ? 0.04 : 1;
      focusFloor = set.has('hq') ? floor : 99;
      if (set.has('hq')) fades.hq.target = 0;
    },
    routeMeshes,
  };

  // -------------------------------------------------------------- helpers
  function walker(parentGroup, x, y, rot) {
    return K.walker(parentGroup, x, y, { rot });
  }

  // Hall with full-height back walls (y0, x0) and knee walls at the front (y1, x1).
  // doors: [wall, a0, a1, height] roll-up doors; gaps: [wall, a0, a1, height] openings
  // (a conveyor passing through); height covers the full wall for knee walls.
  function openHall(x0, y0, x1, y1, h, { doors = [], gaps = [] } = {}) {
    const holes = (wall) => [...doors, ...gaps].filter((d) => d[0] === wall).sort((a, b) => a[1] - b[1]);
    // run a wall along its axis, leaving holes with a header above each
    const run = (wall, a0, a1, draw, hh) => {
      let a = a0;
      for (const [, s0, s1, dh] of holes(wall)) {
        if (s0 > a) draw(a, s0, 0, hh);
        if (dh < hh) draw(s0, s1, dh, hh - dh);
        a = s1;
      }
      if (a < a1) draw(a, a1, 0, hh);
    };
    B.tagged('', (q) => {
      q.plane(x0, y0, x1, y1, 0.05, M.epoxy);
      run('y0', x0, x1, (a, c, z, hh) => {
        q.box(a, y0, z, c - a, 0.6, hh, M.clad);
        q.box(a, y0 + 0.6, z, c - a, 0.05, hh, M.wall);
      }, h);
      run('x0', y0 + 0.6, y1, (a, c, z, hh) => {
        q.box(x0, a, z, 0.6, c - a, hh, M.clad);
        q.box(x0 + 0.6, a, z, 0.05, c - a, hh, M.wall);
      }, h);
      K.windows(q, 'y', y0 + 0.66, x0 + 2, x1 - 2, h - 3.4, h - 1.4, 3.2, 2.4, 0.15, { cool: true });
      K.windows(q, 'x', x0 + 0.66, y0 + 2, y1 - 2, h - 3.4, h - 1.4, 3.2, 2.4, 0.15, { cool: true });
      q.box(x0 + 0.6, y1 - 0.6, 0, x1 - x0 - 1.2, 0.6, 1.3, M.clad);
      q.box(x0 + 0.6, y1 - 0.65, 1.3, x1 - x0 - 1.2, 0.7, 0.12, M.trim);
      run('x1', y0 + 0.6, y1 - 0.6, (a, c, z, hh) => {
        if (z > 0) return;
        q.box(x1 - 0.6, a, 0, 0.6, c - a, 1.3, M.clad);
        q.box(x1 - 0.65, a, 1.3, 0.7, c - a, 0.12, M.trim);
      }, 1.3);
      // roll-up doors: rolled shutter drum, guides and a yellow-striped threshold
      for (const [wall, a0, a1, dh] of doors) {
        if (wall !== 'y0') continue;
        q.cyl(a0 + (a1 - a0) / 2, y0 + 0.95, dh + 0.35, 0.36, a1 - a0 + 0.4, M.darkSteel, { axis: 'x', seg: 16 });
        for (const x of [a0 - 0.18, a1]) q.box(x, y0 - 0.05, 0, 0.18, 0.8, dh, M.yellow);
        for (let x = a0; x < a1; x += 0.8) q.plane(x, y0 - 0.2, x + 0.4, y0 + 0.75, 0.065, M.lineYellow);
      }
      for (let x = x0 + 12; x < x1 - 4; x += 12) {
        q.box(x, y1 - 0.6, 0, 0.6, 0.6, h, M.beam);
        q.box(x, y0 + 0.6, h - 0.6, 0.5, y1 - y0 - 0.6, 0.6, M.beam, { cast: false });
        for (let y = y0 + 6; y < y1 - 2; y += 12) {
          q.box(x - 0.05, y, h - 1.2, 0.6, 1.6, 0.12, M.hallLight, { cast: false });
          q.cyl(x + 0.25, y + 0.8, h - 1.1, 0.02, 0.5, M.darkSteel, { seg: 4 });
        }
      }
      for (let y = y0 + 12; y < y1 - 4; y += 12) {
        q.box(x1 - 0.6, y, 0, 0.6, 0.6, h, M.beam);
        q.box(x0 + 0.6, y, h - 0.6, x1 - x0 - 0.6, 0.5, 0.6, M.beam, { cast: false });
      }
      q.box(x1 - 0.6, y1 - 0.6, 0, 0.6, 0.6, h, M.beam);
      q.box(x0, y0, h, x1 - x0, 0.7, 0.3, M.wallMid);
      q.box(x0, y0, h, 0.7, y1 - y0, 0.3, M.wallMid);
    });
  }
}
