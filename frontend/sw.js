/**
 * StreamBox PWA Service Worker - Enhanced Caching Strategy
 * Implements cache-first for static assets, network-first for dynamic content
 */
const CACHE_NAME = 'streambox-v5';
const STATIC_CACHE = 'streambox-static-v5';
const DYNAMIC_CACHE = 'streambox-dynamic-v5';
const IMAGE_CACHE = 'streambox-images-v5';

// Static assets to precache (never change without version bump)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/player.html',
  '/upload.html',
  '/database.html',
  '/remote.html',
  '/responsive.css',
  '/motion.css',
  '/motion.js',
  '/netflix-ui.css',
  '/favicon.js',
  '/manifest.json'
];

// Dynamic pages that should always be fresh
const DYNAMIC_PAGES = [
  'upload.html',
  'database.html',
  'remote.html'
];

// Install event - precache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys
            .filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== IMAGE_CACHE)
            .map(key => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip cross-origin requests except for CDN images
  if (url.origin !== location.origin) return;
  
  // Always fetch dynamic pages from network (admin pages)
  if (DYNAMIC_PAGES.some(page => url.pathname.includes(page))) {
    return event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
  
  // API requests - network first, fallback to cache
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/movies') || url.pathname.startsWith('/health')) {
    return event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache successful API responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE).then(cache => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => {
          // Return cached version if available
          return caches.match(event.request);
        })
    );
  }
  
  // Image requests - cache first, then network
  if (url.pathname.match(/\.(jpg|jpeg|png|gif|svg|webp|ico)$/i) || 
      url.pathname.includes('/thumbnail') || 
      url.pathname.includes('/hero-banner') ||
      url.pathname.includes('/logos')) {
    return event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            // Return cached image but fetch fresh version in background
            fetch(event.request).then(response => {
              if (response.ok) {
                caches.open(IMAGE_CACHE).then(cache => cache.put(event.request, response));
              }
            }).catch(() => {});
            return cachedResponse;
          }
          
          // Not in cache, fetch from network
          return fetch(event.request).then(response => {
            if (response.ok) {
              caches.open(IMAGE_CACHE).then(cache => cache.put(event.request, response.clone()));
            }
            return response;
          });
        })
    );
  }
  
  // Static assets (CSS, JS) - cache first
  if (url.pathname.match(/\.(css|js|woff|woff2|ttf|eot)$/i)) {
    return event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            // Return cached version but update in background
            fetch(event.request).then(response => {
              if (response.ok) {
                caches.open(STATIC_CACHE).then(cache => cache.put(event.request, response));
              }
            }).catch(() => {});
            return cachedResponse;
          }
          
          // Not in cache, fetch from network
          return fetch(event.request).then(response => {
            if (response.ok) {
              caches.open(STATIC_CACHE).then(cache => cache.put(event.request, response.clone()));
            }
            return response;
          });
        })
    );
  }
  
  // HTML pages - network first for freshness, fallback to cache
  if (event.request.mode === 'navigate') {
    return event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the page
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => {
          // Offline fallback
          return caches.match(event.request)
            .then(cachedResponse => {
              if (cachedResponse) return cachedResponse;
              // Return offline page if available
              return caches.match('/index.html');
            });
        })
    );
  }
  
  // Default - network first
  return event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Handle background sync for offline actions
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // Process any queued requests
      Promise.resolve()
    );
  }
});

// Push notification handling (for future use)
self.addEventListener('push', event => {
  if (event.data) {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'StreamBox', {
        body: data.body || 'New content available',
        icon: '/logos/icon-192.png',
        badge: '/logos/icon-192.png'
      })
    );
  }
});
