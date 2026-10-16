// 人气红包的回归测试（v2.8.11 口径：**红包本身不计流水**，只有内容物以礼物形式被用掉时才计）。
// 素材来自 2026-10-13 房间 1972368500 的真实报文 + B站前端常量 + 社区协议文档：
//   POPULARITY_RED_POCKET_V2_START  total_price=2000（奖品池）、awards=[电池红包×20]、rp_type=3
//   POPULARITY_RED_POCKET_V2_NEW    gift_name=红包 gift_id=13000 price=100（单份奖额）
//   POPULARITY_RED_POCKET_V2_WINNER_LIST 20 人 × 100
//   rp_type：2=上舰红包（主播端模板写死 2===rp_type?"上舰":""）；3/5=电池红包（前端常量）
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
function FakeWebSocket() { this.readyState = 0; }
FakeWebSocket.prototype.send = function () {};
FakeWebSocket.prototype.close = function () {};
global.WebSocket = FakeWebSocket;
global.Blob = function () {};
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ code: 0, data: {} }) });

// eslint-disable-next-line no-eval
(0, eval)(fs.readFileSync(SCRIPT, 'utf8'));
const L = window.__dshLiushui;
const C = () => L.getCounters();
const page = (o) => JSON.parse(JSON.stringify(o));      // 页面钩子通道
const own = (o) => L.feed(structuredClone(o), true);     // 自己通道

let failed = 0;
function check(label, got, want) {
  const ok = String(got) === String(want);
  if (!ok) failed++;
  console.log('   ', ok ? 'PASS' : 'FAIL', label, '=', JSON.stringify(got), ok ? '' : ('期望 ' + JSON.stringify(want)));
}
function scenario(t) { console.log('\n== ' + t); }

const pocketStart = (lot, who, pool, extraData) => ({
  cmd: 'POPULARITY_RED_POCKET_V2_START',
  data: Object.assign({
    lot_id: lot, sender_uid: 39358662, sender_name: who, join_requirement: 2, danmu: '',
    current_time: 0, start_time: 0, end_time: 0, last_time: 600, lot_status: 1,
    user_status: 2, awards: [{ gift_id: 0, gift_name: '电池红包', gift_pic: '', num: 20 }],
    lot_config_id: 0, total_price: pool, wait_num: 0, wait_num_v2: 1, is_mystery: false, rp_type: 3,
  }, extraData || {}),
});
const pocketNew = (lot, who, price, rpType) => ({
  cmd: 'POPULARITY_RED_POCKET_V2_NEW',
  data: { lot_id: lot, start_time: 0, current_time: 0, wait_num: 0, wait_num_v2: 1, uname: who, uid: 1,
    action: '送出', num: 1, gift_name: '红包', gift_id: 13000, price, name_color: '', rp_type: rpType || 3 },
});
const winnerList = (lot, n, each) => ({
  cmd: 'POPULARITY_RED_POCKET_V2_WINNER_LIST',
  data: { lot_id: lot, total_num: n, award_num: n,
    winner_info: Array.from({ length: n }, (_, i) => [1000 + i, '中奖人' + i, 0, 0, false, each, 0, 372984197, {}]) },
});

// ---------- A：_START 带池子 → 只登记，不计钱 ----------
scenario('A. _V2_START 池子 2000 金瓜子（2 元）→ 登记，但流水一分不加');
own(pocketStart(28760258, '黑山羊不吃草', 2000));
let c = C();
check('礼物池没变（gold=0）', c.gold, 0);
check('本场总计 = 0（红包不进合计）', c.total, 0);
check('登记红包个数 = 1', c.pocketCount, 1);
check('登记池子 = 2000 金瓜子', c.pocketPool, 2000);
check('参考值 = 0.5 元（仅对账用）', c.pocketRef, 0.5);
check('事件金额固定 0', c.events.filter((e) => e.kind === 'pocket')[0].yuan, 0);
check('事件文案写明不计入流水', /不计入流水/.test(c.events.filter((e) => e.kind === 'pocket')[0].text), true);

