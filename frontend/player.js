// Player bootstrap kept CSP-safe and aligned with the inline player implementation.
(function () {
  if (document.body.dataset.playerReady === 'true') return;
  document.body.dataset.playerReady = 'true';

  const params = new URLSearchParams(window.location.search);
  const movieFile = params.get('movie');
  const movieId = params.get('id');
  const shouldAutoplay = params.get('autoplay') === '1';
  const video = document.getElementById('video');
  const centerBtn = document.getElementById('centerBtn');
  const centerIcon = document.getElementById('centerIcon');
  const fill = document.getElementById('fill');
  const buffer = document.getElementById('buffer');
  const dot = document.getElementById('dot');
  const bar = document.getElementById('bar');
  const volume = document.getElementById('volume');
  const volumeControl = document.getElementById('volumeControl');
  const audioButton = document.getElementById('audioButton');
  const audioBtn = document.getElementById('audioBtn');
  const current = document.getElementById('current');
  const total = document.getElementById('total');
  const homeBtn = document.getElementById('homeBtn');
  const fsBtn = document.getElementById('fsBtn');
  const leftSkip = document.getElementById('leftSkip');
  const rightSkip = document.getElementById('rightSkip');

  if (!video) return;

  if (movieFile) {
    const nextSrc = '/video/' + encodeURIComponent(movieFile);
    if (!video.src.endsWith(nextSrc)) video.src = nextSrc;
  }

  if (movieId) {
    fetch(`/movies/${movieId}`)
      .then(r => r.json())
      .then(movie => {
        const title = movie?.title || '';
        const titleEl = document.getElementById('movieTitle') || document.querySelector('.title');
        if (titleEl) titleEl.textContent = title;
        if (title) document.title = title + ' - StreamBox';
      })
      .catch(() => {});

    const savedProgress = localStorage.getItem('watch_' + movieId);
    if (savedProgress) video.addEventListener('loadedmetadata', () => {
      video.currentTime = parseFloat(savedProgress);
    }, { once: true });
  }

  function setPlayIcon() {
    if (centerIcon) centerIcon.innerHTML = '<polygon id="playShape" points="8,5 19,12 8,19"/>';
    centerBtn?.setAttribute('aria-label', 'Play');
  }

  function setPauseIcon() {
    if (centerIcon) {
      centerIcon.innerHTML = '<g id="playShape"><rect x="6" y="5" width="4" height="14" fill="white"/><rect x="14" y="5" width="4" height="14" fill="white"/></g>';
    }
    centerBtn?.setAttribute('aria-label', 'Pause');
  }

  function togglePlay() {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
    showCenterOverlay();
  }

  let centerTimer;
  function showCenterOverlay(ms = 1800) {
    if (!centerBtn) return;
    centerBtn.classList.add('visible');
    clearTimeout(centerTimer);
    centerTimer = setTimeout(() => centerBtn.classList.remove('visible'), ms);
  }

  centerBtn?.addEventListener('click', e => {
    e.stopPropagation();
    togglePlay();
  });
  video.addEventListener('click', togglePlay);
  video.addEventListener('play', setPauseIcon);
  video.addEventListener('pause', setPlayIcon);

  let autoplayTried = false;
  function tryAutoplay() {
    if (!shouldAutoplay || autoplayTried || !video.src) return;
    autoplayTried = true;
    video.play()
      .then(() => {
        setPauseIcon();
        showUI();
      })
      .catch(() => {
        setPlayIcon();
        showUI();
        showCenterOverlay(2800);
      });
  }

  video.addEventListener('canplay', tryAutoplay, { once: true });
  video.addEventListener('loadeddata', tryAutoplay, { once: true });
  window.setTimeout(tryAutoplay, 420);

  let hideTimer;
  function showUI() {
    document.body.classList.add('show');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      document.body.classList.remove('show');
      volumeControl?.classList.remove('is-open');
    }, 2000);
  }

  document.addEventListener('mousemove', showUI);
  document.addEventListener('click', showUI);
  document.addEventListener('touchstart', showUI, { passive: true });
  document.addEventListener('focusin', () => {
    showUI();
    showCenterOverlay();
  });
  showUI();

  let volumeTimer;
  function openVolumeControl(ms = 1800) {
    if (!volumeControl) return;
    volumeControl.classList.add('is-open');
    clearTimeout(volumeTimer);
    volumeTimer = setTimeout(() => {
      if (!volumeControl.matches(':hover') && !volumeControl.contains(document.activeElement)) {
        volumeControl.classList.remove('is-open');
      }
    }, ms);
  }

  function updateMuteGlyph() {
    const muted = video.muted || video.volume === 0;
    audioBtn?.classList.toggle('is-muted', muted);
    audioButton?.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    audioButton?.setAttribute('title', muted ? 'Unmute' : 'Mute');
    if (volume) volume.value = muted ? 0 : video.volume;
  }

  if (volume) {
    volume.value = localStorage.getItem('volume') || '0.7';
    video.volume = parseFloat(volume.value);
    volume.addEventListener('input', () => {
      requestAnimationFrame(() => {
        const nextVolume = parseFloat(volume.value);
        video.volume = nextVolume;
        video.muted = nextVolume === 0;
        localStorage.setItem('volume', String(nextVolume));
        openVolumeControl(2200);
      });
    }, { passive: true });
  }

  let prevVolume = video.volume || 0.7;
  audioButton?.addEventListener('click', e => {
    e.stopPropagation();
    openVolumeControl(2200);
    if (!video.muted && video.volume > 0) {
      prevVolume = video.volume;
      video.muted = true;
    } else {
      video.muted = false;
      video.volume = prevVolume || 0.7;
    }
    updateMuteGlyph();
  });

  video.addEventListener('volumechange', updateMuteGlyph);
  updateMuteGlyph();

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  }

  document.addEventListener('fullscreenchange', () => {
    document.body.classList.toggle('fullscreen', !!document.fullscreenElement);
  });

  document.addEventListener('keydown', e => {
    if (e.target?.tagName === 'INPUT') return;
    if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      togglePlay();
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      seekBy(10);
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      seekBy(-10);
    }
    if (e.key === 'ArrowUp') {
      video.muted = false;
      video.volume = Math.min(1, video.volume + 0.1);
      openVolumeControl();
    }
    if (e.key === 'ArrowDown') {
      video.volume = Math.max(0, video.volume - 0.1);
      video.muted = video.volume === 0;
      openVolumeControl();
    }
    if (e.key === 'm' || e.key === 'M') video.muted = !video.muted;
    if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  });

  let rafId;
  function setProgress(percent) {
    const clamped = Math.max(0, Math.min(1, percent || 0));
    if (fill) fill.style.transform = `scaleX(${clamped})`;
    if (dot) dot.style.left = `${clamped * 100}%`;
  }

  function updateBuffered() {
    if (!buffer || !video.duration || !video.buffered.length) return;
    const end = video.buffered.end(video.buffered.length - 1);
    buffer.style.transform = `scaleX(${Math.max(0, Math.min(1, end / video.duration))})`;
  }

  function updateProgress() {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      if (!video.duration) return;
      setProgress(video.currentTime / video.duration);
      updateBuffered();
      if (current) current.textContent = format(video.currentTime);
      if (total) total.textContent = format(video.duration);
    });
  }

  video.addEventListener('timeupdate', () => {
    updateProgress();
    if (movieId && Math.floor(video.currentTime) % 30 === 0) {
      localStorage.setItem('watch_' + movieId, video.currentTime);
    }
  });

  video.addEventListener('progress', updateBuffered);
  video.addEventListener('loadedmetadata', updateProgress);

  function format(t) {
    const totalSeconds = Math.max(0, Math.floor(t || 0));
    const hh = Math.floor(totalSeconds / 3600);
    const mm = Math.floor((totalSeconds % 3600) / 60);
    const ss = totalSeconds % 60;
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
  }

  function seekToClientX(clientX) {
    if (!bar || !video.duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    video.currentTime = ratio * video.duration;
    setProgress(ratio);
    showUI();
  }

  let isScrubbing = false;
  if (bar) {
    bar.addEventListener('pointerdown', e => {
      isScrubbing = true;
      bar.classList.add('is-scrubbing');
      bar.setPointerCapture?.(e.pointerId);
      seekToClientX(e.clientX);
    });
    bar.addEventListener('pointermove', e => {
      if (isScrubbing) seekToClientX(e.clientX);
    });
    const endScrub = e => {
      if (!isScrubbing) return;
      isScrubbing = false;
      bar.classList.remove('is-scrubbing');
      bar.releasePointerCapture?.(e.pointerId);
      seekToClientX(e.clientX);
    };
    bar.addEventListener('pointerup', endScrub);
    bar.addEventListener('pointercancel', endScrub);
  }

  function seekBy(delta) {
    const duration = video.duration || Infinity;
    video.currentTime = Math.max(0, Math.min(duration, video.currentTime + delta));
    updateProgress();
    showUI();
  }

  homeBtn?.addEventListener('click', e => {
    e.stopPropagation();
    if (window.StreamBoxMotion && typeof window.StreamBoxMotion.navigate === 'function') {
      window.StreamBoxMotion.navigate('/index.html');
      return;
    }
    window.location.href = '/index.html';
  });
  fsBtn?.addEventListener('click', e => {
    e.stopPropagation();
    toggleFullscreen();
  });
  leftSkip?.addEventListener('click', e => {
    e.stopPropagation();
    seekBy(-10);
  });
  rightSkip?.addEventListener('click', e => {
    e.stopPropagation();
    seekBy(10);
  });
})();
