// Injected into the app bundle; globals WorkerWrapper and rate helpers are above it.
function newAbortError(message) {
	const error = new Error(message);
	error.name = 'AbortError';
	return error;
}
function init() {
	let resolveInitialised, rejectInitialised, timer;
	const result = { state: 'new', initialisedPromise: new Promise((resolve, reject) => {
		resolveInitialised = resolve; rejectInitialised = reject;
	}) };
	result.initialisedPromise.catch(() => {});
	const fail = error => {
		if (result.state === 'failed') return;
		clearTimeout(timer);
		result.state = 'failed';
		result.worker?.terminate();
		rejectInitialised(error);
		result.rejectError?.(error);
		result.resolveDone = result.rejectError = undefined;
	};
	result.cancel = () => fail(newAbortError('cancelled'));
	try {
		result.worker = new WorkerWrapper({ name: 'fend worker' });
		timer = setTimeout(() => fail(new Error('Calculator startup timed out. Reopen the app online and try again.')), 15000);
		result.worker.onmessage = ({ data }) => {
			if (result.state === 'failed') return;
			clearTimeout(timer);
			result.state = 'ready';
			if (data === 'ready') resolveInitialised();
			else { result.resolveDone?.(data); result.resolveDone = result.rejectError = undefined; }
		};
		result.worker.onerror = event => fail(new Error(event.message || 'Calculator could not start. Please try again.'));
		result.worker.onmessageerror = () => fail(new Error('Could not read the calculator result. Please try again.'));
	} catch (error) { fail(error); }
	return result;
}
var workerCache;
var id = 0;
var evaluationGeneration = 0;
var submittedQueries = 0;
function cancelCalculations() {
	++evaluationGeneration;
	workerCache?.cancel();
}
async function query(args) {
	const currentId = ++id;
	let worker = workerCache;
	if (!worker || worker.state === 'failed' || worker.state === 'busy') {
		worker?.cancel();
		worker = init();
		workerCache = worker;
	}
	if (worker.state === 'new' || worker.state === 'failed') await worker.initialisedPromise;
	if (currentId < id) throw newAbortError('superseded during startup');
	// The WASM currency handler is initialised once per instance.
	if (worker.currencyData && (worker.currencyData.size !== args.currencyData.size ||
		[...args.currencyData].some(([code, rate]) => worker.currencyData.get(code) !== rate))) {
		worker.cancel();
		worker = init();
		workerCache = worker;
		await worker.initialisedPromise;
		if (currentId < id) throw newAbortError('superseded while updating rates');
	}
	if (worker.state !== 'ready') throw new Error('unexpected worker state: ' + worker.state);
	worker.currencyData = args.currencyData;
	return new Promise((resolve, reject) => {
		worker.resolveDone = resolve;
		worker.rejectError = reject;
		worker.state = 'busy';
		try { worker.worker.postMessage(args); }
		catch (error) { worker.rejectError = undefined; worker.cancel(); reject(error); }
	});
}
async function fend(input, timeout, variables, freshRates = true) {
	// Hints cannot cancel a submitted calculation, and blank hints need no worker.
	if (!freshRates && (submittedQueries > 0 || !input.trim())) return { ok: false, message: 'cancelled' };
	const generation = freshRates ? ++evaluationGeneration : evaluationGeneration;
	if (freshRates) ++submittedQueries;
	try {
		const args = { input, timeout, variables, currencyData: await getExchangeRates() };
		let result = await query(args);
		if (freshRates && usesCurrency(input, result)) {
			args.currencyData = await refreshExchangeRates();
			if (generation !== evaluationGeneration) return { ok: false, message: 'cancelled' };
			result = await query(args);
		}
		if (freshRates && generation !== evaluationGeneration) return { ok: false, message: 'cancelled' };
		return result;
	} catch (error) {
		if (error?.name === 'AbortError') return { ok: false, message: 'cancelled' };
		console.error(error);
		return { ok: false, message: error instanceof Error ? error.message : 'Calculator could not start' };
	} finally { if (freshRates) --submittedQueries; }
}
