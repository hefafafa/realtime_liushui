// 把真实的 userscript 加载进 Node，用假的直播消息喂进去，验证记账是否正确。
// 原理：脚本会劫持 JSON.parse，所以我们直接调用 JSON.parse 就能把消息送进它的 handle()。
const fs = require('fs');
const path = require('path');

const SCRIPT = path.join(__dirname, 'realtime_liushui.user.js');

// ---------- 最小 DOM / 环境桩 ----------
function makeEl() {
  return {
    style: {}, innerHTML: '', textContent: '', value: '', id: '',
    appendChild(c) { return c; },
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    addEventListener() {}, setAttribute() {}, focus() {}, click() {},
  };
}

const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  // sweepStale / storageInfo 需要遍历，必须提供 key() 和 length
  key: (i) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
};
global.document = {
  readyState: 'complete',
  body: makeEl(),
  createElement: () => makeEl(),
  getElementById: () => null,
  addEventListener() {},
};
global.location = { pathname: '/1972368500', href: '' };
global.confirm = () => true;
// 脚本现在会劫持 window.WebSocket 来偷握手参数，Node 里给个桩
global.window = global;
function FakeWebSocket() { this.readyState = 0; }
FakeWebSocket.prototype.send = function () {};
FakeWebSocket.prototype.close = function () {};
global.WebSocket = FakeWebSocket;
global.Blob = function () {};
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };

// ---------- 加载真实脚本 ----------
const code = fs.readFileSync(SCRIPT, 'utf8');
// eslint-disable-next-line no-eval
(0, eval)(code);

// ---------- 喂消息 ----------
const feed = (o) => JSON.parse(JSON.stringify(o));

feed({ cmd: 'SEND_GIFT', data: { coin_type: 'gold', price: 1000, num: 1, giftName: '小花花', uname: '甲', uid: 1 } });
// 连击：combo_num 累进，price 100，只应计 100 + 100
feed({ cmd: 'SEND_GIFT', data: { coin_type: 'gold', price: 100, num: 1, combo_num: 1, batch_combo_id: 'B1', giftName: '辣条', uname: '乙', uid: 2 } });
feed({ cmd: 'SEND_GIFT', data: { coin_type: 'gold', price: 100, num: 1, combo_num: 2, batch_combo_id: 'B1', giftName: '辣条', uname: '乙', uid: 2 } });
// 免费礼物：不计钱，只计个数
feed({ cmd: 'SEND_GIFT', data: { coin_type: 'silver', price: 100, num: 3, giftName: '小心心', uname: '丙', uid: 3 } });
// SC 30 元，JPN 重复包应被去重
feed({ cmd: 'SUPER_CHAT_MESSAGE', data: { id: 9001, price: 30, message: '加油', uid: 4, user_info: { uname: '丁' } } });
feed({ cmd: 'SUPER_CHAT_MESSAGE_JPN', data: { id: 9001, price: 30, message: 'がんばれ', uid: 4, user_info: { uname: '丁' } } });
// 舰长 138 元
feed({ cmd: 'GUARD_BUY', data: { guard_level: 3, num: 1, price: 138000, uid: 5, username: '戊' } });
// 无关消息：应只增加 hits，不影响金额
feed({ cmd: 'DANMU_MSG', data: { info: [] } });
// 兜底路径：cmd 名字不认识，但数据结构是礼物 -> 也应记账，并记进 odd 自检
feed({ cmd: 'GIFT_SEND_V2', data: { giftId: 9, giftName: '未知礼物', price: 500, num: 1, coin_type: 'gold', uname: '己', uid: 6 } });
// 连击续报：不该重复计
feed({ cmd: 'COMBO_SEND', data: { giftId: 9, giftName: '未知礼物', price: 500, num: 1, coin_type: 'gold', uname: '己', uid: 6 } });
// 回归：B站现在的礼物命令叫 SEND_GIFT_V2，且字段名用的是下划线风格
feed({ cmd: 'SEND_GIFT_V2', data: { coin_type: 'gold', price: 200, num: 1, gift_name: '粉丝团灯牌', user_name: '庚', uid: 7 } });

