// 大航海回声去重的回归测试。
// 素材来自真实抓包（2026-10-11 房间 0 的 localStorage 账本）：
//   一笔「舰长」上舰 = 1 条 GUARD_BUY + 2 条同一个人/金币/名字对不出价目表的礼物消息。
// 修复前这三条全进账（198+138+138），贡献榜里同一个人也被记三遍。
// 这里既要证明回声被兑掉，也要证明真礼物不会被误吞。
const fs = require('fs');
const path = require('path');

const SCRIPT = path.join(__dirname, 'realtime_liushui.user.js');

// ---------- 与 test-liushui.js 相同的最小环境桩 ----------
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

// eslint-disable-next-line no-eval
(0, eval)(fs.readFileSync(SCRIPT, 'utf8'));

const L = window.__dshLiushui;
const feed = (o) => JSON.parse(JSON.stringify(o));   // 走被劫持的 JSON.parse
const C = () => L.getCounters();

let failed = 0;
function check(label, got, want) {
  const ok = String(got) === String(want);
  if (!ok) failed++;
  console.log('   ', ok ? 'PASS' : 'FAIL', label, '=', JSON.stringify(got), ok ? '' : ('期望 ' + JSON.stringify(want)));
}
function scenario(title) { console.log('\n== ' + title); }

const guard = (uid, name, lv, price) =>
  feed({ cmd: 'GUARD_BUY', data: { guard_level: lv, num: 1, price, uid, username: name } });
const echoGift = (uid, name, price, extra) =>
  feed({ cmd: 'SEND_GIFT', data: Object.assign({ coin_type: 'gold', price, num: 1, uid, uname: name }, extra || {}) });

// 真实抓包里那两条回声：没有礼物名、只有价格，所以脚本只能记成「礼物」
// 同时这是「打折舰长」：GUARD_BUY 按标价 198 报，回声 138 才是实付 → 取最小值 138
scenario('A. 真实抓包那一笔舰长（GUARD_BUY 198 标价 + 两条 138 回声 = 实付 138）');
guard(5, 'Ilanfanya', 3, 198000);
echoGift(5, 'Ilanfanya', 138000);
echoGift(5, 'Ilanfanya', 138000);
let c = C();
check('guard 只记一次、并压到实付价 138', c.guard, 138);
check('付费礼物没被加钱(电池)', c.gold, 0);
check('舰长数', c.guards['3'], 1);
check('回声去重条数', c.guardDedup, 2);
check('按回声价压价的笔数', c.guardAdjusted, 1);
check('贡献榜只有 1 个人', Object.keys(c.users).length, 1);
check('该用户贡献压到 138', c.users['5'].yuan, 138);
check('事件流只有 1 条(上舰)', c.events.length, 1);
check('事件行显示的金额也改成了 138', c.events[0].yuan, 138);

// 「一般通过鸭」那种：回声金额和标价一致 → 不压价
scenario('B. 回声金额与标价一致（真·198 舰长）');
guard(6, '一般通过鸭', 3, 198000);
echoGift(6, '一般通过鸭', 198000);
echoGift(6, '一般通过鸭', 198000);
c = C();
check('guard 累计(元)', c.guard, 138 + 198);
check('付费礼物仍然为 0', c.gold, 0);
check('回声去重条数', c.guardDedup, 4);
check('没有多算一笔压价', c.guardAdjusted, 1);
check('用户6贡献', c.users['6'].yuan, 198);

scenario('C. 提督 / 总督 同样只记一次');
guard(7, '提督丙', 2, 1998000);
echoGift(7, '提督丙', 1998000);
guard(8, '总督丁', 1, 19998000);
echoGift(8, '总督丁', 19998000);
c = C();
check('提督数', c.guards['2'], 1);
check('总督数', c.guards['1'], 1);
check('guard 累计(元)', c.guard, 138 + 198 + 1998 + 19998);
check('回声去重条数', c.guardDedup, 6);
check('这两笔没压价', c.guardAdjusted, 1);

