// Mountain Made PWA Service Worker
const CACHE_NAME = 'mountain-made-v1';

self.addEventListener('install', (event) => {
  console.log('Service Worker installing.');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating.');
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Never intercept API calls or non-GET requests (POST uploads, PUT, DELETE, etc.)
  // so network/backend errors are returned as-is.
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  // Do not intercept navigation requests. Let the browser load page routes directly.
  if (request.mode === 'navigate') {
    return;
  }

  // Static assets: network-first, but handle network failures gracefully.
  event.respondWith(
    fetch(request).catch((err) => {
      console.error('Service Worker fetch failed for', request.url, err);
      return new Response('Network Error', {
        status: 502,
        headers: { 'Content-Type': 'text/plain' }
      });
    })
  );
});
