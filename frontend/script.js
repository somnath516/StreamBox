let allMovies = [];
let currentFocus = null;

/* =============================
   🎬 ENHANCED MOVIE LOADING
============================= */
async function initApp() {
  try {
    const res = await fetch("/movies");
    allMovies = await res.json();
    
    renderMovies(allMovies);
    renderContinueWatching();
    setupSearch();
    setupKeyboardNav();
    
    // Auto-focus first card after render
    setTimeout(() => focusFirstFocusable(), 200);
  } catch (err) {
    console.error("Failed to load movies:", err);
    showError("Failed to load movies. Please refresh.");
  }
}

/* =============================
   🎬 RENDER MOVIES (Optimized)
============================= */
function renderMovies(movies = allMovies) {
  const container = getEl("#movies");
  if (!container) return;
  
  container.innerHTML = movies.map(movie => createMovieCard(movie)).join('');
  
  // Re-attach event listeners
  attachCardListeners();
}

function createMovieCard(movie) {
  return `
    <div class="card focusable" data-movie-id="${movie.id}">
      <img src="/thumbnail/${movie.thumbnail}" 
           alt="${escapeHtml(movie.title)}"
           loading="lazy"
           onerror="this.src='https://via.placeholder.com/320x400/1a1a2e/ffffff?text=No+Image'">
      <div class="card-info">
        <p class="card-title">${truncateTitle(movie.title, 30)}</p>
      </div>
    </div>
  `;
}

/* =============================
   📺 CONTINUE WATCHING
============================= */
function renderContinueWatching() {
  const continued = allMovies.filter(movie => {
    const progress = localStorage.getItem(`watch_${movie.id}`);
    return progress && parseFloat(progress) > 30; // >30s watched
  }).slice(0, 6);
  
  const container = getEl("#continue");
  if (container) {
    container.innerHTML = continued.map(movie => {
      const progress = parseFloat(localStorage.getItem(`watch_${movie.id}`));
      const pct = Math.min(100, (progress / 180) * 100).toFixed(0) + '%';
      return createMovieCard(movie, 'Resume • ' + pct);
    }).join('');
    attachCardListeners();
  }
}

/* =============================
   🔍 ENHANCED SEARCH
============================= */
function setupSearch() {
  const searchInput = getEl("#search");
  if (!searchInput) return;
  
  let searchTimeout;
  searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const query = e.target.value.toLowerCase().trim();
      const filtered = allMovies.filter(movie =>
        movie.title.toLowerCase().includes(query) ||
        (movie.description || '').toLowerCase().includes(query)
      );
      renderMovies(filtered);
    }, 200);
  });
}

/* =============================
   🎮 TV REMOTE NAVIGATION
============================= */
function setupKeyboardNav() {
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    
    switch(e.code) {
      case "ArrowLeft": e.preventDefault(); moveFocus("left"); break;
      case "ArrowRight": e.preventDefault(); moveFocus("right"); break;
      case "ArrowUp": e.preventDefault(); moveFocus("up"); break;
      case "ArrowDown": e.preventDefault(); moveFocus("down"); break;
      case "Enter":
      case "Space": 
        e.preventDefault(); 
        currentFocus?.querySelector("a")?.click() || currentFocus?.click();
        break;
      case "Escape": 
        const overlay = getEl("#searchOverlay");
        if (overlay?.style.display === "flex") closeSearch();
        break;
    }
  });
}

function moveFocus(direction) {
  if (!currentFocus) return;
  
  const focusables = [...document.querySelectorAll(".focusable")];
  const currentIndex = focusables.indexOf(currentFocus);
  
  let nextIndex = currentIndex;
  switch(direction) {
    case "right": nextIndex = Math.min(currentIndex + 1, focusables.length - 1); break;
    case "left": nextIndex = Math.max(currentIndex - 1, 0); break;
    case "up": nextIndex = Math.max(currentIndex - 4, 0); break;
    case "down": nextIndex = Math.min(currentIndex + 4, focusables.length - 1); break;
  }
  
  if (nextIndex !== currentIndex) {
    focusCard(focusables[nextIndex]);
  }
}

function focusCard(card) {
  if (currentFocus) currentFocus.classList.remove("focused");
  currentFocus = card;
  card.classList.add("focused");
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function focusFirstFocusable() {
  const first = document.querySelector(".focusable");
  if (first) focusCard(first);
}

/* =============================
   🎬 CARD EVENT LISTENERS
============================= */
function attachCardListeners() {
  document.querySelectorAll(".focusable").forEach(card => {
    card.addEventListener("mouseenter", () => focusCard(card));
    card.addEventListener("click", (e) => {
      const link = card.querySelector("a");
      if (link) link.click();
    });
  });
}

/* =============================
   🔧 UTILITY FUNCTIONS
============================= */
function getEl(selector) { return document.querySelector(selector); }
function truncateTitle(title, maxLen) {
  return title.length > maxLen ? title.slice(0, maxLen) + "..." : title;
}
function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/* =============================
   🚀 SEARCH OVERLAY
============================= */
function openSearch() {
  const overlay = getEl("#searchOverlay");
  if (overlay) overlay.style.display = "flex";
}

function closeSearch() {
  const overlay = getEl("#searchOverlay");
  if (overlay) overlay.style.display = "none";
}

/* =============================
   🎥 PLAYER INTEGRATION
============================= */
window.saveWatchProgress = (movieId, time) => {
  localStorage.setItem(`watch_${movieId}`, time);
};

window.getWatchProgress = (movieId) => {
  return parseFloat(localStorage.getItem(`watch_${movieId}`)) || 0;
};

/* =============================
   INIT
============================= */
document.addEventListener("DOMContentLoaded", initApp);