scenario('D. 上舰后同一个人送的真礼物（有名字）必须照记、且不参与压价');
guard(9, '真礼戊', 3, 198000);
feed({ cmd: 'SEND_GIFT', data: { coin_type: 'gold', price: 5000, num: 1, giftName: '小花花', uid: 9, uname: '真礼戊' } });
c = C();
check('付费礼物(电池)', c.gold, 5000);
check('该用户贡献(上舰198+真礼物5)', c.users['9'].yuan, 198 + 5);
check('回声去重条数没变', c.guardDedup, 6);
check('没被小额真礼物压价', c.guardAdjusted, 1);

scenario('E. 别人送的同价无名礼物不能被吞');
echoGift(10, '路人己', 138000);
c = C();
check('付费礼物(电池)', c.gold, 5000 + 138000);
check('路人己被记了', c.users['10'].yuan, 138);
check('回声去重条数没变', c.guardDedup, 6);
check('也没动别人的上舰金额', c.guardAdjusted, 1);

scenario('F. 同一个人、回声价 168（2026-10-12 房间 21399689 的真实形态）');
// 真实形态：GUARD_BUY 记 198 标价，紧跟两条「礼物 ×1 168 元」。旧判据要求金额等于实付(198)
// 或档位价(138)，于是这两条被当成真礼物记进去，用户看到的就是「舰长被算了三遍」（198+168+168）。
guard(11, '怪额庚', 3, 198000);
echoGift(11, '怪额庚', 168000);
echoGift(11, '怪额庚', 168000);
c = C();
check('付费礼物没被加钱(电池)', c.gold, 5000 + 138000);
check('该用户贡献压到回声价 168', c.users['11'].yuan, 168);
check('回声去重条数 +2', c.guardDedup, 8);
check('按回声价压价笔数 +1', c.guardAdjusted, 2);

scenario('G. 上舰后的免费礼物不计钱、也不算回声');
guard(12, '免费辛', 3, 198000);
feed({ cmd: 'SEND_GIFT', data: { coin_type: 'silver', price: 100, num: 3, uid: 12, uname: '免费辛' } });
c = C();
check('免费礼物个数', c.silver, 3);
check('回声去重条数没变', c.guardDedup, 8);
check('没有回声就不压价', c.guardAdjusted, 2);

scenario('H. 回声没带 uid 时按昵称兑掉');
guard(13, '无uid壬', 3, 138000);
feed({ cmd: 'SEND_GIFT', data: { coin_type: 'gold', price: 138000, num: 1, uname: '无uid壬' } });
c = C();
check('回声去重条数', c.guardDedup, 9);
check('付费礼物没被加钱(电池)', c.gold, 5000 + 138000);
check('金额与标价相同 → 不压价', c.guardAdjusted, 2);

scenario('I. 用真实抓包序列原样回放（4 笔舰长 + 8 条回声）');
// 下面是 2026-10-11 从 Edge localStorage 账本里挖出来的真实事件（时间戳原样）：
//   舰长 ×1 ¥198 -> 两条礼物 ×1 ¥138（间隔 9ms / 15ms）
//   舰长 ×1 ¥198 -> 两条礼物 ×1 ¥138（间隔 24ms / 197ms）
//   舰长 ×1 ¥198 -> 两条礼物 ×1 ¥198（间隔 20ms / 22ms）
//   舰长 ×1 ¥198 -> 两条礼物 ×1 ¥138（间隔 2ms / 19ms）
// 按「取最小值」：三条 138、一条真 198 → 合计 3×138 + 198 = 612
const real = [
  [14, 'Ilanfanya', 198000, [138000, 138000]],
  [15, '泡沫の梦_', 198000, [138000, 138000]],
  [16, '一般通过鸭', 198000, [198000, 198000]],
  [17, '清楚人Official', 198000, [138000, 138000]],
];
real.forEach(([uid, name, price, echoes]) => {
  guard(uid, name, 3, price);
  echoes.forEach((p) => echoGift(uid, name, p));
});
c = C();
check('这 4 笔合计 = 3×138 + 1×198', c.guard, 138 * 3 + 198 + 23034);
check('回声一条都没进付费礼物', c.gold, 143000);
check('回声去重条数', c.guardDedup, 9 + 8);
check('压价笔数 +3（那三笔 138 的）', c.guardAdjusted, 2 + 3);
// 注意：A 场景和这里用的是同名（真实抓包里的同一个人），新规则按「同名 = 一行」合并，
// 所以这里要断言合并后的总额，而不是各自 138。
const byName = (n) => { const k = Object.keys(c.users).find((x) => c.users[x].name === n); return k ? +c.users[k].yuan.toFixed(2) : null; };
check('Ilanfanya 合并为 138(A) + 138(I)', byName('Ilanfanya'), 276);
check('泡沫の梦_ 贡献 138', byName('泡沫の梦_'), 138);
check('一般通过鸭 合并为 198(B) + 198(I)', byName('一般通过鸭'), 396);
check('清楚人Official 贡献 138', byName('清楚人Official'), 138);
check('同名只占一行', Object.keys(c.users).filter((k) => c.users[k].name === 'Ilanfanya').length, 1);

