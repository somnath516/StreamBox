let allMovies=[];

function motionNavigate(url){
  if (window.StreamBoxMotion && typeof window.StreamBoxMotion.navigate === 'function') {
    window.StreamBoxMotion.navigate(url);
    return;
  }
  window.location.href = url;
}

function hideLoader(){
  const loader = document.getElementById("loading");
  if (loader) loader.classList.add("fade-out");
}

function loadMovies(){
  // Fail-safe: render layout immediately even if fetch fails.
  try {
    allMovies = Array.isArray(allMovies) ? allMovies : [];
    updateHero();
    showHomeSkeletons();
  } catch (e) {
    console.error('homepage_render_init_failed', e);
  }

  setTimeout(hideLoader, 1600);

  fetch("/movies")
    .then(async (res) => {
      if (!res || !res.ok) {
        console.error('movies_fetch_bad_response', {
          ok: !!res?.ok,
          status: res?.status,
        });
        return [];
      }
      try {
        const json = await res.json();
        return Array.isArray(json) ? json : [];
      } catch (e) {
        console.error('movies_fetch_json_parse_failed', e);
        return [];
      }
    })
    .then((data) => {
      allMovies = Array.isArray(data) ? data : [];
      console.info('movies_fetch_success', { count: allMovies.length });

      // Validate shape defensively (never throw)
      const safeMovies = allMovies.filter(m => {
        if (!m || typeof m !== 'object') return false;
        return m.id !== undefined && (m.title !== undefined || m.description !== undefined);
      });

      if (safeMovies.length !== allMovies.length) {
        console.warn('movies_payload_validation_dropped_entries', {
          dropped: allMovies.length - safeMovies.length,
        });
      }

      allMovies = safeMovies;
      updateHero();
      render();
      setTimeout(hideLoader, 180);
    })
    .catch((e) => {
      console.error('movies_fetch_failed', e);
      // Keep page usable
      updateHero('Load Error', "Check console - try refresh");
      render();
      setTimeout(hideLoader, 180);
    });
}


let currentHeroIndex = 0;

function getHeroImageSrc(movie) {
  if (!movie) return null;
  const file = movie.heroBanner || movie.thumbnail;
  return file ? '/hero-banner/' + file : null;
}

function updateHeroHeroContent(movie) {
  const heroTitle = document.getElementById("heroTitle");
  const heroDesc = document.getElementById("heroDesc");
  const playBtn = document.querySelector('.btn-play');
  const infoBtn = document.querySelector('.btn-info');

  if (!heroTitle || !heroDesc || !playBtn || !infoBtn) return;

  if (movie) {
    heroTitle.textContent = movie.title;
    heroDesc.textContent = movie.description || "";
    playBtn.textContent = 'Play';
    infoBtn.textContent = 'More Info';
    playBtn.onclick = () => openPlayer(movie);
  } else {
    heroTitle.textContent = "Welcome to StreamBox";
    heroDesc.textContent = "No movies yet. Upload your first blockbuster!";
    playBtn.textContent = 'Upload Movie';
    infoBtn.textContent = 'How to Upload';
    playBtn.onclick = () => motionNavigate('/upload.html');
    infoBtn.onclick = () => alert('Go to Upload page (top-right + icon), select movie + thumbnail, add title!');
  }
}

function updateHero() {
  currentHeroIndex = 0;
  if (allMovies.length > 0) {
    updateHeroHeroContent(allMovies[0]);
  } else {
    updateHeroHeroContent(null);
  }
}

