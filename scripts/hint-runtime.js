// Inside useCurrentInput: keep a typed preview aligned with committed variables,
// completed submissions and background rate updates.
const hintInputRef = (0, import_react.useRef)('');
const hintVersionRef = (0, import_react.useRef)(0);
(0, import_react.useEffect)(() => {
	const refreshHint = ({ detail }) => {
		if (detail.source !== 'online' || detail.refreshing || submittedQueries > 0 || !hintInputRef.current.trim()) return;
		const value = hintInputRef.current;
		const version = ++hintVersionRef.current;
		(0, import_react.startTransition)(async () => {
			const updatedHint = await evaluateHint(value);
			if (version === hintVersionRef.current && value === hintInputRef.current) setHint(updatedHint);
		});
	};
	window.addEventListener('fend-rates', refreshHint);
	return () => {
		window.removeEventListener('fend-rates', refreshHint);
		++hintVersionRef.current;
	};
}, [evaluateHint]);
(0, import_react.useEffect)(() => {
	if (inputPending || submittedQueries > 0 || !hintInputRef.current.trim()) return;
	const value = hintInputRef.current;
	const version = ++hintVersionRef.current;
	(0, import_react.startTransition)(async () => {
		const updatedHint = await evaluateHint(value);
		if (version === hintVersionRef.current && value === hintInputRef.current) setHint(updatedHint);
	});
}, [inputPending, evaluateHint]);
