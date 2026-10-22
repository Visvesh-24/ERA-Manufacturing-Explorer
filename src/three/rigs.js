// Animated rigs: an industrial robot arm solved with inverse kinematics, a forklift
// that follows a scripted work cycle, and a worker whose arms and body can be posed.
import { M } from './mats.js';
import { part } from './sink.js';
import * as K from './models.js';

export const smooth = (x) => x * x * (3 - 2 * x);
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------- robot arm
// Base yaw, shoulder, elbow and wrist pitch. The wrist keeps the tool pointing
// straight down, so the gripper always meets parts square, as on a real cell.
export function robot(parent, x, y, o = {}) {
  const { L1 = 2.3, L2 = 2.1, T = 0.6, H = 1.0, ped = 0.5, color = M.amber, vacuum = false } = o;
  const base = part(parent, x, y, 0);
  base.s.box(-0.6, -0.6, 0, 1.2, 1.2, ped, M.darkSteel);
  base.s.box(-0.7, -0.7, 0, 1.4, 1.4, 0.08, M.darkSteel);
  base.s.cyl(0, 0, ped, 0.55, 0.22, M.slate, { seg: 28 });
  const yaw = part(base.g, 0, 0, ped + 0.22);
  yaw.s.cyl(0, 0, 0, 0.52, 0.3, color, { seg: 28 });
  yaw.s.cbox(0, 0, 0.3, 0.72, 0.86, H - 0.42, color);
  yaw.s.cbox(-0.55, 0, 0.35, 0.42, 0.56, 0.5, M.darkSteel);
  const sh = part(yaw.g, 0, 0, H);
  sh.s.cyl(0, 0, 0, 0.34, 1.0, M.darkSteel, { axis: 'y', seg: 22 });
  sh.s.cyl(0, 0.5, 0, 0.24, 0.12, color, { axis: 'y', seg: 18 });
  sh.s.cbox(L1 / 2, 0, -0.21, L1, 0.4, 0.42, color);
  sh.s.cbox(L1 * 0.55, 0.21, -0.12, L1 * 0.5, 0.05, 0.24, M.darkSteel);
  const el = part(sh.g, L1, 0, 0);
  el.s.cyl(0, 0, 0, 0.27, 0.74, M.darkSteel, { axis: 'y', seg: 20 });
  el.s.cbox(L2 / 2, 0, -0.15, L2, 0.3, 0.3, color);
  el.s.cbox(-0.38, 0, -0.22, 0.5, 0.42, 0.44, color);
  el.s.cyl(-0.62, 0, 0, 0.2, 0.36, M.darkSteel, { axis: 'x', seg: 14 });
  const wr = part(el.g, L2, 0, 0);
  wr.s.sphere(0, 0, 0, 0.19, M.darkSteel, { seg: 14 });
  wr.s.cyl(0.14, 0, 0, 0.14, 0.18, M.steel, { axis: 'x', seg: 14 });
  const fingers = [];
  if (vacuum) {
    // vacuum pad for cartons
    wr.s.cbox(T - 0.12, 0, -0.06, 0.16, 0.56, 0.12, M.darkSteel, {});
    wr.s.cbox(T - 0.02, 0, -0.28, 0.06, 0.6, 0.56, M.rubber);
  } else {
    wr.s.cbox(T - 0.32, 0, -0.14, 0.2, 0.44, 0.28, M.darkSteel);
    for (const side of [-1, 1]) {
      const f = part(wr.g, T - 0.22, side * 0.14, 0);
      f.s.cbox(0.12, 0, -0.06, 0.26, 0.06, 0.12, M.chrome);
      fingers.push({ g: f.g, side });
    }
  }
  const shZ = ped + 0.22 + H;
  let open = 1;
  return {
    g: base.g,
    // aim the tool tip at plan point (px, py, pz); grip 0 = open, 1 = closed
    reach(px, py, pz, grip = 0) {
      const dx = px - x;
      const dy = py - y;
      yaw.g.rotation.y = -Math.atan2(dy, dx);
      const a = Math.hypot(dx, dy);
      const b = pz + T - shZ;
      const D = Math.max(Math.abs(L1 - L2) + 0.05, Math.min(L1 + L2 - 0.02, Math.hypot(a, b)));
      const q2 = Math.acos(Math.max(-1, Math.min(1, (D * D - L1 * L1 - L2 * L2) / (2 * L1 * L2))));
      const a1 = Math.atan2(b, a) + Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2));
      const a2 = a1 - q2;
      sh.g.rotation.z = a1;
      el.g.rotation.z = -q2;
      wr.g.rotation.z = -Math.PI / 2 - a2;
      open = 1 - grip;
      for (const f of fingers) f.g.position.z = f.side * (0.1 + open * 0.12);
    },
    // follow keyframes [[t, [x, y, z], grip], ...] at time u, easing in cylindrical
    // coordinates around the base so the arm swings like a real robot
    follow(keys, u) {
      let i = 0;
      while (i < keys.length - 2 && u >= keys[i + 1][0]) i++;
      const [t0, p0, g0] = keys[i];
      const [t1, p1, g1] = keys[i + 1];
      const f = smooth(clamp01((u - t0) / Math.max(1e-3, t1 - t0)));
      const ang0 = Math.atan2(p0[1] - y, p0[0] - x);
      const ang1 = Math.atan2(p1[1] - y, p1[0] - x);
      const r0 = Math.hypot(p0[0] - x, p0[1] - y);
      const r1 = Math.hypot(p1[0] - x, p1[1] - y);
      const ang = ang0 + wrapAngle(ang1 - ang0) * f;
      const r = r0 + (r1 - r0) * f;
      const z = p0[2] + (p1[2] - p0[2]) * f;
      const tip = [x + Math.cos(ang) * r, y + Math.sin(ang) * r, z];
      this.reach(tip[0], tip[1], tip[2], g0 + (g1 - g0) * f);
      return tip;
    },
  };
}

