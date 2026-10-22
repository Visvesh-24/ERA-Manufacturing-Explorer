// Materials and procedural canvas textures for the daylight campus.
import * as THREE from 'three';

let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function tex(size, draw, { repeat = true, color = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  return t;
}
function speckle(g, n, size, colors, rmax = 1.6) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    const r = rnd() * rmax;
    g.fillRect(rnd() * size, rnd() * size, r + 0.5, r + 0.5);
  }
}

const T = {
  concrete: tex(256, (g, s) => {
    g.fillStyle = '#c4ccd6';
    g.fillRect(0, 0, s, s);
    speckle(g, 2600, s, ['#bac3ce', '#cdd4dd', '#bfc7d2', '#d3d9e1'], 2);
    g.strokeStyle = 'rgba(90,100,120,.28)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, s - 2, s - 2);
  }),
  asphalt: tex(256, (g, s) => {
    g.fillStyle = '#6b7383';
    g.fillRect(0, 0, s, s);
    speckle(g, 3600, s, ['#626a7a', '#747c8c', '#6f7787', '#7d8595'], 1.4);
  }),
  grass: tex(256, (g, s) => {
    g.fillStyle = '#7fb069';
    g.fillRect(0, 0, s, s);
    speckle(g, 5000, s, ['#76a660', '#88b972', '#93c27c', '#6d9c58'], 1.8);
  }),
  epoxy: tex(256, (g, s) => {
    g.fillStyle = '#d3dae2';
    g.fillRect(0, 0, s, s);
    speckle(g, 1400, s, ['#ccd3dc', '#dae0e7', '#c7ced8'], 2.4);
    g.strokeStyle = 'rgba(80,95,125,.18)';
    g.lineWidth = 1.5;
    g.strokeRect(0.75, 0.75, s - 1.5, s - 1.5);
  }),
  corrugated: tex(128, (g, s) => {
    for (let x = 0; x < s; x++) {
      const v = 0.5 + 0.5 * Math.sin((x / s) * Math.PI * 2 * 8);
      const c = Math.round(170 + v * 40);
      g.fillStyle = `rgb(${c - 8},${c},${c + 14})`;
      g.fillRect(x, 0, 1, s);
    }
  }),
  panelWall: tex(256, (g, s) => {
    g.fillStyle = '#c3cbd8';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#b6bfce';
    for (let y = 0; y < s; y += 32) g.fillRect(0, y, s, 2);
    g.fillStyle = 'rgba(255,255,255,.25)';
    for (let y = 2; y < s; y += 32) g.fillRect(0, y, s, 1);
  }),
  roof: tex(256, (g, s) => {
    g.fillStyle = '#b9c2cd';
    g.fillRect(0, 0, s, s);
    speckle(g, 900, s, ['#b1bac6', '#c1cad4'], 2);
    g.strokeStyle = 'rgba(80,92,112,.3)';
    g.lineWidth = 2;
    for (let x = 0; x < s; x += 64) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, s);
      g.stroke();
    }
  }),
  solar: tex(128, (g, s) => {
    g.fillStyle = '#16294f';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = '#5577aa';
    g.lineWidth = 1;
    for (let i = 0; i <= s; i += 16) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, s);
      g.moveTo(0, i);
      g.lineTo(s, i);
      g.stroke();
    }
  }),
  ribs: tex(128, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 8) {
      g.fillStyle = 'rgba(0,0,0,.22)';
      g.fillRect(x, 0, 2, s);
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.fillRect(x + 3, 0, 1, s);
    }
  }),
  cardboard: tex(128, (g, s) => {
    g.fillStyle = '#c8955a';
    g.fillRect(0, 0, s, s);
    speckle(g, 500, s, ['#bd8a50', '#d3a066'], 1.5);
    g.fillStyle = '#e8c690';
    g.fillRect(s * 0.45, 0, s * 0.1, s);
  }),
  wood: tex(128, (g, s) => {
    g.fillStyle = '#a07a50';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 16) {
      g.fillStyle = 'rgba(60,40,20,.45)';
      g.fillRect(0, y, s, 2);
    }
    speckle(g, 400, s, ['#8f6c45', '#b08a5e'], 1.2);
  }),
  grid: tex(512, (g, s) => {
    g.fillStyle = '#dfe5ec';
    g.fillRect(0, 0, s, s);
    speckle(g, 2200, s, ['#d8dfe7', '#e4e9ef', '#d5dce4'], 2.2);
    g.strokeStyle = 'rgba(120,135,160,.16)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, s - 2, s - 2);
    g.strokeStyle = 'rgba(120,135,160,.07)';
    g.lineWidth = 1;
    for (let i = s / 4; i < s; i += s / 4) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, s);
      g.moveTo(0, i);
      g.lineTo(s, i);
      g.stroke();
    }
  }),
  dash: tex(64, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.fillStyle = '#ffffff';
    g.fillRect(0, s * 0.3, s * 0.5, s * 0.4);
  }),
  water: tex(256, (g, s) => {
    g.fillStyle = '#5e9cc9';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = `rgba(225,242,255,${0.12 + rnd() * 0.25})`;
      g.lineWidth = 1 + rnd() * 1.5;
      const x = rnd() * s;
      const y = rnd() * s;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 10, y - 4, x + 22, y);
      g.stroke();
    }
  }),
  route: tex(128, (g, s) => {
    g.clearRect(0, 0, s, s);
    const grd = g.createLinearGradient(0, 0, s, 0);
    grd.addColorStop(0, 'rgba(255,190,90,0)');
    grd.addColorStop(0.5, 'rgba(255,200,110,1)');
    grd.addColorStop(1, 'rgba(255,190,90,0)');
    g.fillStyle = grd;
    g.fillRect(0, s * 0.3, s, s * 0.4);
  }),
  smoke: tex(64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,.85)');
    r.addColorStop(0.6, 'rgba(244,247,251,.35)');
    r.addColorStop(1, 'rgba(244,247,251,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  }, { repeat: false }),
  shadow: tex(64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(30,40,60,.38)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  }, { repeat: false }),
};
export { T as textures };

