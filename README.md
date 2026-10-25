# dsh-delivery-native-open

把 DSH Web 里两类文件卡片的主点击从「浏览器内查看」改成「用本机默认程序打开」，同时保留原有的浏览器内入口。**不修改 `deepseek-harness` 的任何源码。**

## 覆盖范围

| 卡片 | 点主体 | 保留的浏览器内入口 |
|---|---|---|
| `present` 交付卡片 | 用本机默认程序打开 | 卡片右侧预览按钮；或 `Alt`/`Ctrl`/`Cmd`/`Shift` + 点击 |
| 本轮改动文件卡片（多文件行、单文件头部） | 用本机默认程序打开该文件 | 修饰键 + 点击；展开/收起等控件不受影响 |

## 交互

| 手势 | 结果 |
|---|---|
| 点击交付卡片主体 | 用本机默认程序打开该文件 |
| 点击交付卡片右侧的**侧栏预览按钮**（本插件提供） | 在右侧栏 Web 预览 |
| 点击改动文件卡片的一行 / 单文件头部 | 用本机默认程序打开该文件 |
| `Alt` / `Ctrl` / `Cmd` / `Shift` + 点击上述任一位置 | 保持原生行为（交付卡片进 Sidebar 预览，改动文件卡片进 review 对照） |
| 卡片右侧的打开控件、展开/收起按钮 | 不变 |
| Host 没有桌面（远程、容器） | 不拦截，点击仍是原生行为，且不显示预览按钮 |
| 打开失败（路径无法映射到本机） | 自动回放原生点击，退化为原来的浏览器内行为 |

## 安装

```bash
dsh plugin --profile web add https://github.com/otvaket/dsh-delivery-native-open
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

**交付卡片**：插件占用 `deliverables.file.actions`（list slot），在每个交付卡片内挂一个不可见探针：

1. 用 `probe.closest('[data-presented-file]')` 找到卡片外壳；
2. 用 `:scope > button` 找到卡片自己的激活按钮；
3. 在该按钮上以 capture 阶段监听 `click`，命中后 `preventDefault + stopPropagation`，改为调用 slot owner 的 `onAction('open')`——即 `POST /api/present.open` 的授权链路，状态反馈仍由 `ui-deliverables` 自己发布（「正在打开…」「已请求打开」）。

**改动文件卡片**：它没有可注册的 slot，插件改在 `document` 上做 capture 监听：

1. 命中 `[data-changed-files]` 内、带 `aria-describedby` 的按钮（行与单文件头部都有；展开/收起按钮没有，因此不受影响）；
2. 从 `aria-describedby` 指向的隐藏元素读绝对路径；
3. 调 `remote.session.openWorkspacePath({ path })`，先按渲染出的拼写、失败再用反斜杠拼写重试（Windows 下渲染路径可能是正斜杠，而 Host 文件系统回报反斜杠）。

依赖的上游契约（升级后可能变，变了会**安全降级**为原生行为）：

- `deliverables.file.actions` slot 的 owner props：`actionUrl` / `available` / `pending` / `onAction`；
- 交付卡片 DOM：`[data-presented-file]` 外壳，激活按钮是它的第一个直接子 `<button>`；
- 改动文件卡片 DOM：`[data-changed-files]` 容器，行/头部按钮通过 `aria-describedby` 指向隐藏的绝对路径元素；
- 客户端 Remote：`remote.session.canOpenWorkspacePath()` / `remote.session.openWorkspacePath()`。

任一不满足时不拦截或回放原生点击——不会报错，也不会重复打开。

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

- 改动文件卡片能否打开取决于 Host 能否把该路径映射回本机：路径在工作区之外、或文件已被移动/删除时会失败，插件回放原生点击退回 review 对照。
- 预览按钮的文案固定为中文（外部插件不进宿主 locale 字典）。
- 若上游改变卡片 DOM（激活按钮位置、`aria-describedby` 惯例），拦截与重放会失效，安全降级为原生行为。

## License

MIT
