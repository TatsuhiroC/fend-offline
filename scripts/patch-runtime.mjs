#!/usr/bin/env node
// Patch worker startup/recovery in build output, keeping upstream assets untouched.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const assets = join(process.argv[2] ?? 'www', 'assets');
const region = /function init\(\) \{[\s\S]*?(?=var workerCache = init\(\);)/;
const replacement = `function init() {
	let resolveInitialised, rejectInitialised;
	const result = {
		state: "new",
		worker: new WorkerWrapper({ name: "fend worker" }),
		initialisedPromise: new Promise((resolve, reject) => {
			resolveInitialised = resolve;
			rejectInitialised = reject;
		})
	};
	// Startup can fail before the first calculation.
	result.initialisedPromise.catch(() => {});
	const fail = (error) => {
		clearTimeout(startupTimer);
		result.state = "failed";
		result.worker.terminate();
		rejectInitialised(error);
		result.rejectError?.(error);
	};
	const startupTimer = setTimeout(() => fail(new Error("Calculator startup timed out. Reopen the app online and try again.")), 15000);
	result.worker.onmessage = (e) => {
		clearTimeout(startupTimer);
		result.state = "ready";
		if (e.data === "ready") resolveInitialised();
		else result.resolveDone?.(e.data);
	};
	result.worker.onerror = (e) => fail(new Error(e.message || "Calculator could not start. Reopen the app online and try again."));
	result.worker.onmessageerror = () => fail(new Error("Could not read the calculator result. Please try again."));
	return result;
}
`;
for (const name of readdirSync(assets).filter(name => /^App-.*\.js$/.test(name))) {
	const file = join(assets, name);
	const source = readFileSync(file, 'utf8');
	const retry = 'let w = workerCache;';
	const alert = '\t\talert("Failed to initialise WebAssembly");';
	const ready = 'if (w.state !== "ready") throw new Error("unexpected worker state: " + w.state);';
	if (!region.test(source) || !source.includes(retry) || !source.includes(alert) || !source.includes(ready)) {
		throw new Error(`[runtime] upstream worker wrapper changed in ${name}`);
	}
	const patched = source.replace(region, () => replacement)
		.replace(retry, 'if (workerCache.state === "failed") workerCache = init();\n\tlet w = workerCache;')
		.replace(ready, `// WASM initialises currency handlers only once per instance. Recreate the
	// worker when rate values change, keeping the supplied calculator variables.
	if (w.currencyData && (w.currencyData.size !== args.currencyData.size ||
		[...args.currencyData].some(([code, rate]) => w.currencyData.get(code) !== rate))) {
		w.worker.terminate();
		w = init();
		workerCache = w;
		await w.initialisedPromise;
		if (i < id) throw newAbortError("created new worker for updated currency rates");
	}
	${ready}
	w.currencyData = args.currencyData;`)
		.replace(alert, '')
		.replace('message: "Failed to initialise WebAssembly"', 'message: e instanceof Error ? e.message : "Failed to initialise WebAssembly"');
	writeFileSync(file, patched);
	console.log(`[runtime] ${name}: startup errors reject; next calculation retries`);
}
