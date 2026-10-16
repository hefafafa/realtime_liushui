// 回归测试：SEND_GIFT_V2 的 pb 里「挑哪一条 GiftItem 节点」——粉丝牌子消息冒充礼物条目的坑。
// 真实素材：2026-10-13 房间 1972368500
//   22:10:36  人气票 num=100（10 元）—— 报文顶层 #8 是粉丝牌（#1=主播uid, #5=粉丝牌等级33, #6="帕清姬"），
//             它在字段顺序上排在真正的礼物 #10 前面，旧的「取第一个」把它当成礼物 → 记成 ×1（0.1 元），少记 9.9 元。
//   23:00:59  粉丝团灯牌 num=1（0.1 元）—— 对照，不许因为打分改动而记错。
const fs = require('fs');
const path = require('path');
const SCRIPT = path.join(__dirname, 'realtime_liushui.user.js');
const P = {  // 真实报文载荷（内联，测试自包含；原本从 payloads.json 读）
  num100: "EgbnkIYqKioaSmh0dHBzOi8vaTEuaGRzbGIuY29tL2Jmcy9mYWNlLzRiMTNmYTNmN2Q0ODM5Nzk5ZjQ5N2E2YjNjNDU2ODE2NTJiZDE3MWYuanBnQicIu7i4vwEoITIJ5biV5riF5aesOKOI6ANAwIGDBkjAgYMGUMCBgwZSkgUIxIkCEgnkurrmsJTnpagYZCABKGQwZDiQTkIEZ29sZEoTNDgyNzQ2MDIwNDA5NjYyOTc2MFDZ97jWBlgBYltiYXRjaDpnaWZ0OmNvbWJvX2lkOjljYzhhMTQwNzY0MDE2NDk0ZTA5Y2QwNmI1ZDM4ZDJiOjM1NDY2NzE2Mjk3MzIxMDM6MzM5ODg6MTc5MTkwMDYzMy41NzU2aApwkE54BYUBAACAP4gBAZIBBuaKleWWgsABtYg/6gEVCgrmgbbprLxyb3JvEIeSgLXdtaYGigLLAQiHkoC13bWmBhK/AQoK5oG26ay8cm9ybxJKaHR0cHM6Ly9pMi5oZHNsYi5jb20vYmZzL2ZhY2UvM2Q1MGEzYTVkY2ExNTUxZWM2NTYzNTdmNzNhMjJjYmY1OTU5ZjM5NS5qcGcyWAoK5oG26ay8cm9ybxJKaHR0cHM6Ly9pMi5oZHNsYi5jb20vYmZzL2ZhY2UvM2Q1MGEzYTVkY2ExNTUxZWM2NTYzNTdmNzNhMjJjYmY1OTU5ZjM5NS5qcGc6CyD///////////8BkgICEAKaAuUBCkpodHRwczovL3MxLmhkc2xiLmNvbS9iZnMvbGl2ZS83ZDc4NjQ2ZWU0ZWNjOTAwY2ViYmU0NmNiOTYzZjQyMTA3OTU0OGYwLnBuZxJLaHR0cHM6Ly9pMC5oZHNsYi5jb20vYmZzL2xpdmUvNGQ1MjE1ZGE0N2QyNWIzZGI3ODdkMmJhNTQ0OTAxNmVlMTQyZGM4MC53ZWJwKkpodHRwczovL2kwLmhkc2xiLmNvbS9iZnMvbGl2ZS83MGQ5MmFmMGE4MzdhZTY2ZTI1ZjIzNDkzYTU2ZTE2OTBmNzZlYmJhLmdpZqoCAggCWAFqAggbeqACErcBCgbnkIYqKioSSmh0dHBzOi8vaTEuaGRzbGIuY29tL2Jmcy9mYWNlLzRiMTNmYTNmN2Q0ODM5Nzk5ZjQ5N2E2YjNjNDU2ODE2NTJiZDE3MWYuanBnMlQKBueQhioqKhJKaHR0cHM6Ly9pMS5oZHNsYi5jb20vYmZzL2ZhY2UvNGIxM2ZhM2Y3ZDQ4Mzk3OTlmNDk3YTZiM2M0NTY4MTY1MmJkMTcxZi5qcGc6CyD///////////8BGmQKCeW4lea4heWnrBAhGMCBgwYgwIGDBijAgYMGMKOI6ANQu7i4vwFghvEDegkjOTE5Mjk4Q0OCAQkjOTE5Mjk4Q0OKAQkjOTE5Mjk4Q0OSAQcjRkZGRkZGmgEJIzkxOTI5OEU2",
  lamp: "EgbmiacqKioaSmh0dHBzOi8vaTAuaGRzbGIuY29tL2Jmcy9mYWNlL2IzMmUwNzhiYmZjMzg1Y2U2YmUwMzEwMTMwODhiMDU2NWUyM2NmYjcuanBnQgBSrQUIvPMBEg/nsonkuJ3lm6Lnga/niYwYASABKGQwZDhkQgRnb2xkShM0ODI3NDcyODg0NTI2MTMzMjQ4UKiPudYGWAFiW2JhdGNoOmdpZnQ6Y29tYm9faWQ6Njk3ZjhlMjI0NTVjMTYwMTExNDI5OTE3YTE2MDM5ODg6MzU0NjY3MTYyOTczMjEwMzozMTE2NDoxNzkxOTAzNjU2LjgyMjJoCnBkeAWFAQAAgD+IAQGSAQbmipXlloLAAareQOoBFQoK5oG26ay8cm9ybxCHkoC13bWmBooCywEIh5KAtd21pgYSvwEKCuaBtumsvHJvcm8SSmh0dHBzOi8vaTIuaGRzbGIuY29tL2Jmcy9mYWNlLzNkNTBhM2E1ZGNhMTU1MWVjNjU2MzU3ZjczYTIyY2JmNTk1OWYzOTUuanBnMlgKCuaBtumsvHJvcm8SSmh0dHBzOi8vaTIuaGRzbGIuY29tL2Jmcy9mYWNlLzNkNTBhM2E1ZGNhMTU1MWVjNjU2MzU3ZjczYTIyY2JmNTk1OWYzOTUuanBnOgsg////////////AZICBwiM4NcCEAGaAuUBCkpodHRwczovL3MxLmhkc2xiLmNvbS9iZnMvbGl2ZS9lMDUxZGZkNDU1NzY3OGY4ZWRjYWM0OTkzZWQwMGEwOTM1Y2JkOWNjLnBuZxJLaHR0cHM6Ly9pMC5oZHNsYi5jb20vYmZzL2xpdmUvMzJiNzk5MTIwZTE2MTRmYTYyNzViNmQxNWRhN2E1MmIyMWRkMDE5ZC53ZWJwKkpodHRwczovL2kwLmhkc2xiLmNvbS9iZnMvbGl2ZS84MTZmOGI3YWEyMTMyODg4ZmNlOTI4Y2RmYjE3YjljZjIxY2MwODIzLmdpZqoCFAgBEgcI9bfwAhACEgcIjODXAhABWAFqAggMeroBErcBCgbmiacqKioSSmh0dHBzOi8vaTAuaGRzbGIuY29tL2Jmcy9mYWNlL2IzMmUwNzhiYmZjMzg1Y2U2YmUwMzEwMTMwODhiMDU2NWUyM2NmYjcuanBnMlQKBuaJpyoqKhJKaHR0cHM6Ly9pMC5oZHNsYi5jb20vYmZzL2ZhY2UvYjMyZTA3OGJiZmMzODVjZTZiZTAzMTAxMzA4OGIwNTY1ZTIzY2ZiNy5qcGc6CyD///////////8B"
};

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
function boot() {                       // 起一个干净的环境（同一进程里可以起多个）
  window.__dshLiushui = null;
  (0, eval)(fs.readFileSync(SCRIPT, 'utf8'));
  const lib = window.__dshLiushui;
  lib.setGiftTable({ 33988: { name: '人气票', price: 100 }, 31018: { name: '粉丝团灯牌', price: 100 } },
    { 人气票: 100, 粉丝团灯牌: 100 });
  return lib;
}
const L = boot();