// ---------- protobuf 路径：SEND_GIFT_V2 的礼物内容藏在 base64 的 pb 里 ----------
// 注入一张官方价目表（真实运行时来自 roomGiftList 接口）
window.__dshLiushui.setGiftTable(
  { 31036: { name: '小花花', price: 100 }, 35567: { name: '梦幻邮轮', price: 300000 } },
  { '小花花': 100, '梦幻邮轮': 300000 }
);

// 自己编一段 protobuf：外层 #5 嵌一个内层 message，内层含 礼物id / 礼物名 / 送礼人
function vint(n) { const out = []; do { let b = n & 0x7f; n = Math.floor(n / 128); if (n) b |= 0x80; out.push(b); } while (n); return out; }
const tag = (f, w) => vint(f * 8 + w);
const utf8 = (s) => [...Buffer.from(s, 'utf8')];
const ld = (f, bytes) => [...tag(f, 2), ...vint(bytes.length), ...bytes];
const inner = [...tag(1, 0), ...vint(31036), ...ld(2, utf8('小花花')), ...ld(3, utf8('测试用户'))];
const outer = ld(5, inner);
const pbB64 = Buffer.from(Uint8Array.from(outer)).toString('base64');

feed({ cmd: 'SEND_GIFT_V2', data: { dmscore: 140, pb: pbB64 } });

// ---------- 盲盒：必须算「爆出来的礼物」，不是盒子本身 ----------
// 报文里同时出现「心动盲盒」(15000) 和爆出的「电影票」(2000)，只应计 2000
window.__dshLiushui.setGiftTable(
  { 32251: { name: '心动盲盒', price: 15000 }, 32125: { name: '电影票', price: 2000 } },
  { '心动盲盒': 15000, '电影票': 2000 }
);
const innerBox = [
  ...tag(1, 0), ...vint(32251),
  ...ld(2, utf8('心动盲盒')),
  ...ld(3, utf8('送礼人甲')),
  ...ld(4, utf8('电影票'))
];
const pbBox = Buffer.from(Uint8Array.from(ld(5, innerBox))).toString('base64');
feed({ cmd: 'SEND_GIFT_V2', data: { dmscore: 1, pb: pbBox } });
const boxSample = window.__dshLiushui.getBoxSample();
console.log('盲盒样本:', JSON.stringify(boxSample));
const boxOK = boxSample.indexOf('心动盲盒') >= 0 && boxSample.indexOf('电影票') >= 0;
console.log('盲盒识别:', boxOK ? 'PASS' : 'FAIL');
if (!boxOK) process.exit(1);

// ---------- id 兜底护栏 ----------
// 场景：报文里只有盲盒名（奖品不在价目表里），但含一个整数恰好等于「小花花」的 id。
// 修复前会把小花花算进来（这就是「星光铃铛被记错」的成因），修复后必须不认这个 id。
window.__dshLiushui.setGiftTable(
  { 32251: { name: '心动盲盒', price: 15000 }, 31036: { name: '小花花', price: 100 } },
  { '心动盲盒': 15000, '小花花': 100 }
);
const innerBad = [...tag(1, 0), ...vint(31036), ...ld(2, utf8('心动盲盒'))];
const pbBad = Buffer.from(Uint8Array.from(ld(5, innerBad))).toString('base64');
const guardRes = window.__dshLiushui.decodeGiftProto({ pb: pbBad });
console.log('id兜底护栏:', JSON.stringify(guardRes));
const guardOK = !(guardRes && guardRes.name === '小花花');
console.log('id兜底护栏:', guardOK ? 'PASS' : 'FAIL');
if (!guardOK) process.exit(1);

