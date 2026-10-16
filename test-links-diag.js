// 反馈/打赏入口的回归测试：
//   原则：留空即不显示（不留死链）· 只在面板里 · 一键复制诊断信息
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
global.location = { pathname: '/22748536', href: 'https://live.bilibili.com/22748536' };
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

scenario('0. 出厂默认：QQ 反馈 + 邮箱 + 支付宝/微信收款码都在');
const shipped = L.linksHtml();
check('反馈入口指向 QQ 且带号码', /wpa\.qq\.com\/msgrd\?v=3(&|&amp;)uin=2513493134/.test(shipped), true);
check('有邮箱入口（mailto）', /href="mailto:2513493134@qq\.com"/.test(shipped), true);
check('有收款码开关（点开看码，不是直接跳链）', /id="dsh-ls-donate"/.test(shipped), true);
check('诊断信息入口仍在', /复制诊断信息/.test(shipped), true);
const qr0 = L.qrHtml();
check('收款码浮层含两张图', (qr0.match(/<img /g) || []).length, 2);
check('收款码浮层含支付宝/微信标注', /支付宝/.test(qr0) && /微信/.test(qr0), true);
check('收款码浮层含收款人核对提示', /合法\(\*\*璠\)/.test(qr0), true);
check('收款码确实是内嵌图片（data:image/png）', (qr0.match(/data:image\/png;base64,/g) || []).length, 2);

// 后面的场景都从"干净状态"开始，逐个验证配置组合
L.setLinks('', '', '');
L.setDonateQr('', '', '');

scenario('A. 全部留空时：只有「复制诊断信息」，不留死链');
let html = L.linksHtml();
check('不含 反馈 链接', /反馈 \/ 提需求/.test(html), false);
check('不含 打赏 链接', /请作者喝杯奶茶/.test(html), false);
check('含 复制诊断信息', /复制诊断信息/.test(html), true);
check('没有 example.com 之类的占位死链', /example\.com/.test(html), false);
check('没有 href="#" 空链接', /href="#"/.test(html), false);

scenario('B. 配置后：两个入口都出现，且都带 noopener（防 tab-nabbing）');
L.setLinks('https://github.com/me/repo/issues/new', 'https://afdian.com/a/me');
html = L.linksHtml();
check('出现 反馈 链接', /反馈 \/ 提需求/.test(html), true);
check('出现 打赏 链接', /请作者喝杯奶茶/.test(html), true);
check('反馈链接是 github 地址', /href="https:\/\/github\.com\/me\/repo\/issues\/new"/.test(html), true);
check('打赏链接是爱发电地址', /href="https:\/\/afdian\.com\/a\/me"/.test(html), true);
check('两个链接都 rel=noopener', (html.match(/rel="noopener noreferrer"/g) || []).length, 2);
check('两个链接都 target=_blank', (html.match(/target="_blank"/g) || []).length, 2);
check('诊断信息入口仍然在', /复制诊断信息/.test(html), true);

scenario('C. 诊断信息：一次给全排错材料');
own({ cmd: 'SEND_GIFT', data: { coin_type: 'gold', price: 1000, num: 2, uid: 9, uname: '甲', giftName: '比心' } });
own({ cmd: 'SUPER_CHAT_MESSAGE', data: { id: 1, price: 30, message: 'hi', user_info: { uname: '乙', uid: 2 } } });
own({ cmd: 'GUARD_BUY', data: { guard_level: 3, num: 1, price: 138000, uid: 3, username: '丙' } });
own({ cmd: 'POPULARITY_RED_POCKET_V2_START', data: { lot_id: 111, sender_name: '丁', total_price: 2000, rp_type: 3, awards: [] } });
const d = L.diagText();
const need = ['版本', '房间', '22748536', '本场金额', '消息数', '独立通道', '双通道配对去重', '上舰核验', '红包', '未识别礼物命令', '最近事件', '比心', '甲'];
for (const k of need) check('诊断文本含「' + k + '」', d.indexOf(k) >= 0, true);
check('版本号跟着脚本走', d.indexOf('v' + L.version()) >= 0, true);
check('金额算进去了（礼物 2 元）', /礼物 ¥2\.00/.test(d), true);
check('红包写明不计流水', /红包.*登记 1 个（不计流水）/.test(d), true);

scenario('D. 版本号两处一致（发布前必查）');
const src = fs.readFileSync(SCRIPT, 'utf8');
const hv = (src.match(/^\/\/ @version\s+(\S+)/m) || [])[1];
const cv = (src.match(/var SCRIPT_VERSION = '([^']+)'/) || [])[1];
check('@version 与 SCRIPT_VERSION 相同', hv, cv);

scenario('D. 收款码（支付宝 / 微信）：按需展开，且只认安全地址');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
check('未配置收款码时 qrHtml 为空', L.qrHtml(), '');
check('未配置时页脚没有收款码开关', /dsh-ls-donate/.test(L.linksHtml()), false);
L.setLinks('', 'https://afdian.com/a/me');
check('只有平台链接时，页脚用 <a> 直接跳（不展开浮层）', /href="https:\/\/afdian\.com\/a\/me"/.test(L.linksHtml()), true);
L.setDonateQr(PNG, PNG, '打赏请备注直播间', 'https://example.org/script');
let q = L.qrHtml();
check('配置后页脚出现收款码开关', /id="dsh-ls-donate"/.test(L.linksHtml()), true);
check('浮层里有支付宝图', /支付宝/.test(q) && (q.match(/<img /g) || []).length >= 1, true);
check('浮层里有微信图', /微信/.test(q), true);
check('浮层里两张图', (q.match(/<img /g) || []).length, 2);
check('浮层写明「自愿」', /打赏全凭自愿/.test(q), true);
check('浮层有反冒名提示', /核对收款人姓名/.test(q), true);
check('填了官方地址就展示它', /example\.org\/script/.test(q), true);
check('备注显示出来了', /打赏请备注直播间/.test(q), true);

scenario('E. 安全：非白名单的 src 一律不显示（防注入 / javascript:）');
check('javascript: 被拒', L.safeImgUrl('javascript:alert(1)'), '');
check('http: 被拒（只允许 https）', L.safeImgUrl('http://evil.com/a.png'), '');
check('相对路径被拒', L.safeImgUrl('qr.png'), '');
check('带引号想逃逸属性的被拒', L.safeImgUrl('data:image/png;base64,AAA" onerror="alert(1)'), '');
check('合法 data:image 通过（原样返回）', L.safeImgUrl(PNG) === PNG, true);
check('合法 https 图片通过', L.safeImgUrl('https://i0.hdslb.com/a.png'), 'https://i0.hdslb.com/a.png');
L.setDonateQr('javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', '');
q = L.qrHtml();
check('非法码不进 HTML', /javascript:|<img /i.test(q), false);
check('没有合法码时浮层为空（平台链接由页脚 <a> 处理）', q, '');
L.setDonateQr('', '', '');

console.log('\n' + (failed ? ('❌ 失败 ' + failed + ' 项') : '✅ 全部通过'));
process.exit(failed ? 1 : 0);