let failed = 0;
function check(label, got, want) {
  const ok = String(got) === String(want);
  if (!ok) failed++;
  console.log('   ', ok ? 'PASS' : 'FAIL', label, '=', JSON.stringify(got), ok ? '' : ('期望 ' + JSON.stringify(want)));
}
function scenario(t) { console.log('\n== ' + t); }

// ---------- A：真实报文，粉丝牌在礼物前面 ----------
scenario('A. 真实报文 22:10:36（顶层 #8 粉丝牌 排在 #10 礼物前面）');
let dec = L.decodeGiftProto({ pb: P.num100 });
check('礼物名', dec && dec.name, '人气票');
check('单价', dec && dec.price, 100);
check('个数（旧版这里读成 1）', dec && dec.num, 100);
check('是标准位置的礼物节点（by=名字）', dec && dec.by, '名字');

// ---------- B：这条报文记账后必须是 10 元 ----------
scenario('B. 记账：人气票 ×100 → 10000 电池（10 元）');
L.feed({ cmd: 'SEND_GIFT_V2', data: { dmscore: 0, pb: P.num100 } }, true);
let c = L.getCounters();
check('gold = 10000 电池', c.gold, 10000);
check('本场总计 = 10 元', c.total, 10);
const ev = c.events.filter((e) => /人气票/.test(e.text || ''));
check('事件文案 ×100', ev.length ? ev[ev.length - 1].text : '(无)', '人气票 ×100');
check('事件金额 10 元', ev.length ? ev[ev.length - 1].yuan : '(无)', 10);

