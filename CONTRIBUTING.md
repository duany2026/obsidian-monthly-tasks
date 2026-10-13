# 参与开发 / 维护说明

本文件记录**改这个插件时必须知道的约定**。插件功能说明见 [README.md](./README.md)，变更历史见 [CHANGELOG.md](./CHANGELOG.md)。

## 仓库结构

- 仓库根目录**就是**插件目录，`main.js` 是唯一源码文件，**没有构建步骤**，直接手工维护。
- 分发所需文件：`main.js`、`manifest.json`、`styles.css`、`holidays.json`、`versions.json`、`README.md`、`LICENSE`。
- `holidays.json` 是内置节假日兜底数据（2022–2026），**数据与代码分离**：更新内置数据只需替换该文件，不动代码。

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
- **i18n 三套字典键数必须相同**（简中 / 繁中 / 英）。新增文案要三语同时加，否则缺语言时回退简中，界面会混语言。带 `{占位符}` 的文案，三语占位符名必须一致，调用处必须传参。
- **JS 里用到的类名，CSS 里要有规则**。反过来（CSS 有、JS 不产生）通常无害，但动态切换的关键类（视图模式、选中态、提示类）拼写两端必须一致。
- **行为级验证优先于语法检查**。对纯函数（如任务行解析、元数据剥离），可以把函数从源码里抽出来落成临时模块用 node 跑用例——比读代码可靠，也能避免「终端显示吞字符」造成的误判。
- 涉及手机端布局的改动，**必须真机验证**（见下）。

## 发布流程

1. 代码改完、自查通过，提交到 `main`。
2. 打标签 `vX.Y.Z` 并推送 —— `.github/workflows/release.yml` 会自动打包并创建/更新 Release。
3. Release 说明取自 `CHANGELOG.md` 中对应 `## [X.Y.Z]` 小节的正文（**整段抓取**）。因此面向用户的条目写在这里；仓库运营类事项写到文件顶部的「仓库运营记录」一节，不要混进版本条目。
4. 压缩包命名 `monthly-tasks-X.Y.Z.zip`，标题「月历任务 vX.Y.Z」，每个 Release 只挂这一个附件。
5. 若希望 Release 页面显示的是你本人而非 `github-actions[bot]`，需在仓库 Secrets 配置 `RELEASE_TOKEN`（工作流会先试它）。**该令牌会过期**：失效时工作流不再整条卡住，而是自动退回内置 `GITHUB_TOKEN` 完成发布，日志里会写明「个人令牌不可用，已退回内置令牌发布」——看到这句话就该换一枚 `RELEASE_TOKEN`。
6. 本机若直连 `github.com:443` 被阻断，可走 GitHub 官方的 SSH-over-443 入口：`~/.ssh/config` 里把 `Host github.com` 映射到 `Hostname ssh.github.com`、`Port 443`，再把公钥加进账号即可正常 `git push`。

## 手机端测试（重要）

**Obsidian 手机端不会热更新 `main.js` / `styles.css`。** 改完必须：把插件文件夹重新同步到设备的库目录 → 在插件设置里关闭再启用该插件。

因此「改了没生效」有两种完全不同的原因（代码问题 / 没同步），只看现象无法区分。历史上为定位布局问题曾临时加过「右下角版本角标」来自证同步成功，用完即删——需要时可按同样思路临时加回。

## 数据与隐私红线

- **`data.json` 绝不入库**：它是插件运行时数据，含作者本机的设置（任务归档路径、自定义类别、节假日缓存）。`.gitignore` 已排除，别绕过。
- 写任务文件必须走「以落盘瞬间内容为准」的路径（`vault.process`）。`vault.read → 改字符串 → vault.modify` 的写法会把用户在编辑器另一栏、Obsidian Sync 或其它插件里的并发改动整份盖掉——而插件自己的「跳转」按钮就会把任务文件开进编辑器，这个并发场景是插件引导出来的。
- 解析任务行时会剥离 `📅 ⏳ 🛫 ➕ ✅ ⏰ 🔴 🟡 🟢` 等元数据标记。**解析侧与提交侧必须同一口径**，否则会出现「编辑一次把用户正文删掉」或「内容被剥空导致该行变成界面上不可见的孤儿行」。

## 已知外部状况

- 节假日数据源链为 `holiday-cn`（jsDelivr）→ `timor.tech` → 内置 `holidays.json`。**2026-10-12 实测**：`timor.tech` 返回 `403` 与 Cloudflare 人机验证页（HTML 而非 JSON），该级备份实际不可用；`holiday-cn` 正常。
- 设置页的「刷新节假日数据」一次请求**今年及前后各一年**共三年，任一年失败即提示「部分成功」。
- 从某些网络环境可能无法直连 `github.com:443`（`git push/fetch` 失败），而 `api.github.com` 可达。核对线上真实状态时可直接走 REST API，不要依赖本地可能已过期的 `refs/remotes/origin/*`。

## 提交身份

提交邮箱建议用 GitHub 的 noreply 形式 `ID+用户名@users.noreply.github.com`，否则提交不会归到账号头像下：

```
git config user.name  "duany2026"
git config user.email "277960486+duany2026@users.noreply.github.com"
```