function applyHeroImage(movie) {
  const heroImgA = document.getElementById('heroImgA');
  const heroImgB = document.getElementById('heroImgB');
  if (!heroImgA || !heroImgB) return;

  const src = (movie && movie.heroBanner)
    ? ('/hero-banner/' + movie.heroBanner)
    : (movie && movie.thumbnail)
      ? ('/thumbnail/' + movie.thumbnail)
      : null;

  if (!src) return;

  // Decide which img is currently visible by opacity
  const showA = heroImgA.classList.contains('active') || Number(heroImgA.style.opacity || 1) >= 1;
  const nextEl = showA ? heroImgB : heroImgA;

  nextEl.onload = () => {
    // swap via opacity
    nextEl.style.opacity = '1';
    nextEl.classList.add('active');

    const curEl = showA ? heroImgA : heroImgB;
    curEl.style.opacity = '0';
    curEl.classList.remove('active');

    nextEl.onload = null;
  };

  nextEl.onerror = () => {
    // fallback if hero-banner missing/invalid; try thumbnail
    if (movie && movie.thumbnail) {
      const fallbackSrc = '/thumbnail/' + movie.thumbnail;
      nextEl.onload = () => {
        nextEl.style.opacity = '1';
        nextEl.classList.add('active');
        const curEl = showA ? heroImgA : heroImgB;
        curEl.style.opacity = '0';
        curEl.classList.remove('active');
        nextEl.onload = null;
      };
      nextEl.src = fallbackSrc;
    }
  };

  // preload then fade
  const pre = new Image();
  pre.onload = () => { nextEl.src = src; };
  pre.onerror = () => {
    if (movie && movie.thumbnail) nextEl.src = '/thumbnail/' + movie.thumbnail;
  };
  pre.src = src;
}

let heroIntervalId = null;
let heroFadeTimer = null;
let heroRotationIndex = 0;

function startHeroRotation() {
  if (heroIntervalId || !Array.isArray(allMovies) || allMovies.length < 1) return;

  // show first immediately
  heroRotationIndex = 0;
  applyHeroImage(allMovies[heroRotationIndex]);
  updateHeroHeroContent(allMovies[heroRotationIndex]);

  heroIntervalId = setInterval(() => {
    if (!allMovies.length) return;

    // Prefer movies that have heroBanner, but fallback to thumbnail
    const nextIndex = (heroRotationIndex + 1) % allMovies.length;
    heroRotationIndex = nextIndex;

    const movie = allMovies[heroRotationIndex];
    applyHeroImage(movie);
    updateHeroHeroContent(movie);
  }, 10000);
}

// kick it once after movies render
function kickHero() {
  startHeroRotation();
}

function showHomeSkeletons(){
  const rows = [
    document.getElementById("movies"),
    document.getElementById("trending")
  ].filter(Boolean);
  const continueEl = document.getElementById("continue");
  const continueSection = continueEl && continueEl.closest('.section');
  if (continueSection) continueSection.classList.add('is-empty');

  rows.forEach(row => {
    if (row.children.length) return;
    const section = row.closest('.section');
    if (section) section.classList.remove('is-empty');

    for (let i = 0; i < 8; i++) {
      const skeleton = document.createElement('div');
      skeleton.className = 'card motion-skeleton-card';
      skeleton.setAttribute('aria-hidden', 'true');
      skeleton.style.setProperty('--motion-index', String(i));
      skeleton.innerHTML = '<div class="motion-skeleton-poster"></div><div class="motion-skeleton-line"></div>';
      row.appendChild(skeleton);
    }
  });

  window.StreamBoxMotion?.refresh?.();
}

function clearHomeSkeletons(){
  document.querySelectorAll('.motion-skeleton-card').forEach(card => card.remove());
}

function createCard(m,label=m.title){
  const d = document.createElement("div");
  d.className = "card motion-card-in";
  d.tabIndex = 0;
  d.setAttribute('role', 'button');
  d.setAttribute('aria-label', `Play ${label || m.title || 'movie'}`);
  const imgEl = document.createElement('img');
  imgEl.src = `/thumbnail/${m.thumbnail || 'default.jpg'}`;
  imgEl.loading = 'lazy';
  imgEl.decoding = 'async';
  imgEl.alt = String(label || '').replace(/"/g, '&quot;');
  imgEl.className = 'motion-img';
  const p = document.createElement('p');
  p.textContent = label;
  d.appendChild(imgEl);
  d.appendChild(p);
  d.addEventListener('click', () => openPlayer(m));
  d.addEventListener('focus', () => d.classList.add('focused'));
  d.addEventListener('blur', () => d.classList.remove('focused'));
  d.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      openPlayer(m);
    }
  });
  // Force motion-enhanced class if not present
  if (!document.body.classList.contains('motion-enhanced')) {
    document.body.classList.add('motion-enhanced');
  }
  return d;
}


