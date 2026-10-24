#!/usr/bin/env node
// Explicit maintenance command; normal web/APK builds use checked-in assets.
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = join(root, 'vendor-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const engine = manifest.localEngine;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let buildEnv = {};
const run = (command, args, cwd, capture = false) => execFileSync(command, args, {
	cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit',
	env: { ...process.env, ...buildEnv, RUST_MIN_STACK: '16777212' }
});
const bindgen = process.env.WASM_BINDGEN || 'wasm-bindgen';
const check = process.argv.includes('--check');
const rustVersion = run('rustc', ['--version'], root, true).trim();
if (!rustVersion.startsWith(`rustc ${engine.toolchain.rust} `)) {
	throw new Error(`Use Rust ${engine.toolchain.rust}; found ${rustVersion}`);
}
if (run(bindgen, ['--version'], root, true).trim() !== `wasm-bindgen ${engine.toolchain.wasmBindgen}`) {
	throw new Error(`Use wasm-bindgen ${engine.toolchain.wasmBindgen}`);
}
for (const [name, expected] of Object.entries(engine.sources)) {
	if (sha(await readFile(join(root, name))) !== expected) throw new Error('Engine source hash mismatch: ' + name);
}
// macOS exposes /var as a symlink; rustc uses the canonical /private/var
// path in diagnostics and file!(), so remap that exact path as well.
const temp = await realpath(await mkdtemp(join(tmpdir(), 'fend-engine-')));
try {
	const archive = join(temp, 'source.tar.gz');
	run('curl', ['--fail', '--location', '--retry', '2', '--max-time', '60',
		`https://codeload.github.com/printfn/fend/tar.gz/${manifest.upstream.revision}`, '-o', archive], root);
	if (sha(await readFile(archive)) !== engine.sourceArchiveSha256) throw new Error('Upstream source archive hash mismatch');
	run('tar', ['-xzf', archive, '-C', temp], root);
	const source = join(temp, 'fend-' + manifest.upstream.revision);
	const cargoHome = resolve(process.env.CARGO_HOME || join(homedir(), '.cargo'));
	buildEnv = { CARGO_ENCODED_RUSTFLAGS: [
		`--remap-path-prefix=${homedir()}=/home/builder`,
		`--remap-path-prefix=${cargoHome}=/cargo`,
		`--remap-path-prefix=${source}=/fend`
	].join('\x1f') };
	run('patch', ['-p1', '--batch', '--fuzz=0', '-i', resolve(root, 'engine/fend-core.patch')], source);
	run('cargo', ['test', '--locked', '-p', 'fend-core'], source);
	run('cargo', ['build', '--locked', '--release', '--target', 'wasm32-unknown-unknown', '-p', 'fend-wasm'], source);
	run(bindgen, [join(source, 'target/wasm32-unknown-unknown/release/fend_wasm.wasm'),
		'--target', 'web', '--out-dir', temp, '--out-name', 'fend_wasm', '--no-typescript',
		'--remove-name-section', '--remove-producers-section'], root);
	let glue = await readFile(join(temp, 'fend_wasm.js'), 'utf8');
	const defaultPath = "module_or_path = new URL('fend_wasm_bg.wasm', import.meta.url);";
	if (glue.split(defaultPath).length !== 2) throw new Error('Review changed wasm-bindgen initialization');
	glue = glue.replace(defaultPath, 'module_or_path = fend_wasm_bg_default;');
	const entry = await readFile(join(root, 'engine/worker-entry.js'), 'utf8');
	const files = {
		[engine.worker]: Buffer.from(`// fend ${manifest.upstream.version}, local math patch ${engine.patchVersion}. See engine/README.md.\n` + glue + '\n' + entry),
		[engine.wasm]: await readFile(join(temp, 'fend_wasm_bg.wasm'))
	};
	for (const bytes of Object.values(files)) {
		if ([homedir(), temp].some(path => bytes.includes(Buffer.from(path)))) {
			throw new Error('Local build path found in engine artifact');
		}
	}
	// Compile and test everything before replacing either production artifact.
	if (check) {
		for (const [name, bytes] of Object.entries(files)) {
			if (sha(bytes) !== manifest.files[name] || !bytes.equals(await readFile(join(root, name)))) {
				throw new Error('Rebuilt engine differs from recorded artifact: ' + name);
			}
		}
		console.log('[engine] rebuilt artifacts match recorded bytes');
	} else {
		for (const [name, bytes] of Object.entries(files)) {
			await writeFile(join(root, name), bytes);
			manifest.files[name] = sha(bytes);
		}
		await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
		console.log('[engine] rebuilt and tested ' + engine.patchVersion + '; run npm run test:web');
	}
} finally {
	await rm(temp, { recursive: true, force: true });
}
