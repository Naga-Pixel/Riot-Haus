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
const CACHE_VERSION = '13d5a25b6d41';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
// Replaced post-build with a JSON array of relative paths. The string
// quotes around the placeholder keep this file as valid JS when the
// template hasn't been processed (e.g. during `flutter run` in dev),
// in which case TEMPLATE === true and we no-op.
const PRECACHE = ["assets/index-D5NSfqvF.js","assets/index-DFpzai1N.css","favicon.png","fonts/NotoSansMono-Variable.ttf","fonts/ZalandoSansExpanded-ExtraBold.ttf","fonts/ZalandoSansSemiExpanded-VariableFont_wght.ttf","icons/Icon-1024.png","icons/Icon-192.png","icons/Icon-512.png","icons/Icon-maskable-1024.png","icons/Icon-maskable-192.png","icons/Icon-maskable-512.png","icons/icon.svg","icons/moods/mood_1.png","icons/moods/mood_2.png","icons/moods/mood_3.png","icons/moods/mood_4.png","icons/moods/mood_5.png","images/asset_1.png","images/asset_2.png","images/asset_3.png","images/asset_4.png","images/asset_5.png","images/logo.png","images/tip-arrow.svg","index.html","install_overlay.js","manifest.json"];
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

// --- Web Push -------------------------------------------------------------
// These handlers are independent of the precache, so they run in both the
// template (dev) and injected (prod) builds — they never touch CACHE_NAME.
//
// The Supabase Edge Function (push-daily) signs a VAPID payload and POSTs
// it to each stored endpoint. The payload is a JSON object { title, body },
// but we fall back to an in-character default if it's missing or unparsable
// (e.g. an empty "tickle" push), so a notification always shows.

const PUSH_FALLBACK = {
  title: 'Ungrateful Bastard',
  body: "Silenzio? Davvero? Pure il Wi-Fi funziona. Di' grazie.",
};

self.addEventListener('push', (event) => {
  let data = PUSH_FALLBACK;
  if (event.data) {
    try {
      const parsed = event.data.json();
      data = {
        title: parsed.title || PUSH_FALLBACK.title,
        body: parsed.body || PUSH_FALLBACK.body,
      };
    } catch (_) {
      // Non-JSON payload: treat the raw text as the body.
      const text = event.data.text();
      if (text) data = { title: PUSH_FALLBACK.title, body: text };
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'icons/Icon-192.png',
      badge: 'icons/Icon-192.png',
      // Coalesce repeated nudges into one notification slot.
      tag: 'ub-daily',
      renotify: true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Focus an already-open app window if there is one, otherwise open the
  // PWA at its scope root. registration.scope is the absolute URL the SW
  // controls (".../bastard/app/" in prod, ".../" in dev), so this works in
  // both without hardcoding the deploy path.
  const target = self.registration.scope;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });
    for (const client of all) {
      if (client.url.startsWith(target) && 'focus' in client) {
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