scenario('J. 同一个人不得因「带不带 uid」在贡献榜里占两行');
// 先来一条没有 uid 的小礼物（按昵称建键），再来一条带 uid 的、以及反过来，
// 都必须收敛到同一个键 —— 实测线上出现过 No_fscet = 33585157:198 + No_fscet:0.9 两条。
feed({ cmd: 'SEND_GIFT', data: { coin_type: 'gold', price: 100, num: 1, giftName: '粉丝团灯牌', uname: '双键人' } });
guard(21, '双键人', 3, 198000);
feed({ cmd: 'SEND_GIFT', data: { coin_type: 'gold', price: 900, num: 1, giftName: '粉丝团灯牌', uid: 21, uname: '双键人' } });
feed({ cmd: 'SEND_GIFT', data: { coin_type: 'gold', price: 200, num: 1, giftName: '粉丝团灯牌', uname: '双键人' } });
c = C();
check('双键人只占一行', Object.keys(c.users).filter((k) => c.users[k].name === '双键人').length, 1);
check('双键人合计 = 0.1 + 198 + 0.9 + 0.2', c.users[Object.keys(c.users).find((k) => c.users[k].name === '双键人')].yuan.toFixed(1), '199.2');
check('键保持为最初那个（不做搬迁、不会凭空多一条）', Object.keys(c.users).includes('21'), false);

scenario('K. V2 的「一次送 N 个」必须算 N 个（100×人气票）');
// 按官方 .proto 拼一条真实形状的 SendGiftV2：
//   SendGiftV2 { uid=1 uname=2 gift_list=10 }
//   GiftItem   { gift_id=1 gift_name=2 num=3 price=5 total_coin=7 coin_type=8 }
// 旧实现把 pb 拍平后写死 num=1，于是 100 个人气票被记成 1 个（差 100 倍）。
window.__dshLiushui.setGiftTable({ 35535: { name: '人气票', price: 100 } }, { '人气票': 100 });
const vint = (n) => { const o = []; do { let b = n & 0x7f; n = Math.floor(n / 128); if (n) b |= 0x80; o.push(b); } while (n); return o; };
const t = (f, w) => vint(f * 8 + w);
const u8 = (s) => [...Buffer.from(s, 'utf8')];
const ld = (f, b) => [...t(f, 2), ...vint(b.length), ...b];
const item = [
  ...t(1, 0), ...vint(35535),
  ...ld(2, u8('人气票')),
  ...t(3, 0), ...vint(100),        // num = 100
  ...t(5, 0), ...vint(100),        // price = 100 电池
  ...t(7, 0), ...vint(10000),      // total_coin = 10000 电池
  ...ld(8, u8('gold'))
];
const top = [...t(1, 0), ...vint(777), ...ld(2, u8('整百人')), ...ld(10, item)];
feed({ cmd: 'SEND_GIFT_V2', data: { pb: Buffer.from(Uint8Array.from(top)).toString('base64') } });
c = C();
let ev2 = c.events[c.events.length - 1];
check('事件文案是 ×100', ev2.text, '人气票 ×100');
check('金额 = 100 × 100 电池 = 10 元', ev2.yuan, 10);
check('送礼人取自结构化字段', ev2.who, '整百人');
check('该用户贡献 10 元', Object.keys(c.users).map((k) => c.users[k]).find((u) => u.name === '整百人').yuan, 10);