// ---------- B：两条通道重复投递 → 只登记一次 ----------
scenario('B. 同一个 lot 再从另一条通道来一遍 → 不能重复登记');
page(pocketStart(28760258, '黑山羊不吃草', 2000));
check('个数仍是 1', C().pocketCount, 1);
check('池子仍是 2000', C().pocketPool, 2000);
check('参考值仍是 0.5', C().pocketRef, 0.5);

// ---------- C：先 _NEW 后 _START ----------
scenario('C. 先 _NEW（无池子）后 _START');
own(pocketNew(28760659, '羽猫猫羽', 100));
c = C();
check('_NEW 不登记池子（池子仍 2000）', c.pocketPool, 2000);
check('记为「池子未知」1 个', c.pocketNoPool, 1);
check('gold 没被 _NEW.price 污染', c.gold, 0);
own(pocketStart(28760659, '羽猫猫羽', 1000));
c = C();
check('_START 到了补齐：池子 3000', c.pocketPool, 3000);
check('池子未知清零', c.pocketNoPool, 0);
check('登记个数 = 2', c.pocketCount, 2);
check('参考值累计 0.75', c.pocketRef, 0.75);
check('流水仍是 0', c.total, 0);

// ---------- D：红包 price 报成大数（模拟上舰红包）→ 绝不能计成礼物 ----------
scenario('D. 红包 price 报 198000：不能变成 198 元礼物');
own(pocketNew(28760777, '乙', 198000, 2));
c = C();
check('gold 没变', c.gold, 0);
check('总计仍是 0', c.total, 0);

// ---------- E：上舰提示 USER_TOAST_MSG → 只计数 ----------
scenario('E. USER_TOAST_MSG：只计数，不计钱，不产生事件');
const evBefore = C().events.length;
own({ cmd: 'USER_TOAST_MSG', data: { guard_level: 3, num: 1, price: 0, uid: 2, username: '乙', gift_id: 10002, role_name: '舰长' } });
c = C();
check('提示计数 +1', c.toastMsgs, 1);
check('没有新增事件', c.events.length, evBefore);
check('回声额度没被消耗（guardDedup=0）', c.guardDedup, 0);

// ---------- F：中奖名单 → 只统计 ----------
scenario('F. _WINNER_LIST：只统计人数，不加钱');
const poolBefore = C().pocketPool;
own(winnerList(28760258, 20, 100));
c = C();
check('中奖人数记到 20', c.pocketWinners, 20);
check('池子没被重复登记', c.pocketPool, poolBefore);
check('流水仍是 0', c.total, 0);

// ---------- G：内容物被用掉 = 普通礼物 → 这才是流水 ----------
scenario('G. 内容物真被用掉时是普通礼物消息 → 照旧计礼物流水');
own({ cmd: 'SEND_GIFT', data: { coin_type: 'gold', price: 1000, num: 2, uid: 9, uname: '中奖人甲', giftName: '比心' } });
c = C();
check('gold +2000 电池', c.gold, 2000);
check('本场总计 = 2 元（只算礼物）', c.total, 2);
check('红包登记不受影响（参考值 0.75）', c.pocketRef, 0.75);

// ---------- H：rp_type 分型（登记但不区分计钱） ----------
scenario('H. rp_type=2 记为上舰红包；rp_type=3 记为电池红包；都不计流水');
own(pocketStart(28760999, '丙舰长', 5000, { rp_type: 2 }));
c = C();
check('上舰红包个数 = 1', c.pocketGuardCount, 1);
check('上舰红包池子 = 5000', c.pocketGuardPool, 5000);
check('事件点名「上舰红包」', C().events.filter((e) => /上舰红包/.test(e.text)).length > 0, true);
check('流水没变（仍是 2 元）', c.total, 2);
own(pocketStart(28760998, '丁', 4000, { rp_type: 3 }));
c = C();
check('事件点名「电池红包」', c.events.filter((e) => /电池红包/.test(e.text)).length > 0, true);
check('登记个数 = 4（含前面几个）', c.pocketCount, 4);
check('流水仍是 2 元', c.total, 2);

console.log('\n' + (failed ? ('❌ 失败 ' + failed + ' 项') : '✅ 全部通过'));
process.exit(failed ? 1 : 0);
