// 「双通道配对去重」回归测试：
//   旧行为：页面通道的礼物/上舰整条丢弃 → 自有 WS 一停滞就永久漏账
//           （实测 2026-10-16 房间 22748536 五分钟，覆盖率只有 94.3%）
//   新行为：两边都登记指纹，收到对面重复的才丢，配不上就用页面通道补记
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
global.location = { pathname: '/22748536', href: '' };
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
const page = (o) => L.feed(structuredClone(o), false);   // 页面通道
const own = (o) => L.feed(structuredClone(o), true);     // 自有通道

let failed = 0;
function check(label, got, want) {
  const ok = String(got) === String(want);
  if (!ok) failed++;
  console.log('   ', ok ? 'PASS' : 'FAIL', label, '=', JSON.stringify(got), ok ? '' : ('期望 ' + JSON.stringify(want)));
}
function scenario(t) { console.log('\n== ' + t); }

const gift = (uid, uname, price, num, batch, cum) => ({
  cmd: 'SEND_GIFT_V2',
  data: Object.assign({ coin_type: 'gold', price: price, num: num, uid: uid, uname: uname, giftName: '人气票' },
    batch ? { batch_combo_id: batch, combo_total_coin: cum } : {}),
});

scenario('前置：自有 WS 就绪（否则页面通道是唯一来源，全收）');
L.setOwnReady(true);
own(gift(1, '甲', 100, 1));
check('自有通道 1 笔 → gold 100', C().gold, 100);

scenario('A. 同一笔两条通道都来 → 只记一次（旧行为保持一致）');
own(gift(2, '乙', 100, 1));
check('自有通道记入', C().gold, 200);
page(gift(2, '乙', 100, 1));
check('页面通道重复被丢弃（gold 不变）', C().gold, 200);
check('重复丢弃计数 +1', C().crossDedup, 1);
check('补记计数仍是 0', C().pageRescue, 0);

scenario('B. 自有 WS 漏收（只有页面通道有）→ 补记，不再丢钱');
page(gift(3, '丙', 5000, 1));
check('页面通道这笔被补记（gold 200+5000）', C().gold, 5200);
check('补记计数 = 1', C().pageRescue, 1);
check('事件里有丙的记录', C().events.some((e) => e.who === '丙' && /比心|人气票/.test(e.text)), true);

scenario('C. 顺序反过来：页面通道先到、自有通道后到 → 仍只记一次');
page(gift(4, '丁', 1000, 1));
check('页面先到 → 已记', C().gold, 6200);
check('补记计数 = 2', C().pageRescue, 2);
own(gift(4, '丁', 1000, 1));
check('自有通道后到不重复记', C().gold, 6200);
check('重复丢弃计数 = 2', C().crossDedup, 2);

scenario('D. 连击（带批次累计）：两条通道重复也不翻倍');
own(gift(5, '戊', 100, 1, 'batch:gift:combo_id:AAA', 100));
check('连击第 1 个 → +100', C().gold, 6300);
own(gift(5, '戊', 100, 1, 'batch:gift:combo_id:AAA', 200));
check('连击第 2 个 → +100（差额补）', C().gold, 6400);
page(gift(5, '戊', 100, 1, 'batch:gift:combo_id:AAA', 200));
check('同批次同累计的页面副本 → 丢弃', C().gold, 6400);
page(gift(5, '戊', 100, 1, 'batch:gift:combo_id:AAA', 300));
check('自有通道漏掉的第 3 个 → 页面补记 +100', C().gold, 6500);
check('补记计数 = 3', C().pageRescue, 3);

scenario('E. 同一人连送两件相同的（无批次）→ 两条都要记');
own(gift(6, '己', 100, 1));
own(gift(6, '己', 100, 1));
check('两笔都记 → +200', C().gold, 6700);
page(gift(6, '己', 100, 1));
page(gift(6, '己', 100, 1));
check('页面两份副本都被配对丢弃', C().gold, 6700);

scenario('F. 上舰：页面通道那份漏收时补记');
own({ cmd: 'GUARD_BUY', data: { guard_level: 3, num: 1, price: 198000, uid: 7, username: '庚' } });
check('自有通道记 198', C().guard, 198);
page({ cmd: 'GUARD_BUY', data: { guard_level: 3, num: 1, price: 198000, uid: 7, username: '庚' } });
check('页面通道重复 → 丢弃', C().guard, 198);
page({ cmd: 'GUARD_BUY', data: { guard_level: 3, num: 1, price: 198000, uid: 8, username: '辛' } });
check('自有通道漏收的那笔 → 补记 198', C().guard, 396);
check('上舰补记也计入 pageRescue', C().pageRescue, 4);

scenario('G. 免费礼物（银瓜子）也走配对去重，不能翻倍计数');
own({ cmd: 'SEND_GIFT', data: { coin_type: 'silver', price: 0, num: 3, uid: 9, uname: '壬', giftName: '辣条' } });
const s1 = C().silver;
page({ cmd: 'SEND_GIFT', data: { coin_type: 'silver', price: 0, num: 3, uid: 9, uname: '壬', giftName: '辣条' } });
check('免费礼物只算一次（silver 不变）', C().silver, s1);
check('silver = 3 个', s1, 3);

scenario('H. GIFT_COMBO（连击解锁提示，无金额字段）→ 只计数，不进未识别桶、不产生事件、不计钱');
const gold0 = C().gold, ev0 = C().events.length, odd0 = Object.keys(C().odd || {}).length;
own({ cmd: 'GIFT_COMBO', data: { biz_type: 1, giftId: 34500, giftName: '你真好看', super_batch_gift_num: 6, demarcation: 2, uid: 346181493, uname: '火石l' } });
page({ cmd: 'GIFT_COMBO', data: { biz_type: 1, giftId: 34500, giftName: '你真好看', super_batch_gift_num: 6, demarcation: 2, uid: 346181493, uname: '火石l' } });
c = C();
check('不计钱', c.gold - gold0, 0);
check('不产生事件', c.events.length - ev0, 0);
check('不进未识别礼物桶', Object.keys(c.odd || {}).length - odd0, 0);
check('连击提示计数 +2', c.comboMsgs, 2);

console.log('\n' + (failed ? ('❌ 失败 ' + failed + ' 项') : '✅ 全部通过'));
process.exit(failed ? 1 : 0);
