# 参与开发 / 维护说明

本文件记录**改这个插件时必须知道的约定**。插件功能说明见 [README.md](./README.md)，变更历史见 [CHANGELOG.md](./CHANGELOG.md)。

## 仓库结构

- 仓库根目录**就是**插件目录，`main.js` 是唯一源码文件，**没有编译步骤**，直接手工维护。
- **插件市场安装时 Obsidian 只下载 `main.js`、`manifest.json`、`styles.css` 三份**。任何运行时需要的数据都必须在这三份里，不能指望仓库中的其它文件跟着装进用户的插件目录。
- 手动安装 / ZIP 分发所需文件：`main.js`、`manifest.json`、`styles.css`、`holidays.json`、`versions.json`、`README.md`、`LICENSE`。
- `holidays.json` 是内置节假日兜底数据（2022–2026）的**可编辑数据源**，运行时真正读的是 `main.js` 里的 `BUILTIN_HOLIDAYS` 标记块（原因见上一条）。改数据的流程：
  1. 改 `holidays.json`
  2. `node scripts/sync-holidays.mjs` —— 重新生成 `main.js` 里的标记块
  3. 两个文件一起提交
  CI 会跑 `node scripts/check-holidays-sync.mjs` 独立校验两者逐条一致，忘了同步就发布失败。标记块**不要手改**。
- `scripts/` 下只有维护脚本，不参与插件运行，也不会被 Obsidian 下载。

## 换行符约定（易踩）

| 文件 | 行尾 |
|---|---|
| `main.js`、`manifest.json` | **CRLF**（全文件，不得混入裸 LF） |
| `styles.css`、`CHANGELOG.md`、`README.md`、`versions.json`、`holidays.json` | **LF** |

改 `main.js` 时若用会「按行重写」的工具，很容易把整文件或其中几行换成 LF，而文件内注释与代码风格仍按 CRLF 维护。**改完必须核字节**：`LF 总数 == CRLF 总数 == CR 总数`。

## 版本号要对齐的位置

发版时以下**四处**必须一致（README 刻意不写版本号，见下）：

1. `main.js` 头注释 ` * 版本：X.Y.Z`
2. `manifest.json` 的 `version`
3. `versions.json` 新增 `"X.Y.Z": "0.15.0"`
4. `CHANGELOG.md` 新增 `## [X.Y.Z] - YYYY-MM-DD`

README 里**不留**「当前版本 vX.Y.Z」：重复一处，就多一处发版时漏改、进而与线上 Release 分叉的地方。

## 改完自查清单

- `node --check main.js` —— 语法。
- `node scripts/check-holidays-sync.mjs` —— 内置节假日数据与 `holidays.json` 未漂移。
- **官方上架尺子**：`eslint-plugin-obsidianmd` 的 `recommended` 配置就是社区目录自动审核跑的东西（其 `validate-manifest` 规则源码注明对齐 `obsidianmd/community-workers` 的 `pluginManifest.ts`）。**error 必须为零，否则插件在 Obsidian 里装不上**；warn 不阻断但影响 Scorecard。该配置带 `eslint-comments/no-restricted-disable`，**禁止用 `eslint-disable` 关掉 `obsidianmd/*`**，违规只能真改。
- **i18n 三套字典键数必须相同**（简中 / 繁中 / 英）。新增文案要三语同时加，否则缺语言时回退简中，界面会混语言。带 `{占位符}` 的文案，三语占位符名必须一致，调用处必须传参。
- **JS 里用到的类名，CSS 里要有规则**。反过来（CSS 有、JS 不产生）通常无害，但动态切换的关键类（视图模式、选中态、提示类）拼写两端必须一致。
- **行为级验证优先于语法检查**。对纯函数（如任务行解析、元数据剥离），可以把函数从源码里抽出来落成临时模块用 node 跑用例——比读代码可靠，也能避免「终端显示吞字符」造成的误判。
- 涉及手机端布局的改动，**必须真机验证**（见下）。

## 发布流程

1. 代码改完、自查通过（含官方尺子 error 归零），提交到 `main`。
2. 打标签 **`X.Y.Z`，不带 `v` 前缀**，并推送 —— `.github/workflows/release.yml` 会自动校验、打包并创建/更新 Release。
   ```
   git tag -a 1.8.5 -m "1.8.5"
   git push origin 1.8.5
   ```
   **为什么不带 v**：官方要求「Release 的 tag 必须与 `manifest.json` 里的 version 逐字相同」，Obsidian 客户端就是按这个相等关系去找发行版再下载资产的。带 `v` 的 tag 目录永远认不到。工作流第一步会把不合格的 tag 直接拦下来。
   仓库里 1.8.4 及以前的历史 tag 都带 `v`，那是上架前的自用发布，保留不动；从上架那一版起改用无前缀格式。
