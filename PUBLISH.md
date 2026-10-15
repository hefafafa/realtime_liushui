# 发布指南 · realtime_liushui

脚本文件名：`realtime_liushui.user.js`（单文件，自包含，约 120 KB）
头部元数据（已就绪）：`@name realtime_liushui` / `@name:zh-CN` / `@namespace realtime-liushui` /
`@version` / `@description`（写明仅 B站直播间）/ `@author` / `@license MIT` / `@match https://live.bilibili.com/*` /
`@run-at document-start` / `@grant none` / `@noframes`

> ⚠️ 每发一版都要把头部 `@version` 和代码里的 `SCRIPT_VERSION` **一起**加一，否则篡改猴不认为有更新。
> 仓库里的 `node .dsh-live-watch/make-share.mjs` 会在打包前校验这两个号是否一致。

---

## 1. GitHub（主仓库，建议先做这个）

```bash
cd <这个目录>
git init -b main
git add realtime_liushui.user.js README.md CHANGELOG.md LICENSE .gitignore
git commit -m "feat: realtime_liushui v2.8.24（B站直播间本场流水看板）"
git remote add origin https://github.com/<你的用户名>/realtime_liushui.git
git push -u origin main
```

推送后拿到两个关键地址（把 `<用户名>` 换成你的）：

| 用途 | 地址 |
| --- | --- |
| 直接安装（raw） | `https://raw.githubusercontent.com/<用户名>/realtime_liushui/main/realtime_liushui.user.js` |
| 仓库主页 | `https://github.com/<用户名>/realtime_liushui` |

把脚本头部这两行取消注释、填上上面的 raw 地址（**改完记得把版本号 +1**），重新提交：

```js
// @updateURL    https://raw.githubusercontent.com/<用户名>/realtime_liushui/main/realtime_liushui.user.js
// @downloadURL  https://raw.githubusercontent.com/<用户名>/realtime_liushui/main/realtime_liushui.user.js
// @homepageURL  https://github.com/<用户名>/realtime_liushui
// @supportURL   https://github.com/<用户名>/realtime_liushui/issues
```

再把脚本里 `OFFICIAL_URL` 填成仓库主页（打赏浮层会显示"只从官方地址下载"）：

```js
var OFFICIAL_URL = 'https://github.com/<用户名>/realtime_liushui';
```

> GitHub raw 地址有时在国内访问慢；嫌慢可以在 README 里同时给出 jsDelivr 镜像：
> `https://cdn.jsdelivr.net/gh/<用户名>/realtime_liushui@main/realtime_liushui.user.js`
> （jsDelivr 会缓存，发新版后要等一会儿；`@latest` 或带 tag 更稳）

## 2. GreasyFork（用户脚本站，曝光最大）

1. 注册并登录 `https://greasyfork.org/`
2. 右上角头像 → **发布脚本** → 选「从文件上传」或直接粘贴脚本全文
3. 关键字段：
   - **名称**：realtime_liushui
   - **描述**：仅用于 bilibili 直播间：本场流水看板（礼物 / SC / 大航海 + 官方高能榜），支持抽成后流水与 CSV 导出
   - **适用范围**：留空（脚本自带 `@match`）
   - **附加信息 / 反特性**：勾选/声明 **donation**（打赏属于"作者受益项"，GreasyFork 要求声明）
   - **许可证**：MIT
4. 发布后，GreasyFork 会**自己接管更新**（它会给脚本分配别名与自己的 updateURL），
   所以从 GreasyFork 安装的版本不需要你再维护 `@updateURL`。
5. 以后发新版：进脚本页 → **更新** → 粘贴新版本（版本号必须比旧的大）。

## 3. 脚本猫（ScriptCat，国内用户多）

1. 装 ScriptCat 扩展（`https://scriptcat.org/`）
2. 注册登录后 → **发布脚本** → 粘贴/上传 `realtime_liushui.user.js`
3. 同样声明作者受益项（打赏），填 MIT 许可
4. 脚本猫也支持自动更新

## 4. OpenUserJS（可选，老牌站点）

1. `https://openuserjs.org/` 注册登录 → **New Script**
2. 粘贴脚本全文，填名称/描述/MIT
3. 适合作为备份分发点

## 5. Gist / 自己的静态托管（可选，最快）

- **Gist**：`https://gist.github.com/` 新建，**文件名必须是 `realtime_liushui.user.js`**，
  保存后点 `Raw`，把那个地址发给别人，篡改猴会自动弹出安装页。
- **自己的空间**（OSS / Vercel / 服务器）：任意 **https 且以 `.user.js` 结尾** 的地址都能被篡改猴识别为安装链接；
  这种方式的 URL 最稳定，配上 `@updateURL` 就能自动更新。

---

## 发布前自检清单

```bash
node --check realtime_liushui.user.js          # 语法
for t in test-*.js; do node "$t"; done          # 9 个回归测试（含打赏入口、收款码、面板布局）
node .dsh-live-watch/make-share.mjs             # 校验 @version 与 SCRIPT_VERSION 一致并生成分享副本
node .dsh-live-watch/scan-comments.js           # 注释里不应残留版本号/实测痕迹/自用笔记
```

- [ ] `@version` 与 `SCRIPT_VERSION` 一致且比上一版大
- [ ] `README.md` 写明"仅 B站直播间可用"和使用方法
- [ ] 打赏收款码已内嵌（`DONATE_QR_ALIPAY` / `DONATE_QR_WECHAT` 非空），并在浮层里提示核对收款人昵称
- [ ] 反馈入口有效（QQ 2513493134 / 邮箱 2513493134@qq.com）
- [ ] 已填 `@updateURL` / `@downloadURL` / `OFFICIAL_URL`
- [ ] 发布页声明了 donation（作者受益项）与 MIT 许可

## 各平台发布时的"一句话简介"（可直接粘）

> **realtime_liushui** —— 仅用于 bilibili 直播间：实时统计主播本场流水（付费礼物 / 超级留言 SC / 大航海），
> 并读取官方高能榜贡献值；支持「抽成后流水」（按官方 50% 计提折算真正到账金额）、贡献榜与事件流、CSV 导出。
> 数据只存本地、不上传；红包不计入流水；免费使用。
