// Inside App: reuse the existing input handler, without adding visible controls.
const recalledFormulaRef = (0, import_react.useRef)(null);
(0, import_react.useLayoutEffect)(() => {
	if (recalledFormulaRef.current === null || recalledFormulaRef.current !== currentInput) return;
	recalledFormulaRef.current = null;
	const input = inputText.current;
	if (input && document.activeElement === input) {
		input.setSelectionRange(currentInput.length, currentInput.length);
		input.scrollIntoView({ block: 'nearest' });
	}
}, [currentInput]);
(0, import_react.useEffect)(() => {
	const output = inputText.current?.closest('main')?.querySelector('#output');
	if (!output) return;
	let ignoreClick = false;
	let pointerFormula;
	const resetClick = event => {
		ignoreClick = false;
		pointerFormula = event.target.closest?.('[data-fend-input]') ?? null;
	};
	const keepSelection = () => { ignoreClick = true; };
	const recall = event => {
		if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
		if (event.type === 'keydown') {
			if (!['Enter', ' '].includes(event.key) || event.repeat || event.isComposing || event.keyCode === 229) return;
		} else if (event.button !== 0 || ignoreClick) return;
		const formula = event.target.closest?.('[data-fend-input]');
		if (!formula || !output.contains(formula)) return;
		// WebKit may adjust a touch on a result to a nearby focusable formula.
		// Follow the original pointer target; keyboard/assistive clicks have detail 0.
		if (event.type === 'click' && event.detail > 0 && pointerFormula !== formula) return;
		const selection = window.getSelection();
		if (selection && !selection.isCollapsed) return;
		event.preventDefault();
		const value = formula.getAttribute('data-fend-input');
		recalledFormulaRef.current = value;
		onInput(value);
		const input = inputText.current;
		// Focus in the user gesture so iOS can open its keyboard. Position the
		// caret after React commits the recalled value, or immediately if unchanged.
		input?.focus({ preventScroll: true });
		if (input && input.value === value) {
			recalledFormulaRef.current = null;
			input.setSelectionRange(value.length, value.length);
			input.scrollIntoView({ block: 'nearest' });
		}
	};
	output.addEventListener('pointerdown', resetClick);
	output.addEventListener('contextmenu', keepSelection);
	output.addEventListener('click', recall);
	output.addEventListener('keydown', recall);
	return () => {
		output.removeEventListener('pointerdown', resetClick);
		output.removeEventListener('contextmenu', keepSelection);
		output.removeEventListener('click', recall);
		output.removeEventListener('keydown', recall);
	};
}, [onInput, inputText]);
