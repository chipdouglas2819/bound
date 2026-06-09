// Smoke harness: boots index.html's script with a mock canvas and drives every scene.
// Catches missing-identifier runtime crashes that parse-only validation misses.
// Run: node test_smoke.js   (dev tool — lives in the repo, not served as part of the site)
const fs = require('fs');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL no script tag'); process.exit(1); }
let src = m[1];

if (/gyro/i.test(src)) { console.error('FAIL gyro references remain'); process.exit(1); }

// ---- DOM mocks ----
const gradient = { addColorStop(){} };
function makeCtx(){
  const target = {
    measureText: () => ({ width: 42 }),
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
  };
  return new Proxy(target, {
    get(t, prop){
      if (prop in t) return t[prop];
      return () => {};
    },
    set(t, prop, v){ t[prop] = v; return true; },
  });
}
const canvasMock = {
  getContext: () => makeCtx(),
  style: {},
  width: 0, height: 0,
  setPointerCapture(){}, releasePointerCapture(){},
};
global.window = global;
global.innerWidth = 390; global.innerHeight = 844;
global.devicePixelRatio = 2;
global.document = {
  getElementById: () => canvasMock,
  addEventListener(){},
  hidden: false,
};
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.localStorage = { getItem: () => null, setItem(){}, removeItem(){} };
global.requestAnimationFrame = () => {};

// expose internals for the test driver
src += `;globalThis.__T = { game, meta, shopUI, MODIFIERS, COMBO_TIERS,
  startRun, endRun, beginRun, selectModifier, update, render, ascend, canAscend, totalStatLevels };`;

let step = 'eval';
const results = [];
function pass(name){ results.push('PASS ' + name); }
function fail(name, err){
  console.log(results.join('\n'));
  console.error('FAIL ' + name + ' :: ' + (err && err.stack || err));
  process.exit(1);
}

try { new Function(src)(); pass('boot (script evaluates, no gyro)'); }
catch (e) { fail(step, e); }
const T = global.__T;

try { step='menu render'; T.render(); pass(step); } catch(e){ fail(step, e); }

try {
  step='30s run + 3s of frames';
  T.startRun();
  if (T.game.runDuration !== 30) throw new Error('expected 30s, got ' + T.game.runDuration);
  for (let i=0;i<180;i++){ T.update(1/60); T.render(); }
  pass(step);
} catch(e){ fail(step, e); }

try {
  step='combo tier 3 reached + render';
  T.game.combo.time = 13; T.update(1/60); T.render();
  if (T.game.combo.tier !== 3) throw new Error('tier=' + T.game.combo.tier);
  pass(step);
} catch(e){ fail(step, e); }

try {
  step='GLASS modifier actually applies (maxHp=1)';
  T.selectModifier(T.MODIFIERS.find(x=>x.id==='glass'));
  if (T.game.player.maxHp !== 1) throw new Error('maxHp=' + T.game.player.maxHp + ' — apply() not running');
  pass(step);
} catch(e){ fail(step, e); }

try {
  step='TIGHT QUARTERS shrinks arena multiplicatively';
  T.selectModifier(T.MODIFIERS.find(x=>x.id==='tight_quarters'));
  if (T.game.arena.radius !== Math.floor(96*0.75)) throw new Error('radius=' + T.game.arena.radius);
  pass(step);
} catch(e){ fail(step, e); }

try {
  step='death -> result render';
  for (let i=0;i<90;i++) T.update(1/60);   // ~1.5s elapsed so the descent registers
  T.endRun(false);
  if (T.game.scene !== 'result') throw new Error('scene=' + T.game.scene);
  T.game.resultTimer = 1; T.render();
  pass(step);
} catch(e){ fail(step, e); }

try {
  step='bestTime updates on death';
  if (!(T.meta.bestTime > 0)) throw new Error('bestTime=' + T.meta.bestTime);
  pass(step);
} catch(e){ fail(step, e); }

try {
  step='shop render + settings render';
  T.game.scene = 'shop'; T.render();
  T.shopUI.settingsOpen = true; T.render();
  T.shopUI.settingsOpen = false;
  pass(step);
} catch(e){ fail(step, e); }

try {
  step='ascend flow';
  T.meta.owned = { vitality:3, swiftness:5, compact:4 };  // 12 levels
  if (T.game.scene === 'playing') T.game.scene = 'menu';
  if (!T.canAscend()) throw new Error('canAscend false at 12 levels');
  T.ascend();
  if (T.meta.prestige !== 1) throw new Error('prestige=' + T.meta.prestige);
  if (Object.keys(T.meta.owned).length !== 0) throw new Error('owned not wiped');
  pass(step);
} catch(e){ fail(step, e); }

try {
  step='modifier picker at P9 + pick + render';
  T.meta.prestige = 9;
  T.game.scene = 'menu';
  T.beginRun();
  if (T.game.scene !== 'modifierPick') throw new Error('scene=' + T.game.scene);
  T.render();
  T.selectModifier(T.game.modifierPicks[0]);
  if (T.game.scene !== 'playing') throw new Error('scene=' + T.game.scene);
  pass(step);
} catch(e){ fail(step, e); }

try {
  step='60s mode wave 1->2 transition + render';
  T.meta.prestige = 6; T.meta.preferredMode = 60;
  T.game.activeModifier = null;
  T.startRun();
  if (T.game.runDuration !== 60) throw new Error('duration=' + T.game.runDuration);
  T.game.timeLeft = 29.9;          // just past the 30s elapsed mark
  T.update(1/60);
  if (T.game.wave !== 2) throw new Error('wave=' + T.game.wave);
  for (let i=0;i<120;i++){ T.update(1/60); T.render(); }  // field enemies can spawn here
  pass(step);
} catch(e){ fail(step, e); }

try {
  step='90s mode wave 3 + shielded spawns + render';
  T.meta.prestige = 12; T.meta.preferredMode = 90;
  T.startRun();
  T.game.timeLeft = 29.5;          // 60.5s elapsed -> wave 3
  T.update(1/60);
  if (T.game.wave !== 3) throw new Error('wave=' + T.game.wave);
  for (let i=0;i<240;i++){ T.update(1/60); T.render(); }
  pass(step);
} catch(e){ fail(step, e); }

console.log(results.join('\n'));
console.log('ALL OK');
