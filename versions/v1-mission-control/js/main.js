(() => {
  const pad = (n, w = 2) => String(n).padStart(w, '0');

  // ---- clocks: UTC + mission elapsed time since starting at UT ----------
  const MET_EPOCH = Date.UTC(2025, 7, 20);
  const utc = document.getElementById('utc');
  const met = document.getElementById('met');
  function tick() {
    const d = new Date();
    if (utc) utc.textContent = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    if (met) {
      const s = Math.max(0, Math.floor((d - MET_EPOCH) / 1000));
      met.textContent = `T+${pad(Math.floor(s / 86400), 3)}:${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
    }
  }
  tick();
  setInterval(tick, 1000);

  // ---- timeline ---------------------------------------------------------
  const tl = document.getElementById('timeline');
  if (tl) {
    const T0 = Date.UTC(2024, 0, 1), T1 = Date.UTC(2030, 0, 1);
    const now = Date.now();
    const pct = (t) => Math.min(100, Math.max(0, ((t - T0) / (T1 - T0)) * 100));
    const start = (s) => { const [y, m] = s.split('-').map(Number); return Date.UTC(y, m - 1, 1); };
    const end = (s) => { if (s === 'now') return now; const [y, m] = s.split('-').map(Number); return Date.UTC(y, m, 1); };
    const bar = (track, a, b, cls) => {
      const el = document.createElement('span');
      el.className = 'tl__bar' + (cls ? ' ' + cls : '');
      el.style.left = pct(a) + '%';
      el.style.width = Math.max(0.6, pct(b) - pct(a)) + '%';
      track.appendChild(el);
    };
    tl.style.setProperty('--now', pct(now) + '%');
    tl.querySelectorAll('.tl__row').forEach((row) => {
      const track = row.querySelector('.tl__track');
      const a = start(row.dataset.start);
      const ongoing = row.dataset.end === 'now';
      const b = end(row.dataset.end);
      if (b > now) {
        bar(track, a, now);
        bar(track, now, b, 'tl__bar--plan');
      } else {
        bar(track, a, b, ongoing ? 'tl__bar--live' : '');
      }
    });
    const nowLbl = tl.querySelector('.tl__now');
    if (nowLbl) {
      const d = new Date(now);
      nowLbl.textContent = 'Now · ' + d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }) + ' ' + d.getUTCFullYear();
    }
  }

  // ---- nav: highlight the section in view -------------------------------
  const links = new Map();
  document.querySelectorAll('.nav a').forEach((a) => links.set(a.getAttribute('href').slice(1), a));
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.removeAttribute('aria-current'));
      const a = links.get(e.target.id);
      if (a) a.setAttribute('aria-current', 'true');
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  const hero = document.querySelector('.hero');
  if (hero) new IntersectionObserver(([e]) => {
    if (e.isIntersecting) links.forEach((a) => a.removeAttribute('aria-current'));
  }, { rootMargin: '-45% 0px -50% 0px' }).observe(hero);

  // ---- figures draw themselves in when scrolled to ----------------------
  const figs = document.querySelectorAll('.fig');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.25 });
    figs.forEach((f) => io.observe(f));
  } else {
    figs.forEach((f) => f.classList.add('is-in'));
  }
})();
