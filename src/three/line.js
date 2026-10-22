// The connected production flow of an industrial parts plant:
// raw sheet arrives by forklift → laser cutting and CNC machining → an operator loads
// parts onto an indexing conveyor → two robots assemble each part with a cap in a
// fixture → vision inspection → case packer → palletizing robot → stretch wrapper →
// forklifts take finished pallets to outbound staging and into a trailer.
// One takt clock drives all of it, so parts, robots, people and forklifts stay in step.
import * as THREE from 'three';
import { M } from './mats.js';
import { part } from './sink.js';
import * as K from './models.js';
import { robot, lift, cycle, poseLift, worker, smooth, clamp01, FORK_REACH } from './rigs.js';

const TAKT = 8; // seconds per index
const MOVE = 1.4; // belt index time
const PITCH = 3.5;
const X0 = 66; // load station (slot 0)
const BY = 39.3; // belt centre line
const BZ = 0.8; // belt top
const slotX = (k) => X0 + k * PITCH;
const K_R1 = 7; // R1 takes parts off here
const K_PROD = 8; // R1 puts assemblies back here
const K_QA = 12;
const K_PACK = 21;
const K_PAL = 24;
const T_LOAD = 4.0;
const PART = [0.55, 0.35]; // width, height
const CAP = [0.42, 0.16];
const CART = [0.62, 0.5];
const FIX = [94.6, 45.4, 0.95]; // assembly fixture
const FEED = [99.8, 44.6, 1.0]; // cap feeder pick point
const CONV_Z = 0.62; // pallet conveyor top
const PY = 44.5; // pallet conveyor centre line
const ST = { D: 151.4, B: 155.5, W: 160.6, P: 166.2 };
const STAGE = [176, 23.6]; // outbound staging (warehouse)
const mod = (a, n) => ((a % n) + n) % n;

