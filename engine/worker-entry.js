// App-owned entry appended to wasm-bindgen's generated ES module.
// Keep the upstream filenames: version-assets.mjs versions the entire graph.
var fend_wasm_bg_default = "/fend/assets/fend_wasm_bg-BO_oxczj.wasm";
await __wbg_init({ module_or_path: fend_wasm_bg_default });
self.addEventListener('message', ({ data }) => {
	initialiseWithHandlers(data.currencyData);
	postMessage(JSON.parse(evaluateFendWithVariablesJson(data.input, data.timeout, data.variables)));
});
postMessage('ready');
