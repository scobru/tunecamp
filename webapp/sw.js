const CACHE_NAME = 'tunecamp-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/js/player.js',
    '/manifest.json' // if exists, otherwise remove
];

// Install event: cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate event: clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Fetch event
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. Handle Cover Images (Cache First)
    // Matches /api/albums/:id/cover or /api/artists/:id/cover
    if (url.pathname.match(/\/api\/(albums|artists)\/.*\/cover$/)) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((response) => {
                    // Return cached response if found
                    if (response) return response;

                    // Otherwise fetch from network
                    return fetch(event.request).then((networkResponse) => {
                        // content-type check to ensure valid image
                        if (networkResponse.ok) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    });
                });
            })
        );
        return;
    }

    // 2. Handle Static Assets (Stale-While-Revalidate)
    // This ensures fast load but background update for CSS/JS
    if (ASSETS_TO_CACHE.some(path => url.pathname.endsWith(path)) || url.pathname.startsWith('/assets/')) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                const fetchPromise = fetch(event.request).then((networkResponse) => {
                    if (networkResponse.ok) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse.clone()));
                    }
                    return networkResponse;
                });
                return cachedResponse || fetchPromise;
            })
        );
        return;
    }

    // 3. API Requests (Network First)
    // We generally want fresh data for API, but we could cache proper GETs if needed.
    // For now, let's leave API to Network First (default browser behavior) to avoid stale data issues in Admin UI.
    // If user wants specific API caching, we can add it.

    // Default: Network only (or browser http cache)
    return;
});
