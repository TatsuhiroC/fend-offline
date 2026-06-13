//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
//#endregion
//#region ../wasm/fend-wasm/fend_wasm_bg.wasm?url
var fend_wasm_bg_default = "" + new URL("./fend_wasm_bg-DxrPVr6w.wasm", import.meta.url).href;
//#endregion
//#region ../../../../__vite-plugin-wasm-helper
var __vite_plugin_wasm_helper_default = async (opts = {}, url) => {
	let result;
	if (url.startsWith("data:")) {
		const urlContent = url.replace(/^data:.*?base64,/, "");
		let bytes;
		if (typeof Buffer === "function" && typeof Buffer.from === "function") bytes = Buffer.from(urlContent, "base64");
		else if (typeof atob === "function") {
			const binaryString = atob(urlContent);
			bytes = new Uint8Array(binaryString.length);
			for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
		} else throw new Error("Cannot decode base64-encoded data URL");
		result = await WebAssembly.instantiate(bytes, opts);
	} else {
		const response = await fetch(url);
		const contentType = response.headers.get("Content-Type") || "";
		if ("instantiateStreaming" in WebAssembly && contentType.startsWith("application/wasm")) result = await WebAssembly.instantiateStreaming(response, opts);
		else {
			const buffer = await response.arrayBuffer();
			result = await WebAssembly.instantiate(buffer, opts);
		}
	}
	return result.instance.exports;
};
//#endregion
//#region ../wasm/fend-wasm/fend_wasm_bg.js
/**
* @param {string} input
* @param {number} timeout
* @param {string} variables
* @returns {string}
*/
function evaluateFendWithVariablesJson$1(input, timeout, variables) {
	let deferred3_0;
	let deferred3_1;
	try {
		const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
		const ptr0 = passStringToWasm0(input, wasm.__wbindgen_export, wasm.__wbindgen_export2);
		const len0 = WASM_VECTOR_LEN;
		const ptr1 = passStringToWasm0(variables, wasm.__wbindgen_export, wasm.__wbindgen_export2);
		const len1 = WASM_VECTOR_LEN;
		wasm.evaluateFendWithVariablesJson(retptr, ptr0, len0, timeout, ptr1, len1);
		var r0 = getDataViewMemory0().getInt32(retptr + 0, true);
		var r1 = getDataViewMemory0().getInt32(retptr + 4, true);
		deferred3_0 = r0;
		deferred3_1 = r1;
		return getStringFromWasm0(r0, r1);
	} finally {
		wasm.__wbindgen_add_to_stack_pointer(16);
		wasm.__wbindgen_export3(deferred3_0, deferred3_1, 1);
	}
}
/**
* @param {Map<any, any>} currency_data
*/
function initialiseWithHandlers$1(currency_data) {
	wasm.initialiseWithHandlers(addHeapObject(currency_data));
}
function __wbg___wbindgen_is_undefined_67b456be8673d3d7(arg0) {
	return getObject(arg0) === void 0;
}
function __wbg___wbindgen_number_get_9bb1761122181af2(arg0, arg1) {
	const obj = getObject(arg1);
	const ret = typeof obj === "number" ? obj : void 0;
	getDataViewMemory0().setFloat64(arg0 + 8, isLikeNone(ret) ? 0 : ret, true);
	getDataViewMemory0().setInt32(arg0 + 0, !isLikeNone(ret), true);
}
function __wbg___wbindgen_string_get_72bdf95d3ae505b1(arg0, arg1) {
	const obj = getObject(arg1);
	const ret = typeof obj === "string" ? obj : void 0;
	var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
	var len1 = WASM_VECTOR_LEN;
	getDataViewMemory0().setInt32(arg0 + 4, len1, true);
	getDataViewMemory0().setInt32(arg0 + 0, ptr1, true);
}
function __wbg___wbindgen_throw_1506f2235d1bdba0(arg0, arg1) {
	throw new Error(getStringFromWasm0(arg0, arg1));
}
function __wbg_forEach_2d5872dd26aea3b2(arg0, arg1, arg2) {
	try {
		var state0 = {
			a: arg1,
			b: arg2
		};
		var cb0 = (arg0, arg1) => {
			const a = state0.a;
			state0.a = 0;
			try {
				return __wasm_bindgen_func_elem_2876$1(a, state0.b, arg0, arg1);
			} finally {
				state0.a = a;
			}
		};
		getObject(arg0).forEach(cb0);
	} finally {
		state0.a = 0;
	}
}
function __wbg_getTime_00b3f7db575e4ef5(arg0) {
	return getObject(arg0).getTime();
}
function __wbg_getTimezoneOffset_08e2892156231088(arg0) {
	return getObject(arg0).getTimezoneOffset();
}
function __wbg_new_0_445c13a750296eb6() {
	return addHeapObject(/* @__PURE__ */ new Date());
}
function __wbg_now_e7c6795a7f81e10f(arg0) {
	return getObject(arg0).now();
}
function __wbg_performance_3fcf6e32a7e1ed0a(arg0) {
	const ret = getObject(arg0).performance;
	return addHeapObject(ret);
}
function __wbg_random_33cfffca5c784d5e() {
	return Math.random();
}
function __wbg_static_accessor_GLOBAL_9d53f2689e622ca1() {
	const ret = typeof global === "undefined" ? null : global;
	return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
function __wbg_static_accessor_GLOBAL_THIS_a1a35cec07001a8a() {
	const ret = typeof globalThis === "undefined" ? null : globalThis;
	return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
function __wbg_static_accessor_SELF_4c59f6c7ea29a144() {
	const ret = typeof self === "undefined" ? null : self;
	return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
function __wbg_static_accessor_WINDOW_e70ae9f2eb052253() {
	const ret = typeof window === "undefined" ? null : window;
	return isLikeNone(ret) ? 0 : addHeapObject(ret);
}
function __wbindgen_object_clone_ref(arg0) {
	return addHeapObject(getObject(arg0));
}
function __wbindgen_object_drop_ref(arg0) {
	takeObject(arg0);
}
function __wasm_bindgen_func_elem_2876$1(arg0, arg1, arg2, arg3) {
	wasm.__wasm_bindgen_func_elem_2876(arg0, arg1, addHeapObject(arg2), addHeapObject(arg3));
}
function addHeapObject(obj) {
	if (heap_next === heap.length) heap.push(heap.length + 1);
	const idx = heap_next;
	heap_next = heap[idx];
	heap[idx] = obj;
	return idx;
}
function dropObject(idx) {
	if (idx < 1028) return;
	heap[idx] = heap_next;
	heap_next = idx;
}
let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
	if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || cachedDataViewMemory0.buffer.detached === void 0 && cachedDataViewMemory0.buffer !== wasm.memory.buffer) cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
	return cachedDataViewMemory0;
}
function getStringFromWasm0(ptr, len) {
	return decodeText(ptr >>> 0, len);
}
let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
	if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
	return cachedUint8ArrayMemory0;
}
function getObject(idx) {
	return heap[idx];
}
let heap = new Array(1024).fill(void 0);
heap.push(void 0, null, true, false);
let heap_next = heap.length;
function isLikeNone(x) {
	return x === void 0 || x === null;
}
function passStringToWasm0(arg, malloc, realloc) {
	if (realloc === void 0) {
		const buf = cachedTextEncoder.encode(arg);
		const ptr = malloc(buf.length, 1) >>> 0;
		getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
		WASM_VECTOR_LEN = buf.length;
		return ptr;
	}
	let len = arg.length;
	let ptr = malloc(len, 1) >>> 0;
	const mem = getUint8ArrayMemory0();
	let offset = 0;
	for (; offset < len; offset++) {
		const code = arg.charCodeAt(offset);
		if (code > 127) break;
		mem[ptr + offset] = code;
	}
	if (offset !== len) {
		if (offset !== 0) arg = arg.slice(offset);
		ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
		const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
		const ret = cachedTextEncoder.encodeInto(arg, view);
		offset += ret.written;
		ptr = realloc(ptr, len, offset, 1) >>> 0;
	}
	WASM_VECTOR_LEN = offset;
	return ptr;
}
function takeObject(idx) {
	const ret = getObject(idx);
	dropObject(idx);
	return ret;
}
let cachedTextDecoder = new TextDecoder("utf-8", {
	ignoreBOM: true,
	fatal: true
});
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
	numBytesDecoded += len;
	if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
		cachedTextDecoder = new TextDecoder("utf-8", {
			ignoreBOM: true,
			fatal: true
		});
		cachedTextDecoder.decode();
		numBytesDecoded = len;
	}
	return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}
