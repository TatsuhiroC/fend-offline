#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function checkVendor(root = '.') {
	const manifest = JSON.parse(await readFile(resolve(root, 'vendor-manifest.json'), 'utf8'));
	const actual = (await readdir(resolve(root, 'assets'))).map(name => 'assets/' + name).sort();
	if (JSON.stringify(actual) !== JSON.stringify(Object.keys(manifest.files).sort())) throw new Error('Vendor asset inventory changed');
	for (const name of actual) {
		const bytes = await readFile(resolve(root, name));
		if (createHash('sha256').update(bytes).digest('hex') !== manifest.files[name]) throw new Error('Vendor hash mismatch: ' + name);
	}
	for (const [name, expected] of Object.entries(manifest.localEngine?.sources ?? {})) {
		const bytes = await readFile(resolve(root, name));
		if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Engine source hash mismatch: ' + name);
	}
	const app = await readFile(resolve(root, actual.find(name => /\/App-.*\.js$/.test(name))), 'utf8');
	for (const name of ['react', 'react-dom']) {
		const component = manifest.components.find(component => component.name === name);
		if (!component || !app.includes(`exports.version = "${component.version}";`)) throw new Error('Vendor version mismatch: ' + name);
	}
	return manifest;
}

export async function auditVendor(manifest, fetcher = fetch) {
	// Query the packages actually shipped, rather than applying server-only
	// React advisories to this static client application.
	const response = await fetcher('https://api.osv.dev/v1/querybatch', {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ queries: manifest.components.map(({name, version, ecosystem}) => ({package:{name, ecosystem}, version})) }),
		signal: AbortSignal.timeout(15000)
	});
	if (!response.ok) throw new Error('Vendor advisory service failed: HTTP ' + response.status);
	const data = await response.json();
	if (!Array.isArray(data.results) || data.results.length !== manifest.components.length) throw new Error('Invalid vendor advisory response');
	const affected = [];
	data.results.forEach((result, index) => {
		if (!result || typeof result !== 'object' || (result.vulns !== undefined && !Array.isArray(result.vulns))) throw new Error('Invalid vendor advisory result');
		for (const vulnerability of result.vulns ?? []) affected.push(`${manifest.components[index].name}@${manifest.components[index].version}: ${vulnerability.id}`);
	});
	if (affected.length) throw new Error('Vendored dependencies have published advisories:\n' + affected.join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const manifest = await checkVendor();
	console.log('[vendor] asset hashes and recorded React versions verified');
	if (process.argv.includes('--audit')) {
		await auditVendor(manifest);
		console.log('[vendor] no published advisories for ' + manifest.components.map(({name,version}) => `${name}@${version}`).join(', '));
		console.log('[vendor] scope: ' + manifest.coverage);
	}
}
