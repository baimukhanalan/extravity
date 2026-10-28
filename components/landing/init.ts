/* eslint-disable */
// @ts-nocheck
// AUTO-GENERATED from the Claude design (Extravity Landing.dc.html) — do not hand-edit.
export function initLanding() {
  class DCLogic {}
class Component extends DCLogic {
  componentDidMount() {
    const P = this.props || {};
    const root = document;
    const accent = P.accentColor || '#2456A0';
    root.documentElement.style.setProperty('--accent', accent);

    const rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motionPref = P.motion || 'Максимально';
    const reduce = rmq.matches || motionPref === 'Выключено';
    this._heavy = (motionPref === 'Максимально') && !rmq.matches;

    if (P.showGrain === false) { const g = root.getElementById('grain'); if (g) g.style.display = 'none'; }

    // ---------- i18n ----------
    this.lang = 'ru';
    this.ruBase = {};
    root.querySelectorAll('[data-i18n]').forEach(el => { this.ruBase[el.getAttribute('data-i18n')] = el.textContent; });
    const dict = this.dict();
    const liveCount = root.querySelector('[data-i18n="hero.live"] b')?.textContent?.trim();
    const currentOfferCopy = {
      en: {
        'hero.sub': 'Current competitions, programs and internships for school students in Kazakhstan. Find the right opportunity and apply manually for free.',
        'price.t1sub': 'catalog and manual applications',
        'price.f_calendar': 'Manual applications',
        'price.f_portfolio': 'Deadline calendar and portfolio',
        'price.t2': 'Advanced search',
        'price.t2sub': 'for precise opportunity matching',
        'price.f_reco': 'Advanced recommendations and match score',
        'price.f_pack': 'Smart filters and saved searches',
        'price.f_tg': 'Deadline reminders',
        'price.f_try': 'Choose advanced search',
        'price.note': 'The catalog and manual applications are free.',
        'faq.a1': 'The catalog and manual applications are free.',
        'faq.a3': 'Apply manually on the organizer’s official website.'
      },
      kk: {
        'hero.sub': 'Қазақстан оқушыларына арналған өзекті конкурстар, бағдарламалар және тағылымдамалар. Лайықты мүмкіндікті тауып, өтінімді өзің тегін жібер.',
        'price.t1sub': 'каталог және қолмен өтінім беру',
        'price.f_calendar': 'Қолмен өтінім беру',
        'price.f_portfolio': 'Дедлайн күнтізбесі және портфолио',
        'price.t2': 'Кеңейтілген іздеу',
        'price.t2sub': 'мүмкіндіктерді дәл іріктеу үшін',
        'price.f_reco': 'Кеңейтілген ұсыныстар және сәйкестік бағасы',
        'price.f_pack': 'Ақылды сүзгілер мен сақталған іздеулер',
        'price.f_tg': 'Дедлайн еске салғыштары',
        'price.f_try': 'Кеңейтілген іздеуді таңдау',
        'price.note': 'Каталог пен қолмен өтінім беру тегін.',
        'faq.a1': 'Каталог пен қолмен өтінім беру тегін.',
        'faq.a3': 'Өтінімді ұйымдастырушының ресми сайтында қолмен беріңіз.'
      }
    };
    const setLang = (lang) => {
      this.lang = lang;
      try { document.cookie = 'eckz_locale=' + lang + '; path=/; max-age=31536000; samesite=lax'; } catch (e) {}
      root.documentElement.setAttribute('lang', lang);
      root.querySelectorAll('[data-i18n]').forEach(el => {
        const k = el.getAttribute('data-i18n');
        const v = k === 'hero.live' && liveCount
          ? (lang === 'kk' ? `Қазір ${liveCount} мүмкіндік ашық` : lang === 'en' ? `${liveCount} opportunities open now` : this.ruBase[k])
          : (lang === 'ru') ? this.ruBase[k] : (currentOfferCopy[lang]?.[k] ?? dict[lang]?.[k] ?? this.ruBase[k]);
        el.textContent = v;
      });
      root.querySelectorAll('[data-lang]').forEach(b => {
        const on = b.getAttribute('data-lang') === lang;
        b.style.background = on ? accent : 'transparent';
        b.style.color = on ? '#FFFFFF' : (b.closest('footer') ? '#E7EDF4' : '#12263F');
      });
    };
    root.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => setLang(b.getAttribute('data-lang'))));

    // ---------- mobile nav ----------
    const burger = root.getElementById('burger');
    const menu = root.getElementById('mobileMenu');
    const closeMenu = () => { if (!menu) return; menu.setAttribute('data-open', '0'); menu.style.display = 'none'; menu.style.opacity = '0'; menu.style.pointerEvents = 'none'; menu.style.transform = 'translateY(-12px)'; if (burger) burger.setAttribute('aria-expanded', 'false'); };
    if (burger && menu) {
      burger.addEventListener('click', () => {
        const open = menu.getAttribute('data-open') === '1';
        if (open) { closeMenu(); }
        else { menu.setAttribute('data-open', '1'); menu.style.display = 'block'; requestAnimationFrame(() => { menu.style.opacity = '1'; menu.style.transform = 'translateY(0)'; }); menu.style.pointerEvents = 'auto'; burger.setAttribute('aria-expanded', 'true'); }
      });
      menu.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
    }

    // ---------- responsive layout (no media queries available inline) ----------
    const dNav = root.querySelector('[data-desktop-nav]');
    const dAct = root.querySelector('[data-desktop-actions]');
    const heroTags = Array.from(root.querySelectorAll('[data-htag]'));
    const cue = root.querySelector('[data-cue]');
    const applyResp = () => {
      const w = window.innerWidth;
      const mobile = w < 1080; // desktop header needs ~1080px
      if (dNav) dNav.style.display = mobile ? 'none' : 'flex';
      if (dAct) dAct.style.display = mobile ? 'none' : 'flex';
      if (burger) burger.style.display = mobile ? 'flex' : 'none';
      if (!mobile) closeMenu();
      heroTags.forEach(el => {
        const extra = el.hasAttribute('data-hero-extra');
        el.style.display = (w < 760 || (extra && w < 1100)) ? 'none' : '';
      });
      // hide any tag colliding with the hero text block (bottom-anchored content can rise into the tag band)
      const inner = root.querySelector('[data-hero-inner]');
      if (inner) {
        const ir = inner.getBoundingClientRect();
        const buf = 30;
        heroTags.forEach(el => {
          if (el.style.display === 'none') return;
          const r = el.getBoundingClientRect();
          if (r.bottom + buf > ir.top && r.top - buf < ir.bottom && r.right > ir.left - 12 && r.left < ir.right + 12) el.style.display = 'none';
        });
      }
      if (cue) {
        cue.style.display = (w < 900) ? 'none' : 'flex';
        if (w >= 900) {
          const hi = root.querySelector('[data-hero-inner]');
          if (hi) {
            const ir2 = hi.getBoundingClientRect();
            const cr = cue.getBoundingClientRect();
            if (cr.top - 24 < ir2.bottom && cr.right > ir2.left - 12 && cr.left < ir2.right + 12) cue.style.display = 'none';
          }
        }
      }
      if (this._seedCanvas) this._seedCanvas();
      this.setupParallax();
    };

    // ---------- reveal on scroll ----------
    if (!reduce) {
      const revEls = Array.from(root.querySelectorAll('[data-reveal]'));
      revEls.forEach(el => {
        const kind = el.getAttribute('data-reveal') || 'up';
        el.style.opacity = '0';
        el.style.willChange = 'opacity, transform';
        el.style.transition = 'opacity .9s cubic-bezier(.2,.7,.2,1), transform 1.05s cubic-bezier(.2,.7,.2,1)';
        if (kind === 'up') el.style.transform = 'translateY(34px)';
        else if (kind === 'left') el.style.transform = 'translateX(-40px)';
        else if (kind === 'right') el.style.transform = 'translateX(40px)';
        else if (kind === 'scale') el.style.transform = 'scale(.95)';
      });
      const io = new IntersectionObserver((entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const el = e.target;
            el.style.transitionDelay = (parseFloat(el.getAttribute('data-delay') || '0')) + 'ms';
            el.style.opacity = '1';
            el.style.transform = 'none';
            io.unobserve(el);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -7% 0px' });
      revEls.forEach(el => io.observe(el));
    }

    // ---------- count up ----------
    const countEls = Array.from(root.querySelectorAll('[data-count]'));
    const fmt = (n) => n.toLocaleString('ru-RU');
    const cio = new IntersectionObserver((es) => {
      es.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target; cio.unobserve(el);
        const target = parseFloat(el.getAttribute('data-count'));
        const suf = el.getAttribute('data-suffix') || '';
        if (reduce) { el.textContent = fmt(target) + suf; return; }
        const dur = 1500, t0 = performance.now();
        const step = (t) => {
          const p = Math.min(1, (t - t0) / dur);
          const v = Math.round(target * (1 - Math.pow(1 - p, 3)));
          el.textContent = fmt(v) + suf;
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.5 });
    countEls.forEach(el => cio.observe(el));

    // ---------- match score ring ----------
    const ring = root.getElementById('scoreRing');
    const num = root.getElementById('scoreNum');
    const matchSec = root.getElementById('match');
    if (ring && matchSec) {
      const C = 540.35, targetPct = 0.86;
      const sio = new IntersectionObserver((es) => {
        es.forEach(e => {
          if (!e.isIntersecting) return;
          sio.disconnect();
          if (reduce) { ring.style.strokeDashoffset = String(C * (1 - targetPct)); if (num) num.textContent = '86'; return; }
          ring.style.transition = 'stroke-dashoffset 1.7s cubic-bezier(.2,.7,.2,1)';
          requestAnimationFrame(() => { ring.style.strokeDashoffset = String(C * (1 - targetPct)); });
          const t0 = performance.now();
          const step = (t) => { const p = Math.min(1, (t - t0) / 1700); if (num) num.textContent = String(Math.round(86 * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(step); };
          requestAnimationFrame(step);
        });
      }, { threshold: 0.4 });
      sio.observe(matchSec);
    }

    // ---------- scroll driven (progress, header, parallax, timeline) ----------
    const prog = root.getElementById('scrollProgress');
    const header = root.getElementById('siteHeader');
    const tlWrap = root.querySelector('[data-tl-wrap]');
    const heroIn = root.querySelector('[data-hero-inner]');
    const tlLine = root.querySelector('[data-tl-line]');
    let ticking = false;
    const onScroll = () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY || window.pageYOffset;
        const de = root.documentElement;
        const max = de.scrollHeight - window.innerHeight;
        if (prog) prog.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0) + ')';
        if (header) {
          const s = y > 40;
          header.style.background = s ? 'rgba(247,249,252,0.92)' : 'rgba(247,249,252,0.78)';
          header.style.borderBottomColor = s ? 'rgba(18,38,63,0.1)' : 'rgba(18,38,63,0.07)';
          header.style.backdropFilter = 'blur(16px) saturate(1.2)';
          header.style.webkitBackdropFilter = header.style.backdropFilter;
        }
        const vh = window.innerHeight;
        (this._parallaxEls || []).forEach(el => {
          const sp = parseFloat(el.getAttribute('data-parallax') || '0.1');
          const r = el.getBoundingClientRect();
          const c = r.top + r.height / 2 - vh / 2;
          el.style.transform = 'translate3d(0,' + (-c * sp).toFixed(1) + 'px,0)';
        });
        if (tlWrap && tlLine && !reduce) {
          const r = tlWrap.getBoundingClientRect();
          const p = Math.max(0, Math.min(1, (vh * 0.55 - r.top) / (r.height || 1)));
          tlLine.style.transform = 'scaleY(' + p + ')';
        }
        if (heroIn && this._heavy) { const hp = Math.min(1, y / Math.max(1, vh)); heroIn.style.transform = 'translate3d(0,' + (hp * 70).toFixed(1) + 'px,0)'; heroIn.style.opacity = String(1 - hp * 0.6); }
        ticking = false;
      });
    };

    this.setupParallax = () => {
      const enabled = this._heavy && window.innerWidth > 860;
      this._parallaxEls = enabled ? Array.from(root.querySelectorAll('[data-parallax]')) : [];
      if (!enabled) root.querySelectorAll('[data-parallax]').forEach(el => { el.style.transform = 'none'; });
    };

    const hcv = root.querySelector('[data-hero-canvas]');
    if (hcv && !reduce && this._heavy) {
      const cx = hcv.getContext('2d');
      const hero = hcv.parentElement;
      let W, H, nodes = [];
      const seed = () => {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        W = hero.clientWidth; H = hero.clientHeight;
        hcv.width = W * dpr; hcv.height = H * dpr;
        cx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const n = W < 760 ? 24 : 54;
        nodes = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .3, vy: (Math.random() - .5) * .3, r: Math.random() * 1.9 + .8 }));
      };
      seed();
      this._seedCanvas = seed;
      const D = 132;
      const tick = () => {
        cx.clearRect(0, 0, W, H);
        for (const p of nodes) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; }
        cx.lineWidth = 1; cx.strokeStyle = 'rgba(36,86,160,0.14)';
        for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j], dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 < D * D) { cx.globalAlpha = 1 - Math.sqrt(d2) / D; cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke(); }
        }
        cx.globalAlpha = 1; cx.fillStyle = 'rgba(36,86,160,0.45)';
        for (const p of nodes) { cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.283); cx.fill(); }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    // cinematic pointer-parallax on hero media (desktop, full motion only)
    const cam = root.querySelector('[data-cam]');
    const heroSec = root.getElementById('top');
    if (cam && heroSec && this._heavy) {
      let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
      const loop = () => {
        cx += (tx - cx) * 0.055; cy += (ty - cy) * 0.055;
        cam.style.transform = 'translate3d(' + cx.toFixed(2) + 'px,' + cy.toFixed(2) + 'px,0)';
        if (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.05) raf = requestAnimationFrame(loop); else raf = null;
      };
      heroSec.addEventListener('mousemove', (e) => {
        if (window.innerWidth < 900) return;
        const r = heroSec.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width - 0.5) * -20;
        ty = ((e.clientY - r.top) / r.height - 0.5) * -14;
        if (!raf) raf = requestAnimationFrame(loop);
      });
      heroSec.addEventListener('mouseleave', () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(loop); });
    }
    // custom cursor (fine pointers only)
    const cdot = root.querySelector('[data-cursor-dot]');
    const cring = root.querySelector('[data-cursor-ring]');
    if (cdot && cring && this._heavy && window.matchMedia('(pointer: fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.body.setAttribute('data-cc', '1');
      cdot.style.display = 'block'; cring.style.display = 'block';
      cdot.style.opacity = '0'; cring.style.opacity = '0';
      let mx = -100, my = -100, rx = -100, ry = -100, ts = 1, cs = 1;
      const cloop = () => {
        rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16; cs += (ts - cs) * 0.18;
        cdot.style.transform = 'translate(' + (mx - 3.5) + 'px,' + (my - 3.5) + 'px)';
        cring.style.transform = 'translate(' + (rx - 19) + 'px,' + (ry - 19) + 'px) scale(' + cs.toFixed(3) + ')';
        requestAnimationFrame(cloop);
      };
      requestAnimationFrame(cloop);
      document.addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; cdot.style.opacity = '1'; cring.style.opacity = '1'; }, { passive: true });
      document.addEventListener('mouseover', (e) => {
        const it = e.target && e.target.closest ? e.target.closest('a,button,summary,[data-lang],[data-cat]') : null;
        ts = it ? 1.75 : 1;
        cring.style.background = it ? 'rgba(36,86,160,0.1)' : 'transparent';
        cdot.style.opacity = it ? '0' : '1';
      });
      document.documentElement.addEventListener('mouseleave', () => { cdot.style.opacity = '0'; cring.style.opacity = '0'; });
    }
    // ===== cinematic feature pack =====
    const fine = window.matchMedia('(pointer: fine)').matches;
    const rm2 = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // preloader curtain
    const pre = root.querySelector('[data-preloader]');
    if (pre) {
      const pc = pre.querySelector('[data-pre-count]');
      const pb = pre.querySelector('[data-pre-bar]');
      if (rm2) { pre.style.display = 'none'; }
      else {
        document.body.style.overflow = 'hidden';
        const t0p = performance.now(), durP = 950;
        const stepP = (t) => {
          const p = Math.min(1, (t - t0p) / durP);
          const v = Math.round(100 * (1 - Math.pow(1 - p, 2)));
          if (pc) pc.textContent = v + '%';
          if (pb) pb.style.transform = 'scaleX(' + (v / 100) + ')';
          if (p < 1) requestAnimationFrame(stepP);
          else {
            pre.style.transform = 'translateY(-101%)';
            document.body.style.overflow = '';
            setTimeout(() => { pre.style.display = 'none'; }, 950);
          }
        };
        requestAnimationFrame(stepP);
        setTimeout(function(){ if (pc) pc.textContent='100%'; if (pb) pb.style.transform='scaleX(1)'; pre.style.transform='translateY(-101%)'; document.body.style.overflow=''; setTimeout(function(){ pre.style.display='none'; }, 700); }, 2200);
      }
    }

    // film grain motion
    const grainEl = root.getElementById('grain');
    if (grainEl && !rm2) { grainEl.style.inset = '-4%'; grainEl.style.animation = 'grainShift .5s steps(1) infinite'; }

    // word-mask heading reveals
    const escW = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const wio = new IntersectionObserver((es) => {
      es.forEach(en => {
        if (!en.isIntersecting) return;
        wio.unobserve(en.target);
        en.target._wshown = true;
        const base = performance.now() < 2400 ? 1050 : 0;
        en.target.querySelectorAll('[data-w]').forEach((w, i) => {
          w.style.transitionDelay = (base + i * 60) + 'ms';
          requestAnimationFrame(() => { w.style.transform = 'translateY(0)'; });
        });
      });
    }, { threshold: 0.3 });
    const splitHeads = () => {
      if (rm2) return;
      root.querySelectorAll('h1, h2').forEach(h => {
        h.querySelectorAll('[data-i18n]').forEach(sp => {
          const words = (sp.textContent || '').trim().split(/\s+/).filter(Boolean);
          if (!words.length) return;
          sp.innerHTML = words.map(w => '<span style="display:inline-block;overflow:hidden;vertical-align:bottom;padding:0 0.16em 0.12em 0.08em;margin:0 -0.16em -0.12em -0.08em"><span data-w style="display:inline-block;transform:translateY(118%);transition:transform .95s cubic-bezier(.22,.75,.2,1)">' + escW(w) + '</span></span>').join(' ');
        });
        h.style.opacity = '1'; h.style.transform = 'none';
        if (h._wshown) { h.querySelectorAll('[data-w]').forEach(w => { w.style.transitionDelay = '0ms'; w.style.transform = 'translateY(0)'; }); }
        else if (!h._wobs) { h._wobs = true; wio.observe(h); }
      });
    };
    splitHeads();
    root.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => setTimeout(splitHeads, 40)));

    // magnetic pill buttons
    if (fine && !rm2) {
      root.querySelectorAll('a').forEach(a => {
        const st = a.getAttribute('style') || '';
        if (!st.includes('border-radius:999px')) return;
        const om = a.getAttribute('onmouseover') || '';
        if (om.includes('transform')) { a.removeAttribute('onmouseover'); a.removeAttribute('onmouseout'); }
        a.style.transition = 'transform .3s cubic-bezier(.22,.75,.3,1), background .2s ease, color .2s ease, box-shadow .3s ease';
        a.addEventListener('mousemove', (e) => {
          const r = a.getBoundingClientRect();
          const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
          a.style.transform = 'translate(' + (dx * 0.22).toFixed(1) + 'px,' + (dy * 0.34).toFixed(1) + 'px)';
        });
        a.addEventListener('mouseleave', () => { a.style.transform = 'translate(0,0)'; });
      });
    }

    // 3D tilt cards
    if (fine && !rm2 && this._heavy) {
      let tiltEls = Array.from(root.querySelectorAll('article'));
      const mcard = root.querySelector('#match [data-reveal="scale"]');
      if (mcard) tiltEls.push(mcard);
      const pg = root.getElementById('pricing');
      if (pg) tiltEls = tiltEls.concat(Array.from(pg.querySelectorAll('div[data-reveal]')).filter(d => (d.getAttribute('style') || '').includes('flex-direction:column')));
      tiltEls.forEach(el => {
        el.addEventListener('mouseenter', () => { el.style.transition = 'transform .18s ease-out'; el.style.willChange = 'transform'; });
        el.addEventListener('mousemove', (e) => {
          const r = el.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
          el.style.transform = 'perspective(950px) rotateX(' + (-py * 5).toFixed(2) + 'deg) rotateY(' + (px * 7).toFixed(2) + 'deg) translateY(-4px)';
        });
        el.addEventListener('mouseleave', () => { el.style.transition = 'transform .6s cubic-bezier(.22,.75,.3,1)'; el.style.transform = 'none'; });
      });
    }

    // seamless marquees: duplicate content once so the -50% loop has no gap
    root.querySelectorAll('[data-marquee]').forEach(m => {
      const set = m.querySelector('[data-mq-set]');
      if (set && m.querySelectorAll('[data-mq-set]').length === 1) m.appendChild(set.cloneNode(true));
    });

    // sections keep their own static backgrounds (crossfade removed by request)
    const under = root.querySelector('[data-bg-under]');
    let flats = [];

    // live header ticker
    const ticker = root.querySelector('[data-ticker]');
    const tickTxt = root.querySelector('[data-ticker-text]');
    if (ticker && tickTxt) {
      const tmsgs = {
        ru: ['312 возможностей открыто сейчас', '14 новых возможностей за неделю', 'Астана: 96 · Алматы: 128'],
        kk: ['Қазір 312 мүмкіндік ашық', 'Аптасына 14 жаңа мүмкіндік', 'Астана: 96 · Алматы: 128'],
        en: ['312 opportunities open now', '14 new this week', 'Astana: 96 · Almaty: 128']
      };
      let ti = 0;
      setInterval(() => {
        ti++;
        tickTxt.style.opacity = '0'; tickTxt.style.transform = 'translateY(-7px)';
        setTimeout(() => {
          const arr = tmsgs[this.lang] || tmsgs.ru;
          tickTxt.textContent = arr[ti % arr.length];
          tickTxt.style.transition = 'none'; tickTxt.style.transform = 'translateY(8px)';
          requestAnimationFrame(() => { tickTxt.style.transition = 'opacity .45s ease, transform .45s ease'; tickTxt.style.opacity = '1'; tickTxt.style.transform = 'translateY(0)'; });
        }, 460);
      }, 4200);
      this._tickerResp = () => { ticker.style.display = window.innerWidth >= 1180 ? 'flex' : 'none'; };
      this._tickerResp();
    }

    // pinned horizontal stories + hero scroll-scrub + crossfade driver
    const hsEl = root.querySelector('[data-hscroll]');
    const trackEl = hsEl ? hsEl.firstElementChild : null;
    const storySec = hsEl ? hsEl.closest('section') : null;
    this._pinData = null;
    const setupPin = () => {
      if (!hsEl || !trackEl || !storySec) return;
      storySec.style.height = ''; storySec.style.overflowX = '';
      hsEl.style.position = ''; hsEl.style.top = ''; hsEl.style.overflowX = ''; hsEl.style.scrollSnapType = '';
      trackEl.style.transform = '';
      this._pinData = null;
      if (!(this._heavy && !rm2 && window.innerWidth >= 1000)) return;
      hsEl.scrollLeft = 0;
      hsEl.style.overflowX = 'visible'; hsEl.style.scrollSnapType = 'none';
      const extra = Math.max(0, trackEl.scrollWidth - hsEl.clientWidth);
      if (extra < 60) return;
      const stickyTop = Math.max(76, (window.innerHeight - hsEl.offsetHeight) / 2);
      storySec.style.height = (storySec.offsetHeight + extra) + 'px';
      storySec.style.overflowX = 'clip';
      hsEl.style.position = 'sticky'; hsEl.style.top = stickyTop + 'px';
      trackEl.style.willChange = 'transform';
      this._pinData = { extra, engage: stickyTop - hsEl.offsetTop };
    };
    setupPin();
    const heroMedia2 = root.querySelector('[data-hero-media]');
    const heroInner2 = root.querySelector('[data-hero-inner]');
    if (heroMedia2) { heroMedia2.style.transformOrigin = '50% 42%'; heroMedia2.style.willChange = 'transform'; }
    let tick2 = false;
    const onScroll2 = () => {
      if (tick2) return; tick2 = true;
      requestAnimationFrame(() => {
        const y = window.scrollY || 0, vh = window.innerHeight;
        if (this._heavy && !rm2) {
          if (heroMedia2) { const p = Math.min(1, y / (vh * 1.05)); heroMedia2.style.transform = 'scale(' + (1 + p * 0.16).toFixed(4) + ')'; }
          if (heroInner2) { const p2 = Math.min(1, y / (vh * 0.85)); heroInner2.style.transform = 'translateY(' + (p2 * 44).toFixed(1) + 'px)'; heroInner2.style.opacity = String(1 - p2 * 0.45); }
        }
        if (this._pinData && storySec && trackEl) {
          const r = storySec.getBoundingClientRect();
          const p = Math.max(0, Math.min(1, (this._pinData.engage - r.top) / this._pinData.extra));
          trackEl.style.transform = 'translate3d(' + (-p * this._pinData.extra).toFixed(1) + 'px,0,0)';
        }
        if (flats.length && under) {
          let cur = flats[0][1];
          for (const f of flats) { const rr = f[0].getBoundingClientRect(); if (rr.top <= vh * 0.5 && rr.bottom >= vh * 0.5) { cur = f[1]; break; } }
          if (under._c !== cur) { under._c = cur; under.style.backgroundColor = cur; }
        }
        tick2 = false;
      });
    };
    window.addEventListener('scroll', onScroll2, { passive: true });
    onScroll2();
    let rt2;
    window.addEventListener('resize', () => { clearTimeout(rt2); rt2 = setTimeout(() => { setupPin(); if (this._tickerResp) this._tickerResp(); onScroll2(); }, 200); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => setTimeout(setupPin, 150));

    applyResp();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => setTimeout(applyResp, 60));
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(applyResp, 150); });
  }

  dict() {
    const translations: Record<string, Record<string, string>> = {
      en: {
        'nav.dirs': 'Directions', 'nav.how': 'How it works', 'nav.match': 'Matching', 'nav.pricing': 'Pricing', 'nav.safety': 'Safety', 'nav.login': 'Log in', 'nav.cta': 'Create profile',
        'hero.kicker': 'Opportunities platform · Kazakhstan', 'hero.h1a': 'Opportunities your', 'hero.h1b': 'future grows from', 'hero.sub': 'Olympiads, hackathons, MUN, internships and summer programs across Kazakhstan. We match the right ones, remind you of deadlines and help you prepare the application — in one place.', 'hero.cta1': 'Create a free profile', 'hero.cta2': 'Browse catalog', 'hero.live': '312 opportunities open right now',
        'stat.opps': 'verified opportunities', 'stat.cats': 'categories', 'stat.cities': 'cities of Kazakhstan', 'stat.students': 'students already with us', 'stat.note': '* figures are illustrative',
        'dir.kicker': 'Directions', 'dir.title': 'Twenty-one directions — from olympiads to summer schools',
        'how.kicker': 'How it works', 'how.title': 'Five steps from profile to a strong portfolio', 'how.s1t': 'Profile', 'how.s1d': 'Grade, interests, skills, goals and constraints — in a couple of minutes. The base for personal matching.', 'how.s2t': 'Personal feed', 'how.s2d': 'We match opportunities and explain exactly why they fit you.', 'how.s3t': 'Deadlines', 'how.s3d': 'Reminders 14, 7, 3 and 1 day out — in-app, by email and Telegram. You won\u2019t miss a submission.', 'how.s4t': 'Application', 'how.s4d': 'The Application Pack gathers data and documents for each submission — once, then reused.', 'how.s5t': 'Portfolio', 'how.s5d': 'Achievements are saved to a timeline and turned into a PDF resume for admissions — in Russian, Kazakh and English.',
        'match.kicker': 'Personal matching', 'match.title': 'We explain why an opportunity fits you', 'match.desc': 'First — hard filters: age, grade, city, language, budget. Then a match score by interests, skills, goals and portfolio value.', 'match.p1': 'You meet the age and grade', 'match.p2': 'Related to AI and programming — your interests', 'match.p3': 'Available from Almaty', 'match.p4': 'Needs a team of 3 and a motivation letter', 'match.eligible': 'Eligible', 'match.fit': 'profile match', 'match.prestige': 'prestige', 'match.cost': 'entry', 'match.deadline': 'days to deadline',
        'radar.kicker': 'Deadline radar', 'radar.title': 'No deadline slips past you again', 'radar.desc': 'One calendar, reminders in-app, by email and Telegram. Export to Google Calendar and ICS.', 'radar.d1': 'in 1 day', 'radar.d2': 'in 5 days', 'radar.d3': 'in 12 days',
        'map.kicker': 'Geography', 'map.title': 'Opportunities across Kazakhstan', 'map.note': '* distribution is illustrative · online opportunities are available from any city',
        'stories.kicker': 'Stories', 'stories.title': 'Portfolios that open doors', 'stories.hint': '\u2190 swipe \u2192', 'stories.note': '* stories are illustrative',
        'tl.kicker': 'Portfolio', 'tl.title': 'Every achievement — in your resume',
        'partners.kicker': 'Ecosystem — opportunity organizers', 'partners.note': '* example partners — will be replaced with confirmed ones',
        'sec.kicker': 'Safety', 'sec.title': 'Minors\u2019 data — protected, seriously', 'sec.desc': 'Data minimization, explicit consents, parental control and full access audit are built into the platform\u2019s core.', 'sec.f1t': 'Explicit consents', 'sec.f1d': 'Separate consent for processing, document storage and sharing with organizers.', 'sec.f2t': 'Parental control', 'sec.f2d': 'Parent access to deadlines, expenses and consents — revocable in one click.', 'sec.f3t': 'Encryption & RLS', 'sec.f3d': 'Signed document links and Row Level Security at the database layer.', 'sec.f4t': 'Trust score', 'sec.f4d': 'Every opportunity is moderated; suspicious posts are flagged.',
        'price.kicker': 'Pricing', 'price.title': 'Start for free', 'price.t1': 'Free', 'price.t1sub': 'forever', 'price.t2': 'Pro', 'price.t2sub': 'for an active student', 'price.t3': 'Mentor', 'price.t3sub': 'for a family or counselor', 'price.badge': 'Popular', 'price.f_catalog': 'Catalog, search and filters', 'price.f_calendar': 'Deadline calendar + ICS', 'price.f_portfolio': 'Achievements portfolio', 'price.f_start': 'Start free', 'price.f_all1': 'Everything in Free', 'price.f_reco': 'Advanced recommendations + match score', 'price.f_pack': 'Application Pack and prep', 'price.f_tg': 'Telegram reminders', 'price.f_try': 'Try Pro', 'price.f_all2': 'Everything in Pro', 'price.f_kids': 'Up to 3 students / children', 'price.f_counsel': 'Counselor and parent access', 'price.f_choose': 'Choose plan', 'price.note': '* prices are illustrative',
        'faq.kicker': 'FAQ', 'faq.q1': 'Is it free?', 'faq.a1': 'Catalog, basic search, calendar and portfolio are free. Advanced recommendations and application prep are on paid plans.', 'faq.q2': 'How do you verify opportunities?', 'faq.a2': 'Every opportunity is moderated and gets a trust score: official source, verified organizer, transparent terms. Suspicious posts are flagged.', 'faq.q3': 'Do you apply for me?', 'faq.a3': 'No. We prepare the Application Pack and help you fill it in, but the final confirmation is always yours. Automatic submission only via official integrations.', 'faq.q4': 'I\u2019m 15 — do I need parental consent?', 'faq.a4': 'For minors there is parental access and separate consents for processing and sharing data with organizers.',
        'cta.title': 'Start building your portfolio', 'cta.title2': 'today', 'cta.sub': 'Create a free profile and get your first personal feed of opportunities in a minute.', 'cta.primary': 'Create profile', 'cta.secondary': 'Browse catalog',
        'footer.tag': 'A single operating system for extracurricular opportunities for students in Kazakhstan.', 'footer.c1': 'Platform', 'footer.c2': 'For whom', 'footer.c3': 'Resources', 'footer.c4': 'Legal'
      },
      kk: {
        'nav.dirs': 'Бағыттар', 'nav.how': 'Қалай жұмыс істейді', 'nav.match': 'Іріктеу', 'nav.pricing': 'Тарифтер', 'nav.safety': 'Қауіпсіздік', 'nav.login': 'Кіру', 'nav.cta': 'Профиль құру',
        'hero.kicker': 'Мүмкіндіктер платформасы · Қазақстан', 'hero.h1a': 'Болашағың өсетін', 'hero.h1b': 'мүмкіндіктер', 'hero.sub': 'Олимпиадалар, хакатондар, MUN, тағылымдамалар және жазғы бағдарламалар. Қолайлысын табамыз, дедлайнды еске саламыз және өтінімді дайындауға көмектесеміз.', 'hero.cta1': 'Тегін профиль құру', 'hero.cta2': 'Каталогты қарау', 'hero.live': 'қазір 312 мүмкіндік ашық',
        'stat.opps': 'тексерілген мүмкіндік', 'stat.cats': 'санат', 'stat.cities': 'Қазақстан қаласы', 'stat.students': 'оқушы бізбен бірге', 'stat.note': '* көрсеткіштер шартты',
        'dir.kicker': 'Бағыттар', 'dir.title': 'Жиырма бір бағыт — олимпиададан жазғы мектепке дейін',
        'how.kicker': 'Қалай жұмыс істейді', 'how.title': 'Профильден мықты портфолиоға дейін бес қадам', 'how.s1t': 'Профиль', 'how.s1d': 'Сынып, қызығушылық, дағды, мақсат және шектеулер — бірнеше минутта.', 'how.s2t': 'Жеке лента', 'how.s2d': 'Мүмкіндіктерді іріктеп, неге сәйкес келетінін түсіндіреміз.', 'how.s3t': 'Дедлайндар', 'how.s3d': 'Еске салулар 14, 7, 3 және 1 күн бұрын — қосымшада, email және Telegram арқылы.', 'how.s4t': 'Өтінім', 'how.s4d': 'Application Pack әр өтінімге деректер мен құжаттарды жинайды — бір рет.', 'how.s5t': 'Портфолио', 'how.s5d': 'Жетістіктер таймлайнға сақталып, түсуге арналған PDF-түйіндемеге айналады — орыс, қазақ және ағылшын тілінде.',
        'match.kicker': 'Жеке іріктеу', 'match.title': 'Мүмкіндік неге сәйкес келетінін түсіндіреміз', 'match.desc': 'Алдымен қатаң сүзгілер: жас, сынып, қала, тіл, бюджет. Содан кейін қызығушылық, дағды, мақсат бойынша match score.', 'match.p1': 'Жас пен сынып бойынша өтесіз', 'match.p2': 'AI және бағдарламалаумен байланысты — сіздің қызығушылығыңыз', 'match.p3': 'Алматыдан қолжетімді', 'match.p4': '3 адамдық команда және мотивациялық хат қажет', 'match.eligible': 'Өтесіз', 'match.fit': 'профильмен сәйкестік', 'match.prestige': 'бедел', 'match.cost': 'қатысу', 'match.deadline': 'дедлайнға дейін күн',
        'radar.kicker': 'Дедлайн-радар', 'radar.title': 'Бірде-бір дедлайн өтіп кетпейді', 'radar.desc': 'Бірыңғай күнтізбе, қосымшадағы, email және Telegram еске салулары. Google Calendar және ICS экспорты.', 'radar.d1': '1 күнде', 'radar.d2': '5 күнде', 'radar.d3': '12 күнде',
        'map.kicker': 'География', 'map.title': 'Бүкіл Қазақстан бойынша мүмкіндіктер', 'map.note': '* тарату шартты · онлайн-мүмкіндіктер кез келген қаладан қолжетімді',
        'stories.kicker': 'Тарихтар', 'stories.title': 'Есік ашатын портфолиолар', 'stories.hint': '\u2190 сырғытыңыз \u2192', 'stories.note': '* тарихтар шартты',
        'tl.kicker': 'Портфолио', 'tl.title': 'Әр жетістік — түйіндемеде',
        'partners.kicker': 'Экожүйе — мүмкіндік ұйымдастырушылары', 'partners.note': '* серіктестер мысал ретінде көрсетілген — расталған соң жаңартылады',
        'sec.kicker': 'Қауіпсіздік', 'sec.title': 'Кәмелетке толмағандардың деректері — сенімді қорғауда', 'sec.desc': 'Деректерді азайту, айқын келісімдер, ата-ана бақылауы және толық аудит платформа негізінде.', 'sec.f1t': 'Айқын келісімдер', 'sec.f1d': 'Өңдеуге, құжат сақтауға және ұйымдастырушыларға беруге бөлек келісім.', 'sec.f2t': 'Ата-ана бақылауы', 'sec.f2d': 'Ата-ананың дедлайн, шығын және келісімдерге қолжетімділігі — бір басумен қайтарылады.', 'sec.f3t': 'Шифрлау және RLS', 'sec.f3d': 'Қол қойылған құжат сілтемелері және деректер базасында Row Level Security.', 'sec.f4t': 'Trust score', 'sec.f4d': 'Әр мүмкіндік модерациядан өтеді; күдіктілері белгіленеді.',
        'price.kicker': 'Тарифтер', 'price.title': 'Тегін бастаңыз', 'price.t1': 'Тегін', 'price.t1sub': 'мәңгілік', 'price.t2': 'Про', 'price.t2sub': 'белсенді оқушыға', 'price.t3': 'Тәлімгер', 'price.t3sub': 'отбасы немесе куратор үшін', 'price.badge': 'Танымал', 'price.f_catalog': 'Каталог, іздеу және сүзгілер', 'price.f_calendar': 'Дедлайн күнтізбесі + ICS', 'price.f_portfolio': 'Жетістіктер портфолиосы', 'price.f_start': 'Тегін бастау', 'price.f_all1': 'Тегін тарифтегінің бәрі', 'price.f_reco': 'Кеңейтілген ұсыныстар + match score', 'price.f_pack': 'Application Pack және дайындық', 'price.f_tg': 'Telegram еске салулары', 'price.f_try': 'Проны байқау', 'price.f_all2': 'Про тарифтегінің бәрі', 'price.f_kids': '3 оқушыға / балаға дейін', 'price.f_counsel': 'Куратор мен ата-ана қолжетімділігі', 'price.f_choose': 'Жоспар таңдау', 'price.note': '* бағалар шартты',
        'faq.kicker': 'Жиі қойылатын сұрақтар', 'faq.q1': 'Бұл тегін бе?', 'faq.a1': 'Каталог, негізгі іздеу, күнтізбе және портфолио тегін. Кеңейтілген ұсыныстар мен өтінім дайындау — ақылы тарифтерде.', 'faq.q2': 'Мүмкіндіктерді қалай тексересіздер?', 'faq.a2': 'Әр мүмкіндік модерациядан өтіп, trust score алады: ресми дереккөз, ұйымдастырушы расталуы, ашық шарттар.', 'faq.q3': 'Өтінімді мен үшін бересіздер ме?', 'faq.a3': 'Жоқ. Біз Application Pack дайындап, толтыруға көмектесеміз, бірақ соңғы растау әрқашан сізде.', 'faq.q4': 'Маған 15 жаста — ата-ана келісімі керек пе?', 'faq.a4': 'Кәмелетке толмағандарға ата-ана қолжетімділігі және деректерді өңдеу мен беруге бөлек келісімдер қарастырылған.',
        'cta.title': 'Портфолиоңды бүгін', 'cta.title2': 'бастап құр', 'cta.sub': 'Тегін профиль құрып, бір минутта мүмкіндіктердің алғашқы жеке лентасын алыңыз.', 'cta.primary': 'Профиль құру', 'cta.secondary': 'Каталогты қарау',
        'footer.tag': 'Қазақстан оқушыларына арналған сыныптан тыс мүмкіндіктердің бірыңғай операциялық жүйесі.', 'footer.c1': 'Платформа', 'footer.c2': 'Кімге', 'footer.c3': 'Ресурстар', 'footer.c4': 'Құқықтық'
      }
    };

    Object.assign(translations.en, {
      'stat.opps': 'open opportunities in the catalog',
      'stat.cats': 'catalog and manual applications',
      'stat.cities': 'access from any city',
      'stat.students': 'manual applications directly',
      'stat.note': 'The opportunity count is loaded from the current catalog.',
      'map.note': 'Online opportunities are available from any city.',
      'price.t1sub': 'catalog and manual applications',
      'price.t2': 'Advanced search',
      'price.t2sub': 'for precise opportunity matching',
      'price.f_calendar': 'Manual applications',
      'price.f_portfolio': 'Deadline calendar and portfolio',
      'price.f_reco': 'Advanced recommendations and match score',
      'price.f_pack': 'Smart filters and saved searches',
      'price.f_tg': 'Deadline reminders',
      'price.f_try': 'Choose advanced search',
      'price.per_month': ' /month',
      'price.note': 'The catalog and manual applications are free.',
      'faq.a1': 'The catalog and manual applications are free.',
      'faq.a3': 'Apply manually on the organizer’s official website.',
    });
    Object.assign(translations.kk, {
      'stat.opps': 'каталогтағы ашық мүмкіндік',
      'stat.cats': 'каталог және қолмен өтінім беру',
      'stat.cities': 'кез келген қаладан қолжетімді',
      'stat.students': 'өтінімді тікелей қолмен беру',
      'stat.note': 'Мүмкіндіктер саны өзекті каталогтан жүктеледі.',
      'map.note': 'Онлайн-мүмкіндіктер кез келген қаладан қолжетімді.',
      'price.t1sub': 'каталог және қолмен өтінім беру',
      'price.t2': 'Кеңейтілген іздеу',
      'price.t2sub': 'мүмкіндіктерді дәл іріктеу үшін',
      'price.f_calendar': 'Өтінімді қолмен беру',
      'price.f_portfolio': 'Дедлайн күнтізбесі және портфолио',
      'price.f_reco': 'Кеңейтілген ұсыныстар және сәйкестік бағасы',
      'price.f_pack': 'Ақылды сүзгілер мен сақталған іздеулер',
      'price.f_tg': 'Дедлайн еске салғыштары',
      'price.f_try': 'Кеңейтілген іздеуді таңдау',
      'price.per_month': ' /ай',
      'price.note': 'Каталог пен қолмен өтінім беру тегін.',
      'faq.a1': 'Каталог пен қолмен өтінім беру тегін.',
      'faq.a3': 'Өтінімді ұйымдастырушының ресми сайтында қолмен беріңіз.',
    });

    return translations;
  }
}
  const __dc = new Component();
  __dc.props = { accentColor: '#2456A0', motion: 'Сдержанно', showGrain: true };
  __dc.componentDidMount();
}
