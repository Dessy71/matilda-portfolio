/* ============================================================
   APP — preloader, nav, reveals, counters, filters,
   magnetic buttons, tilt, clocks, toast.
   ============================================================ */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------------- preloader ---------------- */
  var pre = $('#preloader'), bar = $('#preBar'), num = $('#preNum');
  var progress = 0, done = false;

  function setProgress(p) {
    progress = Math.max(progress, Math.min(100, p));
    if (bar) bar.style.width = progress + '%';
    if (num) num.textContent = String(Math.round(progress)).padStart(2, '0');
  }

  var tick = setInterval(function () {
    if (done) return;
    var next = progress + Math.random() * 16;
    setProgress(next > 92 ? 92 + Math.random() * 3 : next);
  }, 130);

  function finish() {
    if (done) return;
    done = true;
    clearInterval(tick);
    setProgress(100);
    setTimeout(function () {
      document.body.classList.add('loaded');
      if (pre) pre.classList.add('done');
      setTimeout(function () { if (pre) pre.style.display = 'none'; }, 1100);
      revealInit();
      if (window.location.hash) {
        var t = document.querySelector(window.location.hash);
        if (t) setTimeout(function () { t.scrollIntoView({ behavior: 'smooth' }); }, 220);
      }
    }, 380);
  }

  if (document.readyState === 'complete') {
    setTimeout(finish, 520);
  } else {
    window.addEventListener('load', function () { setTimeout(finish, 420); });
    // hard fallback
    setTimeout(finish, 4200);
  }
  setProgress(8);

  /* ---------------- fonts (ensure every declared face is ready) ---------------- */
  if (document.fonts && document.fonts.load) {
    ['400 1em "Instrument Serif"',
     'italic 400 1em "Instrument Serif"',
     '400 1em "JetBrains Mono"',
     '500 1em "Space Grotesk"'].forEach(function (f) {
      document.fonts.load(f).catch(function () {});
    });
  }

  /* ---------------- clocks ---------------- */
  function clock(el, tz) {
    if (!el) return;
    function up() {
      try {
        el.textContent = new Intl.DateTimeFormat('en-GB', {
          timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
        }).format(new Date());
      } catch (e) { el.textContent = '--:--'; }
    }
    up();
    setInterval(up, 15000);
  }
  clock($('#clockAccra'), 'Africa/Accra');
  clock($('#clockMunich'), 'Europe/Berlin');
  clock($('#contactClock'), 'Europe/Berlin');

  /* ---------------- nav ---------------- */
  var nav = $('#nav');
  var lastY = window.scrollY;
  var navLinks = $$('.nav-links a');

  function onScroll() {
    var y = window.scrollY;
    if (nav) {
      nav.classList.toggle('solid', y > 30);
      if (y > 520 && y > lastY + 4 && !document.body.classList.contains('is-locked')) {
        nav.classList.add('hide');
      } else if (y < lastY - 4 || y < 200) {
        nav.classList.remove('hide');
      }
    }
    lastY = y;

    var docH = document.documentElement.scrollHeight - window.innerHeight;
    var sp = $('#scrollProgress');
    if (sp) sp.style.width = (docH > 0 ? (y / docH) * 100 : 0) + '%';

    railUpdate();
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* mobile menu */
  var burger = $('#burger'), menu = $('#menu');
  function setMenu(open) {
    if (!burger || !menu) return;
    burger.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('open', open);
    menu.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('is-locked', open);
  }
  if (burger) burger.addEventListener('click', function () {
    setMenu(!menu.classList.contains('open'));
  });
  $$('#menu a').forEach(function (a) {
    a.addEventListener('click', function () { setMenu(false); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setMenu(false);
  });

  /* active link */
  var sections = $$('main section[id]');
  var linkMap = {};
  navLinks.forEach(function (a) {
    var id = a.getAttribute('href');
    if (id) linkMap[id.slice(1)] = a;
  });
  if ('IntersectionObserver' in window) {
    var navObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          navLinks.forEach(function (a) { a.classList.remove('active'); });
          var link = linkMap[en.target.id];
          if (link) link.classList.add('active');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    sections.forEach(function (s) { navObs.observe(s); });
  }

  /* ---------------- reveals ---------------- */
  function revealInit() {
    var els = $$('[data-reveal]');
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('in'); });
      $$('[data-count]').forEach(function (el) { countUp(el, true); });
      return;
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          obs.unobserve(en.target);
          $$('[data-count]', en.target).forEach(function (n) { countUp(n); });
        }
      });
    }, { rootMargin: '0px 0px 0px 0px', threshold: 0.08 });
    els.forEach(function (el) { obs.observe(el); });
    // anything already on screen reveals immediately
    els.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight - 10 && r.bottom > 0) el.classList.add('in');
    });
    $$('[data-count]').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.92) countUp(el);
    });
  }

  function countUp(el, instant) {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    var target = parseFloat(el.dataset.count || '0');
    var dec = parseInt(el.dataset.decimals || '0', 10);
    var suffix = el.dataset.suffix || '';
    if (instant || reduce) {
      el.textContent = target.toFixed(dec) + suffix;
      return;
    }
    var dur = 1500, start = performance.now();
    function step(now) {
      var p = Math.min(1, (now - start) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * e).toFixed(dec) + suffix;
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target.toFixed(dec) + suffix;
    }
    requestAnimationFrame(step);
  }

  /* ---------------- timeline ---------------- */
  var timeline = $('#timeline'), railFill = $('#railFill');
  function railUpdate() {
    if (!timeline || !railFill) return;
    var r = timeline.getBoundingClientRect();
    var vh = window.innerHeight;
    var p = (vh * 0.62 - r.top) / r.height;
    railFill.style.height = Math.max(0, Math.min(1, p)) * 100 + '%';
  }

  var chips = $$('.chip');
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (c) { c.classList.remove('is-active'); });
      chip.classList.add('is-active');
      var f = chip.dataset.filter;
      $$('.tl-item').forEach(function (item) {
        var show = f === 'all' || item.dataset.cat === f;
        if (show) {
          item.classList.remove('hidden');
          item.classList.remove('in');
          void item.offsetWidth;
          requestAnimationFrame(function () { item.classList.add('in'); });
        } else {
          item.classList.add('hidden');
        }
      });
      railUpdate();
    });
  });

  if (timeline && 'IntersectionObserver' in window && !reduce) {
    var dotObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        en.target.classList.toggle('on', en.isIntersecting);
      });
    }, { rootMargin: '-40% 0px -45% 0px' });
    $$('.tl-item').forEach(function (i) { dotObs.observe(i); });
  }

  /* ---------------- magnetic buttons ---------------- */
  var magnets = $$('[data-magnetic]');
  if (!reduce && window.matchMedia('(hover: hover)').matches) {
    var mx = 0, my = 0, raf = null;
    var state = new WeakMap();

    function current(el) {
      var st = state.get(el);
      if (!st) { st = { x: 0, y: 0 }; state.set(el, st); }
      return st;
    }

    window.addEventListener('pointermove', function (e) {
      mx = e.clientX; my = e.clientY;
      if (!raf) raf = requestAnimationFrame(applyMagnets);
    }, { passive: true });

    function applyMagnets() {
      raf = null;
      magnets.forEach(function (el) {
        var st = current(el);
        var r = el.getBoundingClientRect();
        // strip the transform we already applied to get the true layout box
        var baseL = r.left - st.x, baseT = r.top - st.y;
        var cx = baseL + r.width / 2, cy = baseT + r.height / 2;
        var dx = mx - cx, dy = my - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var rad = Math.max(r.width, r.height) * 0.75;
        var tx = 0, ty = 0;
        if (dist < rad) {
          var k = (1 - dist / rad);
          k = k * k * 0.22;                      // eased, capped, no feedback loop
          tx = dx * k; ty = dy * k;
        }
        st.x += (tx - st.x) * 0.18;
        st.y += (ty - st.y) * 0.18;
        if (Math.abs(st.x) < 0.05 && Math.abs(st.y) < 0.05) {
          if (el.style.transform) el.style.transform = '';
        } else {
          el.style.transform = 'translate(' + st.x.toFixed(2) + 'px,' + st.y.toFixed(2) + 'px)';
        }
      });
    }
  }

  /* ---------------- portrait tilt + floats ---------------- */
  var card = $('#portraitCard');
  if (card && !reduce && window.matchMedia('(hover: hover)').matches) {
    var wrap = card.parentElement;
    wrap.addEventListener('pointermove', function (e) {
      var r = wrap.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;
      var py = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = 'rotateY(' + (px * 9).toFixed(2) + 'deg) rotateX(' + (-py * 9).toFixed(2) + 'deg) translateZ(0)';
    });
    wrap.addEventListener('pointerleave', function () {
      card.style.transform = 'rotateY(0deg) rotateX(0deg)';
    });
  }

  var floats = $$('[data-float]');
  if (floats.length && !reduce) {
    var fraf = null;
    window.addEventListener('scroll', function () {
      if (fraf) return;
      fraf = requestAnimationFrame(function () {
        fraf = null;
        var y = window.scrollY;
        floats.forEach(function (el, i) {
          var dir = i % 2 === 0 ? 1 : -1;
          el.style.transform = 'translate3d(0,' + (y * -0.045 * dir).toFixed(1) + 'px,0)';
        });
      });
    }, { passive: true });
  }

  /* ---------------- copy email ---------------- */
  var copyBtn = $('#copyEmail'), toast = $('#toast');
  var EMAIL = 'matilda.lartey@tum.de';
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.classList.remove('show'); }, 2600);
  }
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = EMAIL;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
        showToast('Email copied — ' + EMAIL);
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(EMAIL).then(function () {
          showToast('Email copied — ' + EMAIL);
        }).catch(fallback);
      } else {
        fallback();
      }
    });
  }

  /* ---------------- misc ---------------- */
  var yearEl = $('#year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // smooth in-page anchors with nav offset handled by CSS scroll-margin
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (!id || id === '#' || id.length < 2) return;
      var t = document.querySelector(id);
      if (!t) return;
      e.preventDefault();
      t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', id);
    });
  });

  onScroll();
})();