// ---------------------------------------------------------------- forklift
// A forklift with its pivot at the middle of the truck. phi is the plan direction
// the forks point in. Loads hang off `anchor`, which sits in the pallet pockets.
export const FORK_REACH = 2.07;
export function lift(parent, x, y, phi, o = {}) {
  const root = part(parent, x, y, 0, phi + Math.PI);
  const inner = K.forklift(root.g, -1.05, -0.625, 0, { load: false, ...o });
  const anchor = part(inner.forks, -0.725, 0.625, -0.03);
  return { g: root.g, forks: inner.forks, anchor: anchor.g, s: anchor.s };
}

// Compile a work cycle. Steps: { to: [x, y], rev }, { face: phi }, { lift: h }, { wait: s }, { mark: name }.
// Forks point the way the truck drives unless rev is set. Turns are inserted automatically.
export function cycle(start, steps, { v = 3.4, w = 1.5 } = {}) {
  const segs = [];
  const marks = {};
  let s = { x: start[0], y: start[1], phi: start[2], h: start[3] ?? -0.03 };
  let t = 0;
  const push = (kind, dur, to) => {
    segs.push({ kind, t0: t, t1: t + dur, from: { ...s }, to: { ...s, ...to } });
    t += dur;
    s = { ...s, ...to };
  };
  const turnTo = (phi) => {
    const d = wrapAngle(phi - s.phi);
    if (Math.abs(d) > 1e-3) push('turn', Math.abs(d) / w + 0.35, { phi: s.phi + d });
  };
  for (const st of steps) {
    if (st.mark) marks[st.mark] = t;
    else if (st.face != null) turnTo(st.face);
    else if (st.lift != null) push('lift', 0.35 + Math.abs(st.lift - s.h) * 1.1, { h: st.lift });
    else if (st.wait) push('wait', st.wait, {});
    else if (st.to) {
      const dx = st.to[0] - s.x;
      const dy = st.to[1] - s.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-3) continue;
      turnTo(Math.atan2(dy, dx) + (st.rev ? Math.PI : 0));
      push('drive', len / v + 0.7, { x: st.to[0], y: st.to[1] });
    }
  }
  const T = t;
  return {
    T,
    marks,
    end: s,
    at(tt) {
      const q = Math.max(0, Math.min(T, tt));
      let g = segs[segs.length - 1];
      for (const sg of segs) {
        if (q < sg.t1) {
          g = sg;
          break;
        }
      }
      const f = smooth(clamp01((q - g.t0) / (g.t1 - g.t0)));
      const a = g.from;
      const b = g.to;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, phi: a.phi + (b.phi - a.phi) * f, h: a.h + (b.h - a.h) * f, moving: g.kind === 'drive' || g.kind === 'turn' };
    },
  };
}
export function poseLift(fl, st) {
  fl.g.position.x = st.x;
  fl.g.position.z = st.y;
  fl.g.rotation.y = -(st.phi + Math.PI);
  fl.forks.position.y = 0.12 + st.h;
}

// ---------------------------------------------------------------- worker
// Faces local +x. Arms pitch forward with rotation.z; `hold` sits between the hands.
export function worker(parent, x, y, rot = 0, o = {}) {
  const suit = o.suit ?? K.pick(M.suit);
  const skin = o.skin ?? K.pick(M.skin);
  const root = part(parent, x, y, 0, rot);
  const body = part(root.g, 0, 0, 0);
  const s = body.s;
  const leg = (side) => {
    const p = part(body.g, 0, side * 0.13, 0.86);
    p.s.cbox(0, 0, -0.86, 0.2, 0.2, 0.86, M.pants);
    p.s.cbox(0.05, 0, -0.86, 0.3, 0.2, 0.1, M.rubber);
    return p.g;
  };
  const legL = leg(-1);
  const legR = leg(1);
  s.cbox(0, 0, 0.85, 0.3, 0.52, 0.62, suit);
  if (o.vest !== false) s.cbox(0, 0, 1.12, 0.32, 0.54, 0.08, M.hiVis);
  s.sphere(0, 0, 1.68, 0.17, skin, { seg: 12 });
  if (o.hat !== false) {
    const hm = o.hat === 'white' ? M.hardhatWhite : M.hardhat;
    s.sphere(0, 0, 1.73, 0.19, hm, { half: true, seg: 12 });
    s.cyl(0.03, 0, 1.72, 0.24, 0.03, hm, { seg: 14 });
  }
  const arm = (side) => {
    const p = part(body.g, 0, side * 0.33, 1.44);
    p.s.cbox(0, 0, -0.55, 0.14, 0.13, 0.55, suit);
    p.s.sphere(0, 0, -0.6, 0.07, skin, { seg: 8 });
    return p.g;
  };
  const armL = arm(-1);
  const armR = arm(1);
  const hold = part(body.g, 0.5, 0, 1.0);
  return {
    g: root.g,
    body: body.g,
    hold: hold.g,
    holdSink: hold.s,
    arms(l, r = l) {
      armL.rotation.z = l;
      armR.rotation.z = r;
    },
    face(phi) {
      root.g.rotation.y = -phi;
    },
    bend(a) {
      body.g.rotation.z = -a;
    },
    // walking stride; amt 0 stands still
    stride(t, amt = 1) {
      const a = Math.sin(t * 7) * 0.5 * amt;
      legL.rotation.z = a;
      legR.rotation.z = -a;
      return a;
    },
  };
}