function render(){
  // Ensure hero starts rotating after movies are available
  kickHero();
  const moviesEl = document.getElementById("movies");
  const trendingEl = document.getElementById("trending");
  const continueEl = document.getElementById("continue");

  if (!moviesEl || !trendingEl || !continueEl) return;
  clearHomeSkeletons();

  const moviesSection = moviesEl.closest('.section');
  const trendingSection = trendingEl.closest('.section');
  const continueSection = continueEl.closest('.section');

  // IMPORTANT: Render the sections even when thumbnails fail.
  // Previously we hid everything when posters were missing, which produced a visually empty homepage.
  // We keep the card-level onerror removal, but never hide the whole page pipeline.
  const moviesWithPoster = allMovies.filter(m => !!m.thumbnail);

  // Clear containers
  trendingEl.innerHTML = '';
  continueEl.innerHTML = '';
  moviesEl.innerHTML = '';

  const renderRow = (rowEl, list, resumeLabel) => {
    rowEl.innerHTML = '';
    list.forEach((m, idx) => {
      const card = createCard(m, resumeLabel || m.title);
      card.style.setProperty('--motion-index', String(idx % 12));
      rowEl.appendChild(card);

      const img = card.querySelector('img');
      if (img) {
        img.onerror = () => {
          // Remove only the broken card; keep the rest of the UI visible.
          try { card.remove(); } catch {}
        };
        // Force is-loaded if image fails to load
        setTimeout(() => {
          if (!img.classList.contains('is-loaded')) {
            img.classList.add('is-loaded');
          }
        }, 2000);
      }
    });
  };

  if (moviesWithPoster.length) {
    if (moviesSection) moviesSection.classList.remove('is-empty');
    renderRow(moviesEl, moviesWithPoster.slice(0,12));

    const trendingList = moviesWithPoster.slice(5, 15);
    if (trendingList.length) {
      if (trendingSection) trendingSection.classList.remove('is-empty');
      renderRow(trendingEl, trendingList);
    } else {
      if (trendingSection) trendingSection.classList.add('is-empty');
      trendingEl.innerHTML = '';
    }
  } else {
    // Keep the hero + search + page layout visible.
    if (moviesSection) moviesSection.classList.add('is-empty');
    moviesEl.innerHTML = '';
    if (trendingSection) trendingSection.classList.add('is-empty');
    trendingEl.innerHTML = '';
  }

  // Continue: render if watch progress exists
  let continueCount = 0;
  allMovies.forEach((m, idx) => {
    if (!localStorage.getItem("watch_"+m.id)) return;
    if (!m.thumbnail) return;
    continueCount++;
    const card = createCard(m, "Resume");
    card.style.setProperty('--motion-index', String(idx % 8));
    continueEl.appendChild(card);
    const img = card.querySelector('img');
    if (img) img.onerror = () => { try { card.remove(); } catch {} };
  });

  if (continueCount) {
    if (continueSection) continueSection.classList.remove('is-empty');
  } else {
    if (continueSection) continueSection.classList.add('is-empty');
    continueEl.innerHTML = '';
  }

  // Ensure motion engine picks up new cards
  window.StreamBoxMotion?.refresh?.(moviesEl);
  window.StreamBoxMotion?.refresh?.(trendingEl);
  window.StreamBoxMotion?.refresh?.(continueEl);
}


function openPlayer(movie){
  if (!movie || !movie.movie) return;
  const encodedMovie = encodeURIComponent(movie.movie);
  motionNavigate(`/player.html?movie=${encodedMovie}&id=${movie.id}&autoplay=1`);
}