scenario('L. 那个可疑的 field7（房间级计数器）绝不能被当成金额');
// 实测：真实报文里 f7=1725515，而且不同人拿到同一个大数 → 它是房间级计数器，不是本条实付。
// 早一版我用它做「算不出价时」的兜底，会把 0.1 元的礼物记成上千元 —— 这里钉住这个护栏。
const item2 = [
  ...t(1, 0), ...vint(99999),
  ...ld(2, u8('没上价目表的礼物')),
  ...t(3, 0), ...vint(1),
  ...t(5, 0), ...vint(0),
  ...t(7, 0), ...vint(1725515)
];
const top2 = [...t(1, 0), ...vint(778), ...ld(2, u8('计数器')), ...ld(10, item2)];
feed({ cmd: 'SEND_GIFT_V2', data: { pb: Buffer.from(Uint8Array.from(top2)).toString('base64') } });
c = C();
let ev3 = c.events[c.events.length - 1];
check('没有把 f7 当金额', ev3.yuan, 0);
check('记为未对上价目表 / 金额未识别', /未对上价目表|未识别/.test(ev3.text), true);

scenario('M. 批次累计：同一批只补差额；除以单价不整除的大数不认');
window.__dshLiushui.setGiftTable({ 34001: { name: '粉丝团灯牌', price: 100 } }, { '粉丝团灯牌': 100 });
const batchId = 'batch:gift:combo_id:1:2:3';
const mkBatch = (n, cum) => {
  const it = [
    ...t(1, 0), ...vint(34001),
    ...ld(2, u8('粉丝团灯牌')),
    ...t(3, 0), ...vint(n),
    ...t(5, 0), ...vint(100),
    ...t(14, 0), ...vint(cum),
    ...ld(12, u8(batchId))
  ];
  return Buffer.from(Uint8Array.from([...t(1, 0), ...vint(779), ...ld(2, u8('连击人')), ...ld(10, it)])).toString('base64');
};
let gold0 = C().gold;
feed({ cmd: 'SEND_GIFT_V2', data: { pb: mkBatch(10, 1000) } });
check('第一批 cum=1000 → 记 1000 电池', C().gold - gold0, 1000);
feed({ cmd: 'SEND_GIFT_V2', data: { pb: mkBatch(10, 3000) } });
check('同一批累计到 3000 → 只补 2000', C().gold - gold0, 3000);
feed({ cmd: 'SEND_GIFT_V2', data: { pb: mkBatch(10, 927248) } });
check('不整除的假 cum 不认 → 退回 price×个数', C().gold - gold0, 4000);

scenario('汇总');
c = C();
const total = (c.gold / 1000) + c.sc + c.guard;
check('guard 合计(元)', c.guard, 138 + 198 + 1998 + 19998 + 198 + 168 + 198 + 138 + 612 + 198);
check('guards', JSON.stringify(c.guards), JSON.stringify({ 1: 1, 2: 1, 3: 11 }));
check('付费礼物(元)', c.gold / 1000, 158.2);
check('本场总计(元)', total, 158.2 + 23844);
check('贡献榜人数', Object.keys(c.users).length, 14);
check('回声去重总数', c.guardDedup, 17);
check('压价总数', c.guardAdjusted, 5);

scenario('N. 回声比上舰先到（反向顺序）必须回并，不能漏成礼物');
// 实测过同一秒内「先礼物、后 GUARD_BUY」的报文；旧的前向去重看不到它，那笔 198 就一直算在付费礼物里。
let nGold = C().gold, nGuard = C().guard, nDedup = C().guardDedup;
echoGift(41, '反向人', 138000);
check('先按礼物记下了', C().gold - nGold, 138000);
guard(41, '反向人', 3, 198000);
c = C();
check('回声被并回上舰 → 付费礼物清掉', c.gold - nGold, 0);
check('上舰被压到回声价 138', c.guard - nGuard, 138);
check('去重计数 +1', c.guardDedup - nDedup, 1);
check('事件行标成反向顺序', c.events.some((e) => e.text.indexOf('反向顺序') >= 0), true);

scenario('O. 两条回声两个价：只认第一条（168），后面的 138 不许再往下压');
// 2026-10-12 实测：佛莉蝶儿那笔两条回声 168/138，官方榜单证明实付 168。
guard(42, '两价人', 3, 198000);
echoGift(42, '两价人', 168000);
echoGift(42, '两价人', 138000);
c = C();
check('最终价 = 第一条回声 168', c.users['42'].yuan, 168);