// ---------- C：对照 —— 真实的 ×1 报文不能被打分逻辑带偏 ----------
scenario('C. 对照：23:00:59 粉丝团灯牌 ×1 → 0.1 元');
const dec2 = L.decodeGiftProto({ pb: P.lamp });
check('礼物名', dec2 && dec2.name, '粉丝团灯牌');
check('个数仍是 1', dec2 && dec2.num, 1);
L.feed({ cmd: 'SEND_GIFT_V2', data: { dmscore: 0, pb: P.lamp } }, true);
c = L.getCounters();
check('gold = 10100 电池', c.gold, 10100);
check('总计 = 10.1 元', c.total, 10.1);

// ---------- D：合成的「粉丝牌陷阱」—— 粉丝牌节点 + 礼物节点 ----------
scenario('D. 合成报文：粉丝牌(#8) 在前、礼物(#10, num=10) 在后 → 必须取礼物');
function varint(n) { const out = []; let v = n; while (v > 127) { out.push((v & 0x7f) | 0x80); v = Math.floor(v / 128); } out.push(v); return Buffer.from(out); }
function tag(f, w) { return varint(f * 8 + w); }
function vField(f, n) { return Buffer.concat([tag(f, 0), varint(n)]); }
function sField(f, s) { const b = Buffer.from(String(s), 'utf8'); return Buffer.concat([tag(f, 2), varint(b.length), b]); }
const medal = Buffer.concat([vField(1, 401480763), vField(5, 33), sField(6, '帕清姬'), vField(7, 7996451)]);
const gift = Buffer.concat([vField(1, 33988), sField(2, '人气票'), vField(3, 10), vField(5, 100),
  sField(8, 'gold'), sField(9, '4827460204096629760'), sField(12, 'batch:gift:combo_id:TEST'), vField(14, 1000)]);
const synth = Buffer.concat([sField(2, '测试用户'), sField(8, '').slice(0, 0), tag(8, 2), varint(medal.length), medal,
  tag(10, 2), varint(gift.length), gift]);
const dec3 = L.decodeGiftProto({ pb: synth.toString('base64') });
check('礼物名', dec3 && dec3.name, '人气票');
check('个数取的是礼物节点的 10（不是粉丝牌默认的 1）', dec3 && dec3.num, 10);
const before = L.getCounters().gold;
L.feed({ cmd: 'SEND_GIFT_V2', data: { pb: synth.toString('base64') } }, true);
check('gold +1000 电池（10 个 × 100）', L.getCounters().gold - before, 1000);

