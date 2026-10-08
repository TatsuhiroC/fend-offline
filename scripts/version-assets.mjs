#!/usr/bin/env node
// Build patches change bytes without changing upstream filenames. Version the
// relative-import graph as a whole so installed PWAs cannot reuse old bytes.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = process.argv[2] ?? 'www';
const assets = join(dist, 'assets');
const hash = createHash('sha256');
for (const file of readdirSync(assets).sort()) {
	hash.update(file);
	hash.update(readFileSync(join(assets, file)));
}
const version = hash.digest('hex').slice(0, 16);
const temporary = join(dist, 'versioned-assets');
renameSync(assets, temporary);
mkdirSync(assets);
renameSync(temporary, join(assets, version));
const index = join(dist, 'index.html');
writeFileSync(index, readFileSync(index, 'utf8').replaceAll('"assets/', `"assets/${version}/`));
console.log(`[assets] versioned URLs: assets/${version}/`);
