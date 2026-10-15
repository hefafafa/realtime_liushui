// ==UserScript==
// @name         realtime_liushui
// @name:zh-CN   B站直播 · 本场流水看板
// @namespace    realtime-liushui
// @version      2.8.25
// @copyright    2026, local（MIT：随便用、随便改，出事不负责）
// @description  仅用于 bilibili 直播间（live.bilibili.com）：实时统计本场流水 —— 付费礼物 / 超级留言(SC) / 大航海，并读取官方高能榜贡献值，含贡献榜、事件流、支持「抽成后流水」与 CSV 导出
// @author       local
// @license      MIT
// @match        https://live.bilibili.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ---------------------------------------------------------------------------
// 下面两行指向本脚本的托管地址，Tampermonkey 据此自动检查更新；
// 地址需为 https 且以 .user.js 结尾。
// @updateURL    https://raw.githubusercontent.com/hefafafa/realtime_liushui/main/realtime_liushui.user.js
// @downloadURL  https://raw.githubusercontent.com/hefafafa/realtime_liushui/main/realtime_liushui.user.js
// 每次改动都要递增 @version，否则 Tampermonkey 不认为有更新。
// 主页 / 支持地址（可选）：
// @homepageURL  https://github.com/hefafafa/realtime_liushui
// @supportURL   https://github.com/hefafafa/realtime_liushui/issues
// 在 GreasyFork 发布时声明作者受益项（打赏属于此类）：
// @antifeature  donation
// ==/UserScript==

/*
 * B站直播 · 本场流水看板（Tampermonkey 用户脚本）
 *
 * 怎么拿到数据（三条通道互为备份）：
 *   ① 页面钩子：document-start 劫持 JSON.parse，抄一份页面自己解析出的直播间消息；
 *   ② 独立 WebSocket：偷页面握手参数自己再连一条（抓不到就退而调官方 getDanmuInfo），
 *      protover=2 用 zlib、3 用 brotli 解 —— **钱主要靠这条记**；
 *   ③ 官方高能榜接口 getOnlineGoldRank：纯 HTTP，前两条都拿不到时兜底。
 *   money 消息两条通道都收，按「指纹」配对去重（优先 batch_combo_id + 批次累计，
 *   否则 用户+礼物+个数+单价），配不上就用另一条通道补记 —— 既不翻倍，也不漏账。
 *
 * 口径：1000 电池（旧称金瓜子）= 1 元；红包不计入流水（只有内容物被用掉才算礼物）；
 *       免费礼物只计数；大航海的「回声」报文去重后只算一次。
 * 隐私：只在本机读写 localStorage 自己的数据；只向 B站接口取数，切日元时另取一次汇率。
 *
 * 只在本机读写自己的数据；不加载远程代码，也不上报任何统计。
 * 联系与打赏入口由 FEEDBACK_URL / FEEDBACK_EMAIL / DONATE_QR_* / DONATE_URL 控制，留空即不显示。
 */

