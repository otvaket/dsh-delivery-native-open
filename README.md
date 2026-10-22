# dsh-delivery-native-open

把 DSH Web 交付卡片（`present` 卡片）的主点击从「右侧栏 Web 预览」改成「用本机默认程序打开」，同时保留一个显式的侧栏预览按钮。**不修改 `deepseek-harness` 的任何源码。**

## 交互

| 手势 | 结果 |
|---|---|
| 点击交付卡片主体 | 用本机默认程序打开该文件 |
| 点击卡片右侧的**侧栏预览按钮**（本插件提供） | 在右侧栏 Web 预览 |
| `Alt` / `Ctrl` / `Cmd` / `Shift` + 点击卡片主体 | 同样是在右侧栏 Web 预览（保留原生手势） |
| 卡片右侧的打开控件 | 不变（原 `ui-open-in-app` 的应用菜单 / 显示文件位置） |
| Host 没有桌面（远程、容器） | 不拦截，点击仍是预览，且不显示预览按钮 |

## 安装

```bash
dsh plugin --profile web add https://github.com/<owner>/dsh-delivery-native-open
```

开发期用本地链接安装：

```bash
cd ~/.dsh/profiles/web
pnpm add link:<本目录绝对路径>
```

`dsh.bundle.patch` 会在插件行上生效，**不要**再往 profile 的 `cordis.patch.yml` 手动 insert 同一行（重复 id 会让 loader 崩）。

装好后重启 `dsh web`，浏览器硬刷新。

卸载：

```bash
cd ~/.dsh/profiles/web && pnpm remove dsh-delivery-native-open
```

## 实现方式与依赖

插件占用 `deliverables.file.actions`（list slot），在每个交付卡片内挂一个不可见探针：

1. 用 `probe.closest('[data-presented-file]')` 找到卡片外壳；
2. 用 `:scope > button` 找到卡片自己的激活按钮；
3. 在该按钮上以 capture 阶段监听 `click`，命中后 `preventDefault + stopPropagation`，改为调用 slot owner 的 `onAction('open')`——即 `POST /api/present.open` 的授权链路，状态反馈仍由 `ui-deliverables` 自己发布（「正在打开…」「已请求打开」）。

依赖的上游契约（升级后可能变，变了会**安全降级**为原生预览）：

- `deliverables.file.actions` slot 的 owner props：`actionUrl` / `available` / `pending` / `onAction`；
- 交付卡片 DOM：`[data-presented-file]` 外壳，激活按钮是它的第一个直接子 `<button>`。

任一不满足时探针不拦截，点击退回预览——不会报错，也不会重复打开。

## 预览按钮怎么来的

卡片在 Sidebar 里打开需要 `openFile(path)`，而 slot owner 只暴露 `actionUrl/available/pending/onAction`，路径不在其中。插件改用「重放原生激活」：预览按钮拿到自己卡片上的激活按钮，置一个 `replaying` 标志后调用 `activation.click()`，探针看到标志直接放行，原生预览照常发生——不需要路径，也不依赖事件 schema。按钮用自绘 SVG 图标加注入的 CSS（沿用 `--dsw-*` 主题变量）与卡片右侧其它控件对齐。

## 包结构

```
package.json    dsh.bundle.patch（可被 dsh plugin add 安装）+ dsh.client.platform = web
cordis.patch.yml  bundle patch：插入 host 行
lib/index.js    host 半：空 apply
lib/client.js   浏览器半：window.__ModuleLoader__ 契约，零第三方依赖（只 require('react')）
```

## 限制

- 只覆盖 `present` 交付卡片；「本轮改动文件」卡片（点击进 diff 对照）不在范围内。
- 预览按钮的文案固定为中文（外部插件不进宿主 locale 字典）。
- 若上游把卡片激活按钮挪到非第一个直接子元素，拦截与重放都会失效（安全降级为原生预览）。

## License

MIT
