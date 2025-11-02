const CACHE_NAME = 'asset-tracker-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Handle navigation requests
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html')
        .then((response) => response || fetch(request))
    );
    return;
  }
  
  // Handle API requests - network first, then cache
  if (request.url.includes('/api/') && request.method === 'GET') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone the response before caching
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(request, responseClone);
            });
          return response;
        })
        .catch(async () => {
          // If network fails, try cache
          const cached = await caches.match(request);
          if (cached) return cached;
          // Provide a generic error response to satisfy respondWith
          return new Response(null, { status: 503, statusText: 'Service Unavailable' });
        })
    );
    return;
  }
  
  // Handle other requests - cache first, then network
  event.respondWith(
    caches.match(request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(request);
      })
  );
});

// Background sync for upload queue
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-uploads') {
    event.waitUntil(processUploadQueue());
  }
});

// Process upload queue when back online
async function processUploadQueue() {
  try {
    // This will be handled by the main app
    // Send message to all clients to process queue
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({ type: 'PROCESS_UPLOAD_QUEUE' });
    });
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}
