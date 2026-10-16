// 面板布局回归测试：视口自适应 + 内容区滚动
//   ├ 用户反馈：榜单/事件多时面板比屏幕还高，底部「导出 CSV / 重置本场 / 页脚入口」点不到
//   └ 要求：面板整块留在视口内（头固定），超出部分由内容区上下滚动
const fs = require('fs');
const path = require('path');
const SCRIPT = path.join(__dirname, 'realtime_liushui.user.js');
const src = fs.readFileSync(SCRIPT, 'utf8');

let failed = 0;
function check(label, cond, extra) {
  if (!cond) failed++;
  console.log('   ', cond ? 'PASS' : 'FAIL', label, extra ? ('  ' + extra) : '');
}

console.log('== 面板视口自适应（v2.8.20）');
check('面板高度上限按视口算', /id="dsh-ls-panel"[^>]*max-height:calc\(100vh - 80px\)/.test(src));
check('上限扣掉了 💰 圆钮的高度（注释里写明）', /💰 圆钮\(46px\)|圆钮 46px/.test(src));
check('面板是纵向列布局', /id="dsh-ls-panel"[^>]*flex-direction:column/.test(src));
check('面板 overflow:hidden（圆角不被内容顶破）', /id="dsh-ls-panel"[^>]*overflow:hidden/.test(src));
check('标题栏固定不滚动', /id="dsh-ls-head"[^>]*flex:0 0 auto/.test(src));
check('内容区可上下滚动', /id="dsh-ls-body"[^>]*overflow-y:auto/.test(src));
check('内容区 flex 收缩（min-height:0，否则 flex 子项不滚）', /id="dsh-ls-body"[^>]*min-height:0/.test(src));
check('滚到底不连带页面一起滚', /id="dsh-ls-body"[^>]*overscroll-behavior:contain/.test(src));
check('滚动条出现时不留布局抖动', /id="dsh-ls-body"[^>]*scrollbar-gutter:stable/.test(src));
check('展开时 display 用 flex（列布局需要）', /el\.panel\.style\.display = \(el\.panel\.style\.display === 'none'\) \? 'flex' : 'none'/.test(src));
check('初始仍是收起状态（display:none，且没有第二个 display 覆盖）', /id="dsh-ls-panel" style="display:none;/.test(src) && !/id="dsh-ls-panel"[^>]*display:flex/.test(src));
check('resize 时会重新夹位置（整块留在屏幕内）', /addEventListener\('resize'[\s\S]{0,80}applyPos/.test(src));
check('夹位置用的是实际高度', /function clampPos\(left, top\)[\s\S]{0,200}root\.offsetHeight/.test(src));

console.log('\n== 自检小窗同样夹在视口内（v2.8.21）');
check('有 clampDbg（按实测宽高夹进视口）', /function clampDbg\(l, t\)[\s\S]{0,260}box\.offsetHeight/.test(src));
check('小窗位置恢复后立即夹一次', /applyDbg\(\);\n/.test(src) || /applyDbg\(\);/.test(src));
check('拖动时走 clampDbg（不再只 Math.max(0,…)）', /var c = clampDbg\(sl \+ \(e\.clientX - sx\), st \+ \(e\.clientY - sy\)\)/.test(src));
check('拖动不再出现裸的 Math.max(0, sl + …)', !/Math\.max\(0, sl \+ \(e\.clientX - sx\)\)/.test(src));
check('resize 时主面板与自检小窗都重新夹', /addEventListener\('resize', function \(\) \{\s*applyPos\(\);\s*if \(dbg\.apply\) dbg\.apply\(\);/.test(src));
check('小窗内容区自己有高度上限 + 滚动', /id="dsh-dbg-body"[^>]*max-height:320px[^>]*overflow:auto/.test(src));

console.log('\n== 首次使用提示卡的位置（v2.8.24）');
const posHint = src.indexOf('id="dsh-ls-hint"');
const posFx = src.indexOf('id="dsh-ls-fx"');
const posLinks = src.indexOf('id="dsh-ls-links"');
check('提示卡在总金额/汇率下方', posFx > 0 && posHint > posFx);
check('提示卡在页脚之前（放页脚会被长内容的滚动区挤到看不见）', posLinks > 0 && posHint < posLinks);

console.log('\n' + (failed ? ('❌ 失败 ' + failed + ' 项') : '✅ 全部通过'));
process.exit(failed ? 1 : 0);
