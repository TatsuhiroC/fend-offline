import test from 'node:test';
import assert from 'node:assert/strict';
import {calculator} from './helpers/calculator.mjs';

function near(output, expected) {
	const actual = Number(output.replace(/^approx\. /, ''));
	assert(Number.isFinite(actual), output);
	assert(Math.abs(actual - expected) <= Math.max(Math.abs(expected), 1e-100) * 1e-9, output);
}

test('arbitrary integer log bases calculate directly in previews and submitted formulas', {timeout:10000}, async t => {
	const calc = await calculator(); t.after(() => calc.close());
	for (const fresh of [false,true]) {
		for (const [input, expected] of [
			['log7(8)',1.0686215613240664], ['log7(8+2)',1.1832946624549384],
			['log3(27)',3], ['log0007(8)',1.0686215613240664],
			['log7(log3(27)+5)',1.0686215613240664],
			['log1000000000000000000000000000000(100)',1/15],
			['log2 5',2.3219280949], ['log(5)',0.6989700043], ['log7 1',0]
		]) {
			const actual = await calc.run(input,fresh);
			near(actual.result,expected); assert.equal(actual.requests,0,input);
		}
	}
});

test('log names respect saved functions, parameters, strings, and reloads', async t => {
	const calc = await calculator(); t.after(() => calc.close());
	for (const [input, expected] of [
		['f = log7',null], ['f(8)',1.0686215613240664],
		['log7=x:x+1',null], ['log7(8)',9], ['f(8)',1.0686215613240664],
		['(log3:log3(8))(x:x+2)',10], ['g=x:log5(x+1)',null], ['g(24)',2],
		['ln=x:0',null], ['log5(25)',2]
	]) {
		const actual = await calc.run(input);
		if (expected !== null) near(actual.result,expected);
	}
	// Recreate the WASM instance while retaining serialized variables, just
	// as after an offline relaunch or a change in the exchange-rate dataset.
	calc.context.workerCache.cancel();
	near((await calc.run('f(8)')).result,1.0686215613240664);
	near((await calc.run('log7(8)')).result,9);
	for (const input of ['"log7(8)"', "'log7(8)'", '#"log7(8)"#']) {
		assert.equal((await calc.run(input)).result,'log7(8)');
	}
	assert.equal((await calc.run('1+1 # log7(8)')).result,'2');
});

test('invalid log bases and arguments give errors without breaking the next calculation', async t => {
	const calc = await calculator(); t.after(() => calc.close());
	for (const input of ['log0(5)','log1(5)','log0001(5)']) {
		const result = await calc.evaluate(input);
		assert.equal(result.ok,false,input); assert.match(result.message,/base must be at least 2/);
	}
	for (const input of ['log7(0)','log7(1m)','log7x(8)']) assert.equal((await calc.evaluate(input)).ok,false,input);
	assert.equal((await calc.run('1+1')).result,'2');
});

test('logarithms can be reused as fractional exponents without huge intermediate powers', {timeout:10000}, async t => {
	const calc = await calculator(); t.after(() => calc.close());
	for (const [input, expected] of [
		['10^(log(5))',5], ['2^(log2(5))',5], ['7^(log7(8))',8], ['exp(ln(5))',5],
		['10^(-log(5))',0.2], ['10^0.6989',4.9991941102], ['2^(1/(2^80))',1],
		['x=log(5); 10^x',5], ['f=x:10^(log(x)); f(5)',5],
		['10^(100+2^-80) to 4 sf',1e100], ['10^(-100-2^-80) to 4 sf',1e-100]
	]) near((await calc.run(input)).result,expected);
	await calc.run('log(5)');
	near((await calc.run('10^ans')).result,5);
});

test('exact roots, integer powers, complex logs, and numeric errors retain their semantics', {timeout:10000}, async t => {
	const calc = await calculator(); t.after(() => calc.close());
	for (const [input,expected] of [
		['16^(1/4)','2'], ['2^100 to exact','1267650600228229401496703205376'],
		['4^(10001/2) == 2^10001','true'], ['(1/3)^3 to exact','1/27'],
		['log7(-1)','approx. 1.614459258i']
	]) assert.equal((await calc.run(input)).result,expected,input);
	for (const input of ['0^0','1/0','10^(2^65)','10^(1000+2^-80)']) assert.equal((await calc.evaluate(input)).ok,false,input);
	assert.match((await calc.evaluate('10^(1000+2^-80)')).message,/approximation range/);
	assert.equal((await calc.run('1+1')).result,'2');
});
