// 收款码浮层「收起」的回归用例（v2.8.27）：
//   背景：浮层 #dsh-ls-qr 与页脚那行 #dsh-ls-links 是**兄弟节点**，
//   早先把 dsh-ls-qrclose 的点击委托挂在 el.links 上，于是浮层里的「收起」点了没反应。
//   这个用例把真实 userscript 放进 vm 沙箱，用最小 DOM 桩复现「展开 → 点收起」这条路径。
// 用法：node test-qr-toggle.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SCRIPT = process.env.LS_SCRIPT || path.join(__dirname, 'realtime_liushui.user.js');
const code = fs.readFileSync(SCRIPT, 'utf8');

// ---------- 假 DOM（与 test-drag.js 同一套） ----------
function makeSandbox(opts) {
  const listeners = { doc: {}, win: {}, el: new Map() };

  function fire(map, type, ev) {
    (map[type] || []).forEach(function (fn) { fn(ev || {}); });
  }

  function makeEl(id) {
    const kids = new Map();
    const el = {
      id: id || '',
      style: {},
      innerHTML: '', textContent: '', value: '', href: '', download: '',
      appendChild(c) { return c; },
      setAttribute() {}, focus() {}, click() {},
      addEventListener(type, fn) {
        let m = listeners.el.get(el);
        if (!m) { m = {}; listeners.el.set(el, m); }
        (m[type] = m[type] || []).push(fn);
      },
      querySelector(sel) {
        if (!kids.has(sel)) {
          const k = makeEl(sel.replace(/^#/, ''));
          if (sel === '#dsh-ls-panel') k.style.display = 'none';
          if (sel === '#dsh-ls-qr') k.style.display = 'none';
          kids.set(sel, k);
        }
        return kids.get(sel);
      },
      querySelectorAll() { return []; },
    };
    Object.defineProperty(el, 'offsetWidth', {
      get() { const p = kids.get('#dsh-ls-panel'); return (p && p.style.display !== 'none') ? 330 : 46; },
    });
    Object.defineProperty(el, 'offsetHeight', { get() { return 500; } });
    el.getBoundingClientRect = function () {
      const l = parseFloat(el.style.left), t = parseFloat(el.style.top);
      return { left: isNaN(l) ? 0 : l, top: isNaN(t) ? 0 : t, width: el.offsetWidth, height: el.offsetHeight };
    };
    return el;
  }

  const store = new Map(Object.entries(opts.seed || {}));
  const doc = {
    readyState: 'complete',
    documentElement: { clientWidth: opts.w, clientHeight: opts.h },
    body: makeEl('body'),
    createElement: () => makeEl(''),
    getElementById: () => null,
    addEventListener(type, fn) { (listeners.doc[type] = listeners.doc[type] || []).push(fn); },
  };
  const win = {
    innerWidth: opts.w, innerHeight: opts.h,
    addEventListener(type, fn) { (listeners.win[type] = listeners.win[type] || []).push(fn); },
    JSON, Date, Math, Object, Array, String, Number, isNaN, parseInt, parseFloat, RegExp, Error,
    Promise, Map, Set, Uint8Array, Uint16Array, Uint32Array, Int32Array, ArrayBuffer, DataView,
    TextDecoder: global.TextDecoder, TextEncoder: global.TextEncoder,
    setTimeout() { return 0; }, setInterval() { return 0; }, clearTimeout() {}, clearInterval() {},
    fetch: () => new Promise(function () {}),
    WebSocket: function () { this.send = function () {}; this.close = function () {}; },
    Blob: function () {}, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      key: (i) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    },
    location: { pathname: '/22748536', href: '' },
    confirm: () => true,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    console,
  };
  win.window = win;
  win.document = doc;
  win.self = win;
  win.globalThis = win;

  const sandbox = vm.createContext(win);
  return { win, doc, store, run() { vm.runInContext(code, sandbox); }, fireEl: (el, type, ev) => fire(listeners.el.get(el) || {}, type, ev) };
}

function instrument(sb) {
  const seen = [];
  sb.doc.body.appendChild = function (c) { seen.push(c); return c; };
  return seen;
}

let failed = 0;
function check(name, actual, expected) {
  const ok = String(actual) === String(expected);
  if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + ': ' + name + (ok ? '' : '  实际=' + actual + ' 预期=' + expected));
}

const sb = makeSandbox({ w: 1920, h: 1080 });
const seen = instrument(sb);
sb.run();
const root = seen[0];
const panel = root.querySelector('#dsh-ls-panel');
const links = root.querySelector('#dsh-ls-links');
const qr = root.querySelector('#dsh-ls-qr');
const hint = root.querySelector('#dsh-ls-hint');

// 展开面板（💰 圆钮）
root.querySelector('#dsh-ls-toggle').onclick();
check('面板已展开', panel.style.display, 'flex');
check('浮层默认收起', qr.style.display, 'none');

// --- 路径 1：页脚「请作者喝杯奶茶」展开浮层 ---
sb.fireEl(links, 'click', { target: { id: 'dsh-ls-donate' } });
check('点页脚入口后浮层展开', qr.style.display, 'block');
check('浮层里出现「收起」', /id="dsh-ls-qrclose"/.test(qr.innerHTML), true);
check('「收起」文案正确', /收起/.test(qr.innerHTML), true);

// --- 关键回归：点「收起」必须真的收起 ---
sb.fireEl(qr, 'click', { target: { id: 'dsh-ls-qrclose' } });
check('点「收起」后浮层关闭', qr.style.display, 'none');
check('关闭时清空浮层内容', qr.innerHTML, '');

// --- 路径 2：首次提示里的「支持一下作者」也能开、也能关 ---
sb.fireEl(hint, 'click', { target: { id: 'dsh-ls-hintdonate' } });
check('提示里的入口也能展开', qr.style.display, 'block');
sb.fireEl(qr, 'click', { target: { id: 'dsh-ls-qrclose' } });
check('再关一次同样有效', qr.style.display, 'none');

// --- 反复开关不该越开越大 / 状态错乱 ---
for (let i = 0; i < 3; i++) {
  sb.fireEl(links, 'click', { target: { id: 'dsh-ls-donate' } });
  sb.fireEl(qr, 'click', { target: { id: 'dsh-ls-qrclose' } });
}
check('来回三次后仍是收起态', qr.style.display, 'none');

// --- 传进来的 target 是浮层里别的元素时，不能误关 ---
sb.fireEl(links, 'click', { target: { id: 'dsh-ls-donate' } });
sb.fireEl(qr, 'click', { target: { id: 'dsh-ls-something-else' } });
check('点浮层里非「收起」的元素不会误关', qr.style.display, 'block');

// --- 源码层面的守卫：委托必须挂在浮层容器上 ---
const src = fs.readFileSync(SCRIPT, 'utf8');
check('el.qr 上挂了 click 委托', /el\.qr\.addEventListener\('click'/.test(src), true);
check('委托判断的是 dsh-ls-qrclose', /t\.id === 'dsh-ls-qrclose'/.test(src), true);

console.log(failed ? '\nFAILED: ' + failed + ' 项' : '\nPASS: 收款码浮层「收起」全部通过');
process.exit(failed ? 1 : 0);
