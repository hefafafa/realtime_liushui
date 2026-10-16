// 舰长核验的回归测试：打折舰长（GUARD_BUY 报标价 198、回声给实付 138）会不会被误撤账。
// 素材来自 2026-10-13 房间 1972368500 的真实账本 + 真实高能榜采样：
//   安-灬 22:28:28 上舰 → 榜单 22:28:37 起就显示 138 元（#2）
//   咖啡Official 22:29:57 上舰 → 榜单 22:30:37 起显示 138.1 元（#1）
//   魔羯_少颗心 22:41:32 上舰 → 榜单 22:41:37 起显示 138.1 元（#2）
//   三笔都在购买后约 5 分钟被插件撤账（guardPromo 3），账面少了 414 元。
const fs = require('fs');
const path = require('path');

const SCRIPT = path.join(__dirname, 'realtime_liushui.user.js');

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
  key: (i) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
};
global.document = {
  readyState: 'complete', body: makeEl(),
  createElement: () => makeEl(), getElementById: () => null, addEventListener() {},
};
global.location = { pathname: '/1972368500', href: '' };
global.confirm = () => true;
global.window = global;
function FakeWebSocket() { this.readyState = 0; }
FakeWebSocket.prototype.send = function () {};
FakeWebSocket.prototype.close = function () {};
global.WebSocket = FakeWebSocket;
global.Blob = function () {};
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };

// 把网络全部挡掉：榜单由测试自己喂，其余接口返回空壳，避免真去请求 B 站
global.fetch = async (url) => {
  const u = String(url);
  const json = (o) => ({ ok: true, status: 200, json: async () => o });
  if (u.includes('getOnlineGoldRank')) {
    // 按 page 分页下发，才能测出「只取第 1 页会漏掉第 50 名之后的人」
    const m = /[?&]page=(\d+)/.exec(u);
    const page = m ? Number(m[1]) : 1;
    const size = 50;
    const slice = RANK_NOW.slice((page - 1) * size, page * size);
    return json({ code: 0, data: { OnlineRankItem: slice.map((x) => ({ uid: x.uid || 1, score: x.score, guard_level: x.guard || 0, uinfo: { base: { name: x.name } } })), onlineNum: RANK_NOW.length } });
  }
  if (u.includes('get_info')) return json({ code: 0, data: { uid: 372984197, room_id: 1972368500, live_status: 1 } });
  if (u.includes('roomGiftList') || u.includes('giftConfig')) return json({ code: 0, data: { list: [] } });
  return json({ code: 0, data: {} });
};
let RANK_NOW = [];

// eslint-disable-next-line no-eval
(0, eval)(fs.readFileSync(SCRIPT, 'utf8'));

const L = window.__dshLiushui;
const feed = (o) => JSON.parse(JSON.stringify(o));
const C = () => L.getCounters();
const guard = (uid, name, lv, price) => feed({ cmd: 'GUARD_BUY', data: { guard_level: lv, num: 1, price, uid, username: name } });
const echoGift = (uid, name, price) => feed({ cmd: 'SEND_GIFT', data: { coin_type: 'gold', price, num: 1, uid, uname: name } });

let failed = 0;
function check(label, got, want) {
  const ok = String(got) === String(want);
  if (!ok) failed++;
  console.log('   ', ok ? 'PASS' : 'FAIL', label, '=', JSON.stringify(got), ok ? '' : ('期望 ' + JSON.stringify(want)));
}
function scenario(t) { console.log('\n== ' + t); }

// 与真实采样同一时刻的榜单（前几名 + 一大批低贡献用户，凑够真实形状）
function rankSnapshot(extra) {
  const base = [];
  for (let i = 0; i < 60; i++) base.push({ name: '路人' + i, score: Math.max(1, 60 - i), uid: 9000 + i });
  return base.concat(extra || []);
}

// ---------- 场景 A：打折舰长，榜单承认 138 元（1380 贡献值），不该被撤 ----------
scenario('A. 打折舰长 安-灬：GUARD_BUY 标价 198 + 回声实付 138，榜单随后显示 138 元');
RANK_NOW = rankSnapshot([]);                    // 上舰前：榜单里还没有他（真实采样 22:27:37 就是这样）
L.setRank(RANK_NOW, 'OK · test');
L.setGuardVerifyMs(0);                          // 立即核验，别等 8 分钟
guard(1001, '安-灬', 3, 198000);
let c = C();
check('上舰先按标价记 198', c.guard, 198);
echoGift(1001, '安-灬', 138000);
c = C();
check('回声把价压到实付 138', c.guard, 138);
check('压价笔数', c.guardAdjusted, 1);
RANK_NOW = rankSnapshot([{ name: '安-灬', score: 1380, uid: 1001, guard: 3 }]);   // 22:28:37 榜单认了
L.setRank(RANK_NOW, 'OK · test');
L.verifyPendingGuards();
c = C();
check('【关键】榜单承认后不得撤账（应是 138）', c.guard, 138);
check('【关键】不该记成「赠送/活动舰长」', c.guardPromo, 0);
const yuanOf = (name, c) => {
  let s = 0;
  for (const k of Object.keys(c.users || {})) if (c.users[k] && c.users[k].name === name) s += c.users[k].yuan;
  return s;
};
check('贡献榜里这家还在（138）', yuanOf('安-灬', c), 138);

