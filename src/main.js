import { sectors, groups, steps, parties, methods } from './data.js';
import { icon } from './icons.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const app = $('#app');
const markersEl = $('#markers');
const pop = $('#pop');
const leader = $('#leader');
const drawer = $('#drawer');
const drawerPanel = $('#drawer-panel');
const drawerList = $('#drawer-list');
const overlay = $('#overlay');
const byId = Object.fromEntries(sectors.map((s) => [s.id, s]));
const CARD_W = 372;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

async function boot() {
  if (!hasWebGL()) {
    $('#loader').hidden = true;
    $('#nogl').hidden = false;
    return;
  }
  // let the loader paint before the heavy build
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  const { createEngine } = await import('./three/engine.js');
  const { buildCampus, HQ_GAP } = await import('./three/campus.js');
  const engine = createEngine(app, { bounds: { x0: -30, x1: 262, z0: -60, z1: 175 } });
  const campus = buildCampus(engine);
  start(engine, campus, HQ_GAP);
  engine.start();
  requestAnimationFrame(() => $('#loader').classList.add('done'));
  setTimeout(() => ($('#loader').hidden = true), 900);
}

function start(engine, campus, HQ_GAP) {
  const narrow = () => engine.size().w < 720;

  // ------------------------------------------------------------- markers
  const markers = [];
  const mk = (el, anchor, floor, kind, data) => {
    markersEl.appendChild(el);
    markers.push({ el, anchor, floor: floor ?? null, kind, sx: 0, sy: 0, off: false, ...data });
  };
  for (const s of sectors) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'marker smk';
    el.dataset.sector = s.id;
    el.setAttribute('aria-label', `${s.label}: open details`);
    el.innerHTML = `<span class="smk-dot">${icon(s.icon)}</span><span class="smk-label" aria-hidden="true">${esc(s.short)}</span>`;
    mk(el, s.anchor, s.floor, 'sector', { sector: s });
    for (const p of s.spots) {
      const sp = document.createElement('button');
      sp.type = 'button';
      sp.className = 'marker spk';
      sp.dataset.sector = s.id;
      sp.dataset.spot = p.id;
      sp.setAttribute('aria-label', `${p.label} (${s.label})`);
      sp.innerHTML = `<span class="spk-dot">${p.machine ? icon('play') : ''}</span><span class="spk-label" aria-hidden="true">${esc(p.label)}</span>`;
      mk(sp, p.anchor, p.floor, 'spot', { sector: s, spot: p });
    }
  }
  for (const n of [
    { title: 'Suppliers', sub: 'Inbound materials & services', at: [235, -36, 9] },
    { title: 'Customers', sub: 'Outbound deliveries', at: [236, 96, 10] },
    { title: 'Your production lines', sub: 'ERA reviews the spend around them', at: [70, 40, 13] },
  ]) {
    const el = document.createElement('div');
    el.className = 'node-tag';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<span class="nt-box"><strong>${esc(n.title)}</strong><span>${esc(n.sub)}</span></span>`;
    mk(el, n.at, null, 'node', {});
  }
  markersEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) select(b.dataset.sector, b.dataset.spot || null, { keyboard: e.detail === 0 });
  });

  function placeMarkers() {
    const { w, h } = engine.size();
    const d = engine.cam.dist;
    app.classList.toggle('far', d > 330);
    app.classList.toggle('near', d < 125);
    app.classList.toggle('closeup', d < 72);
    const focus = campus.focusFloor();
    for (const m of markers) {
      const [x, y, z] = m.anchor;
      const p = engine.toScreen(x, y, z + campus.floorOffset(m.floor));
      m.sx = p.x;
      m.sy = p.y;
      // inside the opened tower, only the floor in focus keeps its markers
      const buried = focus < 99 && m.floor != null && (m.kind === 'spot' ? m.floor !== focus : m.floor !== focus && m.sector !== active?.sector);
      const off = buried || p.behind || p.x < -80 || p.y < -40 || p.x > w + 80 || p.y > h + 100;
      if (off !== m.off) {
        m.off = off;
        m.el.classList.toggle('off', off);
      }
      if (!off) m.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
    }
  }

  // ------------------------------------------------------------- drawer
  drawerList.innerHTML = groups
    .map((g) => {
      const list = sectors.filter((s) => s.group === g);
      if (!list.length) return '';
      return `<li class="dg"><p class="dg-title">${esc(g)}</p><ul>${list
        .map((s) => `<li><button type="button" class="dl-btn" data-sector="${s.id}" aria-pressed="false">${icon(s.icon)}<span>${esc(s.label)}</span><span class="dl-count">${s.spots.length}</span></button></li>`)
        .join('')}</ul></li>`;
    })
    .join('');
  drawerList.addEventListener('click', (e) => {
    const b = e.target.closest('.dl-btn');
    if (!b) return;
    if (narrow()) setDrawer(false);
    select(b.dataset.sector, null, { keyboard: e.detail === 0 });
  });
  $('#drawer-toggle').addEventListener('click', () => setDrawer(drawerPanel.hidden));
  function setDrawer(open) {
    drawerPanel.hidden = !open;
    drawer.classList.toggle('open', open);
    $('#drawer-toggle').setAttribute('aria-expanded', String(open));
  }
  $('#drawer-toggle').insertAdjacentHTML('afterbegin', icon('list'));

  // ------------------------------------------------------------- selection
  let active = null;
  let lastTrigger = null;

  function select(sid, pid, { keyboard = false, fly = true } = {}) {
    const s = byId[sid];
    if (!s) return close();
    const p = pid ? s.spots.find((x) => x.id === pid) || null : null;
    if (!pop.contains(document.activeElement)) lastTrigger = document.activeElement;
    active = { sector: s, spot: p };
    app.classList.add('has-active');
    app.dataset.active = s.id;
    for (const [id, g] of Object.entries(campus.areas)) g.visible = lensOn || id === s.id;
    for (const m of markers) {
      if (m.kind === 'node') continue;
      m.el.classList.toggle('in-sector', m.sector === s);
      m.el.setAttribute('aria-pressed', String(m.sector === s && (m.kind === 'sector' ? !p : m.spot === p)));
    }
    for (const b of drawerList.querySelectorAll('.dl-btn')) b.setAttribute('aria-pressed', String(b.dataset.sector === s.id));
    const open = new Set();
    if (s.open) open.add(s.open);
    if (p && p.floor != null) open.add('hq');
    const floor = open.has('hq') ? (p && p.floor != null ? p.floor : s.floor ?? 5) : 99;
    campus.open(open, floor);
    renderPop();
    if (fly) flyTo(s, p, open.has('hq'));
    if (p && p.machine) campus.run(p.machine);
    setHash(p ? `${s.id}--${p.id}` : s.id);
    if (keyboard) requestAnimationFrame(() => $('.pop-title', pop)?.focus({ preventScroll: true }));
  }

  function close() {
    if (!active) return;
    active = null;
    pop.hidden = true;
    leader.setAttribute('hidden', '');
    app.classList.remove('has-active');
    app.dataset.active = '';
    for (const [, g] of Object.entries(campus.areas)) g.visible = lensOn;
    for (const m of markers) {
      m.el.classList.remove('in-sector');
      if (m.kind !== 'node') m.el.setAttribute('aria-pressed', 'false');
    }
    for (const b of drawerList.querySelectorAll('.dl-btn')) b.setAttribute('aria-pressed', 'false');
    campus.open(new Set());
    setHash('');
    if (lastTrigger && document.contains(lastTrigger) && lastTrigger !== document.body) lastTrigger.focus({ preventScroll: true });
  }

  function freeArea(withCard) {
    const { w, h } = engine.size();
    const l = !drawerPanel.hidden && !narrow() ? drawer.getBoundingClientRect().right - app.getBoundingClientRect().left + 20 : 20;
    const r = withCard && !narrow() ? w - CARD_W - 44 : w - 20;
    const t = 80;
    const b = narrow() && withCard ? h * 0.42 : h - 24;
    return { l, r, t, b, w, h };
  }

  function flyTo(s, p, hqOpen) {
    const a = freeArea(true);
    const TAN = Math.tan((15 * Math.PI) / 180);
    if (p) {
      const dist = narrow() ? 80 : 72;
      const sx = narrow() ? a.w / 2 : Math.max(a.l + 60, a.w * 0.34);
      const sy = narrow() ? (a.t + a.b) / 2 : a.h * 0.56;
      engine.flyToPoint(p.anchor[0], p.anchor[1], p.anchor[2], dist, { screen: [sx, sy] });
      return;
    }
    const [x0, y0, x1, y1] = s.focus;
    const whole = x1 - x0 > 150;
    const span = whole ? 120 : ((x1 - x0) + (y1 - y0)) * 0.78 + 12;
    const tall = 0;
    let dist = (span + tall * 1.2) / (2 * TAN * ((a.r - a.l) / a.h));
    dist = Math.min(320, Math.max(60, dist));
    const cx = whole ? s.anchor[0] : (x0 + x1) / 2;
    const cy = whole ? s.anchor[1] : (y0 + y1) / 2;
    const cz = s.open === 'hq' && hqOpen && s.floor != null && s.floor < 5 ? s.floor * 5 + 1.5 : 0;
    engine.flyToPoint(cx, cy, cz, dist, { screen: [(a.l + a.r) / 2, (a.t + a.b) / 2] });
  }

  function renderPop() {
    if (!active) return;
    const { sector: s, spot: p } = active;
    if (p) {
      const i = s.spots.indexOf(p);
      const prev = s.spots[(i - 1 + s.spots.length) % s.spots.length];
      const next = s.spots[(i + 1) % s.spots.length];
      pop.className = 'pop pop-spot';
      pop.innerHTML = `
        <div class="pop-head">
          <button type="button" class="pop-kicker" data-sector="${s.id}" title="Back to ${esc(s.label)}">${icon(s.icon)}<span>${esc(s.label)}</span></button>
          <button type="button" class="pop-x" aria-label="Close">${icon('close')}</button>
        </div>
        <h3 class="pop-title" id="pop-title" tabindex="-1">${esc(p.label)}</h3>
        <p class="pop-text">${esc(p.text)}</p>
        <div class="pop-ask">${icon('question')}<p><strong>A question ERA can help you answer</strong>${esc(p.ask)}</p></div>
        ${p.machine ? `<button type="button" class="pop-run" data-run="${p.machine}">${icon('play')}<span>${esc(p.run)}</span></button>` : ''}
        <div class="pop-nav">
          <button type="button" data-sector="${s.id}" data-spot="${prev.id}" aria-label="Previous place: ${esc(prev.label)}">${icon('back')}</button>
          <span>${i + 1} of ${s.spots.length} in ${esc(s.short)}</span>
          <button type="button" data-sector="${s.id}" data-spot="${next.id}" aria-label="Next place: ${esc(next.label)}">${icon('chevron')}</button>
        </div>`;
    } else {
      pop.className = 'pop pop-sector';
      pop.innerHTML = `
        <div class="pop-head">
          <p class="pop-group">${icon(s.icon)}<span>${esc(s.group)}</span></p>
          <button type="button" class="pop-x" aria-label="Close">${icon('close')}</button>
        </div>
        <h3 class="pop-title" id="pop-title" tabindex="-1">${esc(s.label)}</h3>
        <p class="pop-text">${esc(s.summary)}</p>
        <h4>Explore this area</h4>
        <ul class="pop-spots">${s.spots
          .map((x) => `<li><button type="button" data-sector="${s.id}" data-spot="${x.id}"><span class="ps-dot">${x.machine ? icon('play') : ''}</span><span>${esc(x.label)}</span>${icon('chevron')}</button></li>`)
          .join('')}</ul>
        <h4>Common challenges</h4>
        <ul class="pop-challenges">${s.challenges.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
        <h4>What may be reviewed</h4>
        <ul class="chips">${s.review.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
        <h4>How ERA approaches it</h4>
        <ol class="approach">${s.approach.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>
        <h4>Kept in view alongside cost</h4>
        <ul class="chips keep">${s.keep.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>
        <p class="pop-note">Relevant areas depend on your organization, requirements, and existing arrangements.</p>`;
    }
    pop.hidden = false;
    pop.scrollTop = 0;
  }
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('pop-x')) return close();
    if (b.dataset.run) return campus.run(b.dataset.run);
    if (b.dataset.sector) select(b.dataset.sector, b.dataset.spot || null, { keyboard: e.detail === 0 });
  });

  const activeMarker = () =>
    active && markers.find((m) => m.kind !== 'node' && m.sector === active.sector && (active.spot ? m.spot === active.spot : m.kind === 'sector'));

  function placePop() {
    leader.setAttribute('hidden', '');
    if (!active || pop.hidden) return;
    if (narrow()) {
      pop.style.transform = '';
      pop.style.maxHeight = '';
      pop.dataset.side = 'sheet';
      return;
    }
    const { w, h } = engine.size();
    const m = activeMarker();
    const pw = pop.offsetWidth;
    const right = w - 20;
    const ay = m.sy - (m.kind === 'sector' ? 40 : 26);
    const visible = !m.off;
    const path = $('path', leader);
    const dot = $('circle', leader);
    const drawLeader = (sx, sy, ex, ey, curve) => {
      const mx = (sx + ex) / 2;
      path.setAttribute('d', curve ? `M${sx},${sy} C${mx},${sy} ${mx},${ey} ${ex},${ey}` : `M${sx},${sy} L${ex},${ey}`);
      dot.setAttribute('cx', ex);
      dot.setAttribute('cy', ey);
      leader.removeAttribute('hidden');
    };
    if (!active.spot) {
      const top = 76;
      pop.style.maxHeight = `${Math.max(300, h - top - 200)}px`;
      const x = right - pw;
      pop.dataset.side = 'dock';
      pop.style.transform = `translate(${x}px, ${top}px)`;
      if (visible && m.sx < x - 30) {
        const ph = pop.offsetHeight;
        drawLeader(m.sx + 24, ay, x - 2, Math.max(top + 24, Math.min(top + ph - 24, ay)), true);
      }
      return;
    }
    pop.style.maxHeight = '';
    const ph = pop.offsetHeight;
    const left = !drawerPanel.hidden ? drawer.getBoundingClientRect().right - app.getBoundingClientRect().left + 16 : 20;
    let x = m.sx + 140;
    let side = 'right';
    if (x + pw > right) {
      side = 'left';
      x = m.sx - 140 - pw;
    }
    if (x < left) {
      side = 'none';
      x = Math.max(left, Math.min(right - pw, m.sx - pw / 2));
    }
    const y = Math.max(76, Math.min(h - ph - 20, ay - Math.min(110, ph / 3)));
    pop.dataset.side = side;
    pop.style.transform = `translate(${x}px, ${y}px)`;
    if (visible && side !== 'none') {
      const ey = Math.max(y + 24, Math.min(y + ph - 24, ay));
      drawLeader(side === 'right' ? m.sx + 14 : m.sx - 14, ay, side === 'right' ? x - 2 : x + pw + 2, ey, false);
    }
  }

  // ------------------------------------------------------------- 3D picking
  const pickInfo = (hit) => {
    let o = hit && hit.object;
    while (o && !o.userData.sector) o = o.parent;
    return o ? { sector: o.userData.sector, spot: o.userData.spot || null } : null;
  };
  engine.on('tap', (x, y) => {
    const info = pickInfo(engine.pick(x, y, campus.pickables));
    if (info) select(info.sector, info.spot);
    else if (active && !active.spot) close();
  });
  let hoverQueued = null;
  engine.on('hover', (x, y) => {
    hoverQueued = [x, y];
  });
  let hovered = null;
  function doHover() {
    if (!hoverQueued) return;
    const [x, y] = hoverQueued;
    hoverQueued = null;
    const info = pickInfo(engine.pick(x, y, campus.pickables));
    const id = info ? info.sector : null;
    app.classList.toggle('can-pick', !!info);
    if (id !== hovered) {
      for (const m of markers) if (m.kind === 'sector') m.el.classList.toggle('hover', m.sector.id === id);
      hovered = id;
    }
  }

  // ------------------------------------------------------------- lens
  let lensOn = false;
  const lensBtn = $('#lens');
  lensBtn.insertAdjacentHTML('afterbegin', icon('lens'));
  lensBtn.addEventListener('click', () => {
    lensOn = !lensOn;
    lensBtn.setAttribute('aria-pressed', String(lensOn));
    $('#lens-legend').hidden = !lensOn;
    for (const [id, g] of Object.entries(campus.areas)) g.visible = lensOn || (active && active.sector.id === id);
    app.classList.toggle('lens', lensOn);
    if (lensOn && !active) wholeView();
  });

  // ------------------------------------------------------------- views
  function startView(ms) {
    engine.flyTo(96, 64, narrow() ? 260 : 215, { ms });
  }
  function wholeView(ms) {
    engine.flyTo(118, 52, narrow() ? 560 : 430, { ms });
  }
  const tools = {
    'zoom-in': ['plus', () => engine.zoomAt(0.7)],
    'zoom-out': ['minus', () => engine.zoomAt(1 / 0.7)],
    'view-start': ['home', () => startView()],
    'view-whole': ['expand', () => wholeView()],
  };
  for (const [id, [ic, fn]] of Object.entries(tools)) {
    const b = $('#' + id);
    b.innerHTML = icon(ic);
    b.title = b.getAttribute('aria-label');
    b.addEventListener('click', fn);
  }
  const motionBtn = $('#motion');
  function setMotion(paused) {
    engine.state.paused = paused;
    motionBtn.setAttribute('aria-pressed', String(paused));
    motionBtn.setAttribute('aria-label', paused ? 'Play motion' : 'Pause motion');
    motionBtn.title = paused ? 'Play motion' : 'Pause motion';
    motionBtn.innerHTML = icon(paused ? 'play' : 'pause');
  }
  motionBtn.addEventListener('click', () => setMotion(!engine.state.paused));
  setMotion(reduceMotion.matches);
  reduceMotion.addEventListener?.('change', (e) => setMotion(e.matches));

  // ------------------------------------------------------------- how ERA works
  const stepsEl = $('#steps');
  const stepDetail = $('#step-detail');
  let activeStep = null;
  stepsEl.innerHTML = steps
    .map(
      (s, i) => `<li><button type="button" class="step" data-step="${s.id}" aria-pressed="false">
        <span class="step-top"><span class="step-num">${String(i + 1).padStart(2, '0')}</span><span class="step-icon">${icon(s.icon)}</span></span>
        <span class="step-title">${esc(s.title)}</span>
        <span class="step-text">${esc(s.text)}</span>
        <span class="who">${s.who.map((p) => `<span data-party="${p}">${parties[p].label}</span>`).join('')}</span>
      </button></li>`
    )
    .join('');
  stepsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.step');
    if (!b) return;
    activeStep = activeStep === b.dataset.step ? null : b.dataset.step;
    renderStep();
  });
  function renderStep() {
    for (const b of stepsEl.querySelectorAll('.step')) b.setAttribute('aria-pressed', String(b.dataset.step === activeStep));
    const s = steps.find((x) => x.id === activeStep);
    if (!s) {
      stepDetail.innerHTML = `<p class="sd-default">${icon('people')}<span>Select any part to see who does what. In every part, your team stays involved and makes the decisions.</span></p>`;
      return;
    }
    stepDetail.innerHTML = `<div class="sd-roles">${['client', 'era', 'suppliers']
      .filter((p) => s.roles[p])
      .map((p) => `<div class="sd-role" data-party="${p}"><p class="sd-who">${parties[p].label}</p><p>${esc(s.roles[p])}</p></div>`)
      .join('')}</div>`;
  }
  renderStep();
  $('#methods').innerHTML = methods.map((m) => `<li>${esc(m)}</li>`).join('');
  $('#ov-x').innerHTML = icon('close');
  let ovReturn = null;
  const openOverlay = () => {
    ovReturn = document.activeElement;
    overlay.hidden = false;
    requestAnimationFrame(() => $('#ov-x').focus());
  };
  const closeOverlay = () => {
    overlay.hidden = true;
    ovReturn?.focus?.();
  };
  $('#how').insertAdjacentHTML('afterbegin', icon('people'));
  $('#how').addEventListener('click', openOverlay);
  $('#ov-x').addEventListener('click', closeOverlay);
  overlay.addEventListener('click', (e) => e.target === overlay && closeOverlay());
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      const f = [...overlay.querySelectorAll('button')];
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && i === f.length - 1) {
        e.preventDefault();
        f[0].focus();
      }
    }
  });

  // ------------------------------------------------------------- minimap
  const mm = $('#minimap');
  const mctx = mm.getContext('2d');
  const isoX = (x, y) => (x - y) * 0.866;
  const isoY = (x, y, z = 0) => (x + y) * 0.5 - z * 0.6;
  const mmB = { x0: isoX(0, 160) - 6, x1: isoX(255, -50) + 6, y0: isoY(0, -50) - 10, y1: isoY(255, 125) + 6 };
  const mmScale = () => Math.min(mm.width / (mmB.x1 - mmB.x0), mm.height / (mmB.y1 - mmB.y0));
  const toMM = (x, y, z = 0) => {
    const k = mmScale();
    const ox = (mm.width - (mmB.x1 - mmB.x0) * k) / 2;
    const oy = (mm.height - (mmB.y1 - mmB.y0) * k) / 2;
    return [ox + (isoX(x, y) - mmB.x0) * k, oy + (isoY(x, y, z) - mmB.y0) * k];
  };
  const fromMM = (px, py) => {
    const k = mmScale();
    const ox = (mm.width - (mmB.x1 - mmB.x0) * k) / 2;
    const oy = (mm.height - (mmB.y1 - mmB.y0) * k) / 2;
    const X = (px - ox) / k + mmB.x0;
    const Y = (py - oy) / k + mmB.y0;
    const a = X / 0.866;
    return [(a + 2 * Y) / 2, (2 * Y - a) / 2];
  };
  const quad = (x0, y0, x1, y1, z, fill) => {
    mctx.beginPath();
    [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(([x, y], i) => {
      const [px, py] = toMM(x, y, z);
      i ? mctx.lineTo(px, py) : mctx.moveTo(px, py);
    });
    mctx.closePath();
    mctx.fillStyle = fill;
    mctx.fill();
  };
  const kindColor = { b: '#ffffff', h: '#f4f7fb', t: '#e3e9f1', u: '#c3ccd8', c: '#46b3a3', w: '#4fa66a', p: '#6b7383', o: '#c9d3e0' };
  function drawMinimap() {
    mctx.clearRect(0, 0, mm.width, mm.height);
    quad(-40, 154, 270, 162, 0, '#6b7383');
    quad(204, -70, 212, 190, 0, '#6b7383');
    quad(0, 0, 200, 150, 0, '#b9c3d0');
    quad(131, 95, 199, 148, 0, '#7fb069');
    for (const b of campus.mini) {
      quad(b.x0, b.y0, b.x1, b.y1, b.h, kindColor[b.kind] || '#a9b4c6');
    }
    if (active) {
      const [x0, y0, x1, y1] = active.sector.focus;
      mctx.save();
      mctx.globalAlpha = 0.35;
      quad(x0, y0, x1, y1, 0, '#f2a63b');
      mctx.restore();
    }
    const q = engine.viewQuad();
    if (q.every(Boolean)) {
      mctx.beginPath();
      q.forEach((p, i) => {
        const [px, py] = toMM(p.x, p.z, 0);
        i ? mctx.lineTo(px, py) : mctx.moveTo(px, py);
      });
      mctx.closePath();
      mctx.fillStyle = 'rgba(242,166,59,.14)';
      mctx.fill();
      mctx.strokeStyle = '#f2a63b';
      mctx.lineWidth = 2.5;
      mctx.stroke();
    }
  }
  let mmDrag = false;
  const mmGo = (e, ms) => {
    const r = mm.getBoundingClientRect();
    const [x, y] = fromMM(((e.clientX - r.left) / r.width) * mm.width, ((e.clientY - r.top) / r.height) * mm.height);
    engine.flyTo(x, y, engine.goal.dist, { ms });
  };
  mm.addEventListener('pointerdown', (e) => {
    mmDrag = true;
    mm.setPointerCapture(e.pointerId);
    mmGo(e, 500);
  });
  mm.addEventListener('pointermove', (e) => mmDrag && mmGo(e, 0));
  mm.addEventListener('pointerup', () => (mmDrag = false));
  mm.addEventListener('pointercancel', () => (mmDrag = false));

  // ------------------------------------------------------------- keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!overlay.hidden) return closeOverlay();
      if (active) return close();
      if (!drawerPanel.hidden) return setDrawer(false);
      return;
    }
    if (e.target !== document.body && !app.contains(e.target)) return;
    if (e.target.closest('.pop, .overlay, .drawer-panel, input')) return;
    const moves = { ArrowLeft: [90, 0], ArrowRight: [-90, 0], ArrowUp: [0, 90], ArrowDown: [0, -90] };
    if (moves[e.key]) {
      e.preventDefault();
      engine.panBy(...moves[e.key]);
    } else if (e.key === '+' || e.key === '=') engine.zoomAt(0.75);
    else if (e.key === '-') engine.zoomAt(1 / 0.75);
  });

  // ------------------------------------------------------------- hint
  const hint = $('#hint');
  engine.on('interact', () => hint.classList.add('gone'));
  setTimeout(() => hint.classList.add('gone'), 9000);

  // ------------------------------------------------------------- frame hook
  let mmTick = 0;
  engine.on('frame', () => {
    placeMarkers();
    placePop();
    doHover();
    if ((mmTick++ & 1) === 0) drawMinimap();
  });

  // ------------------------------------------------------------- start
  setDrawer(false);
  startView(0);
  function setHash(h) {
    try {
      history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search);
    } catch {
      /* sandboxed frame */
    }
  }
  function fromHash() {
    const [sid, pid] = location.hash.slice(1).split('--');
    if (byId[sid]) select(sid, pid || null);
  }
  window.addEventListener('hashchange', fromHash);
  setTimeout(fromHash, 200);
}

boot();
