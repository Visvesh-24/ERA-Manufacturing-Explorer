// Geometry sinks. Models are written once against a tiny API in plan coordinates
// (x right-ish, y toward the viewer's left, z up) and can be drawn either into a
// Builder (merged static geometry, few draw calls) or a GroupSink (live meshes
// that animate). Three.js is y-up, so plan (x, y, z) maps to (x, z, y).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Box with UVs in world units so textures tile instead of stretching.
export function boxGeo(w, h, d, ts = 4) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [
    [d, h], [d, h], // ±x
    [w, d], [w, d], // ±y
    [w, h], [w, h], // ±z
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = dims[f];
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * su) / ts, (uv.getY(k) * sv) / ts);
    }
  }
  return g;
}

const tsOf = (mat) => mat.userData.ts || 4;

class Base {
  constructor() {
    this.frames = [new THREE.Matrix4()];
  }
  get frame() {
    return this.frames[this.frames.length - 1];
  }
  // Local frame: origin at plan (x, y, z), rotated by rot radians around the vertical.
  // rot = 0 keeps +x; rot = Math.PI / 2 turns +x toward plan +y.
  within(x, y, z, rot, fn) {
    const m = new THREE.Matrix4().makeRotationY(-rot).setPosition(x, z, y);
    this.frames.push(this.frame.clone().multiply(m));
    try {
      fn(this);
    } finally {
      this.frames.pop();
    }
    return this;
  }
  box(x, y, z, w, d, h, mat, o = {}) {
    const g = boxGeo(w, h, d, tsOf(mat));
    if (o.rot) g.rotateY(-o.rot);
    g.translate(x + w / 2, z + h / 2, y + d / 2);
    return this.put(g, mat, o);
  }
  // Box centred on (cx, cy) on the ground plan, rotated about its own centre.
  cbox(cx, cy, z, w, d, h, mat, o = {}) {
    const g = boxGeo(w, h, d, tsOf(mat));
    if (o.rot) g.rotateY(-o.rot);
    if (o.tilt) g.rotateZ(o.tilt);
    g.translate(cx, z + h / 2, cy);
    return this.put(g, mat, o);
  }
  cyl(cx, cy, z, r, h, mat, o = {}) {
    const g = new THREE.CylinderGeometry(o.rTop ?? r, r, h, o.seg || 24, 1, !!o.open);
    if (o.axis === 'x') g.rotateZ(Math.PI / 2);
    if (o.axis === 'y') g.rotateX(Math.PI / 2);
    g.translate(cx, z + (o.axis ? 0 : h / 2), cy);
    return this.put(g, mat, o);
  }
  sphere(cx, cy, z, r, mat, o = {}) {
    const g = new THREE.SphereGeometry(r, o.seg || 16, Math.max(8, (o.seg || 16) >> 1), 0, Math.PI * 2, 0, o.half ? Math.PI / 2 : Math.PI);
    if (o.sy) g.scale(1, o.sy, 1);
    g.translate(cx, z, cy);
    return this.put(g, mat, o);
  }
  // Flat rectangle on the ground at height z.
  plane(x0, y0, x1, y1, z, mat, o = {}) {
    const w = x1 - x0;
    const d = y1 - y0;
    const g = new THREE.PlaneGeometry(w, d);
    const ts = tsOf(mat);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / ts, (uv.getY(i) * d) / ts);
    g.rotateX(-Math.PI / 2);
    g.translate(x0 + w / 2, z, y0 + d / 2);
    return this.put(g, mat, { cast: false, ...o });
  }
  // Vertical rectangle facing +y (plane y = const) or +x (plane x = const).
  panel(axis, c, a0, a1, z0, z1, mat, o = {}) {
    const w = a1 - a0;
    const h = z1 - z0;
    const g = new THREE.PlaneGeometry(w, h);
    const ts = tsOf(mat);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / ts, (uv.getY(i) * h) / ts);
    if (axis === 'y') g.translate(a0 + w / 2, z0 + h / 2, c);
    else {
      g.rotateY(Math.PI / 2);
      g.translate(c, z0 + h / 2, a0 + w / 2);
    }
    return this.put(g, mat, { cast: false, ...o });
  }
  geo(g, mat, o = {}) {
    return this.put(g, mat, o);
  }
}

// Collects static geometry and merges it by (tag, material).
export class Builder extends Base {
  constructor() {
    super();
    this.buckets = new Map();
    this.tag = '';
  }
  tagged(tag, fn) {
    const prev = this.tag;
    this.tag = tag;
    try {
      fn(this);
    } finally {
      this.tag = prev;
    }
  }
  put(g, mat, o) {
    if (g.index) g = g.toNonIndexed();
    g.applyMatrix4(this.frame);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const tag = o.tag ?? this.tag;
    const cast = o.cast ?? true;
    const key = `${tag}|${mat.uuid}|${cast ? 1 : 0}`;
    if (!this.buckets.has(key)) this.buckets.set(key, { tag, mat, cast, geos: [] });
    this.buckets.get(key).geos.push(g);
    return g;
  }
  flush(parent) {
    const meshes = [];
    for (const { tag, mat, cast, geos } of this.buckets.values()) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast && !mat.transparent;
      mesh.receiveShadow = true;
      mesh.userData.tag = tag;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.buckets.clear();
    return meshes;
  }
}

// Adds real meshes to a Group, for anything that moves.
export class GroupSink extends Base {
  constructor(group = new THREE.Group()) {
    super();
    this.group = group;
  }
  put(g, mat, o) {
    g.applyMatrix4(this.frame);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = (o.cast ?? true) && !mat.transparent;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }
}

// A movable part: a Group placed at plan (x, y, z), returned with a sink to draw into
// in its local coordinates. Pivots are simply the group origin.
export function part(parent, x = 0, y = 0, z = 0, rot = 0) {
  const g = new THREE.Group();
  g.position.set(x, z, y);
  g.rotation.y = -rot;
  parent.add(g);
  return { g, s: new GroupSink(g) };
}
