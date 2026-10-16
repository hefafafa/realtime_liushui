// 「抽成后流水」回归测试：
//   官方口径（哔哩哔哩直播主播帮助中心《用户收益结算》）：
//     一般收益（礼物/打赏）PC端·Android端 按 50% 计提（税前）；iOS 端先扣 30% 渠道费再按 50%
//     大航海收益 PC/Android 50%、iOS 25%
//   插件按 PC/安卓口径统一 50% 折算，且金额一律走 yuan()，人民币/日元都自动换算。
const fs = require('fs');
const path = require('path');
const SCRIPT = path.join(__dirname, 'realtime_liushui.user.js');

function makeEl() {
  return { style: {}, innerHTML: '', textContent: '', value: '', id: '', appendChild(c) { return c; },
    querySelector() { return makeEl(); }, querySelectorAll() { return []; },
    addEventListener() {}, setAttribute() {}, focus() {}, click() {} };
}
const store = new Map();
global.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k), key: (i) => Array.from(store.keys())[i] ?? null, get length() { return store.size; } };
global.document = { readyState: 'complete', body: makeEl(), createElement: () => makeEl(), getElementById: () => null, addEventListener() {} };
global.location = { pathname: '/1972368500', href: '' };
global.confirm = () => true;
global.window = global;
function FW() { this.readyState = 0; }
FW.prototype.send = function () {};
FW.prototype.close = function () {};
global.WebSocket = FW;
global.Blob = function () {};
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ code: 0, data: {} }) });
(0, eval)(fs.readFileSync(SCRIPT, 'utf8'));
const L = window.__dshLiushui;
const C = () => L.getCounters();
const own = (o) => L.feed(structuredClone(o), true);

let failed = 0;
function check(label, got, want) {
  const ok = String(got) === String(want);
  if (!ok) failed++;
  console.log('   ', ok ? 'PASS' : 'FAIL', label, '=', JSON.stringify(got), ok ? '' : ('期望 ' + JSON.stringify(want)));
}
function scenario(t) { console.log('\n== ' + t); }

// 造 300 元面值：礼物 2 元 + SC 100 元 + 大航海 198 元
scenario('准备：礼物 2 元 + SC 100 元 + 舰长 198 元 = 面值 300 元');
own({ cmd: 'SEND_GIFT', data: { coin_type: 'gold', price: 1000, num: 2, uid: 1, uname: '甲', giftName: '比心' } });
own({ cmd: 'SUPER_CHAT_MESSAGE', data: { id: 9001, price: 100, message: '加油', user_info: { uname: '乙', uid: 2 } } });
own({ cmd: 'GUARD_BUY', data: { guard_level: 3, num: 1, price: 198000, uid: 3, username: '丙' } });
let c = C();
check('面值总计 = 300 元', c.total, 300);

scenario('A. 计提比例与抽成后金额');
check('官方计提比例 = 0.5', c.cutRate, 0.5);
check('抽成后总计 = 150 元', c.totalAfterCut, 150);
check('默认不开开关（面板显示面值）', c.cutOn, false);

scenario('B. 开关只影响显示，不动账面');
L.setCut(true);
c = C();
check('开关已打开', c.cutOn, true);
check('面值仍是 300（账面不变）', c.total, 300);
check('抽成后仍是 150', c.totalAfterCut, 150);
L.setCut(false);
check('关掉后恢复面值显示', C().cutOn, false);

scenario('C. 换算函数适配汇率模式（人民币 / 日元）');
L.setCur('CNY');
check('人民币下：抽成后 150 元', L.fmtYuan(C().totalAfterCut), '¥150.00');
L.setCur('JPY', 23.642);
check('日元下：150 元 × 23.642 円', L.fmtYuan(C().totalAfterCut), '3,546 円');
check('日元下面值 300 元', L.fmtYuan(C().total), '7,093 円');
L.setCur('CNY');
check('切回人民币生效', L.fmtYuan(C().totalAfterCut), '¥150.00');

scenario('D. 汇率缓存行为（插件刻意保留缓存汇率，不当成 bug）');
L.setCur('JPY', 20);
check('先缓存 20', L.fmtYuan(150), '3,000 円');
L.setCur('JPY', 0);      // rate=0 是假值，setCur 不会覆盖已有缓存
check('rate=0 不覆盖缓存，仍用 20', L.fmtYuan(150), '3,000 円');
L.setCur('CNY');
check('切回人民币', L.fmtYuan(150), '¥150.00');
// 汇率缺失时的兜底写在 yuan() 里：`cur.mode === 'JPY' && cur.rate > 0` 才走日元分支，
// 否则退回人民币格式。这里用源码断言守住这个兜底，免得以后被改掉。
const src = fs.readFileSync(SCRIPT, 'utf8');
check('yuan() 里有「日元分支要求 rate>0」的兜底', /cur\.mode === 'JPY' && cur\.rate > 0/.test(src), true);

console.log('\n' + (failed ? ('❌ 失败 ' + failed + ' 项') : '✅ 全部通过'));
process.exit(failed ? 1 : 0);