scenario('P. 赠送 / 活动舰长：官方榜单不承认就撤账');
const H = window.__dshLiushui;
H.setGuardVerifyMs(0);
H.setRank([{ name: '赠送人', score: 0, guard: 3 }], 'OK · test');
let pGuard = C().guard, pPromo = C().guardPromo || 0;
guard(51, '赠送人', 3, 198000);
check('先按 198 挂上（待核）', C().guard - pGuard, 198);
H.verifyPendingGuards();
check('官方无对应贡献 → 撤账', C().guard - pGuard, 0);
check('撤账计数 +1', C().guardPromo - pPromo, 1);
check('事件行标成未计入', C().events.some((e) => e.text.indexOf('未计入') >= 0), true);

scenario('Q. 真付了钱的照样留（官方承认）');
H.setRank([{ name: '真付人', score: 0, guard: 3 }], 'OK · test');
let qGuard = C().guard;
guard(52, '真付人', 3, 198000);
H.setRank([{ name: '真付人', score: 1980, guard: 3 }], 'OK · test');   // 官方贡献值涨了 1980 = 198 元
H.verifyPendingGuards();
check('官方承认 → 这笔留着', C().guard - qGuard, 198);

(async () => {
  scenario('R. 落盘不许被配额撑爆，也不许静默失败');
  // 实测事故：热闹房间连开几小时后 combo/users 无限增长 → setItem 抛错被静默吞掉 →
  // 下次加载读到截断 JSON 当坏数据删掉 → 账本「凭空消失」。这里钉住裁剪与失败可见性。
  const rawStore = global.localStorage;
  H.clearAll();
  for (let i = 0; i < 1200; i++) {    // 灌 1200 个用户，远超 300 的上限
    feed({ cmd: 'SEND_GIFT', data: { coin_type: 'gold', price: 100, num: 1, giftName: '粉丝团灯牌', uid: 900000 + i, uname: '灌水' + i } });
  }
  await new Promise((r) => setTimeout(r, 1500));     // 等 save() 的 800ms 去抖
  const raw = rawStore.getItem('dsh_bili_liushui_1972368500') || '';
  const parsed = raw ? JSON.parse(raw) : { users: {}, gold: 0 };
  check('确实落盘了（不再静默失败）', raw.length > 0, true);
  check('体积被裁到合理范围（< 400KB）', raw.length < 400000, true);
  check('用户数被裁到上限内', Object.keys(parsed.users).length <= 300, true);
  check('裁剪不影响总量', parsed.gold >= 120000, true);

  const realSet = rawStore.setItem;
  rawStore.setItem = () => { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; };
  feed({ cmd: 'SEND_GIFT', data: { coin_type: 'gold', price: 100, num: 1, giftName: '粉丝团灯牌', uid: 999999, uname: '配额人' } });
  await new Promise((r) => setTimeout(r, 1500));
  rawStore.setItem = realSet;
  check('配额失败会暴露出来（不再静默）', /保存失败/.test(String(C().saveErr || '')), true);

  scenario('S. SC（醒目留言）：整笔漏掉、重复计入、撤回、未知金钱消息');
  const sc0 = C().sc;
  // ① 主消息那次没收到，只剩日文重发 —— 旧代码只认 SUPER_CHAT_MESSAGE，这一笔就整笔漏掉
  feed({ cmd: 'SUPER_CHAT_MESSAGE_JPN', data: { id: 9001, price: 30, message: '日文重发', user_info: { uname: 'SC甲', uid: 61 } } });
  check('只收到 _JPN 也要记账', C().sc - sc0, 30);
  // ② 主消息随后补到 —— 同一笔不能记两遍
  feed({ cmd: 'SUPER_CHAT_MESSAGE', data: { id: 9001, price: 30, message: '原文', user_info: { uname: 'SC甲', uid: 61 } } });
  check('同一 id 的主消息 + _JPN 只记一次', C().sc - sc0, 30);
  // ③ 自己通道就绪时，网页端的 SC 依旧要记（两条通道互为备份）
  H.setOwnReady(true);
  feed({ cmd: 'SUPER_CHAT_MESSAGE', data: { id: 9002, price: 100, message: 'B', user_info: { uname: 'SC乙', uid: 62 } } });
  check('自己通道就绪时网页端 SC 仍记账', C().sc - sc0, 130);
  H.feed({ cmd: 'SUPER_CHAT_MESSAGE', data: { id: 9002, price: 100, message: 'B', user_info: { uname: 'SC乙', uid: 62 } } }, true);
  check('两条通道都收到也只记一次', C().sc - sc0, 130);
  H.setOwnReady(false);
  // ④ 撤回 / 退款要撤账
  feed({ cmd: 'SUPER_CHAT_MESSAGE_DELETE', data: { id: 9002, user_info: { uname: 'SC乙' } } });
  check('SC 撤回后金额撤回', C().sc - sc0, 30);
  // ⑤ 不认识的金钱消息要留痕，不许再静默消失
  feed({ cmd: 'SUPER_CHAT_ENTRANCE', data: { price: 50, user_info: { uname: 'SC丙' } } });
  check('未知金钱消息被留档', Object.keys(C().oddMoney || {}).length > 0, true);
  // ⑥ 「收到多少条礼物」与「记了多少条」必须能分开看（两条通道各自计数）
  //    v2.8.15 起不再是「页面通道整条丢」，而是**配对去重**：
  //    自有通道记过同一笔就丢（不翻倍），自有通道漏收的就补记（不漏账）。
  H.setOwnReady(true);
  const gOwn0 = C().giftOwn || 0, gPage0 = C().giftPage || 0, gm0 = C().giftMsgs;
  const gold0 = C().gold, rescue0 = C().pageRescue || 0, cd0 = C().crossDedup || 0;
  H.feed({ cmd: 'SEND_GIFT', data: { coin_type: 'gold', price: 100, num: 1, giftName: '粉丝团灯牌', uid: 71, uname: '礼物甲' } }, true);
  H.feed({ cmd: 'SEND_GIFT', data: { coin_type: 'gold', price: 100, num: 1, giftName: '粉丝团灯牌', uid: 71, uname: '礼物甲' } }, false);
  c = C();
  check('独立通道的礼物被记一笔', (c.giftOwn || 0) - gOwn0, 1);
  check('网页端那份是同一笔 → 配对后丢弃，不翻倍', c.gold - gold0, 100);
  check('配对丢弃计数 +1', (c.crossDedup || 0) - cd0, 1);
  check('补记计数不变（这不是漏收）', (c.pageRescue || 0) - rescue0, 0);
  // 自有通道漏收的那一笔（另一个 uid）→ 页面通道必须补记
  H.feed({ cmd: 'SEND_GIFT', data: { coin_type: 'gold', price: 100, num: 1, giftName: '粉丝团灯牌', uid: 72, uname: '礼物乙' } }, false);
  c = C();
  check('自有通道漏收的那笔由网页端补记（+100）', c.gold - gold0, 200);
  check('补记计数 +1', (c.pageRescue || 0) - rescue0, 1);
  check('礼物消息总数 +3（自有 1 + 网页端 2，都算「收到」）', c.giftMsgs - gm0, 3);

  // ⑦ 实测：三笔 SC 全被记成 2 元（B站最低 30 元）。主消息比日文重发完整，
  //    同一笔后到的那条价更高时要把差额补上，而不是重复计或漏掉。
  const scU0 = C().sc;
  feed({ cmd: 'SUPER_CHAT_MESSAGE_JPN', data: { id: 9100, price: 2, message: 'x', user_info: { uname: 'SC升级', uid: 91 } } });
  check('先按 2 元记', C().sc - scU0, 2);
  H.feed({ cmd: 'SUPER_CHAT_MESSAGE', data: { id: 9100, price: 30, message: 'x', user_info: { uname: 'SC升级', uid: 91 } } }, true);
  check('更高价到达 → 补到 30（不是 32）', C().sc - scU0, 30);
  check('升级计数 +1', C().scUpgraded > 0, true);

  console.log(failed ? ('\nFAIL: ' + failed + ' 项不一致') : '\nPASS: 全部通过（含三个残差 + 落盘健壮性 + SC 漏账的回归）');
  process.exit(failed ? 1 : 0);
})();
