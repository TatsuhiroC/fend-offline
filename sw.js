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
const ASSET_VERSION = ASSETS.join('\n').match(/\/assets\/([a-f0-9]{16})\//)?.[1];
const clientVersions = new Map();
let activeWorker = self.registration.active;

function canCleanupCaches() {
	return self.registration.active === activeWorker && !self.registration.installing && !self.registration.waiting;
}

async function isAppCache(key) {
	if (key.startsWith(CACHE_NAMESPACE)) return true;
	if (!key.startsWith('fend-')) return false;
	const requests = await (await caches.open(key)).keys();
	return requests.length > 0 && requests.every(request => request.url.startsWith(self.registration.scope));
}

async function cleanupObsoleteCaches() {
	// A waiting/installing worker already owns a future cache. Never remove it,
	// and never let a superseded worker delete its successor's active cache.
	if (!canCleanupCaches()) return;
	const windows = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
		.filter(client => client.url.startsWith(self.registration.scope));
	const liveIds = new Set(windows.map(client => client.id));
	for (const id of clientVersions.keys()) if (!liveIds.has(id)) clientVersions.delete(id);
	// Existing windows may still need a lazy worker from an older asset graph.
	// Unknown/legacy windows are retained conservatively until closed or upgraded.
	if (!ASSET_VERSION || windows.some(client => clientVersions.get(client.id) !== ASSET_VERSION)) return;
	for (const key of await caches.keys()) {
		if (key === CACHE_NAME || !await isAppCache(key)) continue;
		if (!canCleanupCaches()) return;
		await caches.delete(key);
	}
}

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
	if (!NATIVE_APP && e.data?.type === 'FEND_CLIENT_VERSION' && e.source?.type === 'window' &&
		e.source.url.startsWith(self.registration.scope) && /^[a-f0-9]{16}$/.test(e.data.version)) {
		clientVersions.set(e.source.id, e.data.version);
		e.waitUntil(cleanupObsoleteCaches().catch(console.warn));
	}
});

self.addEventListener('activate', e => {
	activeWorker = self.registration.active;
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
		await self.clients.claim();
		try {
			for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
				if (client.url.startsWith(self.registration.scope)) client.postMessage({ type: 'FEND_REPORT_VERSION' });
			}
			await cleanupObsoleteCaches();
		} catch (error) { console.warn('[sw] cache cleanup failed', error); }
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
			const relativePath = new URL(e.request.url).pathname.slice(new URL(self.registration.scope).pathname.length);
			if (/^assets\/[a-f0-9]{16}\//.test(relativePath)) {
				// Serve only an exact immutable asset URL from a retained graph. Older
				// HTML is never substituted for a new navigation.
				for (const key of await caches.keys()) {
					if (key === CACHE_NAME || !await isAppCache(key)) continue;
					const oldAsset = await (await caches.open(key)).match(e.request);
					if (oldAsset) return oldAsset;
				}
			}
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
