import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const version = (await readdir('www/assets'))[0];
const files = await readdir(join('www/assets', version));
const app = await readFile(join('www/assets', version, files.find(name => /^App-.*\.js$/.test(name))), 'utf8');
const code = app.slice(app.indexOf('// Inside App: reuse'), app.indexOf('\n\tconst pendingOutput', app.indexOf('// Inside App: reuse')));

function setup(value = '') {
 const listeners = new Map(), layouts = [], refs = [], values = [], positions = [];
 let cleanup, selection = {isCollapsed:true}, scrolled = 0;
 const output = {
  addEventListener: (name, handler) => listeners.set(name, handler),
  removeEventListener: (name, handler) => { assert.equal(listeners.get(name),handler); listeners.delete(name); },
  contains: node => node === formula
 };
 const document = {activeElement:null};
 const input = {value, closest: () => ({querySelector: () => output}),
  focus() {document.activeElement = input;},
  setSelectionRange: (...position) => positions.push(position), scrollIntoView() {scrolled++;}
 };
 const formula = {closest() {return formula;}, getAttribute: () => '"<b>USD</b>";\n1 + 2'};
 const context = vm.createContext({document, window:{getSelection:() => selection}, inputText:{current:input},
  currentInput:value, onInput: next => values.push(next),
  import_react:{useRef: current => {const ref={current};refs.push(ref);return ref;},
   useEffect: callback => {cleanup=callback();}, useLayoutEffect: callback => layouts.push(callback)}
 });
 vm.runInContext(code,context);
 const fire = (type, extra = {}) => {
  let prevented = false;
  listeners.get(type)({type,button:0,target:formula,preventDefault() {prevented=true;},...extra});
  return prevented;
 };
 return {fire,formula,values,input,document,listeners,positions,refs,
  setSelection: next => {selection=next;}, cleanup: () => cleanup(), get scrolled() {return scrolled;},
  commit(next) {input.value=next;context.currentInput=next;layouts[0]();}
 };
}

test('recalling a formula focuses synchronously and positions the caret after the committed value', () => {
 const state=setup('unfinished draft');
 assert.equal(state.fire('click'),true);
 const value=state.formula.getAttribute();
 assert.deepEqual(state.values,[value]);
 assert.equal(state.document.activeElement,state.input,'focus must happen inside the user gesture');
 assert.equal(state.positions.length,0,'do not position a caret in the old draft');
 state.commit(value);
 assert.deepEqual(state.positions,[[value.length,value.length]]);
 assert.equal(state.scrolled,1);
 assert.equal(state.refs[0].current,null);
 state.fire('click');
 assert.equal(state.positions.length,2,'reselecting the same formula still positions its caret');
 assert.equal(state.scrolled,2);
});

test('selection, long press and unrelated output stay intact; keyboard recall is accessible and listeners clean up', () => {
 const state=setup();
 state.setSelection({isCollapsed:false});
 state.fire('click');
 state.setSelection(null);
 state.fire('contextmenu');state.fire('click');
 state.fire('pointerdown');
 state.fire('click',{button:2});
 state.fire('click',{ctrlKey:true});
 state.fire('click',{target:{closest:() => null}});
 state.fire('pointerdown',{target:{closest:() => null}});
 state.fire('click',{detail:1});
 for(const extra of [{key:'ArrowUp'},{key:'Enter',repeat:true},{key:'Enter',isComposing:true},{key:'Enter',keyCode:229}]) state.fire('keydown',extra);
 assert.deepEqual(state.values,[]);
 assert.equal(state.fire('keydown',{key:'Enter'}),true);
 assert.equal(state.fire('keydown',{key:' '}),true);
 assert.equal(state.values.length,2);
 state.fire('pointerdown');
 assert.equal(state.fire('click',{detail:1}),true);
 assert.equal(state.values.length,3);
 state.cleanup();
 assert.equal(state.listeners.size,0);
});
