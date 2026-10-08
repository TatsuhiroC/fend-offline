#!/usr/bin/env node
// Replace app-owned runtime regions in build output; preserve upstream assets/.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = join(process.argv[2] ?? 'www', 'assets');
const runtime = readFileSync(fileURLToPath(new URL('./worker-runtime.js', import.meta.url)), 'utf8');
const workerRegion = /\/\/#region src\/lib\/fend\.ts\n[\s\S]*?(?=\/\/#endregion)/;
const history = 'var initialHistory = JSON.parse(localStorage.getItem("fend_history") || "[]");';
const saveHistory = 'localStorage.setItem("fend_history", JSON.stringify(updatedHistory.slice(-100)));';
const oldSubmit = 'submit();\n\t\t\t\tconst fendResult = await evaluate(currentInput);\n\t\t\t\tif (!fendResult.ok && fendResult.message === "cancelled") return;\n\t\t\t\tonInput("");';
const clear = 'if (currentInput.trim() === "clear") {';
const historyLimit = 'if (newEntry.startsWith(" ")) return;';
const historyReturn = 'return updatedHistory;';
const bundles = readdirSync(assets).filter(name => /^App-.*\.js$/.test(name));
if (!bundles.length) throw new Error('[runtime] no App bundle found');
for (const name of bundles) {
	const file = join(assets, name);
	const source = readFileSync(file, 'utf8');
	if (!workerRegion.test(source) || ![history, saveHistory, oldSubmit, clear, historyLimit, historyReturn, 'setOutput(null);'].every(marker => source.includes(marker))) {
		throw new Error(`[runtime] upstream runtime/history/UI changed in ${name}`);
	}
	const patched = source.replace(workerRegion, () => `//#region src/lib/fend.ts\n${runtime}\n`)
		.replace(history, `var initialHistory = (() => {
	try {
		const saved = JSON.parse(localStorage.getItem("fend_history") || "[]");
		return Array.isArray(saved) ? saved.filter(entry => typeof entry === "string" && entry.length <= 10000).slice(-100) : [];
	} catch { return []; }
})();`)
		.replace(saveHistory, 'try { localStorage.setItem("fend_history", JSON.stringify(updatedHistory.slice(-100))); } catch {}')
		.replace(historyLimit, 'if (newEntry.startsWith(" ") || newEntry.length > 10000) return;')
		.replace(historyReturn, 'return updatedHistory.slice(-100);')
		.replace(oldSubmit, 'submit();\n\t\t\t\tonInput("");\n\t\t\t\tconst fendResult = await evaluate(currentInput);\n\t\t\t\tif (!fendResult.ok && fendResult.message === "cancelled") return;')
		.replaceAll('setOutput(null);', 'cancelCalculations();\n\t\t\t\tsetOutput(null);');
	writeFileSync(file, patched);
	console.log(`[runtime] ${name}: recoverable workers, safe history and submitted-input handling`);
}
