// CACHE and ASSETS are rewritten from the complete build output by patch-sw.mjs.
const CACHE = 'fend-dev';
const ASSETS = ['./', './index.html'];
const TIMEOUT = 15000;
// Rewritten from capacitor.config.json at build time.
const NATIVE_ORIGIN = 'https://localhost';
const NATIVE_APP = self.location.origin === NATIVE_ORIGIN;
const CACHE_NAMESPACE = 'fend:' + self.registration.scope + ':';
const CACHE_NAME = CACHE_NAMESPACE + CACHE;
const ASSET_URLS = new Set(ASSETS.map(url => new URL(url, self.registration.scope).href));

self.addEventListener('install', e => {
	e.waitUntil((async () => {
		// An older APK may still register sw.js from its cached HTML. Replace that
		// worker immediately with this retirement path and reload packaged assets.
		if (NATIVE_APP) { await self.skipWaiting(); return; }
		const cache = await caches.open(CACHE_NAME);
		// Keep the previous working version if any offline resource fails to download.
		// Reload bypasses stale HTTP responses for files changed by build patches.
		await cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
		// Wait for old windows to close, or an explicit update request. Replacing a
		// worker mid-calculation can mix an old page with the new asset graph.
	})());
});

self.addEventListener('message', e => {
	if (e.data === 'SKIP_WAITING') e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', e => {
	if (NATIVE_APP) {
		e.waitUntil((async () => {
			try {
				const keys = await caches.keys();
				await Promise.all(keys.filter(key => key.startsWith('fend-') || key.startsWith(CACHE_NAMESPACE)).map(key => caches.delete(key)));
			} catch (error) { console.warn('[sw] native cache cleanup failed', error); }
			await self.clients.claim();
			await self.registration.unregister();
			const windows = await self.clients.matchAll({ type: 'window' });
			await Promise.all(windows.map(client => client.navigate(client.url).catch(console.warn)));
		})());
		return;
	}
	e.waitUntil((async () => {
		try {
			for (const key of await caches.keys()) {
				if (key === CACHE_NAME) continue;
				if (key.startsWith(CACHE_NAMESPACE)) await caches.delete(key);
				else if (key.startsWith('fend-')) {
					// Legacy names had no scope. Only retire caches owned by this app.
					const requests = await (await caches.open(key)).keys();
					if (requests.length && requests.every(request => request.url.startsWith(self.registration.scope))) await caches.delete(key);
				}
			}
		} catch (error) { console.warn('[sw] cache cleanup failed', error); }
		await self.clients.claim();
	})());
});

self.addEventListener('fetch', e => {
	if (NATIVE_APP) return;
	if (e.request.method !== 'GET' || !e.request.url.startsWith(self.registration.scope)) return;
	e.respondWith((async () => {
		let cache;
		try {
			cache = await caches.open(CACHE_NAME);
			const cached = await cache.match(e.request, { ignoreSearch: e.request.mode === 'navigate' });
			if (cached) return cached;
		} catch (error) { console.warn('[sw] cache read failed', error); }
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), TIMEOUT);
		try {
			const response = await fetch(e.request, { signal: controller.signal });
			if (cache && response.ok && ASSET_URLS.has(e.request.url)) {
				try { await cache.put(e.request, response.clone()); }
				catch (error) { console.warn('[sw] cache write failed', error); }
			}
			return response;
		} catch {
			return new Response('', { status: 504, statusText: 'Gateway Timeout' });
		} finally {
			clearTimeout(timer);
		}
	})());
});