function playFeatured(){
  // play whatever hero is currently active
  const movie = allMovies[heroRotationIndex] || allMovies[0];
  if (movie) openPlayer(movie);
}


function openSearch(){
  const overlay = document.getElementById("searchOverlay");
  if (!overlay) return;

  closeNavMenu();
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('show'));

  // Netflix-like behavior: immediately show all movies before typing.
  // Uses existing liveSearch filtering (empty query => show all).
  const searchBox = document.getElementById('searchBox');
  const initialVal = searchBox ? (searchBox.value || '') : '';
  liveSearch(initialVal);
  window.StreamBoxMotion?.refresh?.(overlay);
}

function closeSearch(){
  const overlay = document.getElementById("searchOverlay");
  if (!overlay) return;
  overlay.classList.remove('show');
  window.setTimeout(() => {
    if (!overlay.classList.contains('show')) overlay.style.display = "none";
  }, 240);
}

function setNavMenu(open) {
  const menuBtn = document.querySelector('.menu-btn');
  document.body.classList.toggle('nav-open', !!open);
  if (menuBtn) {
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  }
}

function toggleNavMenu() {
  setNavMenu(!document.body.classList.contains('nav-open'));
}

function closeNavMenu() {
  if (document.body.classList.contains('nav-open')) setNavMenu(false);
}

function liveSearch(val){
  const res = document.getElementById("searchResults");
  if (!res) return;
  res.innerHTML = "";

  const q = (val || "").toLowerCase().trim();
  const moviesWithPoster = allMovies.filter(m => !!m.thumbnail);

  moviesWithPoster
    .filter(m => String(m.title || "").toLowerCase().includes(q))
    .forEach(m => {
      const card = createCard(m);
      const img = card.querySelector('img');
      if (img) img.onerror = () => { try { card.remove(); } catch {} };
      res.appendChild(card);
    });

  window.StreamBoxMotion?.refresh?.(res);
}





// CRITICAL: Ensure loading screen is always removed after timeout
if (typeof document !== 'undefined') {
  let loaderRemovalTimer;
  const ensureLoaderRemoved = () => {
    clearTimeout(loaderRemovalTimer);
    loaderRemovalTimer = setTimeout(() => {
      try {
        const loader = document.getElementById("loading");
        if (loader && !loader.classList.contains("fade-out")) {
          loader.classList.add("fade-out");
        }
      } catch (e) {
        console.error('Failed to remove loader:', e);
      }
    }, 2400);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  ensureLoaderRemoved();
}

function init() {

  const menuBtn = document.querySelector('.menu-btn');
  if (menuBtn) menuBtn.addEventListener('click', toggleNavMenu);

  const navScrim = document.querySelector('.nav-scrim');
  if (navScrim) navScrim.addEventListener('click', closeNavMenu);

  document.querySelectorAll('.nav-links span').forEach(link => {
    link.addEventListener('click', closeNavMenu);
  });

  // Search button (first icon-btn)
  const searchBtn = document.querySelector('.nav-right .icon-btn:first-child');
  if (searchBtn) searchBtn.addEventListener('click', openSearch);

  // Hero Play button (CSP-safe; removes need for inline onclick)
  const heroPlayBtn = document.querySelector('[data-action="playFeatured"]');
  if (heroPlayBtn) heroPlayBtn.addEventListener('click', playFeatured);

  // Admin button (second icon-btn)
  const adminBtn = document.querySelector('.nav-right .icon-btn:nth-child(2)');
  if (adminBtn) adminBtn.addEventListener('click', () => motionNavigate('/login.html'));

  // Close button
  const closeBtn = document.querySelector('.close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeSearch);

  // Search input

  const searchInput = document.getElementById('searchBox');
  if (searchInput) searchInput.addEventListener('input', (e) => liveSearch(e.target.value));

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeSearch();
    closeNavMenu();
  });

  loadMovies();
}

