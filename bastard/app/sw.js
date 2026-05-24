// Hand-rolled service worker for the Ungrateful Bastard PWA.
//
// Strategy:
// - On install, precache every file in the build (the list is injected
//   post-build by tool/inject_sw_manifest.py). This is what makes the
//   app launch fully offline.
// - On activate, delete any cache whose name doesn't match the current
//   CACHE_NAME and take control of open clients. Combined with
//   skipWaiting on install, this gives the "silent update on next
//   launch" behaviour: the new SW takes over the next time the page
//   reloads, no prompt.
// - On fetch:
//   * Navigation (HTML) requests: network-first so users get a fresh
//     index.html when online; fall back to the cached index when offline.
//   * Other same-origin GETs: cache-first; on miss, fetch and cache.
//     Note: no stale-while-revalidate. CACHE_VERSION is a content hash
//     of the whole build, so a cached asset is byte-identical to the
//     network for the lifetime of this SW. SWR would only re-download
//     identical bytes.
//   * Cross-origin or non-GET: passed straight through (no handler).
//
// CACHE_VERSION is a sha256 prefix of the build contents produced by the
// inject script, so any byte change anywhere in build/web/ invalidates
// the cache deterministically.

'use strict';

const CACHE_PREFIX = 'ub-cache-';
const CACHE_VERSION = 'aa883e167617';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
// Replaced post-build with a JSON array of relative paths. The string
// quotes around the placeholder keep this file as valid JS when the
// template hasn't been processed (e.g. during `flutter run` in dev),
// in which case TEMPLATE === true and we no-op.
const PRECACHE = ["3x/Android@3x.png", "assets/AssetManifest.bin", "assets/AssetManifest.bin.json", "assets/FontManifest.json", "assets/NOTICES", "assets/assets/fonts/NotoSansMono-Variable.ttf", "assets/assets/fonts/ZalandoSansExpanded-ExtraBold.ttf", "assets/assets/fonts/ZalandoSansSemiExpanded-VariableFont_wght.ttf", "assets/assets/icons/moods/mood_1.png", "assets/assets/icons/moods/mood_2.png", "assets/assets/icons/moods/mood_3.png", "assets/assets/icons/moods/mood_4.png", "assets/assets/icons/moods/mood_5.png", "assets/assets/images/asset_1.png", "assets/assets/images/asset_2.png", "assets/assets/images/asset_3.png", "assets/assets/images/asset_4.png", "assets/assets/images/asset_5.png", "assets/assets/images/logo.png", "assets/fonts/MaterialIcons-Regular.otf", "assets/packages/cupertino_icons/assets/CupertinoIcons.ttf", "assets/shaders/ink_sparkle.frag", "assets/shaders/stretch_effect.frag", "canvaskit/canvaskit.js", "canvaskit/canvaskit.js.symbols", "canvaskit/canvaskit.wasm", "canvaskit/chromium/canvaskit.js", "canvaskit/chromium/canvaskit.js.symbols", "canvaskit/chromium/canvaskit.wasm", "canvaskit/skwasm.js", "canvaskit/skwasm.js.symbols", "canvaskit/skwasm.wasm", "canvaskit/skwasm_heavy.js", "canvaskit/skwasm_heavy.js.symbols", "canvaskit/skwasm_heavy.wasm", "canvaskit/wimp.js", "canvaskit/wimp.js.symbols", "canvaskit/wimp.wasm", "favicon.png", "flutter.js", "flutter_bootstrap.js", "icons/Icon-1024.png", "icons/Icon-192.png", "icons/Icon-512.png", "icons/Icon-maskable-1024.png", "icons/Icon-maskable-192.png", "icons/Icon-maskable-512.png", "icons/SVG/Ungrateful simplyfied.svg", "icons/SVG/V happy.svg", "icons/SVG/V sad.svg", "icons/SVG/happy.svg", "icons/SVG/normal.svg", "icons/SVG/sad.svg", "icons/icon.svg", "index.html", "install_overlay.js", "main.dart.js", "manifest.json", "version.json"];
const TEMPLATE = typeof PRECACHE === 'string';

self.addEventListener('install', (event) => {
  if (TEMPLATE) {
    self.skipWaiting();
    return;
  }
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Add files one-by-one with `cache: 'reload'` so we bypass any HTTP
    // cache, and so a single 404 doesn't fail the whole install.
    await Promise.all(PRECACHE.map(async (path) => {
      try {
        await cache.add(new Request(path, { cache: 'reload' }));
      } catch (e) {
        console.warn('[sw] precache miss:', path, e);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const stale = names.filter((n) => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME);
    await Promise.all([
      ...stale.map((n) => caches.delete(n)),
      self.clients.claim(),
    ]);
  })());
});

self.addEventListener('fetch', (event) => {
  if (TEMPLATE) return;
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch (_) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('index.html')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic' && !res.redirected) {
        // Keep the SW alive long enough to write the response.
        event.waitUntil(cache.put(req, res.clone()));
      }
      return res;
    } catch (_) {
      return Response.error();
    }
  })());
});