setTimeout(() => {
  // ---------- 过期缓存清理 ----------
  const L0 = window.__dshLiushui;
  const H = 3600 * 1000;
  localStorage.setItem('dsh_bili_liushui_111', JSON.stringify({ savedAt: Date.now() - 48 * H, gold: 1 }));
  localStorage.setItem('dsh_bili_liushui_222', JSON.stringify({ savedAt: Date.now() - 1 * H, gold: 2 }));
  localStorage.setItem('dsh_bili_liushui_pos', JSON.stringify({ right: 16, top: 180 }));
  const swept = L0.sweepStale();
  const sweepState = {
    swept,
    过期已删: localStorage.getItem('dsh_bili_liushui_111') === null,
    未过期保留: localStorage.getItem('dsh_bili_liushui_222') !== null,
    位置记忆保留: localStorage.getItem('dsh_bili_liushui_pos') !== null,
    本房间数据保留: localStorage.getItem('dsh_bili_liushui_1972368500') !== null,
  };
  console.log('过期清理:', JSON.stringify(sweepState, null, 0));
  const sweepOK = swept === 1 && sweepState.过期已删 && sweepState.未过期保留 &&
    sweepState.位置记忆保留 && sweepState.本房间数据保留;
  console.log('过期清理:', sweepOK ? 'PASS' : 'FAIL');
  if (!sweepOK) process.exit(1);
  console.log('存储占用:', JSON.stringify(L0.storageInfo()));

  // ---------- 货币换算断言 ----------
  const L = window.__dshLiushui;
  const moneyCases = [];
  L.setCur('CNY', 23.64);
  moneyCases.push(['CNY 100', L.yuan(100), '¥100.00']);
  moneyCases.push(['CNY 0.1', L.yuan(0.1), '¥0.100']);
  moneyCases.push(['CNY 0', L.yuan(0), '¥0.00']);
  L.setCur('JPY', 23.64);
  moneyCases.push(['JPY 100', L.yuan(100), '2,364 円']);
  moneyCases.push(['JPY 0.1', L.yuan(0.1), '2.4 円']);
  moneyCases.push(['JPY 0', L.yuan(0), '0 円']);
  const moneyBad = moneyCases.filter((c) => c[1] !== c[2]);
  console.log('货币换算:', moneyBad.length ? 'FAIL' : 'PASS');
  moneyCases.forEach((c) => console.log('   ', c[0], '->', JSON.stringify(c[1]), c[1] === c[2] ? '' : ('期望 ' + JSON.stringify(c[2]))));
  if (moneyBad.length) process.exit(1);

  const raw = localStorage.getItem('dsh_bili_liushui_1972368500');
  if (!raw) { console.error('FAIL: 没有写入 localStorage'); process.exit(1); }
  const o = JSON.parse(raw);
  const got = {
    gold: o.gold,
    silver: o.silver,
    sc: o.sc,
    guard: o.guard,
    total: (o.gold / 1000) + o.sc + o.guard,
    hits: o.hits,
    users: Object.keys(o.users).length,
    events: (o.events || []).length,
  };
  // users=8：多了盲盒那条的「送礼人甲」。
  // gold=4000：2000(前面那些) + 2000(盲盒爆出的电影票；盒子价 15000 不应计入)。
  // total = 4.0 + 30(SC) + 138(舰长) = 172.0
  // hits=13 / events=10：各多一条盲盒消息与事件
  const want = { gold: 4000, silver: 3, sc: 30, guard: 138, total: 172.0, hits: 13, users: 8, events: 10 };
  console.log('实际:', JSON.stringify(got));
  console.log('预期:', JSON.stringify(want));
  const bad = Object.keys(want).filter((k) => String(got[k]) !== String(want[k]));
  if (bad.length) { console.error('FAIL: 不一致 ->', bad.join(', ')); process.exit(1); }
  console.log('PASS: 全部记账校验通过（含兜底识别 + 免费礼物事件 + 连击去重）');
  // 脚本里有 setInterval（轮询高能榜），不显式退出的话 node 会一直挂着
  process.exit(0);
}, 1200);
