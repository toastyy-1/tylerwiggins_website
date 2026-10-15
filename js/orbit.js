/* Hero orbit: a real two-body + J2 propagator (RK4), drawn orthographically.
   J2 is scaled up for display so nodal/apsidal precession is visible in seconds. */
(() => {
  const canvas = document.getElementById('orbit');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const MU = 398600.4418;        // km^3/s^2
  const RE = 6378.137;           // km
  const J2 = 1.08262668e-3;
  const WE = 7.2921159e-5;       // rad/s
  const J2_GAIN = 40;
  const DT = 10;                 // integrator step, s
  const SIM_RATE = 1100;         // sim seconds per real second
  const TRAIL_MAX = 3600;
  const D2R = Math.PI / 180;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = getComputedStyle(document.documentElement);
  const C_INK = css.getPropertyValue('--ink').trim() || '#ecebe5';
  const C_SIG = css.getPropertyValue('--signal').trim() || '#ff5b1a';
  const C_BG = css.getPropertyValue('--bg').trim() || '#0b0b0a';

  // ---- dynamics -------------------------------------------------------
  function deriv(s) {
    const x = s[0], y = s[1], z = s[2];
    const r2 = x * x + y * y + z * z;
    const r = Math.sqrt(r2);
    const r3 = r2 * r;
    const k = -1.5 * J2 * J2_GAIN * MU * RE * RE / (r2 * r2 * r);
    const zz = 5 * z * z / r2;
    return [
      s[3], s[4], s[5],
      -MU * x / r3 + k * x * (1 - zz),
      -MU * y / r3 + k * y * (1 - zz),
      -MU * z / r3 + k * z * (3 - zz),
    ];
  }
  function rk4(s, h) {
    const k1 = deriv(s);
    const k2 = deriv(s.map((v, i) => v + 0.5 * h * k1[i]));
    const k3 = deriv(s.map((v, i) => v + 0.5 * h * k2[i]));
    const k4 = deriv(s.map((v, i) => v + h * k3[i]));
    return s.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }
  function coe2rv(a, e, i, raan, argp, nu) {
    const p = a * (1 - e * e);
    const r = p / (1 + e * Math.cos(nu));
    const sq = Math.sqrt(MU / p);
    const rp = [r * Math.cos(nu), r * Math.sin(nu), 0];
    const vp = [-sq * Math.sin(nu), sq * (e + Math.cos(nu)), 0];
    const cO = Math.cos(raan), sO = Math.sin(raan);
    const ci = Math.cos(i), si = Math.sin(i);
    const cw = Math.cos(argp), sw = Math.sin(argp);
    const R = [
      [cO * cw - sO * sw * ci, -cO * sw - sO * cw * ci, sO * si],
      [sO * cw + cO * sw * ci, -sO * sw + cO * cw * ci, -cO * si],
      [sw * si, cw * si, ci],
    ];
    const m = (v) => R.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
    return [...m(rp), ...m(vp)];
  }
  const TAU = 2 * Math.PI;
  const acosC = (x) => Math.acos(Math.max(-1, Math.min(1, x)));
  function raanOf(s) {
    const hx = s[1] * s[5] - s[2] * s[4], hy = s[2] * s[3] - s[0] * s[5];
    const O = Math.atan2(hx, -hy);
    return O < 0 ? O + TAU : O;
  }
  // classical (osculating) elements from the Cartesian state
  function elements(s) {
    const [x, y, z, vx, vy, vz] = s;
    const r = Math.hypot(x, y, z);
    const v = Math.hypot(vx, vy, vz);
    const hx = y * vz - z * vy, hy = z * vx - x * vz, hz = x * vy - y * vx;
    const h = Math.hypot(hx, hy, hz);
    const nx = -hy, ny = hx, nn = Math.hypot(nx, ny);
    const rv = x * vx + y * vy + z * vz;
    const c1 = v * v - MU / r;
    const ex = (c1 * x - rv * vx) / MU, ey = (c1 * y - rv * vy) / MU, ez = (c1 * z - rv * vz) / MU;
    const e = Math.hypot(ex, ey, ez);
    const energy = v * v / 2 - MU / r;
    const a = -MU / (2 * energy);
    const inc = acosC(hz / h);
    const raan = raanOf(s);
    let argp = acosC((nx * ex + ny * ey) / (nn * e));
    if (ez < 0) argp = TAU - argp;
    let nu = acosC((ex * x + ey * y + ez * z) / (e * r));
    if (rv < 0) nu = TAU - nu;
    return {
      r, v, h, e, a, inc, raan, argp, nu, energy,
      p: h * h / MU,
      period: TAU * Math.sqrt(a * a * a / MU),
      eHat: [ex / e, ey / e, ez / e],
      nHat: [nx / nn, ny / nn, 0],
    };
  }

  // ---- state ----------------------------------------------------------
  const A = 11000, E = 0.35, I = 51.6 * D2R;
  let state = coe2rv(A, E, I, 30 * D2R, 40 * D2R, 0);
  let t = 0;
  let trail = [];
  const RA = A * (1 + E);

  // secular J2 rates (rad/s) from the time-averaged (mean) a, e, i,
  // scaled by the same gain as the integrated dynamics
  const mean = { n: 0, a: 0, e: 0, i: 0 };
  function j2Rates() {
    const a = mean.a / mean.n, e = mean.e / mean.n, i = mean.i / mean.n;
    const k = Math.sqrt(MU / (a * a * a)) * J2 * J2_GAIN * (RE / (a * (1 - e * e))) ** 2;
    return { raan: -1.5 * k * Math.cos(i), argp: 0.75 * k * (5 * Math.cos(i) ** 2 - 1) };
  }

  // measured RAAN drift: sample at each ascending-node crossing so the
  // short-period J2 wobble cancels out
  const node = { t0: null, t: 0, prev: 0, total: 0, count: 0 };
  function nodeCrossing() {
    const O = raanOf(state);
    if (node.t0 === null) { node.t0 = t; node.prev = O; return; }
    let d = O - node.prev;
    if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
    node.total += d; node.prev = O; node.t = t; node.count++;
  }

  function step(simSeconds) {
    let n = Math.max(1, Math.round(simSeconds / DT));
    while (n--) {
      const zPrev = state[2];
      state = rk4(state, DT);
      t += DT;
      if (zPrev < 0 && state[2] >= 0) nodeCrossing();
      const k = elements(state);
      mean.n++; mean.a += k.a; mean.e += k.e; mean.i += k.inc;
      trail.push(state[0], state[1], state[2]);
    }
    if (trail.length > TRAIL_MAX * 3) trail = trail.slice(trail.length - TRAIL_MAX * 3);
  }

  // ---- view -----------------------------------------------------------
  let W = 0, H = 0, DPR = 1, cx = 0, cy = 0, scale = 1;
  const EL = 24 * D2R;           // camera elevation above equator
  let yaw = -35 * D2R;
  const sinEl = Math.sin(EL), cosEl = Math.cos(EL);

  // returns [screenX, screenY, depth]; depth > 0 is toward the viewer
  function project(x, y, z) {
    const cy_ = Math.cos(yaw), sy_ = Math.sin(yaw);
    const x1 = x * cy_ - y * sy_;
    const y1 = x * sy_ + y * cy_;
    return [cx + x1 * scale, cy - (y1 * sinEl + z * cosEl) * scale, -y1 * cosEl + z * sinEl];
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const wide = W > 720;
    cx = wide ? W * 0.66 : W * 0.5;
    cy = wide ? H * 0.38 : H * 0.5;
    scale = (wide ? Math.min(W * 0.55, H) * 0.42 : Math.min(W, H) * 0.44) / RA;
  }

  function drawEarth(front) {
    const rot = WE * t;
    ctx.lineWidth = 1;
    ctx.strokeStyle = front ? 'rgba(236,235,229,0.16)' : 'rgba(236,235,229,0.05)';
    const seg = (pts) => {
      ctx.beginPath();
      let pen = false;
      for (const p of pts) {
        const vis = front ? p[2] >= 0 : p[2] < 0;
        if (vis) { pen ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); pen = true; }
        else pen = false;
      }
      ctx.stroke();
    };
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = [];
      const cl = Math.cos(lat * D2R), sl = Math.sin(lat * D2R);
      for (let lon = 0; lon <= 360; lon += 6) {
        const L = lon * D2R + rot;
        pts.push(project(RE * cl * Math.cos(L), RE * cl * Math.sin(L), RE * sl));
      }
      seg(pts);
    }
    for (let lon = 0; lon < 360; lon += 30) {
      const pts = [];
      const L = lon * D2R + rot;
      for (let lat = -90; lat <= 90; lat += 6) {
        const cl = Math.cos(lat * D2R), sl = Math.sin(lat * D2R);
        pts.push(project(RE * cl * Math.cos(L), RE * cl * Math.sin(L), RE * sl));
      }
      seg(pts);
    }
  }

  function drawTrail(frontOnly) {
    const n = trail.length / 3;
    if (n < 2) return;
    const CH = 60;
    ctx.lineWidth = 1.1;
    for (let s = 0; s < n - 1; s += CH) {
      const alpha = 0.06 + 0.55 * (s / n) ** 1.6;
      ctx.strokeStyle = `rgba(236,235,229,${alpha.toFixed(3)})`;
      ctx.beginPath();
      let pen = false;
      const end = Math.min(n, s + CH + 1);
      for (let k = s; k < end; k++) {
        const p = project(trail[3 * k], trail[3 * k + 1], trail[3 * k + 2]);
        if (frontOnly && p[2] < 0) { pen = false; continue; }
        pen ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
        pen = true;
      }
      ctx.stroke();
    }
  }

  function line(a, b) {
    const p = project(...a), q = project(...b);
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
  }
  function marker(pos, label, alpha) {
    const p = project(...pos);
    const hidden = p[2] < 0 && Math.hypot(p[0] - cx, p[1] - cy) < RE * scale;
    ctx.globalAlpha = hidden ? alpha * 0.3 : alpha;
    ctx.strokeStyle = C_INK;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(p[0], p[1], 3.5, 0, TAU); ctx.stroke();
    ctx.font = '400 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = C_INK;
    ctx.fillText(label, p[0] + 7, p[1] - 6);
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const R = RE * scale;

    // equatorial reference ring + axis
    ctx.strokeStyle = 'rgba(236,235,229,0.07)';
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    for (let a = 0; a <= 360; a += 4) {
      const p = project(RA * Math.cos(a * D2R), RA * Math.sin(a * D2R), 0);
      a ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
    }
    ctx.stroke();
    const n1 = project(0, 0, RE * 1.45), s1 = project(0, 0, -RE * 1.45);
    ctx.beginPath(); ctx.moveTo(n1[0], n1[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke();
    ctx.setLineDash([]);

    // line of apsides and line of nodes, hidden where they pass behind Earth
    const k = elements(state);
    const pe = k.eHat.map((c) => c * k.a * (1 - k.e));
    const ap = k.eHat.map((c) => -c * k.a * (1 + k.e));
    const an = k.nHat.map((c) => c * k.p / (1 + k.e * Math.cos(k.argp)));
    const dn = k.nHat.map((c) => -c * k.p / (1 - k.e * Math.cos(k.argp)));
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = 'rgba(236,235,229,0.16)';
    line(pe, ap);
    ctx.strokeStyle = 'rgba(236,235,229,0.10)';
    line(an, dn);
    ctx.setLineDash([]);

    // full trail, then occlude with the Earth disc, then redraw the near side
    drawTrail(false);
    drawEarth(false);
    ctx.fillStyle = C_BG;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(236,235,229,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    drawEarth(true);
    drawTrail(true);

    marker(pe, 'Pe', 0.85);
    marker(ap, 'Ap', 0.85);
    marker(an, 'AN', 0.5);
    marker(dn, 'DN', 0.5);

    // spacecraft
    const p = project(state[0], state[1], state[2]);
    const behind = p[2] < 0 && Math.hypot(p[0] - cx, p[1] - cy) < R;
    ctx.globalAlpha = behind ? 0.3 : 1;
    const vEnd = project(state[0] + state[3] * 160, state[1] + state[4] * 160, state[2] + state[5] * 160);
    ctx.strokeStyle = C_SIG;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(vEnd[0], vEnd[1]); ctx.stroke();
    ctx.fillStyle = C_SIG;
    ctx.fillRect(p[0] - 4, p[1] - 4, 8, 8);
    ctx.strokeStyle = C_INK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p[0] - 16, p[1]); ctx.lineTo(p[0] - 9, p[1]);
    ctx.moveTo(p[0] + 9, p[1]); ctx.lineTo(p[0] + 16, p[1]);
    ctx.moveTo(p[0], p[1] - 16); ctx.lineTo(p[0], p[1] - 9);
    ctx.moveTo(p[0], p[1] + 9); ctx.lineTo(p[0], p[1] + 16);
    ctx.stroke();
    ctx.font = '500 10px "IBM Plex Mono", monospace';
    ctx.fillStyle = C_INK;
    ctx.fillText('TW-01', p[0] + 20, p[1] - 8);
    ctx.globalAlpha = 1;
  }

  // ---- readout --------------------------------------------------------
  const fields = {};
  document.querySelectorAll('[data-el]').forEach((n) => { fields[n.dataset.el] = n; });
  const num = (x, d) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '\u2212');
  const deg = (rad, d = 2) => num(rad / D2R, d) + '°';
  const perDay = (radPerSec) => num(radPerSec * 86400 / D2R, 1) + '°/d';
  const pad = (n) => String(n).padStart(2, '0');
  function readout() {
    if (!fields.a) return;
    const k = elements(state);
    const j2 = j2Rates();
    const s = Math.floor(t);
    const out = {
      a: num(k.a, 0) + ' km',
      e: k.e.toFixed(4),
      period: num(k.period / 60, 1) + ' min',
      inc: deg(k.inc),
      raan: deg(k.raan),
      argp: deg(k.argp),
      nu: deg(k.nu, 1),
      alt: num(k.r - RE, 0) + ' km',
      v: num(k.v, 3) + ' km/s',
      pe: num(k.a * (1 - k.e) - RE, 0) + ' km',
      ap: num(k.a * (1 + k.e) - RE, 0) + ' km',
      energy: num(k.energy, 2) + ' MJ/kg',
      raanSim: node.count ? perDay(node.total / (node.t - node.t0)) : '—',
      raanJ2: perDay(j2.raan),
      argpJ2: perDay(j2.argp),
      met: `T+${pad(Math.floor(s / 86400))}d ${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}`,
    };
    for (const key in out) if (fields[key]) fields[key].textContent = out[key];
  }

  // ---- loop -----------------------------------------------------------
  let running = true, last = 0, lastRO = 0, acc = 0;
  function frame(now) {
    if (!running) return;
    if (!last) last = now;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    acc += dt * SIM_RATE;
    if (acc >= DT) { const s = Math.floor(acc / DT) * DT; step(s); acc -= s; }
    yaw += dt * 0.02;
    draw();
    if (now - lastRO > 120) { readout(); lastRO = now; }
    requestAnimationFrame(frame);
  }

  resize();
  step(6 * 3600); // pre-roll so the trail is not empty on first paint

  if (reduceMotion) {
    step(4 * 3600);
    draw(); readout();
    new ResizeObserver(() => { resize(); draw(); }).observe(canvas);
    return;
  }

  new ResizeObserver(() => { resize(); draw(); }).observe(canvas);
  new IntersectionObserver(([entry]) => {
    const vis = entry.isIntersecting;
    if (vis && !running) { running = true; last = 0; requestAnimationFrame(frame); }
    else if (!vis) running = false;
  }).observe(canvas);
  requestAnimationFrame(frame);
})();