// ---------- 场景 B：赠送舰长（榜单里这人只有 2 元），应当被撤 ----------
scenario('B. 赠送舰长：标价 198，榜单里这人只有 2 元 → 该撤');
RANK_NOW = rankSnapshot([]);
L.setRank(RANK_NOW, 'OK · test');
L.setGuardVerifyMs(0);
guard(1002, '白送的小可爱', 3, 198000);
check('先记到 336', C().guard, 336);
RANK_NOW = rankSnapshot([{ name: '白送的小可爱', score: 20, uid: 1002 }]);
L.setRank(RANK_NOW, 'OK · test');
L.verifyPendingGuards();
c = C();
check('榜单不承认 → 撤账回 138', c.guard, 138);
check('撤账计数 +1', c.guardPromo, 1);

// ---------- 场景 C：榜单里根本没有这个人（如提督 1998 从来不上榜），不该撤 ----------
scenario('C. 榜单里完全没有这个人（提督 1998）→ 宁可多记不可错删');
RANK_NOW = rankSnapshot([]);
L.setRank(RANK_NOW, 'OK · test');
L.setGuardVerifyMs(0);
guard(1003, '峯义孝-', 2, 1998000);
check('先记到 2136', C().guard, 2136);
L.verifyPendingGuards();
c = C();
check('【关键】榜单查无此人时不得撤账（应仍是 2136）', c.guard, 2136);
check('撤账计数不再增加', c.guardPromo, 1);
check('记为「未核验」而不是撤账', c.guardUnverified, 1);

// ---------- 场景 D：榜单靠后位置（翻页修复）----------
// 这里真的走插件自己的 pollRank：把 fetch 桩做成「按 page 分页返回」，目标用户只出现在第 2 页。
(async () => {
scenario('D. 用户在榜单第 2 页（原来只取前 50 名会漏掉他）→ 翻页后必须核得过');
RANK_NOW = rankSnapshot([]);
L.setRank(RANK_NOW, 'OK · test');
L.setGuardVerifyMs(0);
guard(1004, '后排的小舰长', 3, 198000);
check('先记到 2334', C().guard, 2334);
// 造 80 人：目标用户排在第 70 位（只取第 1 页必然找不到）
const tail = [];
for (let i = 0; i < 79; i++) tail.push({ name: '榜上路人' + i, score: 4000 - i * 10, uid: 8000 + i });
tail.push({ name: '后排的小舰长', score: 1980, uid: 1004 });
RANK_NOW = tail;
L.setRank(RANK_NOW, 'OK · test');
L.verifyPendingGuards();
const c = C();
check('靠后的用户也能被认到 → 不撤账', c.guard, 2334);
check('撤账计数不变', c.guardPromo, 1);

// ---------- 场景 E：榜单总值衰减（高水位修复）----------
scenario('E. 榜单先涨到 1380 又衰减回 300 → 高水位应保住这笔');
RANK_NOW = rankSnapshot([]);
L.setRank(RANK_NOW, 'OK · test');
L.setGuardVerifyMs(0);
guard(1005, '衰减受害者', 3, 198000);
echoGift(1005, '衰减受害者', 138000);
check('先记到 2472', C().guard, 2472);
RANK_NOW = rankSnapshot([{ name: '衰减受害者', score: 1380, uid: 1005 }]);
L.setRank(RANK_NOW, 'OK · test');
L.verifyPendingGuards();                     // 这一刻认到了，应该直接结案
RANK_NOW = rankSnapshot([{ name: '衰减受害者', score: 300, uid: 1005 }]);
L.setRank(RANK_NOW, 'OK · test');
L.verifyPendingGuards();                     // 再等也不会因为衰减被撤
check('衰减后仍不撤账', C().guard, 2472);
check('撤账计数不变', C().guardPromo, 1);

// ---------- 场景 F：真·翻页（让插件自己的 pollRank 去翻第 2 页）----------
scenario('F. 榜单第 2 页才有的用户：插件自己的 pollRank 必须翻页找到他');
RANK_NOW = rankSnapshot([]);
L.setRank(RANK_NOW, 'OK · test');
L.setGuardVerifyMs(0);
const filler = [];
for (let i = 0; i < 60; i++) filler.push({ name: '高位路人' + i, score: 3000 - i, uid: 7000 + i });
filler.push({ name: '翻页目标', score: 1980, uid: 1006 });     // 第 61 位 → 只在第 2 页
RANK_NOW = filler;
guard(1006, '翻页目标', 3, 198000);
check('先记到 2670', C().guard, 2670);
const before = (C().guardPromo || 0) + (C().guardUnverified || 0);
await new Promise((r) => setTimeout(r, 2600));                 // 等插件自己那一轮 pollRank（1.5s 后首次）
const c2 = C();
check('翻页后认到了他 → 没有新增撤账/未核验', (c2.guardPromo || 0) + (c2.guardUnverified || 0), before);
check('金额仍是 2670', c2.guard, 2670);

console.log('\n' + (failed ? ('❌ 失败 ' + failed + ' 项') : '✅ 全部通过'));
process.exit(failed ? 1 : 0);
})();