(function () {
  'use strict';

  // 必须在劫持之前存下来：自己解包时用它，免得绕回被劫持的 JSON.parse 重复记账
  var origParse = JSON.parse;

  var GOLD_PER_YUAN = 1000;                          // 1000 电池 = 1 元
  var TTL_MS = 24 * 60 * 60 * 1000;                  // 本场数据保留 24h
  var GUARD_NAME = { 1: '总督', 2: '提督', 3: '舰长' };
  var GUARD_DEFAULT_PRICE = { 1: 19998000, 2: 1998000, 3: 138000 };  // 电池

  var SCRIPT_VERSION = '2.8.25';                     // 与头部 @version 一致；自检窗首行显示，方便用户报版本

  // ---------------- 作者联系 / 打赏入口 ----------------
  // 留空即完全不显示：不产生死链，也不弹窗打扰。与头部 @supportURL / @homepageURL 保持一致。
  var FEEDBACK_URL = 'https://wpa.qq.com/msgrd?v=3&uin=2513493134&site=qq&menu=yes';   // 点开即发起 QQ 会话
  var FEEDBACK_EMAIL = '2513493134@qq.com';                                           // 备用邮箱（渲染成 mailto:）
  var DONATE_URL = '';                                // 可选：爱发电等平台主页
  var AUTHOR_NAME = 'realtime_liushui';

  // 收款码。取值只能是 data:image/(png|jpeg|gif|webp);base64,... 或 https 图片地址，
  // 其它形式（javascript:、http:、相对路径）一律不渲染。微信没有可从浏览器直接跳转的个人收款链接，
  // 支付宝的码在桌面端点开也只是再显示一张图，因此以图片形式按需展开最实际。
  var DONATE_QR_ALIPAY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWgAAAFoAQAAAABSnlx4AAAFAUlEQVR42u2bXW7jRhCEvxYJjIAEoG5A3YTekyQnCencJDfIDZY+Qm4wvgH9EIDCjqbyMKR+bMqWFvuwsYYvkqz2YNRq1lRVt0zccK3I0Tk6R/+E0TszM7Pt8/b5YfrroxmYVsjKQ8Dm3bXNbtmJ9P/M4MKnRBqdJPla8k3fSJKUPqNJoZDGQpKGSloB66t2sc4Ve6l2xmqEyte+ltTT9tAKEYkmKRRjMUI1TvlmPPv/fnHVMSPEh9G1n5+1HRgrWWRfZow9RYhrog8lqLfvn7x63j6bPTRfpA5rEQbYrsz5vnQXA1DyGmQfBHRagtiEJxN++7o/AXAiinbE7wOeZIQ4L3mxS6msn5qn5q/28euXrybToywW++Kb27l/U0A1vFp7O3+XXUaI5dNu8QScL19LPY26tqNN9RpNgeIYcmHtbmkfGb8vMA5J0kAtT9PTSB3tBBIWLTEON7qMEN8fXZ4hMlBN9T1VOCCZoiVIDriLiPxw+d7J5+VyfQ9UA1D7WuqbjrZDoEi0SBEogpMGp1zfJ1c40yRDNVDJU3uaHtqu1YzJClBIwR00IAAbAH+Kya9WzxrwHQ2oIWW77hv1QKuZjkgKgMuc7UeegANU8rV8ox5mlqxoqcCL8QpEPpKO8pqd6G7yvXqLyIfzr5/hREKKYApFKIJLvlOu72NVnSNyosg0vpbU0SYOIRRSBjWSeMbp2j5pkpMSXGWEuAohBqgHqHpo1NPoxOUtQhGKkDDikO8B2GxfIQRABAjlLTsp7zDf1ZBKXH2jvp1UyqiIxUPcB5qk5BbffnUTItsnYxzJv4BU3jBlPLnOgQQn12vAMuPJIn6vp2inoRqoPbXnqdWBHBfRosxpZ7+MToMbbvVP7sNTSpokIbLUQ9tNnE0kylboKLRPEXnSiw/LKRxzxV6OPm/tPR69thUqgf362Nlzgxuglgea/ij//jiegG50GvIJeFkDJsWdEtiomxCZiEWKkFx79xFHvqlzzefpXN/Wn58Zx1D72tMkl2g+AU0KUIy4Menuz1eDuik63hQdLjM8Kl97avWNuukQTBkPRQDcOaO+c19ztZzB4bcBsKZPEvBcazBNChyiJ9Gofk73UcMAuOwpXY7+tgVe7HcAnh/4pzsD2NNZgRXEgUoDPdD0Hv5uu2lqJmJxkosj1zC8eK8u6GQTJd9e6tpOnabONRPDe1eTdNkFvTIns6eUWFsjqWu75I1GkuYuxkL3jsj8gD7gqeae5o5S31XqEsFLpEMKuPGNh5fz/SqDMIuMVj3pXEsFG9yrDFaST6qk6enp2/lusACk4As7ecj5nvqAtSQPjaZOqohE0iwRN3dS1zft5D4mGd/OblHPfSkQcTI5kge6gBDbXLHfNSlwmDzyzSGyndtSUCTIyZMCH87bb563J2/8eXy6Xy/Mf1e+PnjO0B4pbwg4Xe8S3XF9+wXfZwWU5UGAH/HEU0s9bUfbKU0VzJN1I+4j/NZd4/eL2Qbqnid7AFqTJUfJ9layN1svrL3NFfsdLv/pLHjtnxLHe0SAVvtibxHYVSO8bIbrfM3cl3rHoHsb/WgmwwziSiv25d7WO1u/VEPO4Htznpvp9ZNNtT1Vt35Nj7sNc8U66QS7W3XQxjR6G74FnEY3umv7UuFTI8Syyz++nbc/c/lLCGezt0A9Eb2OVl36NUS0aJospesnj8r7QgjLv4vO0Tn6p4v+D9kv29p3qkY3AAAAAElFTkSuQmCC';
  var DONATE_QR_WECHAT = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWgAAAFoAQAAAABSnlx4AAAG2klEQVR42u2bv4/kSBXHP6/tG1va4dogJEYIyR0SwYUrcZK9/8HF6IQ2Iz0hghXSqmtOJ3Q5CRFswB9w/wHViICAYC4jQfIsi9gLALduV3If1X4EZffOTNs91bezaCVcwfQPfVVTfq/qfb/vvWpRjhgzJvSEntBvGxrVpnu31ApInP9WbV4BUSv9OZ+rXpnbDs7WTvY+Al3dOp1qE6mqqikskKhqi6qqVrk2iapq9/G6dyZ7f320ighQ2HnNRmJpRQyrolqnG4kBzkUWO3S/4xeZf5XpNLwWuh1Hx1fer0qyJHGxgI9P8yaN3GTBtwY9X6f+zbmUlwuShu1ssuAdM3fPDaoVSRN5cjDkWpM45DZukMned4w2A7qqsHk1bxIXtShLU1R5nTSRG9FV/0cWbI5Cp7ehe3ooIVungCAY4DLbpNv4BpNEvflXzOvM874CefXDL+Yv32nRaX/fZaxSF7UAS5trnaiqKlBolfcHRQ1FlWtAlrEb9WTvcXTbn4beB/u4iqzzjjrPFpa8Tjpf7WJV5yxy1SnLuCvmbtH+NDSRtrD0OR6Ji1RZms7gI6fBXFPMZjoNd4sWFdUH5aVkm7nz5PCghLkPVipqYZ1NFjwKXR5AP94FKNcogsECTX1tq185O2ogr/BM0o9/qOtKWVNF5O7Q2xhE1BSrxfy6ZttIotqGzP1kIOeYBcjow2gLsA19yg8AXCj60U5hhKC/GhW0Q+ilAS6C64NPANsA2RCTOFGFXX3w1R9tItexezWaZbhBYTDmne1YgWbYl+U/3w9GG/767T8Fex6eQXTU/j4NRSeHTkPy8p0WWaolV613m/XDHXOriEhRdXPHs1fbOQVK/y3wPGAlKd8LKhP7cVH++IgzX9pHI8dhCF1LDc0iEL2YVcDvQr3ziQUXupIvU2BrxrIMQNUsrRer+jT3bK5aJV0GUuxxw05XvXtVKN9evV0cFWN1LLQN2rs8au72GHRlxnKrr80kZR/+rOsjV3aT9bt6lY9HeZ2o6nkDpssrfBhbqh2tiJjmmKecjQmOIbSOu3M2knhmg+QwEgcH49pw/dsAnx4RY42cDDJP38tQEQOXeQ0S+2c8hXWKzmApptDqesZo+1jlgKfgdg9q+j0zsBJnJEuDLTgzMSdp+FP+5wdbbGgcbPn7jx6Z4LmFzzjPwtAxT7dn5eBWGfbOx803/lAPMPcMkk0sKiwflOR1twnrBZTgZZYPGHk9Fn3K+FufXGZhKznjdLb9pQ2MPrybz35VfBxowZhTPnoRzDv6L7BpqHfSM9TMQquJteGrkeirVwkmV9V/u2eFF0baJA5RNSx9HtFnGagpbF7NVVVdPVdD5NGiqj14JMtYx/DdcH2yNTwMQ9euBsQ0Qegs8sSWBq7km8B7Q7Jg0PNqz7CzOPQpF8+jA/XBvrXd1Qe/rLMuu2uQtruTcMXe17sX6en3z15lGbet5DezvyzMB+Mr0Wsr0Z/yt0MrubERP+Qn4ZHt+R+z3wKyCEJnrq4MG56FsdTjrIRmP0MaYZKHGC7AeIC5jlZRzsuVSNYx/KcxWLC+dnhugMuxikj5WfqLMlT7sH2f8wtlP0wMofWFgZ8zkA0MoeXzDOIWTpuQlfysi/Tv/flAL3qXDZdU4E5f2tgFzP3YAcxOtgN97s09p8CSZSdG5eI+OOTXDraxeCFbMcINJ174NA+fB3oeY64m6QfRtvR5oyHAJtwv2Z4OJemDc5/Ai4/i9kUgc1sSA/Xefx5cCYkCujhC9c6G+k6q6hB/Jye/Vn4C5g3iOxueNw4r6ixcf5t90XEA/XBf+x5ciZhj0CdH5A2RvX87eisiIqzKuLBBuwowUp0NemyT6FZE9EHJZbaWxCcWLIDt3OkMVUOxWtzaY3RHZUfPj0I/OQa9l+3Gh1x5TN91e0TftdxnnVf1QVR+by8X6zRxPukoV0VfgRJRS15NFdb/BXr//mBXEqHLMvpbIX70fe751Nl7TXTW27v1vezdeezsfaNY0HNDR+W2qx/2/qgne/MmbiH0w+ZaQ9R9KPyrE/UH5WCf20725g30Aa/emNIq331aqgW6G1NqigO9jMneR6KjTrauFqyzXSuvsMy/mG9iUFiVN5jb3NQQi32NPNn7ddExnbBSIF/lzeaeExVgVeafp/irzxT2cjGfLPiG0EON0WpAf6/TZiN96GKdrO8hLZwbmex9dzemHKCm8GU51wsnrYCudGiKQW5Ih9OicrL3Hd7UjXz9YyUi32lARTsNnDRsIxWAXOvJ3neD9hUTwwLYpP3+XpXQ33U+L/dvqOVVXkPkpIWlpep/76e336adVG/gkOl30RN6Qr916P8C42bdT76ZUnUAAAAASUVORK5CYII=';
  var DONATE_NOTE = '扫码后请核对收款人昵称（显示为「合法(**璠)」）';
  var OFFICIAL_URL = 'https://github.com/hefafafa/realtime_liushui';                              // 官方发布地址：填上后打赏浮层会提示「只从官方地址下载」

  var HINT_KEY = 'dsh_bili_liushui_hintdone';   // 「首次使用提示」只看一次，永不再现
  var hintDone = false;
  try { hintDone = origParse(localStorage.getItem(HINT_KEY) || 'false') === true; } catch (e) {}

  var roomId = (location.pathname.match(/\/(?:blanc\/)?(\d+)/) || [0, '0'])[1];
  var STORE_KEY = 'dsh_bili_liushui_' + roomId;

  // ---------------- 状态 ----------------
  var S = {
    roomId: roomId,
    gold: 0,          // 付费礼物累计电池
    silver: 0,        // 免费礼物累计个数
    sc: 0,            // 超级留言累计元
    guard: 0,         // 大航海累计元
    guards: { 1: 0, 2: 0, 3: 0 },
    users: {},        // uid -> { name, yuan }
    events: [],       // { t, kind, who, text, yuan }
    combo: {},        // batch_combo_id -> 该批次已计入的电池
    scSeen: {},       // SC id 去重
    odd: {},          // 名字不认识但长得像礼物的消息：cmd -> { n, sample }
    oddMoney: {},     // 完全不认识、但带着钱味儿的消息：cmd -> { n, sample }（漏账线索）
    since: Date.now(),
    hits: 0,          // 捕获到的消息条数
    giftMsgs: 0,      // 礼物类消息条数
    scMsgs: 0,
    guardMsgs: 0,
    guardDedup: 0,    // 被判定为「大航海回声」而丢弃的重复礼物条数（诊断用）
    guardAdjusted: 0, // 其中有多少笔顺带按回声实付价把上舰金额压下来了（打折舰长）
    guardPromo: 0,    // 其中有多少笔被判定为「赠送 / 活动舰长」而撤账（官方榜单不承认）
    guardUnverified: 0, // 榜单里查无此人、因此**没有**撤账的上舰笔数（宁可多记，不能错删）
    guardPending: 0,  // 当前挂着「待核」的上舰笔数（诊断用）
    // ---- 人气红包：只登记，**不计入流水**（红包本身没有价值，只有内容物有价值）----
    pocketRef: 0,     // 仅作参考：total_price × 0.25（官方 20% 口径），**不进 total()**
    pocketPool: 0,    // 收到过的红包池子合计（金瓜子，来自 _START.total_price）
    pocketCount: 0,   // 已按池子计过收益的红包个数
    pocketNoPool: 0,  // 只收到 _NEW、池子未知（还没等到 _START）的红包个数
    pocketWinners: 0, // 红包中奖人数合计（诊断）
    pocketGuardPool: 0,   // 上舰红包(rp_type=2)的池子合计：只登记，不并进收益（避免与舰长重复计）
    pocketGuardCount: 0,  // 上舰红包个数
    pocketLots: {},   // lot_id -> { pool, who, at }：跨通道/重复投递去重 + 事后补给池子
    toastMsgs: 0,     // 上舰提示（USER_TOAST_MSG*）条数：只是提示，永不计钱
    echoSample: '',   // 最近一条被去重的回声长什么样（诊断用）
    pageCmds: {},     // 页面钩子收到的 cmd -> 次数
    ownCmds: {},      // 独立通道收到的 cmd -> 次数
    ownState: 'idle', // idle / connecting / open / closed / failed
    rankList: [],     // 高能榜
    rankNum: 0,
    rankState: '未请求',
    giftSample: '',   // 算不出金额的礼物报文样本（诊断用）
    boxSample: '',    // 盲盒「盒子 → 爆出物」样本（诊断用）
    vers: {},         // 收到的包按协议版本分布（诊断）
    undecoded: 0,     // 解不开的包数量（诊断）
    brotli: null      // DecompressionStream 支不支持 brotli
  };

  // ---------------- 持久化 ----------------
  // 只写 localStorage（live.bilibili.com 这个源下面），key 前缀统一是 dsh_bili_liushui_，
  // 不碰 HTTP 缓存、不写磁盘文件、不用 Cookie / IndexedDB。
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var o = origParse(raw);
      if (!o || typeof o !== 'object') {
        // 坏数据：直接删掉，别留着
        try { localStorage.removeItem(STORE_KEY); } catch (e) {}
        return;
      }
      if (Date.now() - (o.savedAt || 0) > TTL_MS) {
        // 过期就顺手清掉，不在浏览器里留垃圾
        try { localStorage.removeItem(STORE_KEY); } catch (e) {}
        return;
      }
      S.gold = o.gold || 0;
      S.silver = o.silver || 0;
      S.sc = o.sc || 0;
      S.guard = o.guard || 0;
      S.guards = o.guards || { 1: 0, 2: 0, 3: 0 };
      S.users = o.users || {};
      S.events = o.events || [];
      S.combo = o.combo || {};
      S.scSeen = o.scSeen || {};
      S.since = o.since || Date.now();
      S.hits = o.hits || 0;
      S.giftMsgs = o.giftMsgs || 0;
      S.scMsgs = o.scMsgs || 0;
      S.guardMsgs = o.guardMsgs || 0;
      S.guardDedup = o.guardDedup || 0;
      S.guardAdjusted = o.guardAdjusted || 0;
      S.guardPromo = o.guardPromo || 0;
      S.guardUnverified = o.guardUnverified || 0;
      S.pocketRef = o.pocketRef || 0;
      S.pocketPool = o.pocketPool || 0;
      S.pocketCount = o.pocketCount || 0;
      S.pocketNoPool = o.pocketNoPool || 0;
      S.pocketWinners = o.pocketWinners || 0;
      S.pocketGuardPool = o.pocketGuardPool || 0;
      S.pocketGuardCount = o.pocketGuardCount || 0;
      S.pocketLots = o.pocketLots || {};
      S.odd = o.odd || {};                 // 漏账线索：以前没落盘，一刷新就查不到了
      S.oddMoney = o.oddMoney || {};
    } catch (e) { /* 读到坏数据就当没有 */ }
  }

  // 启动时扫一遍：把「其它房间」留下的过期数据删掉。
  // 位置记忆(dsh_bili_liushui_pos/dbgpos)和货币设置(cur)不算过期，保留。
  var KEEP_KEYS = { 'dsh_bili_liushui_pos': 1, 'dsh_bili_liushui_dbgpos': 1, 'dsh_bili_liushui_cur': 1 };
  function sweepStale() {
    var removed = 0;
    try {
      var now = Date.now();
      var kill = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf('dsh_bili_liushui_') !== 0) continue;
        if (KEEP_KEYS[k]) continue;
        var o = null;
        try { o = origParse(localStorage.getItem(k) || 'null'); } catch (e) { o = null; }
        if (!o || !o.savedAt || (now - o.savedAt) > TTL_MS) kill.push(k);
      }
      for (var j = 0; j < kill.length; j++) { localStorage.removeItem(kill[j]); removed++; }
    } catch (e) {}
    return removed;
  }

  // 手动清空本插件写过的所有数据（含位置/货币设置），返回删掉的条数
  function clearAll() {
    var removed = 0;
    try {
      var kill = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('dsh_bili_liushui_') === 0) kill.push(k);
      }
      for (var j = 0; j < kill.length; j++) { localStorage.removeItem(kill[j]); removed++; }
    } catch (e) {}
    return removed;
  }

  // 本插件在 localStorage 里占了多少（诊断窗显示用）
  function storageInfo() {
    var kb = 0, n = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('dsh_bili_liushui_') === 0) {
          n++;
          kb += k.length + (localStorage.getItem(k) || '').length;
        }
      }
    } catch (e) {}
    return { keys: n, kb: Math.round(kb / 1024 * 10) / 10 };
  }

  // ---- 落盘：先裁剪、失败就再裁剪重试，并且**不许再静默失败** ----
  // 落盘前先裁剪：users / combo / 红包 lot 表都会随直播时长增长，超配额会让 setItem 抛错。
  // 因此每次裁剪、配额不足时降档重试，并把失败原因显示出来，不做静默失败。
  var SAVE_LIMIT_USERS = 300;
  var SAVE_LIMIT_COMBO = 300;
  var SAVE_LIMIT_SC = 500;

  function pruneForSave(hard) {
    var userCap = hard ? 80 : SAVE_LIMIT_USERS;
    var comboCap = hard ? 50 : SAVE_LIMIT_COMBO;
    var uk = Object.keys(S.users);
    if (uk.length > userCap) {
      uk.sort(function (a, b) { return (S.users[b].yuan || 0) - (S.users[a].yuan || 0); });
      for (var i = userCap; i < uk.length; i++) delete S.users[uk[i]];
      S.usersDropped = (S.usersDropped || 0) + (uk.length - userCap);
    }
    var ck = Object.keys(S.combo);
    if (ck.length > comboCap) for (var j = 0; j < ck.length - comboCap; j++) delete S.combo[ck[j]];
    // 红包 lot 表也要裁：只留最近的，免得长期挂机把配额撑爆
    var pk = Object.keys(S.pocketLots || {});
    var lotCap = hard ? 40 : 200;
    if (pk.length > lotCap) {
      pk.sort(function (a, b) { return (S.pocketLots[b].at || 0) - (S.pocketLots[a].at || 0); });  // 新的在前
      for (var q = lotCap; q < pk.length; q++) delete S.pocketLots[pk[q]];
    }
    var sk = Object.keys(S.scSeen);
    var scCap = hard ? 50 : SAVE_LIMIT_SC;
    if (sk.length > scCap) for (var m = 0; m < sk.length - scCap; m++) delete S.scSeen[sk[m]];
  }

  function writeStore(eventsCap) {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      savedAt: Date.now(),
      gold: S.gold, silver: S.silver, sc: S.sc, guard: S.guard, guards: S.guards,
      users: S.users, events: S.events.slice(-eventsCap), combo: S.combo, scSeen: S.scSeen,
      since: S.since, hits: S.hits,
      giftMsgs: S.giftMsgs, scMsgs: S.scMsgs, guardMsgs: S.guardMsgs,
      guardDedup: S.guardDedup, guardAdjusted: S.guardAdjusted, guardPromo: S.guardPromo,
      guardUnverified: S.guardUnverified || 0,
      pocketRef: S.pocketRef || 0, pocketPool: S.pocketPool || 0, pocketCount: S.pocketCount || 0,
      pocketNoPool: S.pocketNoPool || 0, pocketWinners: S.pocketWinners || 0,
      pocketGuardPool: S.pocketGuardPool || 0, pocketGuardCount: S.pocketGuardCount || 0,
      pocketLots: capMap(S.pocketLots, 60), toastMsgs: S.toastMsgs || 0,
      crossDedup: S.crossDedup || 0, pageRescue: S.pageRescue || 0,
      v2samples: S.v2samples || [], scSamples: S.scSamples || [],
      // 诊断线索也要留下来：以前它们只在内存里，一刷新就没了，等于查不到「漏了什么」。
      // 这些计数是「本次会话」的，所以只写不读（不参与 load），免得跨刷新累加出错。
      odd: capMap(S.odd), oddMoney: capMap(S.oddMoney),
      ownCmds: capMap(S.ownCmds, 20), pageCmds: capMap(S.pageCmds, 20),
      scOwn: S.scOwn || 0, scPage: S.scPage || 0,
      giftOwn: S.giftOwn || 0, giftPage: S.giftPage || 0
    }));
  }

  // 诊断映射只留前 N 条，免得它们自己变成撑爆配额的元凶
  function capMap(m, n) {
    var out = {}, keys = Object.keys(m || {}).slice(0, n || 12);
    for (var i = 0; i < keys.length; i++) out[keys[i]] = m[keys[i]];
    return out;
  }

  var saveTimer = null;
  function save() {
    if (saveTimer) return;
    saveTimer = setTimeout(function () {
      saveTimer = null;
      pruneForSave(false);
      try {
        writeStore(200);
        S.saveErr = '';
      } catch (e1) {
        // 降档再试：用户榜砍到 80、连击号 50、事件 50
        try {
          pruneForSave(true);
          writeStore(50);
          S.saveErr = '保存失败过一次（已降到最小档）';
        } catch (e2) {
          S.saveErr = '保存失败：' + ((e2 && e2.name) || '未知错误') + ' —— 面板数字仍在内存里，刷新会丢';
        }
      }
    }, 800);
  }

  // ---------------- 记账 ----------------
  // 同一个人可能先后以「uid」和「昵称」两种键出现（B站的报文有的带 uid、有的不带），
  // 必须收敛到同一个键，否则贡献榜里同一个人会占两行、金额还被拆开
  // 同一人短时间内可能同时出现礼物与上舰，需按 uid 与金额一起判断。
  // 规则：先看有没有同名条目 → 有就用它（不管它是 uid 键还是昵称键）；没有才用 uid 建键。
  // 这样键只创建一次、永不搬迁，也就不会出现「条目凭空消失」。
  function findKeyByName(name) {
    if (!name || name === '?') return '';
    for (var k in S.users) {
      if (S.users[k] && S.users[k].name === name) return k;
    }
    return '';
  }

  function addUser(uid, name, yuan) {
    if (yuan <= 0) return '';
    var key = findKeyByName(name) || String(uid || '') || String(name || 'unknown');
    if (!S.users[key]) S.users[key] = { name: name || '未知', yuan: 0 };
    if (name && name !== '?') S.users[key].name = name;
    S.users[key].yuan += yuan;
    return key;      // 返回实际用的键：上舰那边要拿它回改金额（applyEchoPrice）
  }

  function pushEvent(kind, who, text, yuan) {
    S.events.push({ t: Date.now(), kind: kind, who: who, text: text, yuan: yuan });
    if (S.events.length > 200) S.events.splice(0, S.events.length - 200);
  }

  function pick() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  }

  // 礼物报文的字段名在不同版本里变过（旧 SEND_GIFT / 新 SEND_GIFT_V2），
  // 所以把常见别名都兜一遍，别因为一个字段改名就整条算不出钱。
  function giftField(d, keys) {
    var scopes = [d, d.gift, d.combo, d.user, d.receiver];
    for (var s = 0; s < scopes.length; s++) {
      var o = scopes[s];
      if (!o || typeof o !== 'object') continue;
      for (var k = 0; k < keys.length; k++) {
        var v = o[keys[k]];
        if (v !== undefined && v !== null && v !== '') return v;
      }
    }
    return undefined;
  }

  // 疑点样本环：只留第一条不够用（用户报问题时想看的往往是后面那几条），
  // 所以保留最近若干条，每条都带 cmd 和 protobuf 字段摘要。
  var SUSP_MAX = 4;
  function noteSusp(kind, cmd, detail) {
    if (!S.susp) S.susp = [];
    var line = kind + ' · ' + (cmd || '?') + ' · ' + String(detail || '').slice(0, 220);
    if (S.susp.length && S.susp[S.susp.length - 1] === line) return;   // 相邻重复就不记了
    S.susp.push(line);
    while (S.susp.length > SUSP_MAX) S.susp.shift();
  }

  function noteGiftSample(cmd, d) {
    if (S.giftSample) return;
    try {
      S.giftSample = (cmd || '?') + ' | 字段=' + Object.keys(d).join(',') +
        ' | ' + JSON.stringify(d).slice(0, 300);
    } catch (e) { S.giftSample = (cmd || '?') + ' (无法序列化)'; }
  }

  // ---------------- 大航海回声去重 ----------------
  // 上舰（GUARD_BUY）之后，B站还会补发 1~2 条「同一个人、金币、名字对不出价目表」的
  // 礼物消息，那是同一笔上舰钱的回声。这里把回声兑掉，保证一笔上舰只记一次。
  var GUARD_ECHO_WINDOW_MS = 15000;   // GUARD_BUY 之后多久内仍算回声
  var GUARD_ECHO_MAX = 4;             // 一笔上舰最多兑几条，避免吞掉同价的真礼物
  var guardEcho = null;               // { uid, uname, at, total, std, left }

  function guardNameLike(name) {
    return /舰长|提督|总督|大航海/.test(String(name == null ? '' : name));
  }

  // 回声价往往才是**实付价**：打折舰长/活动（168、138）在 GUARD_BUY 里照样按 198 报，
  // 真正的付费额只出现在紧随其后的回声礼物里。所以一笔上舰的价值取「观测到的最小值」。
  // 交叉验证：B站高能榜的贡献值 ÷10 正好是回声价（纯洁小ak 1980→198=168+30、
  // No_fscet 1389、烧鸭腿 1380），而不是 GUARD_BUY 的 198。
  // 只有「上舰级别」的回声价才允许压价（≥100 元），免得被小额无名礼物把价压坏。
  var GUARD_PRICE_FLOOR = 100 * GOLD_PER_YUAN;

  // 共用：把已经记进账的一笔撤回来（或改成别的数），并同步事件行与贡献榜。
  // 三处都靠它：①回声按实付价改写上舰金额 ②反向顺序的礼物并回上舰 ③赠送/活动舰长撤账。
  // pool 决定从哪个池子扣（'gold' 付费礼物 / 'guard' 大航海 —— 都是「元」）。
  // 共用：把已经记进账的一笔撤回来（或改成别的数），并同步事件行与贡献榜。
  // 三处都靠它：①回声按实付价改写上舰金额 ②反向顺序的礼物并回上舰 ③赠送/活动舰长撤账
  // ④SC 被撤回。pool 决定从哪个池子扣（'gold' 付费礼物 / 'sc' 超级留言 / 'guard' 大航海）。
  function takeBack(pool, key, yuan, findEv, markEv) {
    if (!(yuan > 0)) return 0;
    if (pool === 'gold') S.gold = Math.max(0, S.gold - yuan * GOLD_PER_YUAN);
    else if (pool === 'sc') S.sc = Math.max(0, S.sc - yuan);
    else S.guard = Math.max(0, S.guard - yuan);
    if (key && S.users[key]) {
      S.users[key].yuan = Math.max(0, (S.users[key].yuan || 0) - yuan);
      if (!(S.users[key].yuan > 0)) delete S.users[key];   // 归零的行不留着占位
    }
    for (var i = S.events.length - 1; i >= 0; i--) {       // 事件行从后往前找最近那一条
      if (findEv(S.events[i])) { markEv(S.events[i]); break; }
    }
    return yuan;
  }

  // 压价只取该笔的第一条回声：同一笔可能出现两条不同价（例如 168 与 138），
  // 而官方榜单证明那笔实付是 168 —— 一路取最小值会把价压到偏低的那条上去。
  function applyEchoPrice(add) {
    var e = guardEcho;
    if (!e || e.priced) return false;
    if (!(add >= GUARD_PRICE_FLOOR) || !(add < e.total)) return false;
    var newYuan = add / GOLD_PER_YUAN;
    takeBack('guard', e.key, (e.total - add) / GOLD_PER_YUAN,
      function (ev) { return ev.kind === 'guard' && ev.who === e.who; },
      function (ev) { ev.yuan = newYuan; });
    e.total = add;
    e.priced = true;
    S.guardAdjusted = (S.guardAdjusted || 0) + 1;
    // 待核阈值必须按实付额算：按标价算会让「标价 198 / 实付 138」的打折舰长永远核不过
    syncPendingAmount(e.key, e.who, newYuan);
    return true;
  }

  // ---------------- 反向顺序：回声比 GUARD_BUY 先到 ----------------
  // 存在「礼物先到、GUARD_BUY 后到」的顺序，需要在内存里留短暂缓冲做反向回并。
  // 前向去重看不到它，所以在内存里留个几秒的短缓冲，GUARD_BUY 一到就把它回并掉。
  var GUARD_ECHO_BACK_MS = 3000;
  var echoish = [];      // {uid, uname, add, at, who, text}

  function rememberEchoish(uid, uname, add, who, text) {
    var now = Date.now();
    echoish.push({ uid: String(uid || ''), uname: uname, add: add, at: now, who: who, text: text });
    while (echoish.length > 6 || (echoish.length && now - echoish[0].at > GUARD_ECHO_BACK_MS)) echoish.shift();
  }

  function absorbPendingEcho() {
    var e = guardEcho, hit = 0;
    if (!e) return 0;
    for (var i = echoish.length - 1; i >= 0; i--) {
      var g = echoish[i];
      if (Date.now() - g.at > GUARD_ECHO_BACK_MS) continue;
      var same = (g.uid && e.uid) ? (g.uid === e.uid)
                                 : (g.uname && g.uname !== '?' && g.uname === e.uname);
      if (!same) continue;
      var yuan = g.add / GOLD_PER_YUAN;
      takeBack('gold', e.key, yuan,
        function (ev) { return ev.kind === 'gift' && ev.who === g.uname && ev.text === g.text; },
        function (ev) { ev.yuan = 0; ev.text = g.text + '（反向顺序，已并回上舰）'; });
      applyEchoPrice(g.add);        // 它同样可以决定这笔上舰的实付价
      S.guardDedup = (S.guardDedup || 0) + 1;
      echoish.splice(i, 1);
      hit++;
    }
    if (hit) noteSusp('反向顺序的回声已并回上舰', 'GUARD_BUY', hit + ' 条 · ' + (e.uname || '?'));
    return hit;
  }

  // ---------------- 赠送 / 活动舰长：拿官方高能榜当第三方核验 ----------------
  // 主播赠送、免费体验这类上舰，GUARD_BUY 里照样按标价报，可是没人真的付钱。
  // 赠送 / 活动舰长同样按标价上报，但其高能榜贡献值会明显偏低，可据此识别。
  // 脚本本来就在拉高能榜，于是每笔上舰先挂「待核」，等榜单承认了才算数。
  //
  // 核验时有三处必须注意，否则真实付款的舰长会被误撤：
  //   ① 阈值必须用**回声压价之后的实付额**。GUARD_BUY 报标价 198、回声才是实付 138 时，
  //      按 198×8=1584 判、官方榜只给 1380，永远核不过 → 4 分钟一到就把真钱撤了。
  //   ② 高能榜**会衰减**，取瞬时值会越等越核不过，应取窗口内最高水位；
  //      只看核验那一刻的值，等得越久越核不过 → 改成记「窗口内最高水位」。
  //   ③ 榜单只取前 50 名时，排到 50 名外的人永远核不过 → 改成翻 3 页。
  //   ④ 榜单里**查无此人**不再撤账：那可能只是没进榜，不该当成没付钱（宁可多记，不能错删）。
  var GUARD_VERIFY_MS = 480000;     // 待核最长 8 分钟（原来是 4 分钟：榜单最长要 4 分钟才结算，太紧）
  var pendingGuards = [];           // {who, key, yuan(标价), amount(实付), at, base, best, seen}

  function rankScoreOf(name) {
    if (!name || !S.rankList) return null;
    for (var i = 0; i < S.rankList.length; i++) if (S.rankList[i].name === name) return S.rankList[i].score;
    return null;
  }

  // 待核期间持续记录「这个人在榜单上的最高水位」。高能榜会衰减，取瞬时值会冤枉真付款的人。
  function rankHighWater(name) {
    var cur = rankScoreOf(name);
    if (cur === null || cur === undefined) return null;
    for (var i = 0; i < pendingGuards.length; i++) {
      var p = pendingGuards[i];
      if (p.who !== name) continue;
      if (cur > (p.best || 0)) p.best = cur;
      p.seen = true;
    }
    return cur;
  }

  function watchGuard(who, key, yuan) {
    // 榜单没在正常工作时就别挂「待核」：没数据可核，挂了只会被误判成赠送（宁可多记，不能错删）
    if (!/^OK/.test(String(S.rankState || ''))) return;
    var base = rankScoreOf(who);
    pendingGuards.push({
      who: who, key: key, yuan: yuan, amount: yuan, at: Date.now(),
      base: base, best: (base || 0), seen: (base !== null && base !== undefined)
    });
    while (pendingGuards.length > 20) pendingGuards.shift();
    S.guardPending = pendingGuards.length;
  }

  // 回声把上舰金额压到实付价时，待核那笔的「应到账金额」也要跟着降 —— 否则阈值会继续按标价算
  function syncPendingAmount(key, who, amount) {
    for (var i = 0; i < pendingGuards.length; i++) {
      var p = pendingGuards[i];
      if ((key && p.key && p.key === key) || (who && p.who === who)) {
        if (amount < p.amount) p.amount = amount;
      }
    }
  }

  function verifyPendingGuards() {
    // 榜单不可信（请求失败 / 状态未知）时一律不动手 —— 宁可多记，也不能把真付款的撤掉。
    // 注意 rankState 实际形如「OK · 12:03:44 · 200 人」，所以用前缀判断，不能写 === 'OK'。
    if (!/^OK/.test(String(S.rankState || '')) || !S.rankList || !S.rankList.length) return;
    var now = Date.now();
    for (var i = pendingGuards.length - 1; i >= 0; i--) {
      var p = pendingGuards[i];
      rankHighWater(p.who);                       // 先把这一刻的分数记进高水位
      var cur = rankScoreOf(p.who);
      if (cur === null || cur === undefined) cur = p.best || 0;
      var need = (p.amount || p.yuan || 0) * 10 * 0.8;   // 用**实付额**算阈值（v2.8.8）
      if ((p.best || 0) - (p.base || 0) >= need) { pendingGuards.splice(i, 1); continue; }
      if (now - p.at < GUARD_VERIFY_MS) continue;
      // 超时官方仍未承认。分两种情况，不能再一撤了之：
      if (!p.seen) {
        // ① 榜单里从头到尾没有这个人：很可能是「没进榜」（榜单只列有贡献的人），
        //    也可能是这个档位根本不进这个榜。证据不足，**不撤账**，只标记，留给人看。
        S.guardUnverified = (S.guardUnverified || 0) + 1;
        for (var k = S.events.length - 1; k >= 0; k--) {
          var ek = S.events[k];
          if (ek.kind === 'guard' && ek.who === p.who && Math.abs(ek.t - p.at) < 3000) {
            ek.text = ek.text + '（未核验：官方榜单查无此人）';
            break;
          }
        }
        noteSusp('榜单查无此人，未撤账', 'GUARD_BUY', p.who + ' ' + (p.amount || p.yuan).toFixed(2) +
          ' 元 · 榜单里没有该用户，未撤回，请人工确认是不是赠送舰长');
        pendingGuards.splice(i, 1);
        continue;
      }
      // ② 人在榜单里、但贡献远低于这笔上舰 → 判定为赠送 / 活动，把这笔从上舰流水里撤掉。
      // 谨慎到极点：只动这一笔，金额取事件行当前值（可能已被回声压过价）。
      var amount = p.amount || p.yuan;
      for (var j = S.events.length - 1; j >= 0; j--) {
        var ev = S.events[j];
        if (ev.kind === 'guard' && ev.who === p.who && Math.abs(ev.t - p.at) < 3000) { amount = ev.yuan; break; }
      }
      takeBack('guard', p.key, amount,
        function (e2) { return e2.kind === 'guard' && e2.who === p.who && Math.abs(e2.t - p.at) < 3000; },
        function (e2) { e2.yuan = 0; e2.text = e2.text + '（未计入：官方无对应贡献）'; });
      S.guardPromo = (S.guardPromo || 0) + 1;
      noteSusp('赠送/活动舰长已撤账', 'GUARD_BUY', p.who + ' ' + amount.toFixed(2) +
        ' 元 · 官方贡献 ' + ((p.best || 0) / 10).toFixed(2) + ' 元（上舰前基准 ' + ((p.base || 0) / 10).toFixed(2) +
        ' 元，本笔实付 ' + (p.amount || p.yuan).toFixed(2) + ' 元）');
      pendingGuards.splice(i, 1);
    }
    S.guardPending = pendingGuards.length;
  }

  // 返回值：1 = 确认是这笔上舰的回声（不计钱）；0 = 与上舰无关，照常记账。
  // 注意这里**不看金额**：回声价在不同房间是 138 / 168 / 198 不等，卡金额会漏（见文件头注释）。
  function guardEchoKind(gname, add, uid, uname) {
    var e = guardEcho;
    if (!e || e.left <= 0) return 0;
    if (Date.now() - e.at > GUARD_ECHO_WINDOW_MS) return 0;
    // 同一个人：两边都有 uid 就比 uid；否则退化成比昵称，绝不靠猜
    var same;
    if (uid && e.uid) same = String(uid) === String(e.uid);
    else if (uname && uname !== '?' && e.uname) same = (uname === e.uname);
    else same = false;
    if (!same) return 0;
    // 只认「认不出名字」或「名字本身就是大航海」的；价目表能对上名字的真礼物一律照记
    if (!(gname === '礼物' || guardNameLike(gname))) return 0;
    return 1;
  }

  // ---------------- 双通道配对去重（跨通道补记） ----------------
  // 两边都登记指纹，收到对面重复的才丢；**配不上就用另一条通道补记**。
  // 为什么不能像以前那样「页面通道整条丢弃」：自有 WS 停滞/重连那段时间，页面通道收到的就永久漏账
  // 只用自有通道、把页面通道整条丢弃时，自有连接每次重连都会漏掉那段时间的流水。
  // 指纹：优先 batch_combo_id + 批次累计（天然唯一），否则 用户+礼物+个数+单价；连击类另有一层保险
  // —— 批次累计相同则差额算 0，本来就不会重复计。
  var CROSS_DEDUP_MS = 8000;
  var ownSeenKeys = [];    // 自有通道已计过的指纹
  var pageSeenKeys = [];   // 页面通道已计过的指纹（自有通道后到时可据此去重）
  function crossKey(o) {
    if (o.batchId) return 'b|' + o.batchId + '|' + (o.cum || 0);
    return 'g|' + (o.uid || o.uname || '?') + '|' + (o.name || '?') + '|' + (o.num || 1) + '|' + (o.price || 0);
  }
  function crossPrune(list, now) {
    while (list.length && now - list[0].at > CROSS_DEDUP_MS) list.shift();
  }
  function crossTake(list, k, now) {
    crossPrune(list, now);
    for (var i = 0; i < list.length; i++) {
      if (list[i].k === k && now - list[i].at <= CROSS_DEDUP_MS) { list.splice(i, 1); return true; }
    }
    return false;
  }
  function crossPush(list, k, now) {
    crossPrune(list, now);
    list.push({ k: k, at: now });
    while (list.length > 300) list.shift();
  }
  // 返回 true = 这条与另一条通道已记过的重复，应当丢弃
  function crossDuplicate(fromOwn, o) {
    if (!ownWsReady) return false;                 // 自有通道没就绪时，页面通道就是唯一来源，全收
    var now = Date.now();
    var k = crossKey(o);
    if (fromOwn) {
      // 自有通道这条：如果页面通道已经补记过同一笔，就别再记一遍
      if (crossTake(pageSeenKeys, k, now)) { S.crossDedup = (S.crossDedup || 0) + 1; return true; }
      crossPush(ownSeenKeys, k, now);
      return false;
    }
    // 页面通道这条：自有通道记过就丢（原有行为）
    if (crossTake(ownSeenKeys, k, now)) { S.crossDedup = (S.crossDedup || 0) + 1; return true; }
    // 配不上 → 自有通道漏了这笔，补记
    crossPush(pageSeenKeys, k, now);
    S.pageRescue = (S.pageRescue || 0) + 1;
    return false;
  }

  // ---------------- 人气红包：只做登记，**不计入流水** ----------------
  // 口径：红包本身没有价值，只有内容物有价值 —— 「发红包」不是流水，_NEW.price / _START.total_price 都不进账；
  // 内容物被中奖人用掉、以礼物形式发出来时，才由 onSendGift 记成礼物流水。
  // 这里只做：按 lot 去重登记、统计个数/池子、核账、给一个「官方 20% 口径」的参考值（只进自检窗与 CSV）。
  // 报文：_START / _V2_START 带 total_price（池子）+ awards；_NEW / _V2_NEW 只有单份奖额 price；
  //       _V2_WINNER_LIST 是中奖名单（核账用）。
  var POCKET_REF_SHARE = 0.25;      // 参考值 = total_price × 0.25（20% 给主播、池子 = 支出的 80%）
  // rp_type：B站前端常量 n=100,i=3,o=4,a=5（3/5 = 电池红包）；主播端「红包记录」页写死 2 === rp_type ? "上舰" : ""
  var RP_GUARD = 2;
  function pocketKindName(t) {
    if (t === RP_GUARD) return '上舰红包';
    if (t === 3 || t === 5) return '电池红包';
    return t ? ('红包(rp_type=' + t + ')') : '红包';
  }
  function pocketRefYuan(pool) {
    return Math.round(pool / GOLD_PER_YUAN * POCKET_REF_SHARE * 1000) / 1000;
  }

  function onRedPacket(cmd, d) {
    if (!d) return;
    var kind = /_WINNER_LIST$/.test(cmd) ? 'winner'
             : (/_START$/.test(cmd) ? 'start' : (/_NEW$/.test(cmd) ? 'new' : 'other'));
    var lot = String(d.lot_id || '');
    var who = d.sender_name || d.uname || '?';
    var rpType = Number(d.rp_type) || 0;
    var kindName = pocketKindName(rpType);

    if (kind === 'winner') {
      var wi = d.winner_info || [], awarded = 0;
      for (var i = 0; i < wi.length; i++) awarded += Number(wi[i] && wi[i][5]) || 0;   // [uid,name,…,金瓜子,…]
      var rw = lot ? S.pocketLots[lot] : null;
      // 中奖名单也按 lot 去重：同一条名单两条通道各来一次，只统计一次
      var wKey = lot || ('w-' + Date.now());
      S.pocketWinners = S.pocketWinners || 0;
      if (!S.pocketWinnersSeen) S.pocketWinnersSeen = {};
      if (!S.pocketWinnersSeen[wKey]) {
        S.pocketWinnersSeen[wKey] = 1;
        S.pocketWinners += wi.length;
        var wk = Object.keys(S.pocketWinnersSeen);
        if (wk.length > 200) for (var q = 0; q < wk.length - 200; q++) delete S.pocketWinnersSeen[wk[q]];
      }
      if (rw && rw.pool > 0 && awarded > 0 && awarded !== rw.pool) {
        noteSusp('红包核账不一致', cmd, 'lot=' + lot + ' 池子 ' + rw.pool + ' 金瓜子 / 实际发出 ' + awarded);
      }
      return;
    }

    // 去重：同一 lot 无论被几条通道、几条报文送来，都只登记一次
    var rec = lot ? S.pocketLots[lot] : null;
    if (!rec) {
      var key = lot || ('nolot-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));
      rec = S.pocketLots[key] = { pool: 0, who: who, at: Date.now(), type: rpType };
      S.pocketNoPool = (S.pocketNoPool || 0) + 1;
      // 只有 _NEW（拿不到池子）才先记一条「待补」；_START 本身就带池子，直接走下面登记
      if (kind !== 'start') pushEvent('pocket', who, kindName + '（池子未知，等 _START）', 0);
    }

    var pool = Number(d.total_price) || 0;
    if (kind === 'start' && pool > 0 && !(rec.pool > 0)) {
      rec.pool = pool; rec.who = who; rec.at = Date.now(); rec.type = rpType;
      S.pocketPool = (S.pocketPool || 0) + pool;
      S.pocketCount = (S.pocketCount || 0) + 1;
      S.pocketRef = Math.round(((S.pocketRef || 0) + pocketRefYuan(pool)) * 1000) / 1000;
      if (S.pocketNoPool > 0) S.pocketNoPool--;
      if (rpType === RP_GUARD) {
        S.pocketGuardPool = (S.pocketGuardPool || 0) + pool;
        S.pocketGuardCount = (S.pocketGuardCount || 0) + 1;
      }
      // 金额固定记 0：红包本身不计流水，内容物被中奖人用掉时才会以礼物形式进账
      pushEvent('pocket', who, kindName + ' 池 ¥' + (pool / GOLD_PER_YUAN).toFixed(2) +
        '（不计入流水）', 0);
      return;
    }
    if (kind === 'start' && pool <= 0) {
      noteSusp('红包没有 total_price', cmd, 'lot=' + lot + ' rp_type=' + rpType + ' 字段=' + Object.keys(d).join(','));
    }
  }

  function onSendGift(d, cmd, fromOwn) {
    if (!d) return;

    // SEND_GIFT_V2：礼物内容在 base64 的 protobuf 里。
    // 先用官方价目表把「礼物名 + 单价」对出来，再走后面的通用记账逻辑。
    if (d.pb && typeof d.pb === 'string') {
      var dec = decodeGiftProto(d);
      if (!dec) {
        if (!S.giftSample) S.giftSample = (cmd || '?') + ' | pb 解不开';
        pushEvent('gift', '?', '礼物（protobuf 无法解析）', 0);
        return;
      }
      if (dec.miss) {
        if (!S.giftSample) {
          S.giftSample = (cmd || '?') + ' | 未对上价目表 | ' + (dec.fields || []).join(' ');
        }
        noteSusp('未对上价目表', cmd, '字符串=' + (dec.strings || []).join('/') +
          ' | 字段=' + (dec.fields || []).slice(-8).join(' '));
        pushEvent('gift', '?', '礼物（未对上价目表）', 0);
        return;
      }
      // 盲盒：记下「盒子 → 爆出物」，并把事件文案标出来，方便核对
      if (dec.box) {
        if (!S.boxSample) {
          S.boxSample = dec.box + ' → ' + dec.name +
            ' | 报文里对上的名字: ' + (dec.allStrings || []).join(' / ');
        }
      }
      d = {
        coin_type: 'gold',
        price: dec.price,
        num: dec.num || 1,
        gift_name: dec.name,
        uname: dec.who,
        _by: dec.by,
        _box: dec.box || '',
        _isBox: !!dec.isBox,
        _v2: true,
        _v2raw: dec.v2raw || null,
        // 批次信息只带这两个：combo_total_coin 与 price×个数一致，可信；
        // 而同一条报文里那个 f7 会蹦出房间级的大数（不可信），所以一律不碰它。
        combo_total_coin: (dec.v2raw && dec.v2raw.comboTotalCoin) || 0,
        batch_combo_id: (dec.v2raw && dec.v2raw.batchId) || ''
      };
      // 盒子里没解出爆出物（只对上盒子本身）时，明确标出来，别让人以为算错了
      if (dec.isBox && !S.boxSample) {
        S.boxSample = dec.box + ' → （未解出爆出物，暂按盒子价计）';
      }
    }

    var coinType = pick(giftField(d, ['coin_type', 'coinType']), 'gold');
    var num = Number(pick(giftField(d, ['num', 'gift_num', 'giftNum']), 1)) || 1;
    var price = Number(pick(giftField(d, ['price', 'gift_price', 'unit_price']), 0)) || 0;
    var batchId = pick(giftField(d, ['batch_combo_id', 'batchComboId', 'combo_id']), '');
    var comboNum = Number(pick(giftField(d, ['combo_num', 'comboNum']), 0)) || 0;
    var uname = pick(giftField(d, ['uname', 'user_name', 'username']),
                     (d.user && (d.user.uname || d.user.name)), '?');
    var gname = pick(giftField(d, ['giftName', 'gift_name', 'name']), '礼物');
    // 名字没解出来、金额却是有的 —— 这种条目最容易让人怀疑，记进疑点样本
    if (gname === '礼物' && !d._box) {
      var rawKeys = '';
      try { rawKeys = Object.keys(d).join(','); } catch (e) {}
      noteSusp('礼物名缺失', cmd, '字段=' + rawKeys + ' | ' + JSON.stringify(d).slice(0, 180));
    } else if (d._by === 'id') {
      noteSusp('按id推定', cmd, gname);
    }
    // 盲盒：文案标出「盒子 → 爆出物」；解不出爆出物、或按 id 推定的，都额外打标，
    // 因为这两种情况的可信度明显更低，不该让人误以为算准了。
    var boxTag = (d._box && !d._isBox ? '〔' + d._box + ' 爆出〕' : '') +
                 (d._isBox ? '〔盲盒未解出爆出物·暂按盒子价〕' : '') +
                 (d._by === 'id' ? '〔按id推定〕' : '');

    // ---- 双通道配对去重（说明见 handle() 与 crossDuplicate()）----
    // 放在计价之前、免费礼物也管：与另一条通道已记过的同一笔重复就整条丢弃，
    // 配不上（说明自有通道漏了）就用页面通道这份补记。
    if (crossDuplicate(fromOwn, {
      uid: pick(giftField(d, ['uid']), (d.user && d.user.uid)),
      uname: uname, name: gname, num: num, price: price, batchId: batchId,
      cum: Number(pick(giftField(d, ['combo_total_coin', 'comboTotalCoin']), 0)) || 0
    })) return;

    if (coinType !== 'gold') {           // 免费礼物：不计钱，但也要让你看见它被收到了
      S.silver += num;
      pushEvent('free', uname, gname + ' ×' + num + '（免费）', 0);
      return;
    }

    var add;
    // 批次累计实付（proto: combo_total_coin）——有它就用它，比 price×个数 更准（含折扣）
    var cumCoin = Number(pick(giftField(d, ['combo_total_coin', 'comboTotalCoin']), 0)) || 0;
    // 量级 / 整除护栏：该字段偶尔会出现房间级大数（与 f7 同源，不可全信）。
    // 真正的批次累计一定是「单价的整数倍」（cum = 单价 × 累计个数），
    // 而 1725515 / 927248 这种除以单价不是整数的，一律不认。
    var cumOk = price > 0 && cumCoin >= price * num && (cumCoin % price) === 0;
    if (batchId && (cumOk || comboNum > 0)) {
      // 连击/批量：报文给的是「这一批的累计量」，只补差额，避免重复计
      var cur = cumOk ? cumCoin : price * comboNum;
      var prev = S.combo[batchId] || 0;
      if (cur > prev) { add = cur - prev; S.combo[batchId] = cur; } else { add = 0; }
    } else {
      // 个数来自报文（V2 走 pb 结构化；V1 走 num 字段），所以「一次送 10 个」是 10 个
      add = price * num;
      if (!add) add = Number(pick(giftField(d, ['total_coin', 'totalCoin']), 0)) || 0;
    }

    if (add <= 0) {
      // 抓到了礼物消息、但算不出金额：照样记一条，别让它悄无声息地消失，
      // 同时把这坨报文的关键信息留下来，方便下一次把字段补齐。
      noteGiftSample(cmd, d);
      pushEvent('gift', uname, gname + ' ×' + num + '（金额未识别）', 0);
      return;
    }

    var yuan = add / GOLD_PER_YUAN;
    var guid = pick(giftField(d, ['uid']), (d.user && d.user.uid));
    // 诊断：把最近几条 V2 礼物的结构化字段记下来（num/单价/那个可疑的 field7/批次），
    // 用来判断「一次送 N 个」到底是 N 条独立消息还是一条累计消息 —— 两者的对账口径不同。
    if (d._v2) {
      if (!S.v2samples) S.v2samples = [];
      var vr = d._v2raw || {};
      S.v2samples.push((gname || '?') + ' num=' + num + ' price=' + price +
        ' f7=' + (vr.totalCoin || 0) + ' cum=' + (vr.comboTotalCoin || 0) +
        ' batch=' + (vr.batchId || '-') + ' who=' + uname);
      while (S.v2samples.length > 3) S.v2samples.shift();
    }
    // 大航海回声：这笔钱 GUARD_BUY 已经记过了，兑掉回声、一分钱都不再计。
    // （修复前这里只是把可疑配对记进疑点样本，钱照记，所以一笔上舰会被记三遍。）
    if (guardEchoKind(gname, add, guid, uname)) {
      guardEcho.left--;
      S.guardDedup = (S.guardDedup || 0) + 1;
      var before = guardEcho.total;
      // 回声价比 GUARD_BUY 报的低 → 这是打折/活动舰长，按回声的实付额把那笔上舰压下来
      var lowered = applyEchoPrice(add);
      S.echoSample = (cmd || '?') + ' · ' + gname + ' ×' + num + ' · ' +
        (add / GOLD_PER_YUAN).toFixed(2) + ' 元 · ' + uname +
        (lowered ? '（按实付价把上舰 ' + (before / GOLD_PER_YUAN).toFixed(2) +
                   ' → ' + (add / GOLD_PER_YUAN).toFixed(2) + ' 元）' : '');
      // 金额既不是实付也不是档位价的（例如回声价和两者都不同），留一条疑点备查
      if (!lowered && add !== guardEcho.total && add !== guardEcho.std) {
        noteSusp('大航海回声已去重(金额与实付不符)', cmd, gname + ' ×' + num + ' ' +
          (add / GOLD_PER_YUAN).toFixed(2) + ' 元 · 同一人 ' + uname +
          ' · 上舰实付 ' + (guardEcho.total / GOLD_PER_YUAN).toFixed(2) +
          ' 元 / 档位标准价 ' + (guardEcho.std / GOLD_PER_YUAN).toFixed(2) + ' 元');
      }
      return;
    }
    S.gold += add;
    addUser(guid, uname, yuan);
    pushEvent('gift', uname, gname + boxTag + ' ×' + num, yuan);
    // 反向顺序的备胎：这条看起来像上舰回声，就先记着；几秒内若真有 GUARD_BUY 进来，
    // absorbPendingEcho() 会把它回并掉。
    if (add >= GUARD_PRICE_FLOOR && (gname === '礼物' || guardNameLike(gname))) {
      rememberEchoish(guid, uname, add, uname, gname + boxTag + ' ×' + num);
    }
  }

  // 醒目留言（SC）。官方一共四个名字：SUPER_CHAT_MESSAGE / _JPN（同一笔的日文重发）/
  // _DELETE（撤回或退款）/ _ENTRANCE（进场提示）。
  // 三个坑都在这里：
  //   ①旧代码只精确匹配第一个名字，_JPN 到了不认；
  //   ②更致命的是一旦主消息那次没收到（例如被通道闸门丢掉），_JPN 也跟着被丢 —— 这笔就永久漏了；
  //   ③_DELETE 不处理，退款/撤回的 SC 会一直挂在流水里（多记）。
  // SC 自带唯一 id，可以跨通道去重，所以它是「两条通道互为备份」的最佳候选。

  function scKey(d, yuan) {
    if (d.id != null && String(d.id)) return 'id:' + d.id;
    var nm = (d.user_info && d.user_info.uname) || '?';
    return 'k:' + nm + '|' + yuan + '|' + String(d.message || '').slice(0, 24);
  }

  // 「这条消息里有没有钱的痕迹」—— 用来给「不认识的金钱消息」留档，
  // 而不是像以前那样静默丢掉（SC 漏账当初就是这么藏起来的）。
  // 只看「有没有金额字段」这条硬证据，不靠 cmd 名字猜：
  // 名字像礼物、其实是连线信息的 UNIVERSAL_EVENT_GIFT 就不会被误报。
  var MONEY_KEYS = ['price', 'total_price', 'total_coin', 'coin_type', 'amount', 'pay_money', 'rmb'];
  function moneySmell(cmd, d) {
    if (/^SUPER_CHAT/.test(String(cmd || ''))) return true;   // SC 家族一律留档（它必然带钱）
    if (!d || typeof d !== 'object') return false;
    var i, k;
    for (i = 0; i < MONEY_KEYS.length; i++) if (d[MONEY_KEYS[i]] != null) return true;
    for (i = 0; i < MONEY_KEYS.length; i++) {                  // 再看一层嵌套（gift / user_info 之类）
      for (k in d) {
        var v = d[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && v[MONEY_KEYS[i]] != null) return true;
      }
    }
    return false;
  }

  // SC 的金额字段不可靠：曾出现多笔都被记成 2 元的情况，而 B站 SC 最低 30 元。
  // 主消息（SUPER_CHAT_MESSAGE）和日文重发（_JPN）带的字段可能不一样，谁先到就用谁的价；
  // 因此：① 保留报文样本以便对照；② 同一笔后续出现更高价时只补差额，不重复计入。
  function noteScSample(cmd, d) {
    if (!S.scSamples) S.scSamples = [];
    // 样本头部放金额字段与类型，其后跟报文原文前半段；
    // 这样即使报文被截断，也能一眼看出到底是不是读错了字段。
    var head = (cmd || '?') + ' price=' + (d && d.price) + '(' + (typeof (d && d.price)) + ')' +
      ' dmscore=' + (d && d.dmscore) + ' rate=' + (d && d.rate) + ' gift=' +
      (d && d.gift ? JSON.stringify(d.gift).slice(0, 120) : '-');
    try {
      S.scSamples.push(head + ' | keys=' + Object.keys(d || {}).join(',') +
        ' | raw=' + JSON.stringify(d).slice(0, 900));
    } catch (e) { S.scSamples.push(head + ' (无法序列化)'); }
    while (S.scSamples.length > 3) S.scSamples.shift();
  }

  function onSuperChat(d, cmd) {
    if (!d) return;
    var yuan = Number(d.price) || 0;
    var key = scKey(d, yuan);
    noteScSample(cmd, d);

    var seen = S.scSeen[key];
    if (seen) {
      // 同一笔又来一次：只有这次带的价更高才动账（主消息一般比日文重发完整）
      var old = (typeof seen === 'number') ? seen : 0;
      if (yuan > old) {
        var delta = yuan - old;
        S.scSeen[key] = yuan;
        var nameU = (d.user_info && d.user_info.uname) || '?';
        var uidU = (d.uid != null) ? d.uid : (d.user_info && d.user_info.uid);
        S.sc += delta;
        addUser(uidU, nameU, delta);
        for (var k = S.events.length - 1; k >= 0; k--) {      // 事件行也跟着补
          if (S.events[k].kind === 'sc' && S.events[k].who === nameU && S.events[k].yuan === old) {
            S.events[k].yuan = yuan;
            break;
          }
        }
        S.scUpgraded = (S.scUpgraded || 0) + 1;
        noteSusp('SC 金额按更完整的那条报升级', cmd || '?', nameU + ' ' +
          old.toFixed(2) + ' → ' + yuan.toFixed(2) + ' 元');
      }
      return;                                  // 同一笔不重复计
    }
    if (d.id != null && S.scSeen[String(d.id)]) return;     // 兼容旧版把裸 id 当键的记录

    S.scSeen[key] = yuan || 1;      // 记住金额，_DELETE 时好撤
    var name = (d.user_info && d.user_info.uname) || '?';
    var uid = (d.uid != null) ? d.uid : (d.user_info && d.user_info.uid);
    S.sc += yuan;
    addUser(uid, name, yuan);
    pushEvent('sc', name, String(d.message || '').slice(0, 40), yuan);
  }

  // 醒目留言被撤回 / 退款：把已经记进去的那笔撤回来
  function onSuperChatDelete(d) {
    if (!d) return;
    var id = (d.id != null) ? String(d.id) : ((d.message_ids && d.message_ids[0]) || '');
    var key = id ? 'id:' + id : '';
    var yuan = (key && typeof S.scSeen[key] === 'number') ? S.scSeen[key] : (Number(d.price) || 0);
    if (!(yuan > 0)) { noteSusp('SC 撤回但查不到原金额', 'SUPER_CHAT_MESSAGE_DELETE', 'id=' + id); return; }
    if (key) delete S.scSeen[key];
    var name = (d.user_info && d.user_info.uname) || '?';
    takeBack('sc', findKeyByName(name), yuan,
      function (ev) { return ev.kind === 'sc' && ev.who === name && Math.abs((ev.yuan || 0) - yuan) < 0.01; },
      function (ev) { ev.yuan = 0; ev.text = String(ev.text) + '（已撤回）'; });
    noteSusp('SC 撤回已撤账', 'SUPER_CHAT_MESSAGE_DELETE', name + ' ' + yuan.toFixed(2) + ' 元');
  }

  function onGuardBuy(d, fromOwn) {
    if (!d) return;
    var lv = Number(d.guard_level) || 3;
    var num = Number(d.num) || 1;
    var hasPrice = Number(d.price) > 0;
    // 双通道配对去重：上舰同样不能整条丢页面通道那份（自有 WS 停顿时会漏掉整笔上舰）
    if (crossDuplicate(fromOwn, {
      uid: d.uid, uname: d.username, name: 'GUARD_BUY_L' + lv, num: num,
      price: hasPrice ? Number(d.price) : (GUARD_DEFAULT_PRICE[lv] || 0), batchId: '', cum: 0
    })) return;
    var price = hasPrice ? Number(d.price) : (GUARD_DEFAULT_PRICE[lv] || 0);
    // 报文里没有 price 时只能按档位默认价估，这种也要留样本，方便核对是不是估错了
    if (!hasPrice) {
      try { noteSusp('舰长用默认价', 'GUARD_BUY', '字段=' + Object.keys(d).join(',') + ' | ' + JSON.stringify(d).slice(0, 160)); } catch (e) {}
    }
    // 记下这笔上舰，供礼物侧兑掉「同一笔钱的回声」（见 guardEchoKind），
    // 并用回声价把「打折舰长」的金额修正成实付额（见 applyEchoPrice）。
    // key/who 要和下面 addUser / pushEvent 用的完全一致，否则后面改动不了同一行。
    guardEcho = {
      uid: String(d.uid || ''),
      uname: String(d.username || ''),
      who: d.username || '?',
      key: '',                                   // 由 addUser 返回后填上（按昵称/uid 收敛）
      at: Date.now(),
      total: price * num,
      std: GUARD_DEFAULT_PRICE[lv] || 0,
      left: GUARD_ECHO_MAX
    };
    var yuan = (price * num) / GOLD_PER_YUAN;
    S.guard += yuan;
    S.guards[lv] = (S.guards[lv] || 0) + num;
    guardEcho.key = addUser(d.uid, d.username, yuan);
    pushEvent('guard', d.username || '?', (GUARD_NAME[lv] || '大航海') + ' ×' + num, yuan);
    absorbPendingEcho();                       // 先看有没有「回声比上舰先到」的漏网之鱼
    watchGuard(d.username || '?', guardEcho.key, yuan);   // 再挂「待核」，等官方榜单确认是否真付款
  }

  // 礼物类消息的判定：不只看 cmd 名字，也看数据长什么样。
  function looksGiftLike(d) {
    if (!d || typeof d !== 'object') return false;
    var hasGift = (d.giftId != null || d.gift_id != null || d.giftName != null || d.gift_name != null);
    var hasMoney = (d.price != null || d.total_coin != null || d.coin_type != null);
    return hasGift && hasMoney;
  }

  function handle(msg, fromOwn) {
    if (!msg) return;
    if (Array.isArray(msg)) { for (var i = 0; i < msg.length; i++) handle(msg[i], fromOwn); return; }
    var cmd = msg.cmd;
    if (typeof cmd !== 'string') return;
    var d = msg.data;
    S.hits++;
    if (fromOwn) S.ownCmds[cmd] = (S.ownCmds[cmd] || 0) + 1;
    else S.pageCmds[cmd] = (S.pageCmds[cmd] || 0) + 1;

    // 关键：B站现在发的是 SEND_GIFT_V2，不再是 SEND_GIFT。
    // 用前缀匹配，以后它再改成 V3 也不会漏。
    var isGiftCmd = /^SEND_GIFT/.test(cmd);
    var isGuardCmd = /^GUARD_BUY/.test(cmd);
    var isScCmd = /^SUPER_CHAT_MESSAGE/.test(cmd);
    var isScDelete = isScCmd && /_DELETE$/.test(cmd);
    var isScMoney = isScCmd && !isScDelete;
    var isMoney = (isGiftCmd || isScMoney || isGuardCmd);
    // 礼物和上舰**不再整条丢弃**页面通道的那一份（旧做法），改成在 onSendGift / onGuardBuy
    // 里做「双通道配对去重」：配得上就丢（和旧行为一致），配不上说明自有通道漏了 → 由页面通道补记。
    // 只用自有通道记钱时，其连接重连期间收到的流水会丢失；
    // 自有 WS 重连那一段（火石l ¥14 / 粘性雷管 ¥9.2 / 式波_アスカ ¥9.1）直接漏账，
    // 按高能榜增量算覆盖率只有 94.3%。SC 本来就走唯一 id 去重，不受影响。

    if (isGiftCmd) {
      S.giftMsgs++;
      // 关键诊断：礼物消息「收到多少条」和「记了多少条」必须能分开看。
      // 自检窗里 SEND_GIFT_V2 收到 118 条、礼物消息却只有 18 条，只有把两个通道
      // 各自的记账数分别落盘，才能判断是「哪条通道的礼物没被记」而不是靠肉眼猜。
      if (fromOwn) S.giftOwn = (S.giftOwn || 0) + 1; else S.giftPage = (S.giftPage || 0) + 1;
      onSendGift(d, cmd, fromOwn);
    }
    else if (/^POPULARITY_RED_POCKET/.test(cmd)) {
      // 人气红包（含上舰红包）：只登记，**不计入流水** —— 红包本身没有价值，
      // 内容物被中奖人用掉、以礼物形式发出来时才算礼物流水（那条走 onSendGift）。
      // 绝不能再落到下面 looksGiftLike 的兜底路上 —— 那条路会按 _NEW.price
      // 否则它会被当成一笔礼物按 price 计钱，且两条通道各记一遍。
      S.pocketMsgs = (S.pocketMsgs || 0) + 1;
      onRedPacket(cmd, d);
    }
    else if (/^USER_TOAST_MSG/.test(cmd)) {
      // 上舰/续费提示：钱已经在 GUARD_BUY 里记过，这里只计数，永不计钱，
      // 也不再让它去占「回声额度」（以前它会被回声规则当成无名礼物吃掉）。
      S.toastMsgs = (S.toastMsgs || 0) + 1;
    }
    else if (isScMoney) {
      S.scMsgs++;
      // 记录 SC 是从哪条通道来的：万一某条通道收不到 SC，这条诊断一眼就能看出来
      if (fromOwn) S.scOwn = (S.scOwn || 0) + 1; else S.scPage = (S.scPage || 0) + 1;
      onSuperChat(d, cmd);
    }
    else if (isScDelete) { onSuperChatDelete(d); }
    else if (isGuardCmd) { S.guardMsgs++; onGuardBuy(d, fromOwn); }
    else if (/^(COMBO_SEND|GIFT_COMBO)$/.test(cmd)) {
      // 连击续报 / 连击解锁提示：真正的钱在 SEND_GIFT_V2 里，这两类再记一次就翻倍。
      // GIFT_COMBO 字段：{biz_type, giftId, giftName, super_batch_gift_num, demarcation, uid, uname}
      // —— 没有任何金额字段，属于连击解锁提示，真正的钱在 SEND_GIFT_V2 里。
      S.comboMsgs = (S.comboMsgs || 0) + 1;
    }
    else if (looksGiftLike(d)) {
      // 名字不认识但长得像礼物：记下 cmd 名和样本，同时尽力按礼物记账
      S.giftMsgs++;
      var rec = S.odd[cmd] || (S.odd[cmd] = { n: 0, sample: '' });
      rec.n++;
      if (!rec.sample) {
        try { rec.sample = JSON.stringify(d).slice(0, 240); } catch (e) { rec.sample = '(无法序列化)'; }
      }
      onSendGift(d, cmd, fromOwn);
    }
    else {
      // 完全不认识的消息里，如果带着钱的痕迹（price / 金额 / 名字里有 CHAT、GIFT、BUY 之类），
      // 就留一条痕迹备查 —— 这类漏账以前是「静默消失」，找起来毫无线索。
      if (moneySmell(cmd, d)) {
        var om = S.oddMoney[cmd] || (S.oddMoney[cmd] = { n: 0, sample: '' });
        om.n++;
        if (!om.sample) {
          try { om.sample = JSON.stringify(d).slice(0, 240); } catch (e) { om.sample = '(无法序列化)'; }
        }
        if (om.n === 1) noteSusp('未处理的疑似金钱消息', cmd, '（已记样本，见自检窗）');
      }
      return;
    }

    save();
    render();
  }

  // ---------------- 通道一：劫持页面的 JSON.parse ----------------
  (function hookParse() {
    JSON.parse = function (text, reviver) {
      var out = origParse.call(this, text, reviver);
      try {
        if (out && typeof out === 'object') handle(out, false);
      } catch (e) { /* 绝不影响页面本身 */ }
      return out;
    };
  })();

  // ---------------- 通道二：自己直连 B 站弹幕服务器 ----------------
  var NativeWS = window.WebSocket;
  var stolenAuth = null;
  var ownWs = null;
  var ownWsReady = false;
  var ownBeatTimer = null;
  var ownProtover = 2;   // 先按 zlib 连；发现 brotli 可用就升到 3

  function biliPacket(op, bodyStr) {
    var body = bodyStr ? new TextEncoder().encode(bodyStr) : new Uint8Array(0);
    var buf = new ArrayBuffer(16 + body.length);
    var dv = new DataView(buf);
    dv.setUint32(0, 16 + body.length);   // 整包长度
    dv.setUint16(4, 16);                 // 头长度
    dv.setUint16(6, 1);                  // 协议版本
    dv.setUint32(8, op);                 // 操作码：2=心跳 7=鉴权
    dv.setUint32(12, 1);                 // 序号
    new Uint8Array(buf, 16).set(body);
    return buf;
  }

  // 把可能拼接在一起的多个 JSON 对象切开（按花括号配对，跳过字符串内部）
  function splitJson(text) {
    var out = [], depth = 0, start = -1, inStr = false, esc = false;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '{') { if (depth === 0) start = i; depth++; }
      else if (c === '}') {
        depth--;
        if (depth === 0 && start >= 0) { out.push(text.slice(start, i + 1)); start = -1; }
      }
    }
    return out;
  }

  function feedOwn(text) {
    var parts = splitJson(text);
    for (var i = 0; i < parts.length; i++) {
      try { handle(origParse(parts[i]), true); } catch (e) {}
    }
  }

  function inflate(kind, body) {
    var stream = new Blob([body]).stream().pipeThrough(new DecompressionStream(kind));
    return new Response(stream).text();
  }

  function ownDecodeFailed() {
    S.undecoded++;
    // 如果一开始就大量解不开，说明 protover 谈崩了，退回去用 zlib 重连一次
    if (ownProtover === 3 && S.undecoded > 5 && Object.keys(S.ownCmds).length === 0) {
      ownProtover = 2;
      try { if (ownWs) ownWs.close(); } catch (e) {}
      ownWs = null; ownWsReady = false; S.undecoded = 0;
      setTimeout(startOwnWs, 600);
    }
    render();
  }

  function decodeOwnFrame(data) {
    try {
      var dv = new DataView(data);
      var packetLen = dv.getUint32(0);
      var headerLen = dv.getUint16(4);
      var ver = dv.getUint16(6);
      var op = dv.getUint32(8);
      if (packetLen > data.byteLength) packetLen = data.byteLength;
      S.vers[ver] = (S.vers[ver] || 0) + 1;
      if (op === 3 || op === 8) return;          // 心跳回复 / 鉴权回复
      if (op !== 5) return;                      // 5 = 普通消息
      var body = new Uint8Array(data, headerLen, packetLen - headerLen);
      if (ver === 2) {
        inflate('deflate', body).then(feedOwn).catch(ownDecodeFailed);
      } else if (ver === 3) {
        if (!S.brotli) { ownDecodeFailed(); return; }
        inflate('brotli', body).then(feedOwn).catch(ownDecodeFailed);
      } else if (ver === 0 || ver === 1) {
        feedOwn(new TextDecoder().decode(body));
      } else {
        ownDecodeFailed();
      }
    } catch (e) { /* 单帧解不开就算了，别影响其它帧 */ }
  }

  function startOwnWs() {
    if (ownWs || !stolenAuth) return;
    var m = /^wss?:\/\/([^\/]+)/.exec(stolenAuth.url || '');
    var host = m ? m[1] : 'broadcastlv.chat.bilibili.com:443';
    S.ownState = 'connecting';
    render();
    try {
      ownWs = new NativeWS('wss://' + host + '/sub');
      ownWs.binaryType = 'arraybuffer';
      ownWs.onopen = function () {
        try {
          ownWs.send(biliPacket(7, JSON.stringify({
            uid: stolenAuth.uid || 0,
            roomid: Number(stolenAuth.roomid) || Number(roomId) || 0,
            protover: ownProtover,
            platform: 'web',
            type: 2,
            key: stolenAuth.key || ''
          })));
          ownWsReady = true;
          S.ownState = 'open';
          if (ownBeatTimer) clearInterval(ownBeatTimer);
          ownBeatTimer = setInterval(function () {
            if (ownWs && ownWs.readyState === 1) { try { ownWs.send(biliPacket(2, '')); } catch (e) {} }
          }, 30000);
        } catch (e) { S.ownState = 'failed'; }
        render();
      };
      ownWs.onmessage = function (ev) { decodeOwnFrame(ev.data); };
      ownWs.onerror = function () { S.ownState = 'failed'; ownWsReady = false; render(); };
      ownWs.onclose = function () {
        ownWsReady = false; ownWs = null;
        S.ownState = 'closed';
        if (ownBeatTimer) { clearInterval(ownBeatTimer); ownBeatTimer = null; }
        render();
      };
    } catch (e) {
      ownWs = null; ownWsReady = false; S.ownState = 'failed'; render();
    }
  }

  (function hookWs() {
    function HookedWs(url, protocols) {
      var ws = (protocols === undefined) ? new NativeWS(url) : new NativeWS(url, protocols);
      try {
        var rawSend = ws.send.bind(ws);
        ws.send = function (data) {
          try {
            if (!stolenAuth && data && data.byteLength >= 16) {
              var dv = new DataView(data);
              var plen = dv.getUint32(0);
              var hlen = dv.getUint16(4);
              var op = dv.getUint32(8);
              if (op === 7 && plen <= data.byteLength) {
                var a = origParse(new TextDecoder().decode(new Uint8Array(data, hlen, plen - hlen)));
                if (a && a.key) {
                  stolenAuth = { url: String(url), key: a.key, roomid: a.roomid, uid: a.uid };
                  startOwnWs();
                }
              }
            }
          } catch (e) { /* 偷不到就退回只用页面那条流 */ }
          return rawSend(data);
        };
      } catch (e) {}
      return ws;
    }
    HookedWs.prototype = NativeWS.prototype;
    try {
      HookedWs.CONNECTING = NativeWS.CONNECTING;
      HookedWs.OPEN = NativeWS.OPEN;
      HookedWs.CLOSING = NativeWS.CLOSING;
      HookedWs.CLOSED = NativeWS.CLOSED;
    } catch (e) {}
    window.WebSocket = HookedWs;
  })();

  // 兜底：万一页面是在 Web Worker 里建的连接（那样 send 钩子抓不到），
  // 就直接问官方接口要一次弹幕服务器地址和 token，自己连。
  function fetchDanmuInfo() {
    if (stolenAuth || ownWs) return;
    var rid = Number(roomId) || 0;
    if (!rid) return;
    try {
      fetch('https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?id=' +
            rid + '&type=0', { credentials: 'include' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (ownWs || !j || j.code !== 0 || !j.data || !j.data.token) return;
          var hosts = j.data.host_list || [];
          var h = hosts[0] || {};
          var host = (h.host || 'broadcastlv.chat.bilibili.com') + (h.wss_port ? ':' + h.wss_port : '');
          stolenAuth = { url: 'wss://' + host + '/sub', key: j.data.token, roomid: rid, uid: 0 };
          startOwnWs();
        })
        .catch(function () {});
    } catch (e) {}
  }

  // ---------------- 礼物价目表 + protobuf 拆解 ----------------
  // B站把礼物消息换成了 SEND_GIFT_V2，payload 只有 dmscore 和一个 base64 的 protobuf(pb)。
  // 不去猜 protobuf 的 schema，而是：
  //   1) 拉官方价目表拿到 礼物id/名字 -> 价格
  //   2) 用 wire format 通用拆解 pb，把里面的字符串和整数都取出来
  //   3) 用「名字优先、id 兜底」去对上价目表
  var GIFT_LIST_API = 'https://api.live.bilibili.com/xlive/web-room/v1/giftPanel/roomGiftList';
  var giftById = {};      // gift_id -> { name, price }
  var giftByName = {};    // name -> price
  var giftListState = '未请求';

  function collectGifts(node, depth) {
    if (!node || typeof node !== 'object' || (depth || 0) > 8) return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) collectGifts(node[i], (depth || 0) + 1);
      return;
    }
    if (node.id != null && node.name != null && node.price != null) {
      var id = Number(node.id), price = Number(node.price);
      if (id && price >= 0) {
        giftById[id] = { name: String(node.name), price: price };
        if (giftByName[node.name] == null) giftByName[String(node.name)] = price;
      }
    }
    for (var k in node) {
      if (Object.prototype.hasOwnProperty.call(node, k) && node[k] && typeof node[k] === 'object') {
        collectGifts(node[k], (depth || 0) + 1);
      }
    }
  }

  function fetchGiftList() {
    var rid = Number(roomId) || 0;
    if (!rid) return;
    try {
      fetch(GIFT_LIST_API + '?platform=pc&room_id=' + rid, { credentials: 'include' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          collectGifts(j, 0);
          var n = Object.keys(giftById).length;
          giftListState = n ? ('OK · ' + n + ' 个礼物') : '空';
          render();
          fetchBlindPrizes();     // 再把盲盒奖池并进来
        })
        .catch(function () { giftListState = '请求失败'; render(); });
    } catch (e) { giftListState = '异常'; }
  }

  // 盲盒专属奖品（星光铃铛、星愿花园…）不在房间礼物面板里，
  // 所以按名字永远匹配不到 —— 这里把盲盒奖池也拉进来补全。
  // 注意：这个接口要求登录；未登录会返回 code -101，那就只能放弃（宁可标「未识别」也不瞎猜）。
  var BLIND_API = 'https://api.live.bilibili.com/xlive/general-interface/v1/blindFirstWin/getInfo';
  var blindState = '未请求';

  function fetchBlindPrizes() {
    var boxIds = [];
    Object.keys(giftById).forEach(function (id) {
      var g = giftById[id];
      if (g && g.name && g.name.indexOf('盲盒') >= 0) boxIds.push(Number(id));
    });
    if (!boxIds.length) { blindState = '价目表里没有盲盒'; render(); return; }
    boxIds = boxIds.slice(0, 8);
    blindState = '获取中…';
    render();

    var left = boxIds.length, added = 0, failed = 0;
    function fin() {
      left--;
      if (left > 0) return;
      blindState = 'OK · 补入 ' + added + ' 项' + (failed ? '（' + failed + ' 个拿不到）' : '');
      render();
    }
    boxIds.forEach(function (bid) {
      try {
        fetch(BLIND_API + '?gift_id=' + bid, { credentials: 'include' })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (j && j.code === 0 && j.data && j.data.gifts && j.data.gifts.length) {
              j.data.gifts.forEach(function (g) {
                var gid = Number(g.gift_id), gp = Number(g.price), gn = g.gift_name;
                if (!gid || !(gp > 0) || !gn) return;
                if (!giftById[gid]) { giftById[gid] = { name: String(gn), price: gp }; added++; }
                if (giftByName[gn] == null) { giftByName[String(gn)] = gp; added++; }
              });
            } else { failed++; }
            fin();
          })
          .catch(function () { failed++; fin(); });
      } catch (e) { failed++; fin(); }
    });
  }

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function readVarint(buf, pos) {
    var result = 0, shift = 0, b;
    while (pos < buf.length) {
      b = buf[pos++];
      result += (b & 0x7f) * Math.pow(2, shift);   // 用乘法避免 32 位溢出
      shift += 7;
      if (!(b & 0x80)) return { value: result, pos: pos };
      if (shift > 63) break;
    }
    return null;
  }

  // 只有整段都是「可打印文本」才当成字符串，否则当成嵌套 message 继续往下拆
  function tryUtf8(sub) {
    if (!sub.length) return null;
    try {
      var s = new TextDecoder('utf-8', { fatal: true }).decode(sub);
      if (s.replace(/[\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, '').length > 0) return null;
      return s;
    } catch (e) { return null; }
  }

  // ---- 结构化读 pb（保留「哪个字段属于哪一层」，拍平的做法做不到这一点）----
  // 字段号来自官方 .proto：SendGiftV2.uid=1 uname=2 gift_list=10(repeated GiftItem)
  // GiftItem: gift_id=1 gift_name=2 num=3 price=5 discount_price=6 total_coin=7
  //           coin_type=8 super_batch_gift_num=11 batch_combo_id=12 combo_total_coin=14
  function pbFields(buf) {
    var out = [], pos = 0;
    while (pos < buf.length) {
      var tag = readVarint(buf, pos);
      if (!tag) break;
      pos = tag.pos;
      var fno = Math.floor(tag.value / 8), wire = tag.value % 8;
      if (wire === 0) {
        var v = readVarint(buf, pos);
        if (!v) break;
        pos = v.pos;
        out.push({ f: fno, v: v.value });
      } else if (wire === 2) {
        var len = readVarint(buf, pos);
        if (!len) break;
        pos = len.pos;
        var end = pos + len.value;
        if (end > buf.length) break;
        out.push({ f: fno, raw: buf.subarray(pos, end) });
        pos = end;
      } else if (wire === 5) { if (pos + 4 > buf.length) break; pos += 4; }
      else if (wire === 1) { if (pos + 8 > buf.length) break; pos += 8; }
      else break;
    }
    return out;
  }

  function firstInt(fs, f) {
    for (var i = 0; i < fs.length; i++) if (fs[i].f === f && fs[i].v != null) return fs[i].v;
    return 0;
  }
  function firstStr(fs, f) {
    for (var i = 0; i < fs.length; i++) {
      var x = fs[i];
      if (x.f !== f || !x.raw) continue;
      var t = tryUtf8(x.raw);
      if (t !== null) return t;
    }
    return '';
  }

  // 给「像 GiftItem 的节点」打分 —— 必须挑最好的，不能取第一个。
  // 坑：报文顶层除礼物 #10 之外还有一个**粉丝牌**子消息 #8（#1=主播 uid、#5=粉丝牌等级、#6=粉丝牌名），
  // 它同样满足「有 #1 且有 #5/#7」的粗形状判断，且在字段顺序上排在真正的礼物之前，
  // 因此不能取「第一个像礼物的节点」，必须按特征打分挑最优（否则一次送 N 个会被读成 ×1）。
  // 判别特征：礼物条目的 coin_type(#8) 是字符串（gold/silver）、#9 是长数字字符串、
  // #2 是礼物名、#6 是数字（折扣价）；粉丝牌的 #8 是整数、#6 反倒是字符串。
  function giftItemScore(fs, canonical) {
    var s = canonical ? 8 : 0;                 // 标准位置：顶层 #10（gift_list）里
    if (firstStr(fs, 8)) s += 4;               // coin_type 是字符串
    if (firstStr(fs, 9)) s += 2;               // 流水号（长数字字符串）
    if (firstStr(fs, 2)) s += 2;               // 礼物名
    if (firstInt(fs, 3) > 0) s += 3;           // 个数
    if (firstInt(fs, 5) > 0) s += 3;           // 单价
    if (firstStr(fs, 12)) s += 2;              // batch_combo_id
    if (firstInt(fs, 14) > 0) s += 1;          // combo_total_coin
    if (firstStr(fs, 6)) s -= 6;               // 粉丝牌的 #6 是名字，礼物的 #6 是数字
    return s;
  }

  // 找「GiftItem 形状」的子消息：有 gift_id 且有 price/total_coin。
  // 标准形状在顶层 #10（gift_list）；外面若还包了一层也能靠递归认出来。
  // 返回 [{fs, score}]，由调用方按 score 取最优。
  function findGiftItems(buf, depth, out, canonical) {
    out = out || [];
    if (!buf || !buf.length) return out;
    var fs = pbFields(buf);
    if (firstInt(fs, 1) && (firstInt(fs, 5) || firstInt(fs, 7))) {
      out.push({ fs: fs, score: giftItemScore(fs, !!canonical) });
    }
    if (depth >= 3) return out;
    for (var i = 0; i < fs.length; i++) {
      var raw = fs[i].raw;
      if (!raw || !raw.length) continue;
      if (tryUtf8(raw) !== null) continue;          // 是文本，不是子消息
      findGiftItems(raw, (depth || 0) + 1, out, !depth && fs[i].f === 10);
    }
    return out;
  }

  // 返回得分最高的那条 GiftItem 的结构化字段（拿不到就 null）
  function readSendGiftV2(bytes) {
    var items = findGiftItems(bytes, 0, []);
    if (!items.length) return null;
    items.sort(function (a, b) { return b.score - a.score; });   // 分了才稳：同分保持 DFS 顺序
    var it = items[0].fs;
    var top = pbFields(bytes);
    // 只取「真的在用」的字段。刻意不取 discount_price(6)/coin_type(8)/super_batch_gift_num(11)/
    // uid(1)：没有依据，取了容易被别的子消息冒充。
    // totalCoin(7) 只喂诊断样本，不参与计价 —— 它有时是房间级计数器。
    return {
      giftId: firstInt(it, 1),
      name: firstStr(it, 2),
      num: firstInt(it, 3) || 1,
      price: firstInt(it, 5),
      totalCoin: firstInt(it, 7),
      batchId: firstStr(it, 12),
      comboTotalCoin: firstInt(it, 14),
      uname: firstStr(top, 2)
    };
  }

  function pbWalk(buf, depth, acc) {
    acc = acc || { varints: [], strings: [], fields: [] };
    depth = depth || 0;
    var pos = 0;
    while (pos < buf.length) {
      var tag = readVarint(buf, pos);
      if (!tag) break;
      pos = tag.pos;
      var fno = Math.floor(tag.value / 8);
      var wire = tag.value % 8;
      if (wire === 0) {
        var v = readVarint(buf, pos);
        if (!v) break;
        pos = v.pos;
        acc.varints.push(v.value);
        acc.fields.push('#' + fno + '=' + v.value);
      } else if (wire === 2) {
        var len = readVarint(buf, pos);
        if (!len) break;
        pos = len.pos;
        var end = pos + len.value;
        if (end > buf.length) break;
        var sub = buf.subarray(pos, end);
        pos = end;
        var txt = tryUtf8(sub);
        if (txt !== null) {
          acc.strings.push(txt);
          acc.fields.push('#' + fno + '="' + txt + '"');
        } else if (depth < 4) {
          pbWalk(sub, depth + 1, acc);
        }
      } else if (wire === 5) { if (pos + 4 > buf.length) break; pos += 4; }
      else if (wire === 1) { if (pos + 8 > buf.length) break; pos += 8; }
      else break;
    }
    return acc;
  }

  // 拆一条 SEND_GIFT_V2，尽力对上官方价目表
  // 分工：结构化读只负责「旧路径拿不到的东西」—— 个数 num、本条实付 total_coin、批次信息；
  //       名字/单价/盲盒判定仍走下面那套规则（含盲盒爆出物与按 id 推定的护栏）。
  function decodeGiftProto(d) {
    var pb = d && (d.pb || d.Pb);
    if (!pb || typeof pb !== 'string') return null;
    var bytes;
    try { bytes = b64ToBytes(pb); } catch (e) { return null; }
    var acc;
    try { acc = pbWalk(bytes, 0); } catch (e) { return null; }
    var v2 = null;
    try { v2 = readSendGiftV2(bytes); } catch (e) { v2 = null; }
    // 从结构化结果里只取这些，其余字段不用，免得与已有规则冲突
    var v2num = (v2 && v2.num > 0) ? v2.num : 1;
    var v2who = (v2 && v2.uname) ? v2.uname : '';

    // 先把「所有能对上价目表的名字」都收出来。
    // 盲盒的报文里会同时出现「盒子名」和「爆出来的礼物名」，必须取后者 ——
    // 盒子的名字里都带「盲盒」，所以优先挑不带「盲盒」的那个匹配。
    function pickBest(list) {
      if (!list.length) return null;
      var notBox = list.filter(function (m) { return m.name.indexOf('盲盒') < 0; });
      var pool = notBox.length ? notBox : list;
      var box = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i].name.indexOf('盲盒') >= 0) { box = list[i].name; break; }
      }
      return { name: pool[0].name, price: pool[0].price, box: box, isBox: !notBox.length && !!box };
    }

    var nameHits = [];
    for (var i = 0; i < acc.strings.length; i++) {
      var s = acc.strings[i];
      if (giftByName[s] != null) nameHits.push({ name: s, price: giftByName[s], at: i });
    }
    var best = pickBest(nameHits);
    var by = '名字';

    if (!best) {
      // 「按 id 猜」这条路很危险：盲盒奖品（星光铃铛之类）常常不在价目表里，
      // 报文里任何一个整数（uid、时间戳片段）都可能撞上某个礼物 id，算出一个完全错误的价钱。
      // 所以这里加两道锁：① 礼物 id 的合理范围；② 报文里出现「盲盒」字样时不猜。
      var hasBoxWord = false;
      for (var s2 = 0; s2 < acc.strings.length; s2++) {
        if (acc.strings[s2].indexOf('盲盒') >= 0) { hasBoxWord = true; break; }
      }
      if (!hasBoxWord) {
        var idHits = [];
        for (var j = 0; j < acc.varints.length; j++) {
          var vv = acc.varints[j];
          if (vv < 1000 || vv > 99999999) continue;   // 礼物 id 的合理区间
          var g = giftById[vv];
          if (g) idHits.push({ name: g.name, price: g.price });
        }
        best = pickBest(idHits);
        by = 'id';
      }
    }

    if (!best) {
      // 拍平的路子对不上价目表时，用结构化字段兜底：名字/单价/实付都在里面。
      // 但盲盒相关一律不兜底 —— 那条路要取「爆出物」，结构化这条只会拿到盒子本身。
      if (v2 && !(v2.name && v2.name.indexOf('盲盒') >= 0) && !(v2.giftId && giftById[v2.giftId] &&
          String(giftById[v2.giftId].name).indexOf('盲盒') >= 0)) {
        var nm2 = v2.name || (v2.giftId && giftById[v2.giftId] ? giftById[v2.giftId].name : '');
        var unit2 = v2.price > 0 ? v2.price : (nm2 && giftByName[nm2] != null ? giftByName[nm2] : 0);
        if (nm2 && unit2 > 0) {
          return {
            name: nm2, price: unit2, who: v2who || '?', num: v2num,
            box: '', isBox: false, by: 'pb结构化',
            v2raw: v2, allStrings: acc.strings.slice(0, 10)
          };
        }
      }
      return { miss: true, fields: acc.fields.slice(0, 16), strings: acc.strings.slice(0, 8) };
    }

    // 送礼人：结构化里 field#2 就是主播收到的送礼人昵称，优先用它；拿不到再退回字符串启发式
    var who = v2who || '?';
    if (!v2who) {
      for (var k = 0; k < acc.strings.length; k++) {
        var t = acc.strings[k];
        if (t === best.name || t === best.box) continue;
        if (giftByName[t] != null) continue;
        if (/^https?:/i.test(t) || t.length > 24) continue;
        who = t; break;
      }
    }
    // 只把 num 带进记账（依据官方 .proto）。
    //    绝不带 total_coin：该字段在不同人身上会出现同一个大数（房间级计数器），
    //    一旦当成金额兜底，就会把 0.1 元的礼物记成上千元。
    return {
      name: best.name, price: best.price, who: who, num: v2num,
      box: best.box, isBox: best.isBox, by: by,
      v2raw: v2, allStrings: acc.strings.slice(0, 10)
    };
  }

  // ---------------- 通道三：B站官方高能榜（贡献值） ----------------
  // 完全不依赖弹幕协议：官方就按「贡献值」列出本场每个用户，
  // 这是前两条路都拿不到礼物时的兜底。
  var RANK_API = 'https://api.live.bilibili.com/xlive/general-interface/v1/rank/getOnlineGoldRank';
  var ROOM_INFO_API = 'https://api.live.bilibili.com/room/v1/Room/get_info';
  var ownerUid = 0;      // 主播 uid —— 高能榜接口的 ruid 必须是它
  var myUid = 0;

  function fetchOwnerUid(cb) {
    if (ownerUid) { if (cb) cb(); return; }
    var rid = Number(roomId) || 0;
    if (!rid) return;
    try {
      fetch(ROOM_INFO_API + '?room_id=' + rid, { credentials: 'include' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j && j.code === 0 && j.data && j.data.uid) {
            ownerUid = Number(j.data.uid);
            S.anchorUid = ownerUid;
            if (cb) cb();
          }
        })
        .catch(function () {});
    } catch (e) {}
  }

  (function pickUid() {
    try {
      var m = /(?:^|;\s*)DedeUserID=(\d+)/.exec(document.cookie || '');
      if (m) myUid = Number(m[1]);
    } catch (e) {}
    if (!myUid) {
      try { myUid = Number(window.BilibiliLive && window.BilibiliLive.uid) || 0; } catch (e) {}
    }
    if (!myUid) myUid = 451537183;   // 实测该接口只要 ruid 是个合法数字就能返回
  })();

  function pollRank() {
    var rid = Number(roomId) || 0;
    if (!rid) { S.rankState = '无房间号'; return; }
    // 关键：这个接口的 ruid 必须是「主播 uid」，不是观众 uid。
    // 传观众 uid（尤其未登录时编的）会返回 code 0 但榜单为空。
    if (!ownerUid) {
      S.rankState = '取主播 uid…';
      fetchOwnerUid(pollRank);
      return;
    }
    // 翻 3 页：只取第 1 页（前 50 名）会让排名在外的上舰用户核不过，
    // 进而被误判成赠送舰长撤账 —— 热门直播间榜单常有上百人。
    var PAGE_SIZE = 50, MAX_PAGE = 3, all = [];
    function fetchPage(page) {
      return fetch(RANK_API + '?roomId=' + rid + '&ruid=' + ownerUid + '&page=' + page + '&pageSize=' + PAGE_SIZE,
                   { credentials: 'include' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || j.code !== 0 || !j.data) return { err: '接口返回 code=' + (j && j.code) };
          var items = j.data.OnlineRankItem || [];
          for (var i = 0; i < items.length; i++) all.push(items[i]);
          if (items.length >= PAGE_SIZE && page < MAX_PAGE) return fetchPage(page + 1);
          return { num: Number(j.data.onlineNum) || 0 };
        });
    }
    try {
      fetchPage(1)
        .then(function (res) {
          if (res && res.err) { S.rankState = res.err; render(); return; }
          if (!all.length) { S.rankState = '接口返回空榜 code=0'; render(); return; }
          S.rankList = all.map(function (it) {
            var nm = (it.uinfo && it.uinfo.base && it.uinfo.base.name) || it.name || ('uid ' + it.uid);
            return { name: nm, score: Number(it.score) || 0, guard: Number(it.guard_level) || 0 };
          }).sort(function (a, b) { return b.score - a.score; });
          S.rankNum = (res && res.num) || S.rankList.length;
          S.rankState = 'OK · ' + fmtTime(Date.now()) + ' · ' + S.rankList.length + ' 人';
          verifyPendingGuards();      // 榜单刷新后核验「待核」的上舰是不是真付了钱
          render();
        })
        .catch(function () { S.rankState = '请求失败'; render(); });
    } catch (e) { S.rankState = '异常 ' + e.message; }
  }

  if (typeof DecompressionStream === 'function') {
    try { new DecompressionStream('brotli'); S.brotli = true; } catch (e) { S.brotli = false; }
  }
  // brotli 可用就用 protover=3 连：礼物消息可能只在 3 里下发
  if (S.brotli) ownProtover = 3;

  // ---------------- 货币换算（人民币 / 日元） ----------------
  // 汇率多源回退：jsDelivr 优先（国内可达性好），失败再试另外两个。
  var CUR_KEY = 'dsh_bili_liushui_cur';
  var cur = { mode: 'CNY', rate: 0, at: 0, src: '', state: '未获取' };

  // 「抽成后流水」——真正打到主播账户上的钱。
  // 官方口径（哔哩哔哩直播主播帮助中心的《用户收益结算》，原文摘录）：
  //   「1. 主播一般收益计提标准：（1）收益源于PC端、Android端App：主播按照50%计提（税前）；
  //     （2）收益源于iOS端App：自2020年7月1日起，在iOS扣除渠道费30%后，主播按照50%计提（税前）」
  //   「2. 主播大航海收益计提标准：（1）PC/Android：按照50%计提（税前）；（2）iOS：按照25%计提（税前）」
  //   另有：银瓜子道具/活动领取道具无收益；与平台或公会另有约定的按约定；
  //         金仓鼠与人民币 1000:1（与插件 GOLD_PER_YUAN 一致）；
  //         互动礼物另给创作者开放平台 5% 服务费（普通礼物 50% 时互动礼物为 45%）。
  // 弹幕协议里看不出投喂来自哪个端，所以统一按 PC/安卓口径 **50%** 折算；
  // iOS 端（一般收益先扣 30% 渠道费 → 约 35%、大航海 25%）只在文档里备注，不参与计算。
  var CUT_RATE = 0.5;
  var cutOn = false;          // 「抽成后流水」开关（跟汇率模式一起持久化）

  function loadCur() {
    try {
      var o = origParse(localStorage.getItem(CUR_KEY) || 'null');
      if (o && typeof o === 'object') {
        if (o.mode === 'JPY' || o.mode === 'CNY') cur.mode = o.mode;
        if (o.rate > 0) {
          cur.rate = o.rate; cur.at = o.at || 0; cur.src = o.src || '';
          cur.state = '缓存';
        }
        if (o.cut === true) cutOn = true;
      }
    } catch (e) {}
  }
  function saveCur() {
    try {
      localStorage.setItem(CUR_KEY, JSON.stringify({
        mode: cur.mode, rate: cur.rate, at: cur.at, src: cur.src, cut: cutOn
      }));
    } catch (e) {}
  }

  function fetchRate() {
    var sources = [
      { n: 'jsdelivr',
        u: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cny.json',
        pick: function (j) { return j && j.cny && j.cny.jpy; } },
      { n: 'er-api',
        u: 'https://open.er-api.com/v6/latest/CNY',
        pick: function (j) { return j && j.rates && j.rates.JPY; } },
      { n: 'exchangerate-api',
        u: 'https://api.exchangerate-api.com/v4/latest/CNY',
        pick: function (j) { return j && j.rates && j.rates.JPY; } }
    ];
    var i = 0;
    function tryNext() {
      if (i >= sources.length) {
        cur.state = cur.rate > 0 ? '刷新失败(用缓存)' : '全部源失败';
        render(); return;
      }
      var s = sources[i++];
      try {
        fetch(s.u, { credentials: 'omit' })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            var v = Number(s.pick(j));
            if (v > 0) {
              cur.rate = v; cur.at = Date.now(); cur.src = s.n; cur.state = 'OK';
              saveCur(); render();
            } else { tryNext(); }
          })
          .catch(function () { tryNext(); });
      } catch (e) { tryNext(); }
    }
    cur.state = '获取中';
    render();
    tryNext();
  }

  // 所有金额都走这里：人民币用 ¥，日元用「円」后缀避免混淆
  function yuan(cny) {
    cny = cny || 0;
    if (cur.mode === 'JPY' && cur.rate > 0) {
      var jpy = cny * cur.rate;
      if (jpy === 0) return '0 円';
      var txt = jpy >= 100 ? Math.round(jpy).toLocaleString('en-US')
              : (jpy >= 1 ? jpy.toFixed(1) : jpy.toFixed(2));
      return txt + ' 円';
    }
    if (cny > 0 && cny < 1) return '¥' + cny.toFixed(3);
    return '¥' + cny.toFixed(2);
  }
  function total() { return (S.gold / GOLD_PER_YUAN) + S.sc + S.guard; }   // 红包不计入（只算礼物/SC/大航海）
  function fmtTime(ms) {
    var d = new Date(ms);
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---------------- 反馈配套：一键复制诊断信息 ----------------
  // 为什么做这个：别人来反馈「数字好像不对」时，我第一件事永远是问版本、房间号、两条通道各收了多少、
  // 有没有未识别命令 —— 与其来回问五轮，不如让他点一下按钮、把这段贴给我。
  // 隐私：这段文字只在本机拼装、只进剪贴板，脚本不会自动发出去；里面含房间号与部分昵称，
  //       贴出去之前可以自己删改（按钮的 tooltip 里写明了）。
  function diagText() {
    var L = [];
    L.push('B站直播流水看板 诊断信息');
    L.push('版本: v' + SCRIPT_VERSION);
    L.push('页面: ' + location.href);
    L.push('房间: ' + roomId + ' · 主播uid: ' + (ownerUid || '（未取到）'));
    L.push('统计开始: ' + fmtTime(S.since));
    L.push('本场金额: 礼物 ¥' + (S.gold / GOLD_PER_YUAN).toFixed(2) + '（' + S.gold + ' 电池） · SC ¥' + S.sc.toFixed(2) +
      ' · 大航海 ¥' + S.guard.toFixed(2) + ' · 免费礼物 ' + S.silver + ' 个');
    L.push('消息数: 共 ' + S.hits + '（礼物 ' + S.giftMsgs + ' · SC ' + S.scMsgs + ' · 大航海 ' + S.guardMsgs + '）');
    L.push('独立通道: ' + (S.ownState || '?') + ' · 收到礼物 ' + (S.giftOwn || 0) + ' / SC ' + (S.scOwn || 0) +
      ' · 网页端: 礼物 ' + (S.giftPage || 0) + ' / SC ' + (S.scPage || 0));
    L.push('双通道配对去重: 丢弃重复 ' + (S.crossDedup || 0) + ' · 页面通道补记 ' + (S.pageRescue || 0));
    L.push('上舰核验: 回声去重 ' + (S.guardDedup || 0) + ' · 按实付压价 ' + (S.guardAdjusted || 0) +
      ' · 未核验不撤账 ' + (S.guardUnverified || 0));
    L.push('红包: 报文 ' + (S.pocketMsgs || 0) + ' 条 · 登记 ' + (S.pocketCount || 0) + ' 个（不计流水）');
    var odd = Object.keys(S.odd || {}), om = Object.keys(S.oddMoney || {});
    L.push('未识别礼物命令: ' + (odd.length ? odd.join(', ') : '无'));
    L.push('疑似金钱消息: ' + (om.length ? om.join(', ') : '无'));
    var susp = (S.susp || []).slice(-3);
    if (susp.length) L.push('疑点样本:\n  ' + susp.join('\n  '));
    var ev = (S.events || []).slice(-5);
    if (ev.length) {
      L.push('最近事件:');
      for (var i = 0; i < ev.length; i++) {
        L.push('  ' + fmtTime(ev[i].t) + ' ' + ev[i].kind + ' ' + ev[i].who + ' ' + ev[i].text + ' ¥' + (ev[i].yuan || 0));
      }
    }
    return L.join('\n');
  }

  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    try {   // 兜底：老式 execCommand（某些非安全上下文里 clipboard API 不可用）
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }

  // 收款码地址白名单：只认 data:image/ 与 https:，其余（javascript:、http:、相对路径…）一律不显示。
  function safeImgUrl(u) {
    u = String(u || '').trim();
    if (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(u)) return u;
    if (/^https:\/\/[^\s"'<>]+$/i.test(u)) return u;
    return '';
  }

  // 打赏浮层的内容（按需展开时才拼）。**没有收款码就不产生任何 HTML** ——
  // 只配了平台链接（爱发电之类）的情况由页脚那个 <a> 直接跳转处理，不需要浮层。
  function qrHtml() {
    var a = safeImgUrl(DONATE_QR_ALIPAY), w = safeImgUrl(DONATE_QR_WECHAT);
    if (!a && !w) return '';
    var box = function (url, label, color) {
      return '<div style="text-align:center;">' +
        '<img src="' + esc(url) + '" alt="' + label + '收款码" style="width:132px;height:132px;display:block;' +
        'background:#fff;border-radius:4px;border:1px solid #2c3342;">' +
        '<div style="color:' + color + ';margin-top:4px;">' + label + '</div></div>';
    };
    var imgs = [];
    if (a) imgs.push(box(a, '支付宝', '#7fd1ff'));
    if (w) imgs.push(box(w, '微信', '#7ee787'));
    var h = '<div style="color:#ffd166;font-weight:600;margin-bottom:6px;">支持一下作者</div>';
    if (imgs.length) h += '<div style="display:flex;gap:10px;justify-content:center;">' + imgs.join('') + '</div>';
    h += '<div style="color:#8b93a7;margin-top:8px;line-height:1.7;">' +
      '看板免费、不接广告、也不要求任何东西；打赏全凭自愿，不给钱一样用，功能完全一样。' +
      (DONATE_NOTE ? '<br>' + esc(DONATE_NOTE) : '') + '<br>' +
      '<span style="color:#ffd166;">⚠️ 扫码前请核对收款人姓名</span>；收款码只是静态图片，' +
      '改过的副本可能被换成别人的码 —— ' +
      (OFFICIAL_URL
        ? '请只从官方地址下载：<a href="' + esc(OFFICIAL_URL) + '" target="_blank" rel="noopener noreferrer" ' +
          'style="color:#7fd1ff;">' + esc(OFFICIAL_URL) + '</a>'
        : '请只从你拿到脚本的那个可信来源使用。') +
      (DONATE_URL
        ? '<br>或者：<a href="' + esc(DONATE_URL) + '" target="_blank" rel="noopener noreferrer" ' +
          'style="color:#7fd1ff;">通过爱发电等平台打赏（能留言）</a>'
        : '') +
      '</div>';
    return h;
  }

  // 面板页脚那行：反馈 / 打赏 / 复制诊断。留空的不显示，所以不会出现死链。
  function linksHtml() {
    var sep = ' <span style="color:#3a4152;">·</span> ';
    var arr = [];
    if (FEEDBACK_URL) {
      arr.push('<a href="' + esc(FEEDBACK_URL) + '" target="_blank" rel="noopener noreferrer" ' +
        'style="color:#7fd1ff;text-decoration:none;" title="提 bug / 提需求：点开即发起 QQ 会话；建议把「复制诊断信息」的内容一起贴上">反馈 / 提需求</a>');
    }
    if (FEEDBACK_EMAIL) {
      arr.push('<a href="mailto:' + esc(FEEDBACK_EMAIL) + '" style="color:#7fd1ff;text-decoration:none;" ' +
        'title="邮箱反馈：' + esc(FEEDBACK_EMAIL) + '（同样建议附上诊断信息）">邮箱</a>');
    }
    var hasQr = !!(safeImgUrl(DONATE_QR_ALIPAY) || safeImgUrl(DONATE_QR_WECHAT));
    if (hasQr) {
      // 有收款码：点一下在面板里展开浮层（不弹窗、不自动打开）
      arr.push('<span id="dsh-ls-donate" style="cursor:pointer;color:#ffd166;" ' +
        'title="点开看作者的收款码；打赏全凭自愿，不影响任何功能">请作者喝杯奶茶</span>');
    } else if (DONATE_URL) {
      arr.push('<a href="' + esc(DONATE_URL) + '" target="_blank" rel="noopener noreferrer" ' +
        'style="color:#ffd166;text-decoration:none;" title="' + esc(AUTHOR_NAME) + ' 维护的免费看板；打赏全凭自愿，不影响任何功能">请作者喝杯奶茶</a>');
    }
    arr.push('<span id="dsh-ls-diag" style="cursor:pointer;color:#7fd1ff;" ' +
      'title="把版本 / 房间号 / 两条通道的收包统计 / 疑点样本复制到剪贴板。内容含房间号与部分昵称，贴出去前可自行删改；脚本不会自动发送。">复制诊断信息</span>');
    return arr.join(sep);
  }

  var el = {};

  function buildUI() {
    if (document.getElementById('dsh-liushui-root')) return;

    var root = document.createElement('div');
    root.id = 'dsh-liushui-root';
    root.style.cssText = 'position:fixed;right:16px;top:180px;z-index:2147483000;font:12px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;color:#e8eaf0;';

    root.innerHTML = [
      '<div id="dsh-ls-toggle" title="点一下展开 / 收起，按住可以拖动" style="width:46px;height:46px;border-radius:50%;background:#1f2430;border:1px solid #3a4152;box-shadow:0 4px 14px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;cursor:move;font-size:18px;user-select:none;touch-action:none;">💰</div>',
      // 面板本体：视口自适应 —— 高度上限要扣掉「💰 圆钮(46px) + 上下留白」，
      // 因为圆钮和面板是上下叠着放在同一个 fixed 容器里的；扣完再配合 clampPos，
      // 保证展开后面板整体（含底部导出/重置/页脚）始终在屏幕内，超出部分由内容区滚动。
      // 内容高于视口时，由内容区滚动，保证底部按钮始终可达。
      '<div id="dsh-ls-panel" style="display:none;width:330px;background:#171b24;border:1px solid #3a4152;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.55);overflow:hidden;max-height:calc(100vh - 80px);flex-direction:column;">',
      '  <div id="dsh-ls-head" style="flex:0 0 auto;padding:8px 10px;background:#1f2430;display:flex;align-items:center;justify-content:space-between;cursor:move;touch-action:none;border-bottom:1px solid #2c3342;">',
      '    <b style="color:#7fd1ff;">本场流水 · 房间 ' + roomId + '</b>',
      '    <span style="display:flex;align-items:center;gap:4px;">',
      '      <span id="dsh-ls-cur" title="点击切换 人民币 / 日元" style="cursor:pointer;background:#2b6cb0;border-radius:4px;padding:1px 6px;font-size:11px;user-select:none;">¥ 人民币</span>',
      '      <span id="dsh-ls-close" style="cursor:pointer;color:#8b93a7;padding:0 4px;">✕</span>',
      '    </span>',
      '  </div>',
      '  <div id="dsh-ls-body" style="flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;scrollbar-width:thin;padding:10px;">',
      '    <div style="display:flex;align-items:baseline;gap:8px;">',
      '      <div id="dsh-ls-total" style="font-size:26px;font-weight:700;color:#ffd166;letter-spacing:.5px;flex:1;min-width:0;">¥0.00</div>',
      '      <button id="dsh-ls-cut" title="按官方计提比例折算：真正打到主播账户上的钱（税前）" style="background:#2b3a55;border:1px solid #3a4152;border-radius:6px;color:#9aa3b5;font-size:11px;padding:4px 8px;cursor:pointer;white-space:nowrap;">抽成后流水</button>',
      '    </div>',
      '    <div id="dsh-ls-totalnote" style="color:#8b93a7;margin-bottom:8px;">本场总计（礼物+SC+大航海）</div>',
      '    <div id="dsh-ls-fx" style="color:#5c6478;font-size:11px;margin-bottom:8px;"></div>',
      // 首次使用提示：放在总金额下方（**必须靠上**，放页脚会因为面板内容长而被挤到滚动区外面，
      // 等于没人看得到）。只出现一次，点过「知道了」写入 localStorage 后永不再现；不弹窗、不遮挡页面。
      '    <div id="dsh-ls-hint" style="display:none;margin-bottom:8px;padding:6px 8px;background:#1b2230;' +
      'border:1px solid #2c3342;border-radius:6px;color:#9aa3b5;font-size:11px;line-height:1.7;"></div>',
      '    <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">',
      '      <tr><td style="color:#9aa3b5;">付费礼物</td><td id="dsh-ls-gift" style="text-align:right;">¥0.00</td></tr>',
      '      <tr><td style="color:#9aa3b5;">超级留言 SC</td><td id="dsh-ls-sc" style="text-align:right;">¥0.00</td></tr>',
      '      <tr><td style="color:#9aa3b5;">大航海</td><td id="dsh-ls-guard" style="text-align:right;">¥0.00</td></tr>',
      // 人气红包这一行按用户要求删除（红包不计流水，留着只是噪音）。
      // ⚠️ 但 onRedPacket() 那条处理逻辑必须留着：它负责把红包报文从礼物计价的路上截走，
      //    删掉逻辑红包又会被当成「名字不认识的礼物」按 price 计钱、还会被两条通道各记一遍。
      '      <tr><td style="color:#9aa3b5;">免费礼物</td><td id="dsh-ls-silver" style="text-align:right;">0 个</td></tr>',
      '    </table>',
      '    <div id="dsh-ls-guards" style="color:#8b93a7;margin-bottom:8px;"></div>',
      '    <div style="color:#7fd1ff;font-weight:600;margin:6px 0 4px;">贡献榜（WS 抓到的礼物/SC/大航海）</div>',
      '    <div id="dsh-ls-rank" style="max-height:54px;overflow:auto;background:#11141b;border-radius:6px;padding:6px;"></div>',
      '    <div style="color:#7fd1ff;font-weight:600;margin:8px 0 4px;">高能榜 · B站官方贡献值</div>',
      '    <div id="dsh-ls-rankapi" style="max-height:54px;overflow:auto;background:#11141b;border-radius:6px;padding:6px;"></div>',
      '    <div id="dsh-ls-rankapifoot" style="color:#8b93a7;margin-top:4px;font-size:11px;"></div>',
      '    <div style="color:#7fd1ff;font-weight:600;margin:8px 0 4px;">最近事件</div>',
      '    <div id="dsh-ls-events" style="max-height:120px;overflow:auto;background:#11141b;border-radius:6px;padding:6px;"></div>',
      '    <div style="display:flex;gap:6px;margin-top:8px;">',
      '      <input id="dsh-ls-room" placeholder="输入房间号" style="flex:1;min-width:0;background:#11141b;border:1px solid #3a4152;border-radius:6px;color:#e8eaf0;padding:4px 6px;">',
      '      <button id="dsh-ls-go" style="background:#2b6cb0;border:0;border-radius:6px;color:#fff;padding:4px 10px;cursor:pointer;">跳转</button>',
      '    </div>',
      '    <div style="display:flex;gap:6px;margin-top:6px;">',
      '      <button id="dsh-ls-csv" style="flex:1;background:#2f855a;border:0;border-radius:6px;color:#fff;padding:5px 0;cursor:pointer;">导出 CSV</button>',
      '      <button id="dsh-ls-reset" style="flex:1;background:#7b341e;border:0;border-radius:6px;color:#fff;padding:5px 0;cursor:pointer;">重置本场</button>',
      '    </div>',
      '    <div style="color:#5c6478;margin-top:8px;font-size:11px;">连接测试 / 自检已移到屏幕左上角独立小窗</div>',
      '    <div id="dsh-ls-links" style="margin-top:6px;font-size:11px;color:#5c6478;"></div>',
      // 收款码浮层：默认隐藏，点页脚「请作者喝杯奶茶」才展开（不弹窗、不自动打开）
      '    <div id="dsh-ls-qr" style="display:none;margin-top:8px;padding:8px;background:#11141b;' +
      'border:1px solid #2c3342;border-radius:6px;font-size:11px;"></div>',
      '  </div>',
      '</div>'
    ].join('');

    document.body.appendChild(root);

    el.root = root;
    el.toggle = root.querySelector('#dsh-ls-toggle');
    el.panel = root.querySelector('#dsh-ls-panel');
    el.close = root.querySelector('#dsh-ls-close');
    el.head = root.querySelector('#dsh-ls-head');
    el.total = root.querySelector('#dsh-ls-total');
    el.totalNote = root.querySelector('#dsh-ls-totalnote');
    el.cutBtn = root.querySelector('#dsh-ls-cut');
    el.gift = root.querySelector('#dsh-ls-gift');
    el.sc = root.querySelector('#dsh-ls-sc');
    el.guard = root.querySelector('#dsh-ls-guard');
    el.silver = root.querySelector('#dsh-ls-silver');
    el.guards = root.querySelector('#dsh-ls-guards');
    el.rank = root.querySelector('#dsh-ls-rank');
    el.rankApi = root.querySelector('#dsh-ls-rankapi');
    el.rankApiFoot = root.querySelector('#dsh-ls-rankapifoot');
    el.events = root.querySelector('#dsh-ls-events');
    el.roomInput = root.querySelector('#dsh-ls-room');
    el.go = root.querySelector('#dsh-ls-go');
    el.csv = root.querySelector('#dsh-ls-csv');
    el.reset = root.querySelector('#dsh-ls-reset');
    el.foot = null;
    el.curBtn = root.querySelector('#dsh-ls-cur');
    el.fx = root.querySelector('#dsh-ls-fx');
    el.links = root.querySelector('#dsh-ls-links');
    el.hint = root.querySelector('#dsh-ls-hint');
    el.qr = root.querySelector('#dsh-ls-qr');

    // 货币切换按钮：人民币 <-> 日元
    if (el.curBtn) {
      el.curBtn.onclick = function (e) {
        if (e && e.stopPropagation) e.stopPropagation();
        cur.mode = (cur.mode === 'CNY') ? 'JPY' : 'CNY';
        saveCur();
        if (cur.mode === 'JPY' && !cur.rate) fetchRate();
        render();
      };
    }
    // 「抽成后流水」按钮：在总金额处切换「面值 ↔ 扣完平台计提后真正到账的钱」
    if (el.cutBtn) {
      el.cutBtn.onclick = function (e) {
        if (e && e.stopPropagation) e.stopPropagation();
        cutOn = !cutOn;
        saveCur();
        render();
      };
    }
    // 收款码浮层：页脚入口与首次提示里的「支持一下作者」共用同一套展开/收起逻辑
    function toggleQr() {
      if (!el.qr) return;
      var show = el.qr.style.display === 'none';
      el.qr.style.display = show ? 'block' : 'none';
      el.qr.innerHTML = show
        ? qrHtml() + '<div id="dsh-ls-qrclose" style="color:#7fd1ff;cursor:pointer;margin-top:6px;text-align:right;">收起</div>'
        : '';
      applyPos();      // 变高了，重新夹一次位置，别把底部顶出屏幕
    }

    // 页脚入口：反馈 / 打赏（<a> 自己会开新标签）、「复制诊断信息」、收款码浮层
    if (el.links) {
      el.links.addEventListener('click', function (e) {
        var t = e.target;
        if (!t) return;
        if (t.id === 'dsh-ls-diag') {
          var ok = copyText(diagText());
          t.textContent = ok ? '已复制 ✓（贴到反馈里就行）' : '复制失败，请手动复制自检窗内容';
          setTimeout(function () { t.textContent = '复制诊断信息'; }, 2600);
        } else if (t.id === 'dsh-ls-donate' || t.id === 'dsh-ls-qrclose') {
          toggleQr();
        }
      });
    }
    // 首次使用提示：点「知道了」只记一次；点「支持一下作者」顺手展开收款码
    if (el.hint) {
      el.hint.addEventListener('click', function (e) {
        var t = e.target;
        if (!t) return;
        if (t.id === 'dsh-ls-hintok') {
          hintDone = true;
          try { localStorage.setItem(HINT_KEY, 'true'); } catch (err) {}
          render();
        } else if (t.id === 'dsh-ls-hintdonate') {
          toggleQr();
        }
      });
    }
    // 点汇率那行可以手动刷新
    if (el.fx) {
      el.fx.style.cursor = 'pointer';
      el.fx.onclick = function () { fetchRate(); };
    }

    // 主面板默认停靠右侧（离边 16px）；位置统一交给 pos + applyPos()（字段含义见下面的拖拽段）
    var DEFAULT_POS = { side: 'right', pad: 16, left: null, top: 180 };
    var savedPos = null;
    try { savedPos = origParse(localStorage.getItem('dsh_bili_liushui_pos') || 'null'); } catch (e) {}
    var restoredPos = null;
    if (savedPos && (savedPos.side === 'left' || savedPos.side === 'right')) {
      restoredPos = { side: savedPos.side, pad: 0, left: null, top: 180 };
      if (typeof savedPos.left === 'number') restoredPos.left = Math.max(0, savedPos.left);
      if (typeof savedPos.top === 'number') restoredPos.top = Math.max(0, savedPos.top);
    } else if (savedPos && typeof savedPos.right === 'number') {
      // 老版本（≤2.8.6）只存了 {right, top}：按「贴右边、离边 right 像素」还原，位置不会跳
      restoredPos = { side: 'right', pad: Math.max(0, savedPos.right), left: null, top: 180 };
      if (typeof savedPos.top === 'number') restoredPos.top = Math.max(0, savedPos.top);
    }
    // 整体赋值（pos 是下面的 var，提升在这里只能赋、不能读字段）
    var pos = restoredPos || DEFAULT_POS;
    applyPos();

    el.toggle.onclick = function () {
      // 刚才那一下是拖着挪位置，不是点击 —— 别顺手把面板开合了
      if (lastGestureWasDrag) return;
      // 展开时用 flex（面板改成「头固定 + 内容区滚动」的列布局，见 buildUI 里的样式）
      el.panel.style.display = (el.panel.style.display === 'none') ? 'flex' : 'none';
      applyPos();     // 展开/收起会改宽度：贴着边时重新贴回去，别探出屏幕
      render();
    };
    el.close.onclick = function () { el.panel.style.display = 'none'; applyPos(); };

    el.go.onclick = function () {
      var v = (el.roomInput.value || '').trim().match(/\d+/);
      if (!v) { el.roomInput.focus(); return; }
      location.href = 'https://live.bilibili.com/' + v[0];
    };
    el.roomInput.onkeydown = function (e) { if (e.key === 'Enter') el.go.onclick(); };

    el.reset.onclick = function () {
      if (!confirm('确定清零「房间 ' + roomId + '」的本场统计？')) return;
      S.gold = 0; S.silver = 0; S.sc = 0; S.guard = 0;
      S.guards = { 1: 0, 2: 0, 3: 0 };
      S.users = {}; S.events = []; S.combo = {}; S.scSeen = {}; S.odd = {}; S.oddMoney = {};
      S.since = Date.now(); S.hits = 0; S.giftMsgs = 0; S.scMsgs = 0; S.guardMsgs = 0;
      S.guardDedup = 0; S.guardAdjusted = 0; S.guardPromo = 0; S.scOwn = 0; S.scPage = 0; S.giftOwn = 0; S.giftPage = 0; S.ownCmds = {}; S.pageCmds = {}; S.echoSample = ''; guardEcho = null; echoish = []; pendingGuards = [];
      S.pocketRef = 0; S.pocketPool = 0; S.pocketCount = 0; S.pocketNoPool = 0; S.pocketWinners = 0; S.pocketLots = {}; S.toastMsgs = 0; S.pocketMsgs = 0;
      S.pocketGuardPool = 0; S.pocketGuardCount = 0; S.pocketWinnersSeen = {};
      S.vers = {}; S.undecoded = 0; S.giftSample = '';
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      render();
    };

    el.csv.onclick = function () {
      var rows = [['UID', '昵称', '贡献(元)']];
      Object.keys(S.users).forEach(function (k) {
        rows.push([k, S.users[k].name, (S.users[k].yuan || 0).toFixed(3)]);
      });
      rows.push([]);
      rows.push(['汇总项', '数值', '']);
      rows.push(['房间号', roomId, '']);
      rows.push(['统计开始', new Date(S.since).toLocaleString('zh-CN'), '']);
      rows.push(['付费礼物(元)', (S.gold / GOLD_PER_YUAN).toFixed(3), '']);
      rows.push(['付费礼物(电池)', String(S.gold), '']);
      rows.push(['超级留言SC(元)', S.sc.toFixed(2), '']);
      rows.push(['大航海(元)', S.guard.toFixed(2), '']);
      rows.push(['人气红包-参考值(元，不计入流水)', (S.pocketRef || 0).toFixed(3), '仅参考：池子×0.25，官方 20% 口径']);
      rows.push(['人气红包-池子合计(金瓜子)', String(S.pocketPool || 0), '来自 _START.total_price']);
      rows.push(['人气红包-已登记个数', String(S.pocketCount || 0), '只登记，不计入流水']);
      rows.push(['人气红包-池子未知个数', String(S.pocketNoPool || 0), '只收到 _NEW、还没等到 _START']);
      rows.push(['人气红包-中奖人数', String(S.pocketWinners || 0), '']);
      rows.push(['上舰红包-个数(rp_type=2)', String(S.pocketGuardCount || 0), '同上：只登记不计流水']);
      rows.push(['上舰红包-池子合计(金瓜子)', String(S.pocketGuardPool || 0), '']);
      rows.push(['上舰提示条数', String(S.toastMsgs || 0), 'USER_TOAST_MSG*，不计钱']);
      rows.push(['本场总计(元)', total().toFixed(2), '面值，未扣平台计提']);
      rows.push(['平台计提比例', (CUT_RATE * 100) + '%', '官方：一般收益/大航海在 PC·安卓端均为 50%（税前）；iOS 见备注']);
      rows.push(['抽成后到账(元)', (total() * CUT_RATE).toFixed(2), '= 面值 × ' + (CUT_RATE * 100) + '%（真正打到主播账户的钱，税前）']);
      rows.push(['抽成后-礼物(元)', ((S.gold / GOLD_PER_YUAN) * CUT_RATE).toFixed(2), '']);
      rows.push(['抽成后-SC(元)', (S.sc * CUT_RATE).toFixed(2), '']);
      rows.push(['抽成后-大航海(元)', (S.guard * CUT_RATE).toFixed(2), '']);
      rows.push(['免费礼物(个)', String(S.silver), '']);
      rows.push(['未核验上舰笔数', String(S.guardUnverified || 0), '榜单查无此人，未撤账']);
      var csv = '\ufeff' + rows.map(function (r) {
        return r.map(function (c) {
          c = (c === undefined || c === null) ? '' : String(c);
          return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
        }).join(',');
      }).join('\r\n');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = 'bili-liushui-' + roomId + '-' + Date.now() + '.csv';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    };

    // 拖拽 + 贴边吸附（左右对称）
    // 折叠成一个 💰 圆钮时也要能拖，所以「面板标题栏」和「💰 圆钮」共用同一套拖拽逻辑。
    // 圆钮上还挂着「点一下展开 / 收起」，所以必须区分「点」和「拖」：位移超过阈值才算拖，
    // 而且拖完的那次 click 要吞掉，否则一拖完面板就自己弹出来了。
    //
    // 位置口径：统一记「左边缘 / 上边缘」，用 left/top 摆放。
    // 老版本只把 right 夹到 ≥0，于是往右顶到边像吸附、往左却能一路滑出屏幕（左边没有边界）。
    // 现在整块始终被夹在视口内，左右两条竖边都能吸附：
    //   · side='left' / 'right' = 吸在这一侧（宽度变化时重新贴合，展开收起不会越贴越歪）
    //   · side=null = 自由摆放，位置就是 left/top
    var DRAG_THRESHOLD = 3;        // 位移小于这个像素数就当点击
    var SNAP_GAP = 24;             // 松手时离左右边缘小于这个距离就吸附过去
    var lastGestureWasDrag = false;

    function viewportW() { return window.innerWidth || (document.documentElement || {}).clientWidth || 0; }
    function viewportH() { return window.innerHeight || (document.documentElement || {}).clientHeight || 0; }

    // pos 的值在上面「恢复上次位置」那一段就赋好了（side / pad / left / top 四个字段），这里只用不重建。
    // 整块始终夹在视口里：往左拖顶住左边缘、往右拖顶住右边缘，上下同理
    function clampPos(left, top) {
      var w = root.offsetWidth || 46, h = root.offsetHeight || 46;
      var maxL = Math.max(0, viewportW() - w), maxT = Math.max(0, viewportH() - h);
      if (!(left >= 0)) left = 0;              // NaN 也当 0
      if (left > maxL) left = maxL;
      if (!(top >= 0)) top = 0;
      if (top > maxT) top = maxT;
      return { left: left, top: top };
    }

    // 按 pos 重新摆一次：吸在边上时，宽度变了（展开 / 收起 / 缩放窗口）也跟着重新贴合
    function applyPos() {
      var w = root.offsetWidth || 46, c;
      if (pos.side === 'left') c = clampPos(0, pos.top);
      else if (pos.side === 'right') c = clampPos(viewportW() - w - (pos.pad || 0), pos.top);
      else c = clampPos(pos.left == null ? 16 : pos.left, pos.top);
      pos.left = c.left; pos.top = c.top;
      root.style.right = 'auto';               // left / right 同时给值会把面板拉宽
      root.style.left = pos.left + 'px';
      root.style.top = pos.top + 'px';
    }

    function savePos() {
      try {
        localStorage.setItem('dsh_bili_liushui_pos',
          JSON.stringify({ side: pos.side, left: pos.left, top: pos.top }));
      } catch (e) {}
    }

    // 松手：离哪条竖边近就吸过去（左右对称），都不近就自由摆放
    function settlePos() {
      var w = root.offsetWidth || 46;
      var c = clampPos(pos.left, pos.top);
      pos.left = c.left; pos.top = c.top;
      var maxL = Math.max(0, viewportW() - w);
      if (pos.left <= SNAP_GAP) { pos.side = 'left'; pos.pad = 0; }
      else if (pos.left >= maxL - SNAP_GAP) { pos.side = 'right'; pos.pad = 0; }
      else { pos.side = null; pos.pad = 0; }
      applyPos();
      savePos();
    }

    function attachDrag(handle) {
      var sx = 0, sy = 0, sl = 0, st = 0, on = false, moved = false;

      function press(x, y) {
        on = true; moved = false;
        lastGestureWasDrag = false;     // 每次按下重新判定，免得漏一次就把后面的点击也吞了
        sx = x; sy = y;
        // 用实际矩形当基准：展开/收起会改宽度，靠 pos 推算容易差一截
        var r = (typeof root.getBoundingClientRect === 'function') ? root.getBoundingClientRect() : null;
        sl = r ? r.left : (pos.left || 0);
        st = r ? r.top : (pos.top || 0);
      }
      function drag(x, y) {
        if (!on) return;
        var dx = x - sx, dy = y - sy;
        if (!moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        moved = true;
        lastGestureWasDrag = true;
        pos.side = null; pos.pad = 0;
        var c = clampPos(sl + dx, st + dy);
        pos.left = c.left; pos.top = c.top;
        applyPos();
      }
      function release() {
        if (!on) return;
        on = false;
        if (!moved) return;
        settlePos();
      }

      // 鼠标
      handle.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;     // 只认左键
        press(e.clientX, e.clientY);
        e.preventDefault();
      });
      document.addEventListener('mousemove', function (e) { drag(e.clientX, e.clientY); });
      document.addEventListener('mouseup', release);

      // 触屏（移动端适配）：同一套逻辑，坐标取第一根手指
      handle.addEventListener('touchstart', function (e) {
        var t = e.touches && e.touches[0];
        if (!t) return;
        press(t.clientX, t.clientY);
        if (e.cancelable) e.preventDefault();
      }, { passive: false });
      document.addEventListener('touchmove', function (e) {
        if (!on) return;
        var t = e.touches && e.touches[0];
        if (!t) return;
        drag(t.clientX, t.clientY);
        if (e.cancelable) e.preventDefault();
      }, { passive: false });
      document.addEventListener('touchend', release);
      document.addEventListener('touchcancel', release);
    }
    attachDrag(el.head);
    attachDrag(el.toggle);

    // 窗口尺寸变了（转屏 / 拖窗口 / 缩放）也要重新贴边，别把面板留在屏幕外
    // 窗口尺寸变了（转屏 / 拖窗口 / 缩放）也要重新贴边，别把面板或自检小窗留在屏幕外
    if (window.addEventListener) {
      window.addEventListener('resize', function () {
        applyPos();
        if (dbg.apply) dbg.apply();
      });
    }

    render();
  }

  // ---------------- 左侧「连接测试 / 自检」独立小窗 ----------------
  // 用户要求：导出/重置按钮之后那一大坨自检文字，从面板里搬出来，单独钉在屏幕左边。
  var dbg = {};

  function buildDebug() {
    if (document.getElementById('dsh-liushui-debug')) return;
    var box = document.createElement('div');
    box.id = 'dsh-liushui-debug';
    box.style.cssText = 'position:fixed;left:16px;top:16px;z-index:2147483000;width:360px;' +
      'font:11px/1.55 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;color:#9aa3b5;' +
      'background:rgba(17,20,27,.93);border:1px solid #3a4152;border-radius:8px;' +
      'box-shadow:0 6px 20px rgba(0,0,0,.5);overflow:hidden;';
    box.innerHTML =
      '<div id="dsh-dbg-head" style="padding:5px 8px;background:#1f2430;border-bottom:1px solid #2c3342;' +
      'display:flex;justify-content:space-between;align-items:center;cursor:move;">' +
      '  <b style="color:#7fd1ff;font-weight:600;">连接测试 / 自检</b>' +
      '  <span id="dsh-dbg-fold" style="cursor:pointer;color:#8b93a7;padding:0 6px;user-select:none;">－</span>' +
      '</div>' +
      '<div id="dsh-dbg-body" style="padding:6px 8px;max-height:320px;overflow:auto;word-break:break-all;"></div>';
    document.body.appendChild(box);

    dbg.box = box;
    dbg.body = box.querySelector('#dsh-dbg-body');
    dbg.fold = box.querySelector('#dsh-dbg-fold');
    dbg.head = box.querySelector('#dsh-dbg-head');

    var saved = null;
    try { saved = origParse(localStorage.getItem('dsh_bili_liushui_dbgpos') || 'null'); } catch (e) {}
    // 和主面板一样的规矩：整个小窗始终夹在视口内。
    // （它的内容区本来就有 max-height:320px + overflow:auto，所以高度是有界的；
    //   真正会出问题的是拖得太靠下 —— 末行会被屏幕切掉，因此同样需要夹取。）
    function dbgVW() { return window.innerWidth || (document.documentElement || {}).clientWidth || 0; }
    function dbgVH() { return window.innerHeight || (document.documentElement || {}).clientHeight || 0; }
    function clampDbg(l, t) {
      var w = box.offsetWidth || 360, h = box.offsetHeight || 200;
      if (!(l >= 0)) l = 0;
      if (!(t >= 0)) t = 0;
      if (l > dbgVW() - w) l = Math.max(0, dbgVW() - w);
      if (t > dbgVH() - h) t = Math.max(0, dbgVH() - h);
      return { left: l, top: t };
    }
    function applyDbg() {
      var c = clampDbg(parseInt(box.style.left, 10), parseInt(box.style.top, 10));
      box.style.left = c.left + 'px';
      box.style.top = c.top + 'px';
    }
    dbg.apply = applyDbg;      // 供 resize 时调用（它和主面板共用同一个 resize 监听）
    if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
      box.style.left = Math.max(0, saved.left) + 'px';
      box.style.top = Math.max(0, saved.top) + 'px';
    }
    applyDbg();

    // 点标题栏上的 － / ＋ 折叠
    dbg.fold.onclick = function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      var willHide = dbg.body.style.display !== 'none';
      dbg.body.style.display = willHide ? 'none' : 'block';
      dbg.fold.textContent = willHide ? '＋' : '－';
    };

    // 这个小窗也能拖
    (function dragDbg() {
      var sx = 0, sy = 0, sl = 0, st = 0, on = false;
      dbg.head.addEventListener('mousedown', function (e) {
        on = true;
        sx = e.clientX; sy = e.clientY;
        sl = parseInt(box.style.left, 10); if (isNaN(sl)) sl = 16;
        st = parseInt(box.style.top, 10); if (isNaN(st)) st = 16;
        e.preventDefault();
      });
      document.addEventListener('mousemove', function (e) {
        if (!on) return;
        var c = clampDbg(sl + (e.clientX - sx), st + (e.clientY - sy));
        box.style.left = c.left + 'px';
        box.style.top = c.top + 'px';
      });
      document.addEventListener('mouseup', function () {
        if (!on) return;
        on = false;
        try {
          localStorage.setItem('dsh_bili_liushui_dbgpos',
            JSON.stringify({ left: parseInt(box.style.left, 10), top: parseInt(box.style.top, 10) }));
        } catch (e) {}
      });
    })();

    render();
  }

  function render() {
    if (!el.total) return;
    // 「抽成后流水」：开了就让总金额和三个分项都显示扣完平台计提后真正到账的钱，
    // 金额一律走 yuan()，所以人民币/日元两种模式都自动换算。
    var faceTotal = total();
    el.total.textContent = yuan(cutOn ? faceTotal * CUT_RATE : faceTotal);
    if (el.totalNote) {
      el.totalNote.innerHTML = cutOn
        ? ('抽成后到账 · 按官方 ' + (CUT_RATE * 100) + '% 计提（税前，PC/安卓端）· 面值 ' + yuan(faceTotal) +
           ' <span style="color:#7fd1ff;font-size:11px;">(点按钮切回面值)</span>')
        : '本场总计（礼物+SC+大航海）';
    }
    if (el.cutBtn) {
      el.cutBtn.style.color = cutOn ? '#ffd166' : '#9aa3b5';
      el.cutBtn.style.borderColor = cutOn ? '#ffd166' : '#3a4152';
      el.cutBtn.style.background = cutOn ? '#4a3a12' : '#2b3a55';
      el.cutBtn.textContent = cutOn ? '抽成后 ✓' : '抽成后流水';
    }
    if (el.curBtn) el.curBtn.textContent = (cur.mode === 'JPY') ? '円 日元' : '¥ 人民币';
    if (el.fx) {
      if (cur.mode === 'JPY') {
        var fxTime = cur.at ? fmtTime(cur.at) : '—';
        el.fx.innerHTML = '汇率 1 元 = ' + (cur.rate ? cur.rate.toFixed(3) : '?') + ' 日元' +
          ' · ' + esc(cur.state) + ' · ' + esc(cur.src || '—') + ' · ' + fxTime + ' <span style="color:#7fd1ff;">(点击刷新)</span>';
      } else {
        el.fx.innerHTML = '<span style="color:#5c6478;">（点右上角按钮可切换成日元）</span>';
      }
    }
    var faceGift = S.gold / GOLD_PER_YUAN;
    el.gift.innerHTML = yuan(cutOn ? faceGift * CUT_RATE : faceGift) +
      (S.gold ? ' <span style="color:#5c6478;font-size:11px;">' +
        (cutOn ? '面值 ' + yuan(faceGift) + ' · ' : '') + S.gold + ' 金瓜子</span>' : '');
    el.sc.innerHTML = yuan(cutOn ? S.sc * CUT_RATE : S.sc) +
      (cutOn && S.sc ? ' <span style="color:#5c6478;font-size:11px;">面值 ' + yuan(S.sc) + '</span>' : '');
    el.guard.innerHTML = yuan(cutOn ? S.guard * CUT_RATE : S.guard) +
      (cutOn && S.guard ? ' <span style="color:#5c6478;font-size:11px;">面值 ' + yuan(S.guard) + '</span>' : '');
    el.silver.textContent = S.silver + ' 个';

    // 页脚：反馈 / 打赏 / 复制诊断（留空项不显示）
    if (el.links) el.links.innerHTML = linksHtml();
    // 收款码浮层：配置被清空（或收款码非法）时自动收起，不留一个空盒子
    if (el.qr && el.qr.style.display !== 'none' && !qrHtml()) {
      el.qr.style.display = 'none';
      el.qr.innerHTML = '';
    }
    // 首次使用提示：只在第一次展开面板时出现，点过「知道了」永不再现
    if (el.hint) {
      if (hintDone) el.hint.style.display = 'none';
      else {
        el.hint.style.display = 'block';
        el.hint.innerHTML =
          '面板可以拖动；点右上角 ✕ 收成 💰 圆钮，再点 💰 展开。<br>' +
          '金额口径：1000 电池 = 1 元；红包不计入流水；点「抽成后流水」看扣完平台计提后真正到账的钱。<br>' +
          '左边小窗是排错用的自检信息；遇到数字不对，点页脚「复制诊断信息」' +
          ((FEEDBACK_URL || FEEDBACK_EMAIL) ? '，连同诊断信息一起反馈' : '') + '。<br>' +
          (DONATE_URL || safeImgUrl(DONATE_QR_ALIPAY) || safeImgUrl(DONATE_QR_WECHAT)
            ? '看板免费、按需取用；觉得有用可以<span id="dsh-ls-hintdonate" style="color:#ffd166;cursor:pointer;">支持一下作者</span>（页脚也有入口）。<br>'
            : '') +
          '<span id="dsh-ls-hintok" style="color:#7fd1ff;cursor:pointer;">知道了</span>';
      }
    }
    el.guards.textContent = '总督 ' + (S.guards[1] || 0) + ' · 提督 ' + (S.guards[2] || 0) + ' · 舰长 ' + (S.guards[3] || 0);

    var arr = Object.keys(S.users).map(function (k) {
      return { name: S.users[k].name, yuan: S.users[k].yuan || 0 };
    }).sort(function (a, b) { return b.yuan - a.yuan; }).slice(0, 10);

    // 贡献榜：框体只露 3 行（max-height 54px = 3×18px），其余靠滚动条看
    el.rank.innerHTML = arr.length ? arr.map(function (u, i) {
      var medal = ['🥇', '🥈', '🥉'][i] || ('#' + (i + 1));
      return '<div style="display:flex;justify-content:space-between;gap:8px;line-height:18px;">' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + medal + ' ' + esc(u.name) + '</span>' +
        '<span style="color:#ffd166;">' + yuan(u.yuan) + '</span></div>';
    }).join('') : '<span style="color:#5c6478;">暂无</span>';

    // 高能榜：B站官方贡献值，走 HTTP 接口，和弹幕协议完全无关。
    // 框体同样只露 3 行；「在线 / 合计 / 接口」那行从滚动区里搬出来，免得被挤到框外看不见。
    if (el.rankApi) {
      var rl = S.rankList.slice(0, 10);
      var sum = S.rankList.reduce(function (a, b) { return a + b.score; }, 0);
      el.rankApi.innerHTML = (rl.length ? rl.map(function (u, i) {
        var medal = ['🥇', '🥈', '🥉'][i] || ('#' + (i + 1));
        var g = u.guard ? ' <span style="color:#c792ea;">' + (GUARD_NAME[u.guard] || '') + '</span>' : '';
        return '<div style="display:flex;justify-content:space-between;gap:8px;line-height:18px;">' +
          '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
          medal + ' ' + esc(u.name) + g + '</span>' +
          '<span style="color:#ffd166;">' + u.score + '</span></div>';
      }).join('') : '<span style="color:#5c6478;">榜单为空 / 未开播</span>');
      if (el.rankApiFoot) {
        el.rankApiFoot.innerHTML = '在线 ' + S.rankNum + ' 人 · 贡献值合计 <span style="color:#ffd166;">' + sum + '</span>' +
          ' · <span style="color:#5c6478;">接口: ' + esc(S.rankState) + '</span>' +
          (rl.length > 3 ? ' · <span style="color:#5c6478;">共 ' + S.rankList.length + ' 人，框内可滚动</span>' : '');
      }
    }

    var ev = S.events.slice(-40).reverse();
    el.events.innerHTML = ev.length ? ev.map(function (e) {
      var color = e.kind === 'sc' ? '#ff9f6b'
        : (e.kind === 'guard' ? '#c792ea' : (e.kind === 'free' ? '#8b93a7' : '#7fd1ff'));
      return '<div style="display:flex;justify-content:space-between;gap:8px;">' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#9aa3b5;">' +
        '<span style="color:' + color + ';">' + esc(e.who) + '</span> ' + esc(e.text) + '</span>' +
        '<span style="color:#ffd166;white-space:nowrap;">' + (e.yuan ? yuan(e.yuan) : '') + '</span></div>';
    }).join('') : '<span style="color:#5c6478;">暂无</span>';

    // 自检区：两条通道各自收到哪些 cmd，分别列出来
    function topCmds(map, n) {
      return Object.keys(map).map(function (k) { return [k, map[k]]; })
        .sort(function (a, b) { return b[1] - a[1]; }).slice(0, n)
        .map(function (p) { return p[0] + ' ' + p[1]; }).join(' · ');
    }
    var stateText = { idle: '未启动', connecting: '连接中', open: '已连接', closed: '已断开', failed: '失败' }[S.ownState] || S.ownState;

    var oddKeys = Object.keys(S.odd || {});
    var oddLine = '';
    if (oddKeys.length) {
      oddLine = '<br><span style="color:#ff9f6b;">未识别礼物消息: ' +
        esc(oddKeys.map(function (k) { return k + ' ×' + S.odd[k].n; }).join(', ')) + '</span>' +
        '<br><span style="color:#5c6478;">样本: ' + esc(S.odd[oddKeys[0]].sample) + '</span>';
    }
    var omKeys = Object.keys(S.oddMoney || {});
    if (omKeys.length) {
      oddLine += '<br><span style="color:#ff6b6b;">未处理的疑似金钱消息: ' +
        esc(omKeys.map(function (k) { return k + ' ×' + S.oddMoney[k].n; }).join(', ')) + '</span>' +
        '<br><span style="color:#5c6478;">样本: ' + esc(S.oddMoney[omKeys[0]].sample) + '</span>';
    }

    if (!dbg.body) return;
    // 疑点样本放最上面：排在底部会被小窗的高度截掉，滚轮在小窗里也不一定好用。
    dbg.body.innerHTML =
      ((S.susp && S.susp.length) ? '<span style="color:#ff9f6b;font-weight:600;">疑点样本（最近 ' +
        S.susp.length + ' 条）:</span>' +
        S.susp.map(function (x) { return '<br><span style="color:#c9d1e0;">· ' + esc(x) + '</span>'; }).join('') +
        '<br><br>' : '') +
      '开始于 ' + fmtTime(S.since) + ' · v' + SCRIPT_VERSION + ' · 消息 ' + S.hits + ' 条' +
      '<br>礼物消息 ' + S.giftMsgs + '（独立通道 ' + (S.giftOwn||0) + ' / 网页端 ' + (S.giftPage||0) + '）· SC ' + S.scMsgs + '（独立通道 ' + (S.scOwn||0) + ' / 网页端 ' + (S.scPage||0) + '）· 大航海 ' + S.guardMsgs +
      '<br><span style="color:#ffb86b;">人气红包 ' + (S.pocketMsgs || 0) + ' 条报文 · 登记 ' + (S.pocketCount || 0) + ' 个（池 ¥' + (S.pocketPool / GOLD_PER_YUAN).toFixed(2) + '）· <b>不计入流水</b>' +
      ((S.pocketRef || 0) ? '（官方 20% 口径参考 ¥' + (S.pocketRef || 0).toFixed(3) + '，仅对账用）' : '') +
      ((S.pocketNoPool || 0) ? ' · <span style="color:#ffd166;">' + S.pocketNoPool + ' 个池子未知</span>' : '') +
      ((S.pocketWinners || 0) ? ' · 中奖 ' + S.pocketWinners + ' 人次' : '') +
      ((S.toastMsgs || 0) ? ' · 上舰提示 ' + S.toastMsgs + ' 条（不计钱）' : '') +
      '<br><span style="color:#7fd1ff;">双通道配对去重：重复丢弃 ' + (S.crossDedup || 0) + ' 笔 · <b>页面通道补记 ' +
      (S.pageRescue || 0) + ' 笔</b>（补记是自有 WS 漏收、由网页端那份兜住的钱）</span>' +
      '<br><span style="color:#7fd1ff;">金额：面值 ' + yuan(total()) + ' → 抽成后（' + (CUT_RATE * 100) + '% 计提，税前）<b>' +
      yuan(total() * CUT_RATE) + '</b>' + (cutOn ? ' · 面板正在显示抽成后' : ' · 面板当前显示面值') + '</span>' +
      ((S.pocketGuardCount || 0) ? ' · <span style="color:#8b93a7;">其中上舰红包 ' + S.pocketGuardCount + ' 个（池 ¥' +
        (S.pocketGuardPool / GOLD_PER_YUAN).toFixed(2) + '）</span>' : '') + '</span>' +
      ((S.guardDedup || S.guardAdjusted || S.guardPromo || S.guardUnverified || S.guardPending) ?
        '<br><span style="color:#7fd1ff;">大航海核验: 回声去重 ' + (S.guardDedup || 0) + ' 条' +
        (S.guardAdjusted ? '（其中 ' + S.guardAdjusted + ' 笔按回声实付价压过价）' : '') +
        (S.guardPromo ? '（' + S.guardPromo + ' 笔赠送/活动已撤账）' : '') +
        (S.guardUnverified ? '（<span style="color:#ffd166;">' + S.guardUnverified + ' 笔榜单查无此人、未撤账，请人工确认</span>）' : '') +
        (S.guardPending ? '（待核 ' + S.guardPending + ' 笔）' : '') +
        (S.echoSample ? '（最近: ' + esc(S.echoSample) + '）' : '') + '</span>' : '') +
      ((S.v2samples && S.v2samples.length) ? '<br><span style="color:#5c6478;">最近 V2 礼物字段: ' +
        esc(S.v2samples.join(' ｜ ')) + '</span>' : '') +
      ((S.scSamples && S.scSamples.length) ? '<br><span style="color:#ffd166;">最近 SC 报文: ' +
        esc(S.scSamples.join(' ｜ ')) + '</span>' : '') +
      '<br><span style="color:#7fd1ff;">独立通道（' + stateText + ' · protover ' + ownProtover + '）: ' +
        (esc(topCmds(S.ownCmds, 10)) || '暂无') + '</span>' +
      '<br><span style="color:#5c6478;">页面钩子: ' + (esc(topCmds(S.pageCmds, 10)) || '暂无') + '</span>' +
      '<br><span style="color:#5c6478;">包版本: ' +
        esc(Object.keys(S.vers).map(function (v) { return 'ver' + v + '×' + S.vers[v]; }).join(' ') || '无') +
        ' · 解不开 ' + S.undecoded + ' · brotli ' + (S.brotli ? '支持' : '不支持') +
        '<br>价目表: ' + esc(giftListState) + '（' + Object.keys(giftById).length + ' 项）' +
        '<br>盲盒奖池: ' + esc(blindState) + '</span>' +
      (S.giftSample ? '<br><span style="color:#ff9f6b;">算不出的礼物报文: ' + esc(S.giftSample) + '</span>' : '') +
      (S.boxSample ? '<br><span style="color:#ffd166;">盲盒样本: ' + esc(S.boxSample) + '</span>' : '') +
      '<br><span style="color:#5c6478;">本地存储: ' + (function () {
        var st = storageInfo();
        return st.keys + ' 项 / 约 ' + st.kb + ' KB（仅 localStorage，24h 过期自动清理' +
          (S.swept ? '；本次启动清掉 ' + S.swept + ' 个过期房间' : '') + '）';
      })() + '</span>' +
      (S.saveErr ? '<br><span style="color:#ff6b6b;">' + esc(S.saveErr) + '</span>' : '') +
      (S.usersDropped ? '<br><span style="color:#5c6478;">贡献榜已裁剪 ' + S.usersDropped +
        ' 个低贡献条目（只留前 ' + SAVE_LIMIT_USERS + '，防止把 localStorage 配额撑爆）</span>' : '') +
      oddLine;
  }

  // ---------------- 启动 ----------------
  S.swept = sweepStale();   // 先把过期房间数据清掉，再读本房间的
  load();
  loadCur();
  // 汇率：启动时拉一次，之后每 6 小时刷一次（失败自动换源）
  fetchRate();
  setInterval(fetchRate, 6 * 60 * 60 * 1000);
  // 给页面自身连接 6 秒用于取握手参数；取不到则走接口兜底
  setTimeout(function () { if (!ownWs) fetchDanmuInfo(); }, 6000);
  // 高能榜每 30 秒刷一次：不依赖弹幕协议的兜底数据源
  setTimeout(pollRank, 1500);
  setInterval(pollRank, 30000);
  // 礼物价目表：解 protobuf 礼物消息要用它换算金额，10 分钟刷一次
  fetchGiftList();
  setInterval(fetchGiftList, 600000);

  function bootUI() {
    buildUI();
    buildDebug();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootUI);
  } else {
    bootUI();
  }

  // 给自动化测试用的最小钩子（正常使用不受影响）
  try {
    window.__dshLiushui = {
      setGiftTable: function (byId, byName) { giftById = byId; giftByName = byName; },
      decodeGiftProto: decodeGiftProto,
      pbWalk: pbWalk,
      b64ToBytes: b64ToBytes,
      yuan: yuan,
      getBoxSample: function () { return S.boxSample; },
      storageInfo: storageInfo,
      getCounters: function () {
        return {
          gold: S.gold, silver: S.silver, sc: S.sc, guard: S.guard, guards: S.guards,
          users: S.users, events: S.events.slice(-50), susp: (S.susp || []).slice(-4),
          hits: S.hits, giftMsgs: S.giftMsgs, scMsgs: S.scMsgs, guardMsgs: S.guardMsgs,
          guardDedup: S.guardDedup, guardAdjusted: S.guardAdjusted, guardPromo: S.guardPromo,
          guardUnverified: S.guardUnverified || 0,
          pocketRef: S.pocketRef || 0, pocketPool: S.pocketPool || 0, pocketCount: S.pocketCount || 0,
          pocketNoPool: S.pocketNoPool || 0, pocketWinners: S.pocketWinners || 0,
          pocketGuardPool: S.pocketGuardPool || 0, pocketGuardCount: S.pocketGuardCount || 0,
          pocketMsgs: S.pocketMsgs || 0, toastMsgs: S.toastMsgs || 0,
          crossDedup: S.crossDedup || 0, pageRescue: S.pageRescue || 0,
          comboMsgs: S.comboMsgs || 0,
          total: total(),
          cutOn: cutOn, cutRate: CUT_RATE, totalAfterCut: total() * CUT_RATE,
          saveErr: S.saveErr || '', usersDropped: S.usersDropped || 0, scUpgraded: S.scUpgraded || 0, scSamples: S.scSamples || [],
          scOwn: S.scOwn || 0, scPage: S.scPage || 0, giftOwn: S.giftOwn || 0, giftPage: S.giftPage || 0,
          odd: S.odd || {}, oddMoney: S.oddMoney || {}
        };
      },
      sweepStale: sweepStale,
      clearAll: clearAll,
      setCur: function (mode, rate) { cur.mode = mode; if (rate) cur.rate = rate; },
      setCut: function (on) { cutOn = !!on; },
      setLinks: function (fb, dn, email) {
        FEEDBACK_URL = fb || ''; DONATE_URL = dn || '';
        if (email !== undefined) FEEDBACK_EMAIL = email || '';
        render();
      },
      setDonateQr: function (alipay, wechat, note, official) {
        DONATE_QR_ALIPAY = alipay || ''; DONATE_QR_WECHAT = wechat || '';
        if (note !== undefined) DONATE_NOTE = note || '';
        if (official !== undefined) OFFICIAL_URL = official || '';
        render();
      },
      qrHtml: qrHtml,
      safeImgUrl: safeImgUrl,
      linksHtml: linksHtml,
      diagText: diagText,
      version: function () { return SCRIPT_VERSION; },
      fmtYuan: yuan,
      // 测试专用：伪造官方榜单 / 缩短「待核」判定时间 / 手动触发核验
      setRank: function (list, state) { S.rankList = list || []; S.rankState = state || 'OK · test'; },
      setGuardVerifyMs: function (ms) { GUARD_VERIFY_MS = ms; },
      verifyPendingGuards: verifyPendingGuards,
      // 测试专用：切换「自己通道是否就绪」、直接喂一条消息（可指定来自哪条通道）
      setOwnReady: function (b) { ownWsReady = !!b; },
      feed: function (msg, fromOwn) { handle(msg, !!fromOwn); }
    };
  } catch (e) {}
})();