function std(color, o = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.75, metalness: o.metal ?? 0.05, ...o.extra });
  if (o.map) m.map = o.map;
  if (o.emissive) {
    m.emissive = new THREE.Color(o.emissive);
    m.emissiveIntensity = o.ei ?? 1;
  }
  if (o.transparent) {
    m.transparent = true;
    m.opacity = o.opacity ?? 0.5;
    m.depthWrite = o.depthWrite ?? false;
  }
  if (o.side) m.side = o.side;
  m.userData.ts = o.ts || 4;
  return m;
}

export const M = {
  ground: std('#ffffff', { map: T.grid, rough: 0.95, ts: 16 }),
  pad: std('#e2e6ec', { map: T.concrete, rough: 0.92, ts: 6 }),
  apron: std('#eef1f5', { map: T.concrete, rough: 0.9, ts: 6 }),
  asphalt: std('#ffffff', { map: T.asphalt, rough: 0.95, ts: 8 }),
  grass: std('#ffffff', { map: T.grass, rough: 1, ts: 6 }),
  epoxy: std('#ffffff', { map: T.epoxy, rough: 0.7, ts: 6 }),
  paint: std('#f2b33b', { rough: 0.6, ts: 2 }),
  paintWhite: std('#f4f6f9', { rough: 0.6 }),
  wall: std('#ffffff', { map: T.panelWall, rough: 0.75, ts: 8 }),
  wallMid: std('#a9b8cc', { rough: 0.72 }),
  wallInner: std('#eef1f5', { rough: 0.85 }),
  trim: std('#ffffff', { rough: 0.55 }),
  clad: std('#ffffff', { map: T.corrugated, rough: 0.6, metal: 0.15, ts: 3 }),
  cladBlue: std('#8fb0e4', { map: T.corrugated, rough: 0.6, metal: 0.15, ts: 3 }),
  roof: std('#ffffff', { map: T.roof, rough: 0.85, ts: 10 }),
  steel: std('#b5bfcc', { rough: 0.42, metal: 0.55 }),
  darkSteel: std('#56627a', { rough: 0.5, metal: 0.5 }),
  beam: std('#8796ad', { rough: 0.7, metal: 0.25 }),
  rackBlue: std('#2f5fd0', { rough: 0.5, metal: 0.3 }),
  rackOrange: std('#f08a35', { rough: 0.55, metal: 0.2 }),
  tank: std('#eef2f6', { rough: 0.35, metal: 0.45 }),
  tankDark: std('#8a96aa', { rough: 0.45, metal: 0.4 }),
  glass: std('#a9c8ec', { rough: 0.08, metal: 0.3, transparent: true, opacity: 0.4 }),
  winDark: std('#8eb2da', { rough: 0.15, metal: 0.2 }),
  winLit: std('#a6c4e6', { rough: 0.15, metal: 0.2 }),
  winCool: std('#9bbde2', { rough: 0.15, metal: 0.2 }),
  screen: std('#1d3157', { emissive: '#5a9cf0', ei: 0.35, rough: 0.2 }),
  ledGreen: std('#2fcf6b', { emissive: '#2fcf6b', ei: 0.3 }),
  ledBlue: std('#3aa8e8', { emissive: '#3aa8e8', ei: 0.3 }),
  beacon: std('#f2a63b', { emissive: '#f2a63b', ei: 0.35 }),
  beaconRed: std('#e0503a', { emissive: '#e0503a', ei: 0.35 }),
  lampHead: std('#f4f1e8', { rough: 0.4 }),
  hallLight: std('#f2f4f7', { rough: 0.5 }),
  door: std('#e07a35', { rough: 0.55 }),
  shutter: std('#dde3ea', { map: T.panelWall, rough: 0.6, ts: 2.5 }),
  dockDark: std('#3a4458', { rough: 0.8 }),
  amber: std('#f2a63b', { rough: 0.5, metal: 0.1 }),
  yellow: std('#f6c445', { rough: 0.45, metal: 0.1 }),
  orange: std('#e8742f', { rough: 0.5 }),
  red: std('#cf4b34', { rough: 0.5, metal: 0.1 }),
  blue: std('#3c6ad6', { rough: 0.5, metal: 0.15 }),
  navy: std('#1f3570', { rough: 0.5 }),
  green: std('#3f9a5a', { rough: 0.55 }),
  teal: std('#2fa595', { rough: 0.5 }),
  white: std('#f4f6f9', { rough: 0.5 }),
  offWhite: std('#dde3ea', { rough: 0.6 }),
  slate: std('#5b6a87', { rough: 0.55 }),
  gray: std('#8995a8', { rough: 0.6 }),
  rubber: std('#22262e', { rough: 0.9 }),
  chrome: std('#e4e9f0', { rough: 0.18, metal: 0.9 }),
  cardboard: std('#ffffff', { map: T.cardboard, rough: 0.85, ts: 1.4 }),
  sheet: std('#d5a874', { rough: 0.85 }),
  wood: std('#ffffff', { map: T.wood, rough: 0.9, ts: 1.2 }),
  wrapFilm: std('#eef4ff', { rough: 0.1, metal: 0.1, transparent: true, opacity: 0.6 }),
  solar: std('#ffffff', { map: T.solar, rough: 0.25, metal: 0.45, ts: 2 }),
  container: ['#2fa595', '#e9a03a', '#3c6ad6', '#5b6a87', '#cf4b34', '#3f9a5a'].map((c) =>
    std('#ffffff', { map: T.ribs, rough: 0.6, metal: 0.15, ts: 2.4, extra: { color: new THREE.Color(c) } }),
  ),
  water: std('#7fb2dc', { map: T.water, rough: 0.3, metal: 0, ts: 8 }),
  leafA: std('#4f9a5c', { rough: 0.9 }),
  leafB: std('#66b06c', { rough: 0.9 }),
  trunk: std('#6b5642', { rough: 0.9 }),
  skin: [std('#e3b18c'), std('#c68b5f'), std('#8d5a3b'), std('#f0c7a4'), std('#a8714a')],
  suit: [std('#3f6fd8'), std('#2fa595'), std('#5b84f2'), std('#2f5be0'), std('#e07a35'), std('#26314d')],
  hardhat: std('#f6b638', { rough: 0.35 }),
  hardhatWhite: std('#f2f5fa', { rough: 0.35 }),
  hiVis: std('#d9f05a', { rough: 0.5 }),
  pants: std('#2a3550', { rough: 0.8 }),
  desk: std('#e8dcc6', { rough: 0.6 }),
  serverBody: std('#1c2436', { rough: 0.4, metal: 0.5 }),
  filmRoll: std('#e6eef8', { rough: 0.2, metal: 0.2 }),
  // ERA amber route lines stay as flat colour (no glow)
  route: new THREE.MeshBasicMaterial({ map: T.route, transparent: true, depthWrite: false, opacity: 0.9, color: '#f2a63b' }),
  routeBase: new THREE.MeshBasicMaterial({ color: '#f2a63b', transparent: true, opacity: 0.28, depthWrite: false }),
  lane: new THREE.MeshBasicMaterial({ map: T.dash, transparent: true, depthWrite: false, color: '#ffffff', opacity: 0.85 }),
  lineYellow: new THREE.MeshBasicMaterial({ color: '#f2b33b', transparent: true, opacity: 0.95, depthWrite: false }),
  lineWhite: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false }),
  area: new THREE.MeshBasicMaterial({ color: '#f2a63b', transparent: true, opacity: 0.14, depthWrite: false }),
  areaEdge: new THREE.MeshBasicMaterial({ color: '#e8962a', transparent: true, opacity: 0.95, depthWrite: false }),
  packet: new THREE.MeshBasicMaterial({ color: '#e8962a' }),
  blobShadow: new THREE.MeshBasicMaterial({ map: T.shadow, transparent: true, depthWrite: false }),
};
M.route.map.wrapS = THREE.RepeatWrapping;

// Shell materials fade when a building opens; each building gets its own clones.
export function fading(mat) {
  const m = mat.clone();
  m.opacity = mat.transparent ? mat.opacity : 1;
  m.transparent = true;
  m.userData = { ...mat.userData };
  return m;
}