export function buildLine({ B, dyn, ambient, tagPart }) {
  // ================================================================ static
  // ---------------------------------------------------------------- conveyor
  const BX0 = 64.4;
  const BX1 = 151.2;
  B.tagged('', (b) => {
    for (const y of [BY - 0.86, BY + 0.74]) b.box(BX0, y, 0.5, BX1 - BX0, 0.12, 0.38, M.darkSteel);
    b.box(BX0, BY - 0.7, 0.42, BX1 - BX0, 1.4, 0.1, M.rubber);
    for (let x = BX0 + 0.3; x < BX1; x += 2.4) {
      for (const y of [BY - 0.78, BY + 0.66]) b.box(x, y, 0, 0.12, 0.12, 0.5, M.steel);
      b.box(x, BY - 0.78, 0.18, 0.12, 1.56, 0.08, M.steel);
    }
    b.cyl(BX0, BY, BZ - 0.12, 0.12, 1.6, M.steel, { axis: 'y', seg: 12 });
    b.cyl(BX1, BY, BZ - 0.12, 0.12, 1.6, M.steel, { axis: 'y', seg: 12 });
    // enclosed transfer between the halls
    b.box(125.4, BY - 1.25, 1.9, 5.2, 2.5, 0.12, M.cladBlue);
    for (const y of [BY - 1.25, BY + 1.13]) b.box(125.4, y, 0.95, 5.2, 0.12, 0.95, M.cladBlue);
    for (const x of [125.6, 130.2]) for (const y of [BY - 1.2, BY + 1.05]) b.box(x, y, 0, 0.15, 0.15, 1.9, M.steel);
    // index position marks on the belt guard
    for (let k = 0; k <= K_PAL; k++) b.box(slotX(k) - 0.04, BY + 0.85, 0.7, 0.08, 0.02, 0.14, M.amber, { cast: false });
  });
  // belt surface: a texture that indexes with the parts
  const beltTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#353b46';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#4a5260';
    g.fillRect(0, 0, 6, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  })();
  {
    const len = BX1 - BX0;
    const g = new THREE.PlaneGeometry(len, 1.5);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / 0.7);
    g.rotateX(-Math.PI / 2);
    g.translate((BX0 + BX1) / 2, BZ, BY);
    const belt = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.85 }));
    belt.receiveShadow = true;
    dyn.add(belt);
  }

  // ---------------------------------------------------------------- raw stock, laser, CNC, load station
  B.tagged('', (b) => {
    // receiving floor marks inside the door
    for (const x of [57.8, 61.4]) {
      b.plane(x - 0.85, 39.55, x + 0.85, 39.65, 0.07, M.lineYellow);
      b.plane(x - 0.85, 41.15, x + 0.85, 41.25, 0.07, M.lineYellow);
      b.plane(x - 0.85, 39.55, x - 0.75, 41.25, 0.07, M.lineYellow);
      b.plane(x + 0.75, 39.55, x + 0.85, 41.25, 0.07, M.lineYellow);
    }
    for (let y = 34.8; y < 38.6; y += 0.9) b.plane(56.4, y, 63, y + 0.45, 0.07, M.lineWhite);
    // raw stock: sheet pallets and a cantilever bar rack
    for (const [x, y, n] of [[46.2, 37.2, 9], [48.2, 37.2, 6], [50.2, 37.2, 10], [46.2, 39.4, 4], [48.2, 39.4, 8]]) {
      K.pallet(b, x, y, 0, 1.3, 1.3);
      b.box(x + 0.03, y + 0.03, 0.13, 1.24, 1.24, n * 0.07, M.steel);
      for (let k = 1; k < n; k++) b.box(x + 0.02, y + 0.02, 0.13 + k * 0.07, 1.26, 1.26, 0.01, M.darkSteel, { cast: false });
    }
    for (const x of [45.2, 48.6, 52, 55.4]) {
      b.box(x, 34.7, 0, 0.2, 0.3, 2.8, M.rackBlue);
      for (const z of [0.8, 1.6, 2.4]) b.box(x, 34.7, z, 0.2, 1.3, 0.1, M.rackOrange);
    }
    for (const z of [0.9, 1.7, 2.5]) for (let k = 0; k < 6; k++) b.cyl(45, 35.0 + k * 0.17, z + 0.08, 0.07, 10.6, M.steel, { axis: 'x', seg: 8 });
    // laser cutter: frame, slat bed, enclosure, control cabinet
    b.box(46, 45, 0, 9.4, 8.6, 0.85, M.darkSteel);
    b.box(46.2, 45.2, 0.85, 9.0, 8.2, 0.05, M.steel);
    for (let x = 46.6; x < 55.2; x += 0.45) b.box(x, 45.3, 0.9, 0.05, 8.0, 0.1, M.slate, { cast: false });
    b.box(47, 46.0, 1.0, 7.4, 6.4, 0.03, M.chrome);
    for (const [x, y] of [[45.8, 44.8], [55.4, 44.8], [45.8, 53.6], [55.4, 53.6]]) b.box(x, y, 0, 0.2, 0.2, 2.6, M.white);
    b.box(45.8, 44.8, 2.6, 9.8, 9.0, 0.1, M.white);
    b.box(45.8, 44.82, 0.9, 9.8, 0.04, 1.7, M.glass, { cast: false });
    b.box(45.82, 44.8, 0.9, 0.04, 9.0, 1.7, M.glass, { cast: false });
    b.box(45.8, 53.76, 0.9, 9.8, 0.04, 1.7, M.glass, { cast: false });
    b.box(55.5, 45.2, 0, 0.12, 0.12, 2.0, M.yellow);
    b.box(55.5, 53.3, 0, 0.12, 0.12, 2.0, M.yellow);
    b.box(56.2, 50.2, 0, 1.0, 1.6, 2.1, M.offWhite);
    b.box(57.2, 50.5, 1.2, 0.04, 1.0, 0.7, M.screen, { cast: false });
    b.box(46.5, 54.2, 0, 3.2, 1.2, 1.8, M.slate);
    b.cyl(48.1, 54.8, 1.8, 0.25, 1.4, M.steel, { seg: 10 });
    // cut parts waiting for machining
    for (const [x, y] of [[57.4, 45.4], [59.0, 45.4]]) {
      b.box(x, y, 0, 1.2, 0.9, 0.7, M.steel);
      b.box(x + 0.05, y + 0.05, 0.7, 1.1, 0.8, 0.35, M.blue);
      for (let k = 0; k < 4; k++) b.box(x + 0.15 + k * 0.24, y + 0.2, 1.05, 0.18, 0.5, 0.04, M.steel, { cast: false });
    }
    // CNC machining centres
    for (let i = 0; i < 3; i++) {
      const x0 = 68 + 7 * i;
      b.box(x0, 45, 0, 4.2, 3.6, 3.0, M.white);
      b.box(x0, 45, 3.0, 4.2, 3.6, 0.2, M.slate);
      b.box(x0 - 0.02, 45, 2.2, 4.24, 3.64, 0.1, M.blue);
      b.box(x0 + 0.4, 48.6, 0.6, 2.4, 0.04, 2.0, M.dockDark, { cast: false });
      b.box(x0 + 3.1, 48.62, 1.1, 0.8, 0.06, 0.9, M.darkSteel);
      b.box(x0 + 3.16, 48.68, 1.2, 0.68, 0.02, 0.5, M.screen, { cast: false });
      b.box(x0 + 4.2, 46, 0, 0.9, 1.4, 1.1, M.slate);
      b.box(x0 + 4.25, 46.1, 1.1, 0.5, 1.2, 0.6, M.darkSteel);
      b.cyl(x0 + 3.8, 45.4, 3.2, 0.05, 0.5, M.steel, { seg: 6 });
      b.cyl(x0 + 3.8, 45.4, 3.7, 0.09, 0.14, M.ledGreen, { seg: 8, cast: false });
      b.cyl(x0 + 3.8, 45.4, 3.84, 0.09, 0.14, M.amber, { seg: 8, cast: false });
      b.plane(x0 - 0.3, 49.0, x0 + 4.5, 49.1, 0.07, M.lineYellow);
    }
    // parts cart and tote table at the load station
    b.box(62.6, 45.6, 0.3, 1.8, 1.1, 0.06, M.steel);
    b.box(62.6, 45.6, 0.9, 1.8, 1.1, 0.06, M.steel);
    for (const [x, y] of [[62.65, 45.65], [64.35, 45.65], [62.65, 46.65], [64.35, 46.65]]) b.box(x, y, 0.1, 0.05, 0.05, 1.0, M.steel);
    for (const [x, y] of [[62.7, 45.6], [64.3, 45.6], [62.7, 46.7], [64.3, 46.7]]) b.cyl(x, y, 0.08, 0.08, 0.06, M.rubber, { axis: 'y', seg: 8 });
    b.box(62.7, 45.7, 0.96, 0.8, 0.9, 0.3, M.blue);
    b.box(63.6, 45.7, 0.96, 0.8, 0.9, 0.3, M.blue);
    b.box(63.4, 42.6, 0, 1.3, 0.9, 0.8, M.steel);
    b.box(63.45, 42.65, 0.8, 1.2, 0.8, 0.32, M.blue);
    for (let k = 0; k < 4; k++) b.box(63.55 + (k % 2) * 0.55, 42.72 + (k >> 1) * 0.38, 1.1, 0.4, 0.3, 0.04, M.steel, { cast: false });
    b.plane(64.8, 40.45, 67.2, 41.5, 0.07, M.slate);
  });

  // ---------------------------------------------------------------- robot assembly cell
  B.tagged('', (b) => {
    const seg = (pts) => K.fence(b, pts, 2.0);
    seg([[88.2, 37.6], [102, 37.6]]);
    seg([[88.2, 37.6], [88.2, 38.3]]);
    seg([[88.2, 40.3], [88.2, 50], [102, 50], [102, 40.3]]);
    seg([[102, 38.3], [102, 37.6]]);
    for (const [x, y] of [[88.2, 41.0], [102, 41.0]]) {
      b.box(x - 0.1, y - 0.1, 0, 0.2, 0.2, 2.1, M.yellow);
      b.box(x - 0.06, y + 0.1, 0.3, 0.12, 0.04, 1.6, M.darkSteel, { cast: false });
    }
    // fixture table with locating pins and clamps
    b.box(FIX[0] - 0.7, FIX[1] - 0.7, 0, 1.4, 1.4, FIX[2] - 0.05, M.steel);
    b.box(FIX[0] - 0.75, FIX[1] - 0.75, FIX[2] - 0.05, 1.5, 1.5, 0.05, M.darkSteel);
    for (const [dx, dy] of [[-0.42, -0.42], [0.42, 0.42]]) b.cyl(FIX[0] + dx, FIX[1] + dy, FIX[2], 0.04, 0.12, M.chrome, { seg: 6 });
    for (const dy of [-0.5, 0.36]) b.box(FIX[0] - 0.12, FIX[1] + dy, FIX[2], 0.24, 0.14, 0.14, M.red);
    // vibratory bowl feeder for caps
    b.box(100.2, 45.0, 0, 1.2, 1.2, 0.9, M.slate);
    b.cyl(100.8, 45.6, 0.9, 0.62, 0.36, M.chrome, { seg: 24, open: true });
    b.cyl(100.8, 45.6, 0.9, 0.6, 0.06, M.steel, { seg: 24 });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      b.box(100.8 + Math.cos(a) * 0.38 - 0.08, 45.6 + Math.sin(a) * 0.38 - 0.08, 0.96, 0.16, 0.16, 0.07, M.amber, { cast: false });
    }
    b.box(99.5, 44.35, 0.85, 1.0, 0.5, 0.15, M.steel);
    // cell controller and stack light
    b.box(102.6, 47.6, 0, 0.9, 1.6, 2.0, M.offWhite);
    b.box(103.48, 47.9, 1.1, 0.04, 1.0, 0.6, M.screen, { cast: false });
    b.cyl(102.9, 47.8, 2.0, 0.05, 0.4, M.steel, { seg: 6 });
    b.cyl(102.9, 47.8, 2.4, 0.09, 0.14, M.ledGreen, { seg: 8, cast: false });
    // vision inspection arch over the belt + QA bench
    const qx = slotX(K_QA);
    for (const y of [BY - 1.25, BY + 1.05]) b.box(qx - 0.15, y, 0, 0.3, 0.2, 2.2, M.slate);
    b.box(qx - 0.4, BY - 1.3, 2.2, 0.8, 2.6, 0.3, M.slate);
    b.box(qx - 0.18, BY - 0.18, 1.85, 0.36, 0.36, 0.35, M.darkSteel);
    b.cyl(qx, BY, 1.78, 0.1, 0.08, M.navy, { seg: 10 });
    b.box(103.6, 41.4, 0, 3.2, 1.0, 0.9, M.steel);
    b.box(103.6, 41.4, 0.9, 3.2, 1.0, 0.05, M.offWhite);
    b.box(104.0, 41.5, 0.95, 0.9, 0.06, 0.6, M.darkSteel);
    b.box(104.05, 41.57, 1.0, 0.8, 0.02, 0.45, M.screen, { cast: false });
    b.box(105.4, 41.6, 0.95, PART[0], PART[0], PART[1], M.steel);
    b.box(105.47, 41.67, 0.95 + PART[1], CAP[0], CAP[0], CAP[1], M.amber);
    // floor marks: main aisle and the hall's working zones
    b.plane(44.6, 61.2, 105.8, 61.4, 0.08, M.lineYellow);
    b.plane(44.6, 64.8, 105.8, 65, 0.08, M.lineYellow);
  });

  // ---------------------------------------------------------------- packaging: packer, palletizer, wrapper
  B.tagged('packaging', (b) => {
    // case packer straddling the belt at slot 21
    const px = slotX(K_PACK);
    b.box(px - 2.5, BY - 1.6, 0, 5, 0.3, 2.8, M.white);
    b.box(px - 2.5, BY + 1.3, 0, 5, 0.3, 2.8, M.white);
    b.box(px - 2.5, BY - 1.6, 2.8, 5, 3.2, 0.3, M.blue);
    b.box(px - 2.5, BY - 1.3, 1.45, 0.3, 2.6, 1.35, M.white);
    b.box(px + 2.2, BY - 1.3, 1.45, 0.3, 2.6, 1.35, M.white);
    b.box(px - 1.8, BY + 1.6, 0.9, 3.0, 0.04, 1.4, M.glass, { cast: false });
    b.box(px + 1.4, BY + 1.62, 1.3, 0.6, 0.04, 0.5, M.screen, { cast: false });
    b.box(px - 1.6, BY - 2.9, 0, 3.2, 1.3, 1.0, M.slate);
    b.box(px - 1.5, BY - 2.8, 1.0, 3.0, 1.1, 0.9, M.sheet);
    for (let z = 1.1; z < 1.9; z += 0.1) b.box(px - 1.52, BY - 2.82, z, 3.04, 1.14, 0.015, M.cardboard, { cast: false });
    // palletizer guarding
    const seg = (pts) => K.fence(b, pts, 2.0);
    seg([[147.5, 37.6], [158.4, 37.6], [158.4, 43.2]]);
    seg([[158.4, 45.8], [158.4, 47.6], [147.5, 47.6], [147.5, 40.3]]);
    seg([[147.5, 38.3], [147.5, 37.6]]);
    b.box(158.3, 43.0, 0, 0.2, 0.2, 2.1, M.yellow);
    b.box(158.3, 45.8, 0, 0.2, 0.2, 2.1, M.yellow);
    // pallet roller conveyor with dispenser, turntable and pick-up station
    const cx0 = 150.4;
    const cx1 = 167.0;
    for (const y of [PY - 1.1, PY + 0.98]) b.box(cx0, y, 0.3, cx1 - cx0, 0.12, CONV_Z - 0.3, M.darkSteel);
    for (let x = cx0 + 0.2; x < cx1; x += 0.36) {
      if (Math.abs(x - ST.W) < 1.0) continue;
      b.cyl(x, PY, CONV_Z - 0.06, 0.06, 2.0, M.steel, { axis: 'y', seg: 8 });
    }
    for (let x = cx0 + 0.4; x < cx1; x += 2.2) for (const y of [PY - 1.05, PY + 0.93]) b.box(x, y, 0, 0.12, 0.12, 0.3, M.steel);
    b.box(cx1 - 0.1, PY - 1.1, CONV_Z, 0.1, 2.2, 0.2, M.yellow);
    // dispenser frame holding a stack of empty pallets
    for (const [dx, dy] of [[-0.85, -0.85], [0.75, -0.85], [-0.85, 0.75], [0.75, 0.75]]) b.box(ST.D + dx, PY + dy, 0, 0.1, 0.1, 2.4, M.yellow);
    for (const dy of [-0.85, 0.75]) b.box(ST.D - 0.85, PY + dy, 2.3, 1.7, 0.1, 0.1, M.yellow);
    for (let i = 0; i < 5; i++) K.pallet(b, ST.D - 0.65, PY - 0.65, 1.35 + i * 0.14, 1.3, 1.3);
    // stretch wrapper mast
    b.box(ST.W - 0.5, PY - 2.75, 0, 1.0, 0.9, 0.12, M.darkSteel);
    b.box(ST.W - 0.2, PY - 2.6, 0.12, 0.4, 0.4, 3.2, M.steel);
    b.box(ST.W - 0.32, PY - 2.65, 3.3, 0.64, 0.5, 0.3, M.darkSteel);
    b.box(ST.W + 0.35, PY - 2.9, 0, 0.7, 0.6, 1.4, M.offWhite);
    b.box(ST.W + 0.38, PY - 2.31, 0.9, 0.5, 0.02, 0.35, M.screen, { cast: false });
    b.cyl(ST.W, PY, 0.3, 1.05, CONV_Z - 0.36, M.darkSteel, { seg: 32 });
    // forklift pick-up lane from the hall door
    b.plane(ST.P - 0.95, 34.7, ST.P - 0.85, 43.1, 0.07, M.lineYellow);
    b.plane(ST.P + 0.85, 34.7, ST.P + 0.95, 43.1, 0.07, M.lineYellow);
    for (let y = 35.2; y < 42.6; y += 1.4) b.plane(ST.P - 0.5, y, ST.P + 0.5, y + 0.12, 0.07, M.lineYellow);
  });

  // ---------------------------------------------------------------- open container (raw material supply)
  B.tagged('freight', (b) => {
    const cm = M.container[2];
    const x0 = 123;
    const y0 = 26.4;
    b.box(x0, y0, 0, 6, 0.08, 2.6, cm);
    b.box(x0, y0 + 2.32, 0, 6, 0.08, 2.6, cm);
    b.box(x0, y0, 0, 0.08, 2.4, 2.6, cm);
    b.box(x0, y0, 2.52, 6, 2.4, 0.08, cm);
    b.box(x0, y0, 0, 6, 2.4, 0.12, M.wood);
    b.box(x0 + 0.08, y0 + 0.08, 0.12, 5.9, 2.24, 2.4, M.dockDark, { cast: false });
    for (const [cx, cy] of [[x0, y0], [x0 + 5.82, y0], [x0, y0 + 2.22], [x0 + 5.82, y0 + 2.22]]) b.box(cx, cy, 0, 0.18, 0.18, 2.6, M.darkSteel);
    // doors swung open against the sides
    b.box(x0 + 6, y0 - 0.06, 0.1, 1.2, 0.05, 2.4, cm);
    b.box(x0 + 6, y0 + 2.41, 0.1, 1.2, 0.05, 2.4, cm);
    for (const x of [124.3, 125.8]) {
      K.pallet(b, x - 0.65, 26.95, 0.12, 1.3, 1.3);
      b.box(x - 0.62, 26.98, 0.25, 1.24, 1.24, 0.7, M.steel);
    }
    for (let x = 129.6; x < 134.6; x += 1.2) b.plane(x, 26.7, x + 0.6, 26.8, 0.06, M.lineYellow);
    for (let x = 129.6; x < 134.6; x += 1.2) b.plane(x, 28.4, x + 0.6, 28.5, 0.06, M.lineYellow);
    // forklift lane along the hall fronts
    for (let x = 58; x < 133; x += 3) b.plane(x, 30.35, x + 1.6, 30.45, 0.045, M.lineYellow);
    for (let x = 58; x < 133; x += 3) b.plane(x, 32.05, x + 1.6, 32.15, 0.045, M.lineYellow);
  });

  // ---------------------------------------------------------------- warehouse outbound
  B.tagged('freight', (b) => {
    const [sx, sy] = STAGE;
    for (const [ax, ay, bx, by] of [[sx - 0.9, sy - 0.9, sx + 0.9, sy - 0.8], [sx - 0.9, sy + 0.8, sx + 0.9, sy + 0.9], [sx - 0.9, sy - 0.9, sx - 0.8, sy + 0.9], [sx + 0.8, sy - 0.9, sx + 0.9, sy + 0.9]]) b.plane(ax, ay, bx, by, 0.075, M.lineYellow);
    for (let x = 167.5; x < 189; x += 1.4) b.plane(x, 22.3, x + 0.7, 22.4, 0.075, M.lineWhite);
    for (let x = 167.5; x < 189; x += 1.4) b.plane(x, 24.8, x + 0.7, 24.9, 0.075, M.lineWhite);
    b.plane(165.3, 22.4, 167.1, 22.5, 0.075, M.lineYellow);
    b.plane(182.7, 22.4, 184.5, 22.5, 0.075, M.lineYellow);
  });

  // ================================================================ dynamic
  // ---------------------------------------------------------------- items on the line
  const partGeo = new THREE.BoxGeometry(PART[0], PART[1], PART[0]);
  const capGeo = new THREE.BoxGeometry(CAP[0], CAP[1], CAP[0]);
  const cartGeo = new THREE.BoxGeometry(CART[0], CART[1], CART[0]);
  const inst = (geo, mat, n) => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.userData.keep = true;
    dyn.add(m);
    return m;
  };
  const parts = inst(partGeo, M.steel, 40);
  const caps = inst(capGeo, M.amber, 40);
  const cartons = inst(cartGeo, M.cardboard, 48);
  const mtx = new THREE.Matrix4();
  let np = 0;
  let nc = 0;
  let nk = 0;
  const putPart = (x, y, zb) => {
    mtx.makeTranslation(x, zb + PART[1] / 2, y);
    parts.setMatrixAt(np++, mtx);
  };
  const putCap = (x, y, zb) => {
    mtx.makeTranslation(x, zb + CAP[1] / 2, y);
    caps.setMatrixAt(nc++, mtx);
  };
  const putCarton = (x, y, zb) => {
    mtx.makeTranslation(x, zb + CART[1] / 2, y);
    cartons.setMatrixAt(nk++, mtx);
  };

  // ---------------------------------------------------------------- robots
  const r1 = robot(dyn, 92.2, 42.5, { L1: 2.3, L2: 2.1, T: 0.6 });
  const r2 = robot(dyn, 97.6, 47.4, { L1: 2.3, L2: 2.1, T: 0.6 });
  const rp = robot(dyn, 152.0, 42.3, { L1: 2.6, L2: 2.4, T: 0.7, H: 1.1, ped: 0.6, color: M.orange, vacuum: true });
  tagPart(rp.g, 'packaging', 'packer');
  const P_H = PART[1] + CAP[1];
  const UP = 0.95;
  const H1 = [93.4, 41.0, 2.4];
  const Fa = [FIX[0], FIX[1], FIX[2] + P_H + UP];
  const Fg = [FIX[0], FIX[1], FIX[2] + P_H];
  const S8a = [slotX(K_PROD), BY, BZ + P_H + UP];
  const S8g = [slotX(K_PROD), BY, BZ + P_H];
  const S7a = [slotX(K_R1), BY, BZ + PART[1] + UP];
  const S7g = [slotX(K_R1), BY, BZ + PART[1]];
  const Fpa = [FIX[0], FIX[1], FIX[2] + PART[1] + UP];
  const Fp = [FIX[0], FIX[1], FIX[2] + PART[1]];
  const K1 = [
    [0, H1, 0], [1.4, H1, 0], [1.9, Fa, 0], [2.15, Fg, 0], [2.3, Fg, 1], [2.55, Fa, 1], [3.25, S8a, 1], [3.5, S8g, 1], [3.65, S8g, 0],
    [3.9, S8a, 0], [4.35, S7a, 0], [4.6, S7g, 0], [4.75, S7g, 1], [5.0, S7a, 1], [5.75, Fpa, 1], [6.0, Fp, 1], [6.15, Fp, 0], [6.4, Fpa, 0],
    [7.1, H1, 0], [8, H1, 0],
  ];
  const H2 = [98.4, 45.0, 2.4];
  const Ca = [FEED[0], FEED[1], FEED[2] + CAP[1] + 0.8];
  const Cg = [FEED[0], FEED[1], FEED[2] + CAP[1]];
  const HOLD = [96.9, 46.2, 2.5];
  const Fca = [FIX[0], FIX[1], FIX[2] + P_H + 0.8];
  const Fc = [FIX[0], FIX[1], FIX[2] + P_H];
  const K2 = [
    [0, H2, 0], [3.0, H2, 0], [3.5, Ca, 0], [3.75, Cg, 0], [3.9, Cg, 1], [4.15, Ca, 1], [4.8, HOLD, 1], [6.35, HOLD, 1],
    [6.75, Fca, 1], [6.95, Fc, 1], [7.05, Fc, 0], [7.3, Fca, 0], [8, H2, 0],
  ];
  const HP = [153.8, 41.6, 3.0];
  const S24a = [slotX(K_PAL), BY, BZ + CART[1] + 1.0];
  const S24g = [slotX(K_PAL), BY, BZ + CART[1]];
  const cartonSpot = (c) => {
    const q = c & 3;
    return [(q & 1 ? 0.32 : -0.32), (q & 2 ? 0.32 : -0.32), 0.13 + (c >> 2) * CART[1]];
  };
  const KP = (c) => {
    const [dx, dy, z] = cartonSpot(c);
    const g = [ST.B + dx, PY + dy, CONV_Z + z + CART[1]];
    const a = [g[0], g[1], CONV_Z + 0.13 + 2 * CART[1] + CART[1] + 0.6];
    return [[0, HP, 0], [3.2, HP, 0], [3.9, S24a, 0], [4.4, S24g, 0], [4.75, S24g, 1], [5.05, S24a, 1], [5.8, a, 1], [6.05, g, 1], [6.2, g, 0], [6.5, a, 0], [7.3, HP, 0], [8, HP, 0]];
  };

  // feeder cap that slides to the pick point after each pick
  const feedCap = part(dyn, FEED[0], FEED[1], FEED[2]);
  feedCap.s.cbox(0, 0, 0, CAP[0], CAP[0], CAP[1], M.amber);

  // ---------------------------------------------------------------- pallets (pool of four)
  const pallets = [];
  for (let i = 0; i < 4; i++) {
    const p = part(dyn, 0, 0, 0);
    K.pallet(p.s, -0.65, -0.65, 0, 1.3, 1.3);
    const boxes = [];
    for (let c = 0; c < 8; c++) {
      const [dx, dy, z] = cartonSpot(c);
      const m = new THREE.Mesh(cartGeo, M.cardboard);
      m.position.set(dx, z + CART[1] / 2, dy);
      m.castShadow = true;
      m.userData.keep = true;
      p.g.add(m);
      boxes.push(m);
    }
    const film = new THREE.Mesh(new THREE.BoxGeometry(1.36, 1, 1.36).translate(0, 0.5, 0), M.wrapFilm);
    film.position.y = 0.12;
    film.userData.keep = true;
    p.g.add(film);
    p.g.visible = false;
    pallets.push({ g: p.g, boxes, film });
  }
  for (const p of pallets) tagPart(p.g, 'packaging', 'wrapper');
  const turntable = part(dyn, ST.W, PY, CONV_Z - 0.06);
  turntable.s.cyl(0, 0, 0, 0.98, 0.06, M.steel, { seg: 32 });
  for (let k = -2; k <= 2; k++) turntable.s.cyl(k * 0.36, 0, 0.03, 0.05, 1.7, M.chrome, { axis: 'y', seg: 8 });
  tagPart(turntable.g, 'packaging', 'wrapper');
  const carriage = part(dyn, ST.W, PY - 2.4, 0.8);
  carriage.s.box(-0.3, -0.25, 0, 0.6, 0.5, 0.5, M.amber);
  carriage.s.box(-0.06, 0.2, 0.1, 0.12, 0.7, 0.12, M.darkSteel);
  carriage.s.cyl(0, 0.95, -0.05, 0.13, 0.6, M.filmRoll, { seg: 14 });
  tagPart(carriage.g, 'packaging', 'wrapper');

  // ---------------------------------------------------------------- forklifts
  // FL-C: wrapped pallets from the pick-up station to outbound staging
  const flc = lift(dyn, ST.P, STAGE[1], Math.PI / 2);
  const cyC = cycle([ST.P, STAGE[1], Math.PI / 2, -0.03], [
    { lift: CONV_Z - 0.09 },
    { to: [ST.P, PY - FORK_REACH] },
    { mark: 'pick' },
    { lift: CONV_Z + 0.2 },
    { to: [ST.P, STAGE[1]], rev: true },
    { face: 0 },
    { lift: 0.3 },
    { to: [STAGE[0] - FORK_REACH, STAGE[1]] },
    { lift: -0.03 },
    { mark: 'drop' },
    { to: [ST.P, STAGE[1]], rev: true },
    { face: Math.PI / 2 },
  ]);
  // FL-A: staging into the trailer at dock 4
  const A0 = cyC.T + 1;
  const HA = [183.6, STAGE[1]];
  const fla = lift(dyn, HA[0], HA[1], Math.PI);
  const cyA = cycle([HA[0], HA[1], Math.PI, -0.03], [
    { to: [STAGE[0] + FORK_REACH, STAGE[1]] },
    { mark: 'pick' },
    { lift: 0.3 },
    { to: HA, rev: true },
    { face: 0 },
    { lift: 1.25 },
    { to: [188.9, STAGE[1]] },
    { lift: 1.07 },
    { mark: 'drop' },
    { to: HA, rev: true },
    { lift: -0.03 },
    { face: Math.PI },
  ]);
  const PERIOD = 8 * TAKT;
  // FL-B: raw sheet from the container to the laser area, empties back
  const LANE = 31.2;
  const DROPY = 40.4 - FORK_REACH;
  const flbSteps = (D, E) => [
    { to: [130.1, 27.6] },
    { mark: 'pickFull' },
    { lift: 0.3 },
    { to: [134, 27.6], rev: true },
    { to: [134, LANE] },
    { to: [D, LANE] },
    { lift: 0.1 },
    { to: [D, DROPY] },
    { lift: -0.03 },
    { mark: 'drop' },
    { to: [D, 36], rev: true },
    { to: [E, 36] },
    { to: [E, DROPY] },
    { mark: 'pickEmpty' },
    { lift: 0.3 },
    { to: [E, LANE], rev: true },
    { to: [134, LANE] },
    { to: [134, 27.6] },
    { to: [130.1, 27.6] },
    { lift: -0.03 },
    { mark: 'dropEmpty' },
    { to: [134, 27.6], rev: true },
  ];
  const cyE = cycle([134, 27.6, Math.PI, -0.03], flbSteps(57.8, 61.4), { v: 3.6 });
  const cyO = cycle([134, 27.6, Math.PI, -0.03], flbSteps(61.4, 57.8), { v: 3.6 });
  const TT = cyE.T + cyO.T;
  const flb = lift(dyn, 134, 27.6, Math.PI);
  const sheetLoad = (s) => {
    K.pallet(s, -0.65, -0.65, 0, 1.3, 1.3);
    const st = new THREE.Mesh(new THREE.BoxGeometry(1.24, 1, 1.24).translate(0, 0.5, 0), M.steel);
    st.position.y = 0.13;
    st.castShadow = true;
    st.userData.keep = true;
    return st;
  };
  const flbFull = part(flb.anchor, 0, 0, 0);
  const flbFullStack = sheetLoad(flbFull.s);
  flbFullStack.scale.y = 0.7;
  flbFull.g.add(flbFullStack);
  const flbEmpty = part(flb.anchor, 0, 0, 0);
  K.pallet(flbEmpty.s, -0.65, -0.65, 0, 1.3, 1.3);
  const spots = [57.8, 61.4].map((x) => {
    const p = part(dyn, x, 40.4, 0.06);
    const st = sheetLoad(p.s);
    p.g.add(st);
    return { g: p.g, st };
  });
  // parked forklifts on charge in the pallet yard
  for (const y of [79.9, 82.9]) lift(dyn, 192.6, y, 0);

  // ---------------------------------------------------------------- people at work
  const loader = worker(dyn, 66.0, 40.95, -Math.PI / 2, { suit: M.suit[0] });
  const loaderPart = part(loader.hold, 0, 0, -0.1);
  loaderPart.s.cbox(0, 0, 0, PART[0], PART[0], PART[1], M.steel);
  const cncOps = [0, 1, 2].map((i) => worker(dyn, 69.6 + 7 * i, 49.7, -Math.PI / 2, { suit: M.suit[(i + 1) % 6] }));
  const cncDoors = [0, 1, 2].map((i) => {
    const d = part(dyn, 68.4 + 7 * i, 48.66, 0.6);
    d.s.box(0, 0, 0, 1.25, 0.04, 2.0, M.offWhite);
    d.s.box(0.15, 0.02, 0.6, 0.95, 0.04, 1.1, M.glass, { cast: false });
    d.s.box(1.05, 0.04, 0.9, 0.08, 0.08, 0.5, M.darkSteel);
    return d.g;
  });
  const laserOp = worker(dyn, 57.85, 51.0, Math.PI, { suit: M.suit[3] });
  const gantry = part(dyn, 46.2, 49.5, 1.0);
  gantry.s.box(0, -0.3, 0, 0.4, 0.6, 0.9, M.yellow);
  gantry.s.box(8.6, -0.3, 0, 0.4, 0.6, 0.9, M.yellow);
  gantry.s.box(0, -0.25, 0.9, 9.0, 0.5, 0.45, M.yellow);
  const head = part(gantry.g, 4.5, 0.35, 0.55);
  head.s.box(-0.3, -0.1, 0, 0.6, 0.35, 0.8, M.darkSteel);
  head.s.cyl(0, 0.08, -0.25, 0.08, 0.3, M.chrome, { seg: 8 });
  const inspector = worker(dyn, 105.2, 43.1, -Math.PI / 2, { suit: M.suit[4], hat: 'white' });
  inspector.holdSink.cbox(-0.05, -0.18, 0.05, 0.05, 0.36, 0.26, M.darkSteel);
  const cellTech = worker(dyn, 104.2, 48.4, Math.PI, { suit: M.suit[3] });
  const packOp = worker(dyn, slotX(K_PACK) - 0.4, BY - 3.6, Math.PI / 2, { suit: M.suit[1] });
  const qaLight = part(dyn, slotX(K_QA), BY, 2.5);
  const qaMat = M.ledGreen.clone();
  qaLight.s.cyl(0, 0, 0, 0.12, 0.12, qaMat, { seg: 10, cast: false });
  const picker = worker(dyn, 156, 9.05, 0, { suit: M.suit[2] });
  const mopper = worker(dyn, 150, 69.4, 0, { suit: M.suit[1], hat: 'white' });
  mopper.holdSink.cbox(0.25, 0, -1.0, 0.04, 0.04, 1.3, M.steel);
  mopper.holdSink.cbox(0.4, 0, -1.0, 0.25, 0.6, 0.06, M.offWhite);
  const tech = worker(dyn, 117, 74.9, -Math.PI / 2, { suit: M.suit[3] });
  tagPart(tech.g, 'mro', 'spares');
  tagPart(mopper.g, 'cleaning', 'janitorial');

  // ================================================================ the clock
  ambient((clock) => {
    const tau = clock + 4000;
    const n = Math.floor(tau / TAKT);
    const u = tau - n * TAKT;
    const ease = smooth(clamp01(u / MOVE));
    const slotS = (age) => (u < MOVE ? age - 1 + ease : age);
    beltTex.offset.x = -((n + ease) * PITCH) / 0.7;
    np = nc = nk = 0;

    // belt contents by age (cycles since the part was loaded)
    for (let a = 0; a <= K_PAL; a++) {
      const x = slotX(slotS(a));
      const onPart = (a === 0 && u >= T_LOAD) || (a >= 1 && a < K_R1) || (a === K_R1 && u < 4.75);
      const onProd = (a === K_PROD && u >= 3.65) || (a > K_PROD && a < K_PACK) || (a === K_PACK && u < MOVE);
      const onCart = (a === K_PACK && u >= MOVE) || (a > K_PACK && a < K_PAL) || (a === K_PAL && u < 4.75);
      if (onPart || onProd) putPart(x, BY, BZ);
      if (onProd) putCap(x, BY, BZ + PART[1]);
      if (onCart) putCarton(x, BY, BZ);
    }
    // fixture contents
    const inFix = u >= 6.15 || u < 2.3;
    if (inFix) putPart(FIX[0], FIX[1], FIX[2]);
    if (u >= 7.05 || u < 2.3) putCap(FIX[0], FIX[1], FIX[2] + PART[1]);

    // robots
    const t1 = r1.follow(K1, u);
    if (u >= 2.3 && u < 3.65) {
      putPart(t1[0], t1[1], t1[2] - P_H);
      putCap(t1[0], t1[1], t1[2] - CAP[1]);
    } else if (u >= 4.75 && u < 6.15) putPart(t1[0], t1[1], t1[2] - PART[1]);
    const t2 = r2.follow(K2, u);
    if (u >= 3.9 && u < 7.05) putCap(t2[0], t2[1], t2[2] - CAP[1]);
    feedCap.g.visible = !(u >= 3.9 && u < 4.4);
    const slide = u >= 4.4 && u < 5.2 ? 1 - smooth((u - 4.4) / 0.8) : 0;
    feedCap.g.position.x = FEED[0] + slide * 0.6;
    feedCap.g.position.z = FEED[1] + slide * 0.5;
    const cNow = mod(n - K_PAL, 8);
    const tp = rp.follow(KP(cNow), u);
    if (u >= 4.75 && u < 6.2) putCarton(tp[0], tp[1], tp[2] - CART[1]);
    qaMat.emissiveIntensity = u > MOVE + 0.3 && u < MOVE + 1.6 ? 1.2 : 0.25;

    // pallets: dispense → build → wrap → pick-up → forklifts → trailer
    const phiC = mod(tau - (34 * TAKT + 6.5), PERIOD);
    poseLift(flc, cyC.at(phiC));
    const phiA = phiC - A0;
    poseLift(fla, cyA.at(phiA < 0 ? cyA.T : phiA));
    const jNow = Math.floor((n - 31) / 8);
    let wrapping = null;
    for (const p of pallets) p.g.visible = false;
    for (let j = jNow - 2; j <= jNow + 1; j++) {
      const p = pallets[mod(j, 4)];
      const Nj = 8 * j + 31;
      const tD = (Nj - 7) * TAKT;
      const tB = (Nj + 1) * TAKT;
      const tW0 = tB + 3.5;
      const tW1 = (Nj + 3) * TAKT + 3.5;
      const tP0 = (Nj + 3) * TAKT + 4.0;
      const tP1 = tP0 + 2.5;
      const lifeEnd = tP1 + A0 + cyA.marks.drop + 2.6;
      if (tau < tD + 0.5 || tau >= lifeEnd) continue;
      p.g.visible = true;
      let x = ST.D;
      let y = PY;
      let z = CONV_Z;
      let rot = 0;
      let parent = dyn;
      if (tau < tD + 2.0) z = 1.35 - (1.35 - CONV_Z) * smooth((tau - tD - 0.5) / 1.5);
      else if (tau < tD + 4.5) x = ST.D + (ST.B - ST.D) * smooth(clamp01((tau - tD - 2.5) / 2));
      else if (tau < tB + 0.5) x = ST.B;
      else if (tau < tB + 3.0) x = ST.B + (ST.W - ST.B) * smooth((tau - tB - 0.5) / 2.5);
      else if (tau < tP0) {
        x = ST.W;
        const w = clamp01((tau - tW0) / (tW1 - tW0));
        rot = smooth(w) * Math.PI * 12;
        if (w > 0 && w < 1) wrapping = w;
      } else if (tau < tP1) x = ST.W + (ST.P - ST.W) * smooth((tau - tP0) / 2.5);
      else {
        const ph = tau - tP1;
        x = ST.P;
        if (ph >= cyC.marks.pick && ph < cyC.marks.drop) parent = flc.anchor;
        else if (ph >= cyC.marks.drop && ph < A0 + cyA.marks.pick) [x, y, z] = [STAGE[0], STAGE[1], 0.06];
        else if (ph >= A0 + cyA.marks.pick && ph < A0 + cyA.marks.drop) parent = fla.anchor;
        else if (ph >= A0 + cyA.marks.drop) {
          [y, z] = [STAGE[1], 1.16];
          x = 188.9 + FORK_REACH + smooth(clamp01((ph - A0 - cyA.marks.drop - 0.6) / 2)) * 3;
        }
      }
      if (p.g.parent !== parent) parent.add(p.g);
      if (parent === dyn) {
        p.g.position.set(x, z, y);
        p.g.rotation.y = rot;
      } else {
        p.g.position.set(0, 0, 0);
        p.g.rotation.y = 0;
      }
      // cartons placed so far, and film height
      for (let c = 0; c < 8; c++) p.boxes[c].visible = tau >= (8 * j + c + K_PAL) * TAKT + 6.2;
      const w = clamp01((tau - tW0) / (tW1 - tW0));
      p.film.visible = w > 0;
      p.film.scale.y = Math.max(0.001, Math.min(1, w / 0.55) * 1.04);
    }
    turntable.g.rotation.y = wrapping != null ? smooth(wrapping) * Math.PI * 12 : 0;
    const climb = wrapping == null ? 0 : wrapping < 0.55 ? smooth(wrapping / 0.55) : smooth(1 - (wrapping - 0.55) / 0.45);
    carriage.g.position.y = 0.8 + climb * 1.05;

    // FL-B: alternate between the two drop spots
    const tt = mod(tau, TT);
    const even = tt < cyE.T;
    const cy = even ? cyE : cyO;
    const lt = even ? tt : tt - cyE.T;
    poseLift(flb, cy.at(lt));
    flbFull.g.visible = lt >= cy.marks.pickFull && lt < cy.marks.drop;
    flbEmpty.g.visible = lt >= cy.marks.pickEmpty && lt < cy.marks.dropEmpty;
    // spot A (57.8) filled on even trips, emptied on odd; spot B the other way round
    const spotState = (dropAt, pickAt) => {
      const since = mod(tt - dropAt, TT);
      const life = mod(pickAt - dropAt, TT);
      if (since >= life) return -1;
      const used = clamp01((since - 8) / Math.max(1, life - 16));
      return Math.ceil((1 - used) * 10) / 10;
    };
    const sA = spotState(cyE.marks.drop, cyE.T + cyO.marks.pickEmpty);
    const sB = spotState(cyE.T + cyO.marks.drop, cyE.marks.pickEmpty);
    [sA, sB].forEach((v, i) => {
      spots[i].g.visible = v >= 0;
      spots[i].st.visible = v > 0;
      spots[i].st.scale.y = Math.max(0.001, v * 0.7);
    });

    // people
    // loader: turn to the tote, pick a part, turn back, place it at slot 0
    {
      const toTote = u >= 1.6 && u < 2.2 ? smooth((u - 1.6) / 0.6) : u >= 2.2 && u < 2.8 ? 1 : u >= 2.8 && u < 3.4 ? 1 - smooth((u - 2.8) / 0.6) : 0;
      loader.face(-Math.PI / 2 - toTote * 2.4);
      const reach = u >= 2.2 && u < 2.8 ? Math.sin(((u - 2.2) / 0.6) * Math.PI) : 0;
      const place = u >= 3.4 && u < 4.2 ? Math.sin(((u - 3.4) / 0.8) * Math.PI) : 0;
      loader.bend(reach * 0.35 + place * 0.25);
      const carry = u >= 2.6 && u < T_LOAD;
      loader.arms(carry ? 1.0 + place * 0.4 : 0.15 + reach * 0.9);
      loaderPart.g.visible = carry && u < 3.7;
      if (u >= 3.7 && u < T_LOAD) putPart(66.0, BY + (1 - smooth((u - 3.7) / 0.3)) * 0.9, BZ);
    }
    cncOps.forEach((op, i) => {
      const c = mod(tau + i * 8, 24);
      const open = c < 1.5 ? smooth(c / 1.5) : c < 4.5 ? 1 : c < 6 ? 1 - smooth((c - 4.5) / 1.5) : 0;
      cncDoors[i].position.x = 68.4 + 7 * i + open * 1.25;
      const load = c >= 1.5 && c < 4.5 ? Math.sin(((c - 1.5) / 3) * Math.PI) : 0;
      op.arms(0.2 + load * 1.2 + (c >= 7 ? 0.9 + Math.sin(tau * 9 + i) * 0.06 : 0), 0.2 + load * 1.2);
      op.bend(load * 0.2);
      op.face(-Math.PI / 2 + (c >= 7 ? 0.6 : 0));
    });
    gantry.g.position.z = 49.5 + Math.sin(tau * 0.35) * 3.6;
    head.g.position.x = 4.5 + Math.sin(tau * 1.1) * 3.6;
    laserOp.arms(1.0 + Math.sin(tau * 8) * 0.06, 1.0 + Math.cos(tau * 7) * 0.06);
    inspector.arms(1.15, 0.9 + (u > MOVE && u < MOVE + 1.5 ? Math.sin(tau * 10) * 0.15 : 0));
    cellTech.arms(1.0 + Math.sin(tau * 8.4) * 0.05);
    {
      const c = mod(u + 2, TAKT);
      const r = c < 1.2 ? Math.sin((c / 1.2) * Math.PI) : 0;
      packOp.arms(0.3 + r * 1.1);
      packOp.bend(r * 0.15);
    }
    {
      // picker walks the aisle, stopping at bays to pick
      const span = 19;
      const c = mod(tau * 0.9, span * 2 + 8);
      const stop = c >= span && c < span + 4 ? 1 : c >= span * 2 + 4 ? 2 : 0;
      const d = c < span ? c : stop === 1 ? span : c < span * 2 + 4 ? span * 2 + 4 - c : 0;
      picker.g.position.x = 156 + d;
      picker.face(stop ? Math.PI / 2 : c < span ? 0 : Math.PI);
      const sw = picker.stride(tau, stop ? 0 : 1);
      picker.arms(stop ? 1.3 + Math.sin(tau * 3) * 0.1 : -sw * 0.8, stop ? 1.3 : sw * 0.8);
    }
    {
      const c = mod(tau * 0.35, 2);
      const x = c < 1 ? c : 2 - c;
      mopper.g.position.x = 145 + x * 14;
      mopper.face(0);
      mopper.stride(tau * 0.4, 0.35);
      const sw = Math.sin(tau * 3);
      mopper.body.rotation.y = sw * 0.35;
      mopper.arms(0.9 + sw * 0.15, 0.7 - sw * 0.15);
    }
    tech.arms(1.15 + Math.sin(tau * 5) * 0.2, 0.9);
    tech.bend(0.12);

    parts.count = np;
    caps.count = nc;
    cartons.count = nk;
    parts.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    cartons.instanceMatrix.needsUpdate = true;
  });
}
