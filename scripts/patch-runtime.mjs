#!/usr/bin/env node
// Replace app-owned runtime regions in build output; preserve upstream assets/.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = join(process.argv[2] ?? 'www', 'assets');
const runtime = readFileSync(fileURLToPath(new URL('./worker-runtime.js', import.meta.url)), 'utf8');
const hintRuntime = readFileSync(fileURLToPath(new URL('./hint-runtime.js', import.meta.url)), 'utf8');
const historyRecallRuntime = readFileSync(fileURLToPath(new URL('./history-recall-runtime.js', import.meta.url)), 'utf8');
const inputRef = 'const inputText = (0, import_react.useRef)(null);';
const submittedFormula = 'const request = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: `> ${currentInput}` });';
const hintState = 'const [hint, setHint] = (0, import_react.useState)("");';
const hintInput = 'setCurrentInputInternal(value);';
const hintResult = 'setHint(await evaluateHint(value));';
const inputHook = 'function useCurrentInput(evaluateHint) {';
const inputCall = 'const { currentInput, submit, onInput, upArrow, downArrow, hint } = useCurrentInput(evaluateHint);';
const pendingState = 'const [isPending, startTransition] = (0, import_react.useTransition)();';
const pendingBlock = pendingState + '\n\tlet t3;';
const keyHandler = 't3 = (event) => {';
const resultLog = 'console.log(result);';
const submittedTimeout = 'fend(input, 1e9, variables)';
const workerRegion = /\/\/#region src\/lib\/fend\.ts\n[\s\S]*?(?=\/\/#endregion)/;
const history = 'var initialHistory = JSON.parse(localStorage.getItem("fend_history") || "[]");';
const saveHistory = 'localStorage.setItem("fend_history", JSON.stringify(updatedHistory.slice(-100)));';
const oldSubmit = 'submit();\n\t\t\t\tconst fendResult = await evaluate(currentInput);\n\t\t\t\tif (!fendResult.ok && fendResult.message === "cancelled") return;\n\t\t\t\tonInput("");';
const clear = 'if (currentInput.trim() === "clear") {';
const historyLimit = 'if (newEntry.startsWith(" ")) return;';
const historyReturn = 'return updatedHistory;';
const bundles = readdirSync(assets).filter(name => /^App-.*\.js$/.test(name));
if (!bundles.length) throw new Error('[runtime] no App bundle found');
function pruneUnusedRuntime(source) {
	const waitRegion = /\/\/#region src\/lib\/WaitGroup\.ts\n[\s\S]*?\/\/#endregion\n/;
	if (!waitRegion.test(source)) throw new Error('[runtime] upstream WaitGroup region changed');
	const withoutWait = source.replace(waitRegion, '');
	if (/\b(?:WaitGroup|abortPromise)\b/.test(withoutWait)) {
		throw new Error('[runtime] waiting helpers still have callers; patch rates first');
	}
	const start = withoutWait.indexOf('var import_dist = (');
	const end = withoutWait.indexOf('\nfunction PendingOutput(', start);
	if (start < 0 || end < 0) throw new Error('[runtime] upstream spinner module changed');
	const module = withoutWait.slice(start, end);
	const rest = withoutWait.slice(0, start) + withoutWait.slice(end);
	if (!module.trimEnd().endsWith('})))();') ||
		[...rest.matchAll(/\bimport_dist\b/g)].length !== 1 ||
		!/\bimport_dist\.ThreeDotsScale\b/.test(rest)) {
		throw new Error('[runtime] spinner consumers changed; review retained exports');
	}
	// Retain the exact upstream component and its React binding, including SVG
	// animation timing and accessibility behavior. Discard the unused module exports.
	const component = module.match(/\tvar (import_react\d+) = __toESM\(require_react\(\)\);\n(\tfunction ThreeDotsScale\([\s\S]*?\n\t})\n/);
	if (!component) throw new Error('[runtime] upstream ThreeDotsScale component changed');
	const spinner = `var import_dist = (() => {\n\tvar ${component[1]} = __toESM(require_react());\n${component[2]}\n\treturn { ThreeDotsScale };\n})();`;
	return withoutWait.slice(0, start) + spinner + withoutWait.slice(end);
}
for (const name of bundles) {
	const file = join(assets, name);
	const source = readFileSync(file, 'utf8');
	if (!workerRegion.test(source) || ![history, saveHistory, oldSubmit, clear, historyLimit, historyReturn, hintState, hintInput, hintResult, inputHook, inputCall, pendingBlock, keyHandler, resultLog, inputRef, submittedFormula, submittedTimeout, 'setOutput(null);'].every(marker => source.includes(marker))) {
		throw new Error(`[runtime] upstream runtime/history/UI changed in ${name}`);
	}
	const patched = source.replace(workerRegion, () => `//#region src/lib/fend.ts\n${runtime}\n`)
		.replace(history, `var initialHistory = (() => {
	try {
		const saved = JSON.parse(localStorage.getItem("fend_history") || "[]");
		return Array.isArray(saved) ? saved.filter(entry => typeof entry === "string" && entry.length <= 10000).slice(-100) : [];
	} catch { return []; }
})();`)
		.replace(hintState, () => hintState + '\n' + hintRuntime)
		.replace(inputRef, () => inputRef + '\n' + historyRecallRuntime)
		.replace(submittedFormula, 'const request = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { role: "button", tabIndex: 0, "aria-label": `Edit formula: ${currentInput}`, "data-fend-input": currentInput, children: `> ${currentInput}` });')
		.replace(inputHook, 'function useCurrentInput(evaluateHint, inputPending) {')
		.replace(inputCall, pendingState + '\n\t' + inputCall.replace('useCurrentInput(evaluateHint)', 'useCurrentInput(evaluateHint, isPending)'))
		.replace(pendingBlock, 'let t3;')
		.replace(keyHandler, keyHandler + '\n\t\t\t\tif (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;')
		.replace(resultLog, '')
		.replace(submittedTimeout, 'fend(input, calculationTimeout, variables)')
		.replace(hintInput, 'hintInputRef.current = value;\n\t\t\tconst hintVersion = ++hintVersionRef.current;\n\t\t\t' + hintInput)
		.replace(hintResult, 'const evaluatedHint = await evaluateHint(value);\n\t\t\t\tif (hintVersion === hintVersionRef.current) setHint(evaluatedHint);')
		.replace(saveHistory, 'try { localStorage.setItem("fend_history", JSON.stringify(updatedHistory.slice(-100))); } catch {}')
		.replace(historyLimit, 'if (newEntry.startsWith(" ") || newEntry.length > 10000) return;')
		.replace(historyReturn, 'return updatedHistory.slice(-100);')
		.replace(oldSubmit, 'submit();\n\t\t\t\tonInput("");\n\t\t\t\tconst fendResult = await evaluate(currentInput);\n\t\t\t\tif (!fendResult.ok && fendResult.message === "cancelled") return;')
		.replaceAll('setOutput(null);', 'cancelCalculations();\n\t\t\t\tsetOutput(null);');
	writeFileSync(file, pruneUnusedRuntime(patched));
	console.log(`[runtime] ${name}: recoverable workers, safe history and submitted-input handling`);
}
