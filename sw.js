// CACHE and ASSETS are rewritten at build time by scripts/patch-sw.mjs: the cache name is
// derived from a hash of every shipped file, and the asset list is generated from www/.
// The values below are only used if this file is served unpatched (e.g. straight from the repo).
const CACHE = 'fend-dev';
const ASSETS = ['./', './index.html'];
const TIMEOUT = 3000;

self.addEventListener('install', e => {
	e.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			// Cache entries fail individually: one missing file must not abort the whole
			// install, which would leave clients stuck on the previous worker forever.
			await Promise.all(
				ASSETS.map(async url => {
					try {
						await cache.add(url);
					} catch (err) {
						console.warn('[sw] could not cache', url, err);
					}
				})
			);
			await self.skipWaiting();
		})()
	);
});

self.addEventListener('activate', e => {
	e.waitUntil(
		caches.keys().then(keys =>
			Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
		).then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', e => {
	e.respondWith(
		caches.match(e.request).then(cached => {
			if (cached) return cached;
			return Promise.race([
				fetch(e.request).then(resp => {
					if (resp && resp.ok) {
						const clone = resp.clone();
						caches.open(CACHE).then(c => c.put(e.request, clone));
					}
					return resp;
				}),
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error('timeout')), TIMEOUT)
				)
			]).catch(() => new Response('', { status: 504, statusText: 'Gateway Timeout' }));
		})
	);
});