// ---------- E：回归 —— 同一份报文被同一条通道重复投递，只许记一次 ----------
// 用户 2026-10-14 报的问题：面板上成对出现「人气票 ×1」和「人气票 ×1（金额未识别）」。
// 页面钩子把同一份 JSON 解两遍 / 断线补发时，第二份在跨通道配对里找不到对手，
// 于是被当成「自有通道漏了这笔」又记一次，留下的就是那条幻影行。真实报文带 batch id，
// 同一批次的累计量没变 → 第二份必须整条丢掉。
scenario('E. 真实报文 22:10:36 连喂两次（同通道重复投递）→ 只记一次、不留幻影行');
{
  const E = boot();                     // 干净环境：前面的场景已经把这条批次记过一次了
  E.feed({ cmd: 'SEND_GIFT_V2', data: { dmscore: 0, pb: P.num100 } }, true);
  const gold1 = E.getCounters().gold, ev1 = E.getCounters().events.length;
  E.feed({ cmd: 'SEND_GIFT_V2', data: { dmscore: 0, pb: P.num100 } }, true);
  const c2 = E.getCounters();
  check('第一份进账 10000 电池', gold1, 10000);
  check('第二份一份钱都不加', c2.gold, 10000);
  check('事件流只有 1 条', c2.events.length, 1);
  check('那一行是正常金额（不是「金额未识别」）', c2.events[0].text, '人气票 ×100');
  check('本场总计里没有幻影 0 元行',
    c2.events.filter((e) => /未识别/.test(e.text || '')).length, 0);
}

// ---------- F：两条**不同**的报文不许被误合 ----------
// 修复去重时必须守住这条：同一条连击里累计量涨了 → 第 2 条是**真消息**，
// 必须进账（补差额），不能被「指纹相同」当成重复吞掉。
scenario('F. 同一批次累计量从 100 个涨到 200 个 → 两笔都记（第 2 笔只补差额）');
{
  const F = boot();
  const raw100 = Buffer.from(P.num100, 'base64');
  // 行 1616 附近的 pbFields 里，批次累计 comboTotalCoin 是 #14、消息时间戳是 #13（见 #11 实测）
  function varint2(n) { const out = []; let v = n; while (v > 127) { out.push((v & 0x7f) | 0x80); v = Math.floor(v / 128); } out.push(v); return Buffer.from(out); }
  function tag2(f, w) { return varint2(f * 8 + w); }
  function vField2(f, n) { return Buffer.concat([tag2(f, 0), varint2(n)]); }
  // 把 pb 里第一个出现的 10000（= #14 批次累计）换成 20000，模拟连击第 2 条
  const head = raw100.indexOf(Buffer.from([0x70, 0x90, 0x4e]));   // tag(14,varint) + varint(10000)
  const raw200 = head < 0 ? null
    : Buffer.concat([raw100.slice(0, head), vField2(14, 20000),
      raw100.slice(head + 3).subarray(raw100.slice(head + 3).indexOf(1) >= 0 ? 0 : 0)]);
  const dec1 = F.decodeGiftProto({ pb: P.num100 });
  const dec2 = raw200 ? F.decodeGiftProto({ pb: raw200.toString('base64') }) : null;
  check('第 1 份累计量 10000', dec1 && dec1.v2raw && dec1.v2raw.comboTotalCoin, 10000);
  check('第 2 份累计量 20000（报文确实不同）', dec2 && dec2.v2raw && dec2.v2raw.comboTotalCoin, 20000);
  const before = F.getCounters().gold;
  F.feed({ cmd: 'SEND_GIFT_V2', data: { dmscore: 0, pb: P.num100 } }, true);
  F.feed({ cmd: 'SEND_GIFT_V2', data: { dmscore: 0, pb: raw200.toString('base64') } }, true);
  check('两笔都记 = 20000 电池', F.getCounters().gold - before, 20000);
  check('事件流 2 条（第 2 条不是「金额未识别」）',
    JSON.stringify(F.getCounters().events.map((e) => e.text)), JSON.stringify(['人气票 ×100', '人气票 ×100']));
  // 再喂一遍第 2 份 → 这次是重复投递，必须不加钱
  F.feed({ cmd: 'SEND_GIFT_V2', data: { dmscore: 0, pb: raw200.toString('base64') } }, true);
  check('第 2 份重复投递不再加钱', F.getCounters().gold - before, 20000);
}

console.log('\n' + (failed ? ('❌ 失败 ' + failed + ' 项') : '✅ 全部通过'));
process.exit(failed ? 1 : 0);