3. 工作流依次做：校验 tag == manifest.version 且为 `x.y.z` 三段式 → 校验 `versions.json` 已登记该版本 → `node --check` + 节假日漂移检查 → `actions/attest@v4` 为三份资产生成来源证明 → 打 ZIP → 从 CHANGELOG 抓发行说明 → 创建 Release。
4. **Release 附件是 `main.js`、`manifest.json`、`styles.css` 三个独立文件，外加一个 ZIP**。前三份是官方硬性要求（客户端逐个下载，ZIP 它不认）；ZIP 供手动安装与本地备份，命名 `monthly-tasks-X.Y.Z.zip`。标题「月历任务 X.Y.Z」。
5. 仓库 Settings → Actions → General → Workflow permissions 必须是 **Read and write**，否则 `GITHUB_TOKEN` 建不了 Release，`attestations: write` 也写不进证明。
6. Release 说明取自 `CHANGELOG.md` 中对应 `## [X.Y.Z]` 小节的正文（**整段抓取**）。因此面向用户的条目写在这里；仓库运营类事项写到文件顶部的「仓库运营记录」一节，不要混进版本条目。
7. 若希望 Release 页面显示的是你本人而非 `github-actions[bot]`，需在仓库 Secrets 配置 `RELEASE_TOKEN`（工作流会先试它）。**该令牌会过期**：失效时工作流不再整条卡住，而是自动退回内置 `GITHUB_TOKEN` 完成发布，日志里会写明「个人令牌不可用，已退回内置令牌发布」——看到这句话就该换一枚 `RELEASE_TOKEN`。
8. 本机若直连 `github.com:443` 被阻断，可走 GitHub 官方的 SSH-over-443 入口：`~/.ssh/config` 里把 `Host github.com` 映射到 `Hostname ssh.github.com`、`Port 443`，再把公钥加进账号即可正常 `git push`。

## 上架（只有首个版本需要走一遍）

1. 仓库根目录必须有 `README.md`、`LICENSE`、`manifest.json`。
2. 按上面的发布流程发一个 tag 与 version 相同的 Release，三份资产齐全。
3. 到 **community.obsidian.md** 用 Obsidian 账号登录、关联 GitHub、添加插件。目录读的是**默认分支 HEAD 上的 `manifest.json`**，不是某个 Release 里的。
4. 提交后跑自动审核；**审核报的 error 清完之前，插件在 Obsidian 内不可安装**。
5. `manifest.json` 的 `description` 规则（扫描器实测口径）：≤250 字符、**以 ASCII 的 `.` / `!` / `?` 结尾**（中文「。」不通过）、不含 emoji、以动作陈述开头、不写「This is a plugin」这类自指句、不拿插件名开头。`id` 不含 `obsidian`、不以 `plugin` 结尾。不接受捐赠就不要写 `fundingUrl`。
6. 后续版本只需正常发 Release，不用再提交一次。

## 手机端测试（重要）

**Obsidian 手机端不会热更新 `main.js` / `styles.css`。** 改完必须：把插件文件夹重新同步到设备的库目录 → 在插件设置里关闭再启用该插件。

因此「改了没生效」有两种完全不同的原因（代码问题 / 没同步），只看现象无法区分。历史上为定位布局问题曾临时加过「右下角版本角标」来自证同步成功，用完即删——需要时可按同样思路临时加回。

## 数据与隐私红线

- **`data.json` 绝不入库**：它是插件运行时数据，含作者本机的设置（任务归档路径、自定义类别、节假日缓存）。`.gitignore` 已排除，别绕过。
- 写任务文件必须走「以落盘瞬间内容为准」的路径（`vault.process`）。`vault.read → 改字符串 → vault.modify` 的写法会把用户在编辑器另一栏、Obsidian Sync 或其它插件里的并发改动整份盖掉——而插件自己的「跳转」按钮就会把任务文件开进编辑器，这个并发场景是插件引导出来的。
- 解析任务行时会剥离 `📅 ⏳ 🛫 ➕ ✅ ⏰ 🔴 🟡 🟢` 等元数据标记。**解析侧与提交侧必须同一口径**，否则会出现「编辑一次把用户正文删掉」或「内容被剥空导致该行变成界面上不可见的孤儿行」。

## 已知外部状况

- 节假日数据源链为 `holiday-cn`（jsDelivr）→ `timor.tech` → 内置 `BUILTIN_HOLIDAYS`（在 `main.js` 里，由 `holidays.json` 同步生成）。**2026-10-12 实测**：`timor.tech` 返回 `403` 与 Cloudflare 人机验证页（HTML 而非 JSON），该级备份实际不可用；`holiday-cn` 正常。
- 设置页的「刷新节假日数据」一次请求**今年及前后各一年**共三年，任一年失败即提示「部分成功」。
- 从某些网络环境可能无法直连 `github.com:443`（`git push/fetch` 失败），而 `api.github.com` 可达。核对线上真实状态时可直接走 REST API，不要依赖本地可能已过期的 `refs/remotes/origin/*`。

## 提交身份

提交邮箱建议用 GitHub 的 noreply 形式 `ID+用户名@users.noreply.github.com`，否则提交不会归到账号头像下：

```
git config user.name  "duany2026"
git config user.email "277960486+duany2026@users.noreply.github.com"
```
