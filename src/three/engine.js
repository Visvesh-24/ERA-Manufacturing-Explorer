// Renderer, daylight and the camera rig.
// The camera keeps a fixed isometric-style angle; it pans and zooms with
// trackpad, mouse and touch, with momentum and eased motion.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const AZ = Math.PI / 4; // camera sits toward plan +x / +y
const EL = (48 * Math.PI) / 180;
const FOV = 30;
const TAN = Math.tan((FOV * Math.PI) / 360);
const DIR = new THREE.Vector3(Math.cos(EL) * Math.sin(AZ), Math.sin(EL), Math.cos(EL) * Math.cos(AZ));
// ground directions for screen right and screen up
const RIGHT = new THREE.Vector3(Math.cos(AZ), 0, -Math.sin(AZ));
const UP = new THREE.Vector3(-Math.sin(AZ), 0, -Math.cos(AZ));

export function createEngine(host, { bounds }) {
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'gl';
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d6e2ef');
  scene.fog = new THREE.Fog('#d6e2ef', 420, 1050);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 2200);

  // clean bright day: soft sky fill, a faint studio environment for metals, and one
  // warm sun from the viewer's upper left so the faces we see are lit
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;
  const hemi = new THREE.HemisphereLight('#e8f0ff', '#a3adba', 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e4', 2.7);
  sun.position.set(35, 230, 235);
  sun.target.position.set(115, 0, 65);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -230, right: 230, top: 200, bottom: -200, near: 20, far: 650 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.45;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);

  // ---------------------------------------------------------------- camera
  const cam = { tx: 100, tz: 70, dist: 180 };
  const goal = { ...cam };
  const vel = { x: 0, z: 0 };
  const limits = { min: 16, max: 560 };
  let w = 1;
  let h = 1;
  let fly = null;

  const pxScale = (dist) => {
    const k = (2 * dist * TAN) / h;
    return [k, k / Math.sin(EL)];
  };
  function place(c, obj) {
    obj.position.set(c.tx + DIR.x * c.dist, DIR.y * c.dist, c.tz + DIR.z * c.dist);
    obj.lookAt(c.tx, 0, c.tz);
    obj.updateMatrixWorld();
  }
  function clampGoal() {
    goal.dist = Math.min(limits.max, Math.max(limits.min, goal.dist));
    goal.tx = Math.min(bounds.x1, Math.max(bounds.x0, goal.tx));
    goal.tz = Math.min(bounds.z1, Math.max(bounds.z0, goal.tz));
  }
  // Move the view so content follows the finger by (dx, dy) screen pixels.
  function panBy(dx, dy, immediate = true) {
    const [kx, ky] = pxScale(cam.dist);
    const mx = -RIGHT.x * dx * kx + UP.x * dy * ky;
    const mz = -RIGHT.z * dx * kx + UP.z * dy * ky;
    goal.tx += mx;
    goal.tz += mz;
    clampGoal();
    if (immediate) {
      cam.tx = goal.tx;
      cam.tz = goal.tz;
    }
    return [mx, mz];
  }

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function groundAt(px, py, c = camera) {
    ndc.set((px / w) * 2 - 1, -(py / h) * 2 + 1);
    ray.setFromCamera(ndc, c);
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(ground, p) ? p : null;
  }
  const ghost = new THREE.PerspectiveCamera(FOV, 1, 1, 2200);
  // Zoom so the ground point under (px, py) stays put.
  function zoomAt(factor, px, py, immediate = false) {
    ghost.aspect = camera.aspect;
    ghost.updateProjectionMatrix();
    place(goal, ghost);
    const before = groundAt(px, py, ghost);
    goal.dist = Math.min(limits.max, Math.max(limits.min, goal.dist * factor));
    place(goal, ghost);
    const after = groundAt(px, py, ghost);
    if (before && after) {
      goal.tx += before.x - after.x;
      goal.tz += before.z - after.z;
    }
    clampGoal();
    if (immediate) Object.assign(cam, goal);
  }
  // Fly so ground point (x, z) appears at screen centre + offset.
  function flyTo(x, z, dist, { offset = [0, 0], ms = 1100 } = {}) {
    const d = Math.min(limits.max, Math.max(limits.min, dist));
    const [kx, ky] = pxScale(d);
    const to = {
      dist: d,
      tx: x - RIGHT.x * offset[0] * kx + UP.x * offset[1] * ky,
      tz: z - RIGHT.z * offset[0] * kx + UP.z * offset[1] * ky,
    };
    vel.x = vel.z = 0;
    if (reduced() || ms === 0) {
      Object.assign(cam, to);
      Object.assign(goal, to);
      fly = null;
      return;
    }
    fly = { from: { ...cam }, to, t0: performance.now(), ms };
  }

  // Fly so the 3D point (plan x, y, z) lands exactly at screen (sx, sy).
  const pv = new THREE.Vector3();
  function flyToPoint(x, y, z, dist, { screen = [w / 2, h / 2], ms = 1100 } = {}) {
    const d = Math.min(limits.max, Math.max(limits.min, dist));
    const k0 = z / Math.tan(EL);
    const c = { tx: x - Math.sin(AZ) * k0, tz: y - Math.cos(AZ) * k0, dist: d };
    ghost.aspect = camera.aspect;
    ghost.updateProjectionMatrix();
    for (let i = 0; i < 6; i++) {
      place(c, ghost);
      pv.set(x, z, y).project(ghost);
      const px = ((pv.x + 1) / 2) * w;
      const py = ((1 - pv.y) / 2) * h;
      const depth = ghost.position.distanceTo(pv.set(x, z, y));
      const k = (2 * depth * TAN) / h;
      const ex = screen[0] - px;
      const ey = screen[1] - py;
      c.tx += -RIGHT.x * ex * k + UP.x * ey * (k / Math.sin(EL));
      c.tz += -RIGHT.z * ex * k + UP.z * ey * (k / Math.sin(EL));
    }
    vel.x = vel.z = 0;
    if (reduced() || ms === 0) {
      Object.assign(cam, c);
      Object.assign(goal, c);
      fly = null;
      return;
    }
    fly = { from: { ...cam }, to: c, t0: performance.now(), ms };
  }

  // ---------------------------------------------------------------- input
  const el = host;
  const pointers = new Map();
  let moved = false;
  let samples = [];
  let pinch = null;
  const listeners = { tap: [], hover: [], frame: [], interact: [] };
  const on = (ev, fn) => listeners[ev].push(fn);
  const emit = (ev, ...a) => listeners[ev].forEach((f) => f(...a));
  const local = (e) => {
    const r = el.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const isUi = (e) => !!e.target.closest('.hud, .pop, .overlay, .marker');

  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.hud, .pop, .overlay')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.set(e.pointerId, { start: local(e), cur: local(e), onMarker: !!e.target.closest('.marker') });
    fly = null;
    vel.x = vel.z = 0;
    if (pointers.size === 1) moved = false;
    // seed with the press, so a drag whose moves arrive coalesced still has a velocity
    samples = [{ t: e.timeStamp || performance.now(), mx: 0, mz: 0 }];
    pinch = null;
    emit('interact');
  });
  el.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse' && !isUi(e)) emit('hover', ...local(e));
      return;
    }
    const prev = p.cur;
    p.cur = local(e);
    if (pointers.size === 1) {
      if (!moved && Math.hypot(p.cur[0] - p.start[0], p.cur[1] - p.start[1]) < 6) return;
      if (!moved) {
        moved = true;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        el.classList.add('dragging');
      }
      const [mx, mz] = panBy(p.cur[0] - prev[0], p.cur[1] - prev[1]);
      // input timestamps, so momentum still reads right if a frame was slow
      const now = e.timeStamp || performance.now();
      samples.push({ t: now, mx, mz });
      // keep ~120ms of motion, but always the last few moves (slow frames)
      while (samples.length > 3 && now - samples[0].t > 120) samples.shift();
    } else if (pointers.size === 2) {
      moved = true;
      const [a, b] = [...pointers.values()].map((q) => q.cur);
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
      if (pinch) {
        zoomAt(pinch.d / d, mid[0], mid[1], true);
        panBy(mid[0] - pinch.mid[0], mid[1] - pinch.mid[1]);
      }
      pinch = { mid, d };
    }
  });
  const end = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    pinch = null;
    if (pointers.size) return;
    el.classList.remove('dragging');
    const idle = samples.length ? (e.timeStamp || performance.now()) - samples[samples.length - 1].t : 1e9;
    if (moved && samples.length > 1 && idle < 140 && !reduced()) {
      const span = Math.max(0.016, (samples[samples.length - 1].t - samples[0].t) / 1000);
      vel.x = samples.reduce((s, q) => s + q.mx, 0) / span;
      vel.z = samples.reduce((s, q) => s + q.mz, 0) / span;
      const sp = Math.hypot(vel.x, vel.z);
      const max = cam.dist * 4;
      if (sp > max) {
        vel.x *= max / sp;
        vel.z *= max / sp;
      }
    }
    if (!moved && e.type === 'pointerup' && !p.onMarker) emit('tap', ...p.cur);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  // Two-finger scroll pans; pinch arrives as ctrl+wheel (Chrome/Firefox/Edge on macOS).
  // A notched mouse wheel zooms instead.
  el.addEventListener(
    'wheel',
    (e) => {
      if (e.target.closest('.pop, .overlay, .drawer-panel')) return;
      e.preventDefault();
      fly = null;
      emit('interact');
      const [px, py] = local(e);
      const unit = e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? h : 1;
      const dx = e.deltaX * unit;
      const dy = e.deltaY * unit;
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(dy * 0.0085), px, py, true);
      } else if (e.deltaMode === 1 || (dx === 0 && Math.abs(dy) >= 100 && Number.isInteger(dy))) {
        zoomAt(Math.exp(Math.sign(dy) * 0.22), px, py, false);
      } else {
        vel.x = vel.z = 0;
        panBy(-dx, -dy);
      }
    },
    { passive: false }
  );
  // Safari trackpad pinch
  let gScale = 1;
  el.addEventListener('gesturestart', (e) => {
    e.preventDefault();
    gScale = 1;
    fly = null;
  });
  el.addEventListener('gesturechange', (e) => {
    e.preventDefault();
    const [px, py] = local(e);
    zoomAt(gScale / e.scale, px, py, true);
    gScale = e.scale;
  });
  el.addEventListener('gestureend', (e) => e.preventDefault());

  // ---------------------------------------------------------------- loop
  const tickers = [];
  let last = 0;
  let avg = 16;
  let prevT = 0;
  let dpr = renderer.getPixelRatio();
  let clock = 0; // animation time, frozen while paused
  const state = { paused: false };

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (fly) {
      const t = Math.min(1, (now - fly.t0) / fly.ms);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const hop = Math.hypot(fly.to.tx - fly.from.tx, fly.to.tz - fly.from.tz);
      const rise = Math.sin(Math.PI * e) * Math.min(0.45, hop / 500);
      cam.dist = Math.exp(Math.log(fly.from.dist) + (Math.log(fly.to.dist) - Math.log(fly.from.dist)) * e + rise);
      cam.tx = fly.from.tx + (fly.to.tx - fly.from.tx) * e;
      cam.tz = fly.from.tz + (fly.to.tz - fly.from.tz) * e;
      Object.assign(goal, cam);
      if (t >= 1) {
        Object.assign(goal, fly.to);
        fly = null;
      }
    } else {
      if (Math.abs(vel.x) + Math.abs(vel.z) > 0.02) {
        goal.tx += vel.x * dt;
        goal.tz += vel.z * dt;
        const f = Math.exp(-dt * 4);
        vel.x *= f;
        vel.z *= f;
        clampGoal();
      }
      const a = 1 - Math.exp(-dt * 16);
      cam.tx += (goal.tx - cam.tx) * a;
      cam.tz += (goal.tz - cam.tz) * a;
      cam.dist += (goal.dist - cam.dist) * a;
    }
    place(cam, camera);
    if (!state.paused) clock += dt;
    for (const t of tickers) t(clock, state.paused ? 0 : dt, now / 1000);
    emit('frame');
    renderer.render(scene, camera);

    if (prevT) avg = avg * 0.94 + (now - prevT) * 0.06;
    prevT = now;
    if (avg > 30 && dpr > 1) {
      dpr = Math.max(1, dpr - 0.25);
      renderer.setPixelRatio(dpr);
      resize();
      avg = 18;
    }
    requestAnimationFrame(frame);
  }

  function resize() {
    const r = el.getBoundingClientRect();
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(el);
  resize();
  place(cam, camera);

  const v = new THREE.Vector3();
  function toScreen(x, y, z) {
    v.set(x, z, y).project(camera);
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, behind: v.z > 1 || v.z < -1 };
  }
  function pick(px, py, objects) {
    ndc.set((px / w) * 2 - 1, -(py / h) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(objects, true)[0] || null;
  }
  // ground footprint of the screen (for the minimap)
  function viewQuad() {
    return [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => groundAt(x, y));
  }

  return {
    renderer,
    scene,
    camera,
    cam,
    goal,
    limits,
    hemi,
    sun,
    tickers,
    state,
    on,
    flyTo,
    flyToPoint,
    zoomAt: (f) => zoomAt(f, w / 2, h / 2),
    panBy: (dx, dy) => panBy(dx, dy, false),
    groundAt,
    toScreen,
    pick,
    viewQuad,
    pxScale,
    size: () => ({ w, h }),
    start() {
      requestAnimationFrame((t) => {
        last = t;
        frame(t);
      });
    },
  };
}
