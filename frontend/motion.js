(function () {
  'use strict';

  const doc = document;
  const root = doc.documentElement;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);
  const lowPower = saveData || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  const tvLike = /TV|SmartTV|AFT|BRAVIA|NetCast|Tizen|WebOS|Android.*TV/i.test(navigator.userAgent) ||
    ((window.matchMedia && window.matchMedia('(min-width: 1600px)').matches) && !coarsePointer);

  root.classList.add('motion-js');
  if (reduceMotion) root.classList.add('motion-reduced');
  if (lowPower) root.classList.add('motion-low');
  if (tvLike) root.classList.add('motion-tv');

  let exitStarted = false;
  let revealObserver = null;
  let mutationObserver = null;
  let lastTvFocus = null;
  let mutationRaf = 0;
  const pendingRefreshNodes = new Set();

  function ready(callback) {
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  function createOverlay() {
    if (doc.getElementById('motionPageOverlay')) return;
    const overlay = doc.createElement('div');
    overlay.id = 'motionPageOverlay';
    overlay.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(overlay);
  }

  function navigate(url) {
    if (!url || exitStarted) return;
    exitStarted = true;

    if (reduceMotion || !doc.body) {
      window.location.href = url;
      return;
    }

    doc.body.classList.add('motion-exiting');
    window.setTimeout(() => {
      window.location.href = url;
    }, 230);
  }

  function setupPageTransitions() {
    createOverlay();
    doc.body.classList.add('motion-enhanced');
    requestAnimationFrame(() => doc.body.classList.add('motion-ready'));

    doc.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = event.target.closest && event.target.closest('a[href]');
      if (!anchor) return;
      if (anchor.target || anchor.hasAttribute('download')) return;

      const next = new URL(anchor.getAttribute('href'), window.location.href);
      if (next.origin !== window.location.origin) return;
      if (next.href === window.location.href) return;
      if (next.hash && next.pathname === window.location.pathname && next.search === window.location.search) return;

      event.preventDefault();
      navigate(next.href);
    });
  }

  function throttleRaf(fn) {
    let scheduled = false;
    return function throttled() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        fn();
      });
    };
  }

  function selectWithSelf(scope, selector) {
    const matches = [];
    if (scope && scope.nodeType === 1 && scope.matches && scope.matches(selector)) {
      matches.push(scope);
    }
    if (scope && scope.querySelectorAll) {
      matches.push.apply(matches, Array.from(scope.querySelectorAll(selector)));
    }
    return matches;
  }

  function setupNavbar() {
    const navbar = doc.querySelector('.navbar');
    const navLinks = Array.from(doc.querySelectorAll('.nav-links span, .nav-link'));

    navLinks.forEach((link, index) => {
      link.style.setProperty('--motion-index', String(index));
      if (link.classList.contains('active')) link.setAttribute('aria-current', 'page');
    });

    const path = window.location.pathname.replace(/\/$/, '') || '/index.html';
    doc.querySelectorAll('.nav-link[href]').forEach((link) => {
      const href = new URL(link.getAttribute('href'), window.location.href).pathname.replace(/\/$/, '') || '/index.html';
      if (href === path || (path === '/' && href.endsWith('/index.html'))) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      }
    });

    const firstHomeLink = doc.querySelector('.nav-links span');
    if (firstHomeLink && (path === '/index.html' || path === '/')) {
      firstHomeLink.classList.add('is-active');
    }

    if (!navbar) return;

    let lastY = window.scrollY;
    const update = throttleRaf(() => {
      const y = window.scrollY;
      const searchOpen = doc.body.classList.contains('search-open');
      const navOpen = doc.body.classList.contains('nav-open');
      const shouldHide = y > 92 && y > lastY + 8 && !searchOpen && !navOpen;

      navbar.classList.toggle('is-scrolled', y > 8);
      navbar.classList.toggle('is-hidden', shouldHide);

      if (y < lastY - 6 || y < 80) navbar.classList.remove('is-hidden');
      lastY = Math.max(y, 0);
    });

    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  function initRevealObserver() {
    if (reduceMotion || !('IntersectionObserver' in window)) return null;
    const compactViewport = window.innerHeight < 720 || coarsePointer;
    return new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver && revealObserver.unobserve(entry.target);
      });
    }, {
      threshold: compactViewport ? 0.08 : 0.16,
      rootMargin: compactViewport ? '0px 0px -4% 0px' : '0px 0px -10% 0px'
    });
  }

  function markReveal(el, index) {
    if (!el || el.dataset.motionReveal === 'true') return;
    el.dataset.motionReveal = 'true';
    el.style.setProperty('--motion-index', String(index || 0));
    el.classList.add('motion-reveal');

    if (reduceMotion || !revealObserver) {
      el.classList.add('is-visible');
      return;
    }

    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * .96 && rect.bottom > 0) {
      requestAnimationFrame(() => el.classList.add('is-visible'));
      return;
    }

    revealObserver.observe(el);
  }

  function setupReveals(context) {
    const scope = context || doc;
    const selectors = [
      '.section',
      '.page-title',
      '.upload-card',
      '.stats-grid',
      '.stat-card',
      '.table-container',
      '.search-input',
      '.form-group',
      '.remote',
      '#status.empty-state',
      '.preview-section'
    ];

    selectWithSelf(scope, selectors.join(',')).forEach((el, index) => markReveal(el, index));
  }

  function setupImages(context) {
    const scope = context || doc;
    const images = selectWithSelf(scope, '.card img, .hero-img, #previewImg, #previewThumbnail, #previewHeroBanner');

    images.forEach((img) => {
      if (img.dataset.motionImage === 'true') {
        if (img.complete && img.naturalWidth > 0) img.classList.add('is-loaded');
        return;
      }

      img.dataset.motionImage = 'true';
      img.classList.add('motion-img');

      const markLoaded = () => img.classList.add('is-loaded');
      if (img.complete && img.naturalWidth > 0) markLoaded();
      else {
        img.addEventListener('load', markLoaded, { once: true });
        img.addEventListener('error', () => img.classList.add('is-loaded'), { once: true });
      }
    });
  }

  function setupCards(context) {
    const scope = context || doc;
    const cards = selectWithSelf(scope, '.card');

    cards.forEach((card, index) => {
      if (card.dataset.motionCard === 'true') return;
      card.dataset.motionCard = 'true';
      if (!card.hasAttribute('tabindex') && !card.classList.contains('motion-skeleton-card')) {
        card.tabIndex = 0;
      }
      card.style.setProperty('--motion-index', String(index % 12));
      card.classList.add('motion-card-in');

      card.addEventListener('focus', () => card.classList.add('focused'));
      card.addEventListener('blur', () => card.classList.remove('focused'));

      if (reduceMotion || coarsePointer || lowPower) return;

      let raf = 0;
      let latestEvent = null;

      // Smooth tilt to avoid mechanical jitter on high refresh-rate pointers.
      let curTiltX = 0;
      let curTiltY = 0;
      let curPanX = 0;
      let curPanY = 0;
      let curGlowX = 50;
      let curGlowY = 50;

      let targetTiltX = 0;
      let targetTiltY = 0;
      let targetPanX = 0;
      let targetPanY = 0;
      let targetGlowX = 50;
      let targetGlowY = 50;

      let smoothRaf = 0;
      const lerp = (a, b, t) => a + (b - a) * t;

      const applySmooth = () => {
        smoothRaf = 0;
        // Dampen on low power further
        const alpha = lowPower ? 0.10 : 0.16;

        curTiltX = lerp(curTiltX, targetTiltX, alpha);
        curTiltY = lerp(curTiltY, targetTiltY, alpha);
        curPanX = lerp(curPanX, targetPanX, alpha);
        curPanY = lerp(curPanY, targetPanY, alpha);
        curGlowX = lerp(curGlowX, targetGlowX, alpha);
        curGlowY = lerp(curGlowY, targetGlowY, alpha);

        card.style.setProperty('--tilt-x', curTiltX.toFixed(2) + 'deg');
        card.style.setProperty('--tilt-y', curTiltY.toFixed(2) + 'deg');
        card.style.setProperty('--card-pan-x', curPanX.toFixed(2) + 'px');
        card.style.setProperty('--card-pan-y', curPanY.toFixed(2) + 'px');
        card.style.setProperty('--glow-x', curGlowX.toFixed(1) + '%');
        card.style.setProperty('--glow-y', curGlowY.toFixed(1) + '%');

        // Continue until we converge closely, including the soft return after pointer leave.
        const stillMoving =
          Math.abs(curTiltX - targetTiltX) + Math.abs(curTiltY - targetTiltY) > 0.02 ||
          Math.abs(curPanX - targetPanX) + Math.abs(curPanY - targetPanY) > 0.05 ||
          Math.abs(curGlowX - targetGlowX) + Math.abs(curGlowY - targetGlowY) > 0.12;
        if (stillMoving) smoothRaf = requestAnimationFrame(applySmooth);
      };

      const updateTilt = () => {
        raf = 0;
        if (!latestEvent) return;
        const rect = card.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const relX = (latestEvent.clientX - rect.left) / rect.width;
        const relY = (latestEvent.clientY - rect.top) / rect.height;
        const x = Math.max(0, Math.min(1, relX));
        const y = Math.max(0, Math.min(1, relY));

        // Slightly reduced intensity; CSS further scales by ~.78.
        targetTiltY = ((x - .5) * 5.2);
        targetTiltX = ((.5 - y) * 3.8);
        targetPanX = ((x - .5) * -5);
        targetPanY = ((y - .5) * -4);
        targetGlowX = (x * 100);
        targetGlowY = (y * 100);

        if (!smoothRaf) smoothRaf = requestAnimationFrame(applySmooth);
      };

      card.addEventListener('pointerenter', () => {
        card.classList.add('is-hovering');
      }, { passive: true });

      card.addEventListener('pointermove', (event) => {
        latestEvent = event;
        if (!raf) raf = requestAnimationFrame(updateTilt);
      }, { passive: true });

      card.addEventListener('pointerleave', () => {
        latestEvent = null;
        card.classList.remove('is-hovering');
        targetTiltX = 0;
        targetTiltY = 0;
        targetPanX = 0;
        targetPanY = 0;
        targetGlowX = 50;
        targetGlowY = 50;
        if (!smoothRaf) smoothRaf = requestAnimationFrame(applySmooth);
      }, { passive: true });
    });
  }

  function setupRowKinetics(context) {
    const scope = context || doc;
    const rows = selectWithSelf(scope, '.row');

    rows.forEach((row) => {
      if (row.dataset.motionRow === 'true') return;
      row.dataset.motionRow = 'true';

      let pointerRaf = 0;
      let latestPointer = null;
      let scrollTimer = 0;

      const updatePointer = () => {
        pointerRaf = 0;
        if (!latestPointer) return;
        const rect = row.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = Math.max(0, Math.min(1, (latestPointer.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (latestPointer.clientY - rect.top) / rect.height));
        row.style.setProperty('--row-spot-x', (x * 100).toFixed(1) + '%');
        row.style.setProperty('--row-spot-y', (y * 100).toFixed(1) + '%');
      };

      if (!reduceMotion && !lowPower) {
        row.addEventListener('pointerenter', () => row.classList.add('row-hot'), { passive: true });
        row.addEventListener('pointermove', (event) => {
          latestPointer = event;
          if (!pointerRaf) pointerRaf = requestAnimationFrame(updatePointer);
        }, { passive: true });
        row.addEventListener('pointerleave', () => {
          latestPointer = null;
          row.classList.remove('row-hot');
          row.style.setProperty('--row-spot-x', '50%');
          row.style.setProperty('--row-spot-y', '50%');
        }, { passive: true });
      }

      row.addEventListener('scroll', () => {
        row.classList.add('is-kinetic');
        clearTimeout(scrollTimer);
        scrollTimer = window.setTimeout(() => row.classList.remove('is-kinetic'), 180);
      }, { passive: true });
    });
  }

  function setupRipple() {
    if (reduceMotion) return;

    const selector = [
      '.btn',
      '.icon-btn',
      '.upload-btn',
      '.refresh-btn',
      '.action-icon',
      '.file-btn',
      '.nav-link',
      '.controlButton',
      '.skipBtn',
      '.remote button',
      '.menu-btn',
      '.hamburger'
    ].join(',');

    doc.addEventListener('pointerdown', (event) => {
      const target = event.target.closest && event.target.closest(selector);
      if (!target || target.disabled) return;

      const rect = target.getBoundingClientRect();
      const ripple = doc.createElement('span');
      ripple.className = 'motion-ripple';
      ripple.style.left = (event.clientX - rect.left) + 'px';
      ripple.style.top = (event.clientY - rect.top) + 'px';

      target.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 700);
    }, { passive: true });
  }

  function setupHeroParallax() {
    const hero = doc.querySelector('.hero');
    const heroBackground = doc.querySelector('.hero-background');
    if (!hero || !heroBackground || reduceMotion || lowPower) return;

    const parallaxTravel = coarsePointer ? 12 : 28;
    const scaleTravel = coarsePointer ? .008 : .018;
    const update = throttleRaf(() => {
      const rect = hero.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, -rect.top / Math.max(rect.height, 1)));
      heroBackground.style.setProperty('--hero-parallax', (progress * parallaxTravel).toFixed(1) + 'px');
      heroBackground.style.setProperty('--hero-scale', (1 + progress * scaleTravel).toFixed(3));
    });

    window.addEventListener('scroll', update, { passive: true });
    update();

    if (coarsePointer) return;

    let heroPointerRaf = 0;
    let latestPointer = null;
    const updatePointerDrift = () => {
      heroPointerRaf = 0;
      if (!latestPointer) return;
      const rect = hero.getBoundingClientRect();
      const x = ((latestPointer.clientX - rect.left) / Math.max(rect.width, 1)) - .5;
      const y = ((latestPointer.clientY - rect.top) / Math.max(rect.height, 1)) - .5;
      heroBackground.style.setProperty('--hero-drift-x', (x * -10).toFixed(2) + 'px');
      heroBackground.style.setProperty('--hero-drift-y', (y * -6).toFixed(2) + 'px');
    };

    hero.addEventListener('pointermove', (event) => {
      latestPointer = event;
      if (!heroPointerRaf) heroPointerRaf = requestAnimationFrame(updatePointerDrift);
    }, { passive: true });

    hero.addEventListener('pointerleave', () => {
      latestPointer = null;
      heroBackground.style.setProperty('--hero-drift-x', '0px');
      heroBackground.style.setProperty('--hero-drift-y', '0px');
    }, { passive: true });
  }

  function setupSearch() {
    const overlay = doc.getElementById('searchOverlay');
    if (!overlay || !('MutationObserver' in window)) return;

    const input = doc.getElementById('searchBox');
    const sync = () => {
      const open = overlay.classList.contains('show') || overlay.style.display === 'flex';
      doc.body.classList.toggle('search-open', open);
      if (open && input) window.setTimeout(() => input.focus({ preventScroll: true }), 120);
    };

    new MutationObserver(sync).observe(overlay, {
      attributes: true,
      attributeFilter: ['class', 'style']
    });
    sync();
  }

  function setupModals() {
    const modal = doc.getElementById('editorModal');
    if (!modal) return;
    modal.classList.add('motion-modal');
    if (modal.style.display && modal.style.display !== 'none') {
      requestAnimationFrame(() => modal.classList.add('is-open'));
    }
  }

  function setupPlayer() {
    // Player implementation lives in public/player.html (inline script).
    // motion.js should ONLY add buffering/seek hint states when the video exists.
    const video = doc.getElementById('video');
    if (!video) return;


    let spinner = doc.querySelector('.player-spinner');
    if (!spinner) {
      spinner = doc.createElement('div');
      spinner.className = 'player-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      doc.body.appendChild(spinner);
    }

    let seekHint = doc.querySelector('.player-seek-hint');
    if (!seekHint) {
      seekHint = doc.createElement('div');
      seekHint.className = 'player-seek-hint';
      seekHint.setAttribute('aria-hidden', 'true');
      doc.body.appendChild(seekHint);
    }

    const setBuffering = (value) => doc.body.classList.toggle('video-buffering', Boolean(value));
    const setReady = () => {
      doc.body.classList.add('video-ready');
      setBuffering(false);
    };
    let seekHintTimer = 0;
    const showSeekHint = (label) => {
      if (!seekHint || reduceMotion) return;
      seekHint.textContent = label;
      doc.body.classList.add('seek-feedback');
      clearTimeout(seekHintTimer);
      seekHintTimer = window.setTimeout(() => doc.body.classList.remove('seek-feedback'), 520);
    };

    // Keep video logic minimal to avoid fighting the inline player script.
    // Only drive visual buffering state.
    video.addEventListener('waiting', () => setBuffering(true));
    video.addEventListener('stalled', () => setBuffering(true));
    video.addEventListener('seeking', () => setBuffering(true));
    video.addEventListener('seeked', () => {
      setBuffering(false);
      doc.body.classList.add('video-ready');
    });
    video.addEventListener('canplay', () => {
      setBuffering(false);
      doc.body.classList.add('video-ready');
    });
    video.addEventListener('playing', () => {
      setBuffering(false);
      doc.body.classList.add('video-ready');
    });
    video.addEventListener('loadeddata', () => {
      setBuffering(false);
      doc.body.classList.add('video-ready');
    });


    doc.addEventListener('keydown', (event) => {
      if (event.target && event.target.tagName === 'INPUT') return;
      if (event.key === 'ArrowRight') showSeekHint('+10s');
      if (event.key === 'ArrowLeft') showSeekHint('-10s');
    });

    doc.getElementById('rightSkip')?.addEventListener('click', () => showSeekHint('+10s'));
    doc.getElementById('leftSkip')?.addEventListener('click', () => showSeekHint('-10s'));
  }

  function isVisible(el) {
    if (!el || el.disabled || el.closest('[aria-hidden="true"]')) return false;
    if (el.classList && el.classList.contains('motion-skeleton-card')) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    if (rect.right < 0 || rect.left > window.innerWidth || rect.bottom < 0 || rect.top > window.innerHeight) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.02;
  }

  function getTvFocusable() {
    const selector = [
      '.card:not(.motion-skeleton-card)',
      'button',
      'a[href]',
      '[role="button"]',
      'input:not([type="hidden"])',
      'textarea',
      'select',
      '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    return Array.from(doc.querySelectorAll(selector))
      .filter((el, index, list) => list.indexOf(el) === index)
      .filter(isVisible);
  }

  function getDirectionalCandidate(current, direction, focusables) {
    if (!current || !isVisible(current)) {
      if (lastTvFocus && isVisible(lastTvFocus)) return lastTvFocus;
      return focusables.find((el) => el.matches && el.matches('.card:not(.motion-skeleton-card)')) || focusables[0] || null;
    }

    const currentRect = current.getBoundingClientRect();
    const currentCx = currentRect.left + currentRect.width / 2;
    const currentCy = currentRect.top + currentRect.height / 2;
    let best = null;
    let bestScore = Infinity;

    focusables.forEach((candidate) => {
      if (candidate === current) return;
      const rect = candidate.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = cx - currentCx;
      const dy = cy - currentCy;

      const directional =
        (direction === 'right' && dx > 12) ||
        (direction === 'left' && dx < -12) ||
        (direction === 'down' && dy > 12) ||
        (direction === 'up' && dy < -12);

      if (!directional) return;

      const primary = direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
      const secondary = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
      const score = primary + secondary * 1.85;

      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    });

    if (best) return best;

    const index = focusables.indexOf(current);
    if (index < 0) return focusables[0] || null;
    if (direction === 'right' || direction === 'down') return focusables[Math.min(index + 1, focusables.length - 1)] || null;
    return focusables[Math.max(index - 1, 0)] || null;
  }

  function setupTvNavigation() {
    if (!tvLike || doc.getElementById('video')) return;

    doc.addEventListener('focusin', (event) => {
      if (event.target && isVisible(event.target)) lastTvFocus = event.target;
    });

    doc.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const tag = event.target && event.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const focusables = getTvFocusable();
      if (!focusables.length) return;

      const direction = event.key.replace('Arrow', '').toLowerCase();
      const current = focusables.includes(doc.activeElement) ? doc.activeElement : null;
      const next = getDirectionalCandidate(current, direction, focusables);

      if (!next) return;
      event.preventDefault();
      next.focus({ preventScroll: true });
      next.classList && next.classList.add('focused');
      lastTvFocus = next;
      alignTvFocus(next);
    });
  }

  function alignTvFocus(el) {
    const behavior = reduceMotion ? 'auto' : 'smooth';
    const row = el.closest && el.closest('.row');

    if (row) {
      const rowRect = row.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const needsInline =
        elRect.left < rowRect.left + rowRect.width * .12 ||
        elRect.right > rowRect.right - rowRect.width * .12;

      if (needsInline) {
        const offset = el.offsetLeft - Math.max(18, row.clientWidth * .12);
        row.scrollTo({ left: Math.max(0, offset), behavior });
      }

      const targetY = window.scrollY + rowRect.top - Math.max(84, window.innerHeight * .18);
      if (rowRect.top < 96 || rowRect.bottom > window.innerHeight - 96) {
        window.scrollTo({ top: Math.max(0, targetY), behavior });
      }
      return;
    }

    el.scrollIntoView({ behavior, block: 'nearest', inline: 'nearest' });
  }

  function setupCounters() {
    const counters = doc.querySelectorAll('.stat-number');
    counters.forEach((counter) => {
      if (counter.id === 'freeStorage') return;
      if (counter.dataset.motionCounter === 'true') return;
      counter.dataset.motionCounter = 'true';
      counter.dataset.motionValue = counter.textContent.trim() || '0';

      // Counters with formatted values such as "2.3 GB" must not be
      // parsed and rewritten as integers by the animation.
      if (!/^\d+$/.test(counter.textContent.trim())) return;

      if (!('MutationObserver' in window) || reduceMotion) return;

      new MutationObserver(() => {
        if (counter.dataset.motionCounting === 'true') return;
        const next = parseInt(counter.textContent, 10);
        const prev = parseInt(counter.dataset.motionValue || '0', 10);
        if (!Number.isFinite(next) || next === prev) return;
        counter.dataset.motionValue = String(next);
        animateNumber(counter, prev, next);
      }).observe(counter, { childList: true, characterData: true, subtree: true });
    });
  }

  function animateNumber(el, from, to) {
    const start = performance.now();
    const duration = 520;
    el.dataset.motionCounting = 'true';
    el.classList.add('is-counting');

    const frame = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(from + (to - from) * eased));

      if (t < 1) requestAnimationFrame(frame);
      else {
        el.textContent = String(to);
        el.dataset.motionCounting = 'false';
        el.classList.remove('is-counting');
      }
    };

    requestAnimationFrame(frame);
  }

  function decorateTables(context) {
    const scope = context || doc;
    selectWithSelf(scope, '.table tbody tr').forEach((row, index) => {
      row.style.setProperty('--motion-index', String(index));
    });
  }

  function refresh(context) {
    const scope = context && context.nodeType === 1 ? context : doc;
    setupImages(scope);
    setupCards(scope);
    setupRowKinetics(scope);
    setupReveals(scope);
    decorateTables(scope);
    setupCounters();
  }

  function setupMutationRefresh() {
    if (!('MutationObserver' in window)) return;

    mutationObserver = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (node.nodeType === 1) pendingRefreshNodes.add(node);
        });
      });

      if (!pendingRefreshNodes.size || mutationRaf) return;
      mutationRaf = requestAnimationFrame(() => {
        mutationRaf = 0;
        const nodes = Array.from(pendingRefreshNodes);
        pendingRefreshNodes.clear();
        nodes.forEach((node) => refresh(node));
      });
    });

    mutationObserver.observe(doc.body, {
      childList: true,
      subtree: true
    });
  }

  window.StreamBoxMotion = {
    navigate,
    refresh,
    reduced: reduceMotion,
    lowPower,
    tvLike
  };

  ready(() => {
    if (!doc.body) return;

    if (lowPower) doc.body.classList.add('motion-low');
    if (tvLike) doc.body.classList.add('motion-tv');

    revealObserver = initRevealObserver();
    setupPageTransitions();
    setupNavbar();
    setupReveals(doc);
    setupImages(doc);
    setupCards(doc);
    setupRowKinetics(doc);
    setupRipple();
    setupHeroParallax();
    setupSearch();
    setupModals();
    setupPlayer();
    setupTvNavigation();
    setupCounters();
    decorateTables(doc);
    setupMutationRefresh();
  });
})();