const cachedTextEncoder = new TextEncoder();
if (!("encodeInto" in cachedTextEncoder)) cachedTextEncoder.encodeInto = function(arg, view) {
	const buf = cachedTextEncoder.encode(arg);
	view.set(buf);
	return {
		read: arg.length,
		written: buf.length
	};
};
let WASM_VECTOR_LEN = 0;
let wasm;
function __wbg_set_wasm(val) {
	wasm = val;
}
//#endregion
//#region ../wasm/fend-wasm/fend_wasm_bg.wasm
var fend_wasm_bg_exports = /* @__PURE__ */ __exportAll({
	__wasm_bindgen_func_elem_2876: () => __wasm_bindgen_func_elem_2876,
	__wbindgen_add_to_stack_pointer: () => __wbindgen_add_to_stack_pointer,
	__wbindgen_export: () => __wbindgen_export,
	__wbindgen_export2: () => __wbindgen_export2,
	__wbindgen_export3: () => __wbindgen_export3,
	evaluateFendWithTimeout: () => evaluateFendWithTimeout,
	evaluateFendWithTimeoutMultiple: () => evaluateFendWithTimeoutMultiple,
	evaluateFendWithVariablesJson: () => evaluateFendWithVariablesJson,
	evaluate_fend_with_timeout: () => evaluate_fend_with_timeout,
	initialiseWithHandlers: () => initialiseWithHandlers,
	memory: () => memory,
	substituteInlineFendExpressions: () => substituteInlineFendExpressions
});
URL = globalThis.URL;
const { memory, initialiseWithHandlers, evaluate_fend_with_timeout, evaluateFendWithTimeout, evaluateFendWithTimeoutMultiple, evaluateFendWithVariablesJson, substituteInlineFendExpressions, __wasm_bindgen_func_elem_2876, __wbindgen_export, __wbindgen_export2, __wbindgen_add_to_stack_pointer, __wbindgen_export3 } = await __vite_plugin_wasm_helper_default({ "./fend_wasm_bg.js": {
	"__wbindgen_object_drop_ref": __wbindgen_object_drop_ref,
	"__wbg_forEach_2d5872dd26aea3b2": __wbg_forEach_2d5872dd26aea3b2,
	"__wbg_performance_3fcf6e32a7e1ed0a": __wbg_performance_3fcf6e32a7e1ed0a,
	"__wbg_now_e7c6795a7f81e10f": __wbg_now_e7c6795a7f81e10f,
	"__wbg_getTime_00b3f7db575e4ef5": __wbg_getTime_00b3f7db575e4ef5,
	"__wbg_getTimezoneOffset_08e2892156231088": __wbg_getTimezoneOffset_08e2892156231088,
	"__wbg_new_0_445c13a750296eb6": __wbg_new_0_445c13a750296eb6,
	"__wbindgen_object_clone_ref": __wbindgen_object_clone_ref,
	"__wbg_static_accessor_GLOBAL_THIS_a1a35cec07001a8a": __wbg_static_accessor_GLOBAL_THIS_a1a35cec07001a8a,
	"__wbg_static_accessor_SELF_4c59f6c7ea29a144": __wbg_static_accessor_SELF_4c59f6c7ea29a144,
	"__wbg_static_accessor_WINDOW_e70ae9f2eb052253": __wbg_static_accessor_WINDOW_e70ae9f2eb052253,
	"__wbg_static_accessor_GLOBAL_9d53f2689e622ca1": __wbg_static_accessor_GLOBAL_9d53f2689e622ca1,
	"__wbg_random_33cfffca5c784d5e": __wbg_random_33cfffca5c784d5e,
	"__wbg___wbindgen_is_undefined_67b456be8673d3d7": __wbg___wbindgen_is_undefined_67b456be8673d3d7,
	"__wbg___wbindgen_number_get_9bb1761122181af2": __wbg___wbindgen_number_get_9bb1761122181af2,
	"__wbg___wbindgen_string_get_72bdf95d3ae505b1": __wbg___wbindgen_string_get_72bdf95d3ae505b1,
	"__wbg___wbindgen_throw_1506f2235d1bdba0": __wbg___wbindgen_throw_1506f2235d1bdba0
} }, fend_wasm_bg_default);
//#endregion
//#region ../wasm/fend-wasm/fend_wasm.js
__wbg_set_wasm(fend_wasm_bg_exports);
//#endregion
//#region src/lib/worker.ts
function eventListener({ data }) {
	try {
		initialiseWithHandlers$1(data.currencyData);
		const result = JSON.parse(evaluateFendWithVariablesJson$1(data.input, data.timeout, data.variables));
		postMessage(result);
	} catch (e) {
		console.error(e);
		throw e;
	}
}
self.addEventListener("message", (ev) => {
	eventListener(ev);
});
postMessage("ready");
//#endregion

//# sourceMappingURL=worker-DSB9rMtK.js.map