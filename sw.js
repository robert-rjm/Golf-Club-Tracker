// Service worker: keeps the app's files on the device so it opens with no connection.
// Registered from js/main.js. Only runs over HTTPS (or localhost), never from file://.

const CACHE = 'clubtrack-v1';

// Stored on first load. Add any new file the app loads here, or it won't open offline.
const APP_FILES = [
  './',
  'index.html',
  'styles.css',
  'manifest.json',
  'Logo.png',
  'Logo-transparent.png',
  'courses.js',
  'share.js',
  'js/state.js',
  'js/scoring.js',
  'js/round.js',
  'js/summary.js',
  'js/live-share.js',
  'js/players.js',
  'js/lobby.js',
  'js/course-editor.js',
  'js/settings.js',
  'js/main.js',
  'view.html',
  'view.js',
  'courses.html',
];

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// How long to wait for the network before falling back to the stored copy
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_FILES.map(f => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) e.respondWith(networkFirst(e));
  else if (FONT_HOSTS.includes(url.hostname)) e.respondWith(cacheFirst(req));
  // Anything else (Supabase, GitHub) goes straight to the network
});

// App files: fresh from the network when there's signal, the stored copy when there isn't
async function networkFirst(e) {
  const cache = await caches.open(CACHE);
  const network = fetch(e.request).then(res => {
    if (res.ok) cache.put(e.request, res.clone());
    return res;
  });
  e.waitUntil(network.catch(() => {}));
  const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch {}
  // ignoreSearch so view.html?app=1 finds the stored view.html
  const cached = await cache.match(e.request, { ignoreSearch: true });
  return cached || network;
}

// Fonts never change at a given URL, so the stored copy is always good
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}
