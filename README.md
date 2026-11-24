# 月历任务插件

一款滴答清单风格的 Obsidian 月历任务插件：任务铺在日历上，支持农历、节假日、调休标注。任务存成库里的普通 checklist 行，无数据库、无账号。

安装：Obsidian 设置 → 第三方插件 → 浏览，搜「Monthly Tasks」→ 安装启用。手动安装 / BRAT 方式见[文末](#安装)。

## Monthly Tasks

Monthly Tasks is a TickTick-style task calendar for Obsidian: month grid, week, or a three-day hour-by-hour timeline, with Chinese lunar dates, statutory holidays and make-up workdays marked. Tasks are plain Obsidian checklist lines in Markdown notes — no database, no account. The interface follows Obsidian's language (Simplified Chinese / Traditional Chinese / English); the view title and commands stay in Chinese.

- **Views**: Month Cells / Month Agenda / Week Cells / Week Agenda / 3-Day Timeline — switch from the top bar; the last choice is remembered. In the 3-Day Timeline, drag empty space to draft a block, drag the body to move (across days too), drag edges to resize, 15-min snap; untimed tasks collect in a sticky all-day strip.
- **Tasks**: click a day cell to create — 📅 due, ⏰ time range, 🔴/🟡 priority, 🛫 start date for multi-day, `#tag` category. Delete is undoable for 6 s.
- **Task file**: everything is written into one archive note — `任务/YYYY年任务列表.md`, `任務/YYYY年任務列表.md`, or `Tasks/Tasks YYYY.md` (+ `-MM` monthly variants) following your interface language. **All three conventions are recognized**, in any folder; switching language never orphans existing files. "Task source" defaults to task-list files only; "Entire vault" mode reads dated checklist lines in every note (edits then touch the source notes directly).
- **Settings**: Display (default view, completed tasks, strikethrough, lunar, holidays, first day of week, tasks per cell), Tasks (all-day default, source, archive period, folder), Category Management, Holiday Data (startup prefetch, manual refresh).
- **Network & privacy**: online only for holiday data (holiday-cn CDN mirrors → timor.tech → built-in 2022–2026 fallback); requests carry just a year — no content, paths, settings or identity. No account, telemetry or uploads; works offline for cached/built-in years.

Requires Obsidian 0.15.0+, desktop and mobile. MIT license.

---

## 功能特性

- **五档视图** - 大月 / 小月 / 大周 / 小周 / 三天视图，顶栏一键切换，自动记住选择
- **三天视图** - 三天 × 24 小时，定时任务画成可拖拽时间块：点空白拉草稿、拖条体挪位、拖边改起止、15 分钟吸附；无时间任务收在吸顶「全天」条
- **类别筛选** - 任务行尾 `#标签` 即类别，顶栏漏斗多选筛选，颜色在设置里调
- **任务管理** - 点日期格新建；🔴 高 / 🟡 中优先级；跨天任务逐日显示；删除后 6 秒可撤销
- **农历与节假日** - 农历日期、法定假日红标、调休上班蓝标；数据源链 holiday-cn → timor.tech → 内置兜底（见「节假日数据」）
- **移动端适配** - 响应式布局；格内任务可滑动浏览，时间输入一键弹系统选择器

---

## 使用方法

打开视图：点左侧日历图标，或命令面板搜「月历任务」。

新建任务：点任意日期格 → 填内容，可选 📅 截止日、⏰ 时间段（关闭「默认全天任务」后出现）、优先级、🛫 跨天起始日、`#类别`。Enter 或确认创建。

### 任务格式

任务就是标准 checklist 行，手写或别的插件生成的也认：

```markdown
- [ ] 完成任务 📅 2026-04-22
- [x] 已完成任务 📅 2026-04-21
- [ ] 跨天任务 🛫 2026-04-22 📅 2026-04-25
- [ ] 带时间的任务 ⏰ 09:00~12:00 📅 2026-04-22
- [ ] 高优先级任务 🔴 📅 2026-04-22
- [ ] 带类别的任务 📅 2026-04-22 #生活
```

任务统一写进任务列表文件，不写进日记。**文件名随界面语言**：简体 `任务/YYYY年任务列表.md`（按年）或 `…YYYY年MM月任务列表.md`（按月），繁体 `任務/…任務列表.md`，英文 `Tasks/Tasks YYYY.md` / `Tasks YYYY-MM.md`。**三种写法全都认**——切语言后旧文件照常读写，已有文件里新加的月份小节也沿用该文件自己的语言，不混排。

「任务来源」默认**只读任务列表文件**；切成「读取全库」后所有笔记里带 📅/🛫 的清单行都上月历——那一档下在月历里编辑、删除会直接改动原笔记。

---

## 设置选项

| 分区 | 设置项 | 说明 | 默认值 |
|------|--------|------|--------|
| 显示 | 默认视图 | 打开时用哪一档：大月 / 小月 / 大周 / 小周 / 三天视图 | 大月 |
| 显示 | 显示已完成任务 | 在月历中显示已完成任务 | 开启 |
| 显示 | 已完成隐藏删除线 | 隐藏删除线（同时隐藏过期红竖线） | 开启 |
| 显示 | 显示农历 | 显示农历日期 | 开启 |
| 显示 | 显示节假日 | 显示法定节假日与调休上班 | 开启 |
| 显示 | 每周第一天 | 周日 / 周一 / 周六 | 周日 |
| 显示 | 每日任务显示数量 | 每格最多显示几条，超出收起 + 「查看全部」 | 5 |
| 任务 | 默认全天任务 | 新建默认不带时间 | 开启 |
| 任务 | 任务来源 | 只读任务列表文件 / 读取全库（见上文） | 只读任务列表文件（老用户保持全库） |
| 任务 | 归档周期 | 新任务写按年还是按月文件；不影响已有文件 | 按年 |
| 任务 | 记录位置 | 任务文件放哪个文件夹；已有同名文件优先用 | 默认（`任务/`） |
| 类别管理 | 已知类别 | 新建弹窗与漏斗的顺序和颜色；不改笔记 | 生活、学习 |
| 节假日数据 | 启动时自动刷新节假日 | 预取今年前后共三年，全程静默 | 关闭 |
| 节假日数据 | 刷新节假日数据 | 手动强制刷新这三年 | 按钮 |

> 界面语言跟随 Obsidian（简体 / 繁体 / English），无单独选项；任务文件名、月份小节、默认文件夹也随之切换，旧文件不受影响。

---

## 数据存储

- `data.json` - 用户设置和节假日缓存（在插件目录）
- 任务文件 - 库内按年（默认）或按月归档的 Markdown 笔记

---

## 节假日数据

**数据获取链**（按序尝试，任一成功即采用）：

1. **[holiday-cn](https://github.com/NateScarlet/holiday-cn)** — 社区维护，覆盖 2007 至今；经多个 CDN 镜像按顺序访问（jsdelivr 三个节点 → raw.githubusercontent.com）
2. **[timor.tech](https://timor.tech)** — 备份源。**已知状况**：目前对本插件返回 403/人机验证页，实际不起作用
3. **内置兜底** — 打包进 `main.js` 的 2022–2026 官方数据，离线可用

**联网与隐私**：插件只在取节假日数据时联网，请求只带年份，不含笔记内容、路径、设置或身份。无账号、无付费、无遥测。断网照常工作（已缓存与内置年份）。「启动时自动刷新」默认关，开则静默预取三年；浏览到未缓存年份时按需获取，失败退避 5 分钟。

仓库里的 `holidays.json` 是可编辑数据源（`node scripts/sync-holidays.mjs` 同步进 `main.js`）；往插件目录另放一份同名文件可按年覆盖内置副本，格式见 `holidays.json`。

---

## 安装

**社区市场（推荐）**：设置 → 第三方插件 → 浏览 → 搜「Monthly Tasks」→ 安装启用。客户端只下载 `main.js`、`manifest.json`、`styles.css` 三份——节假日兜底数据打包在 `main.js` 里，离线也能显示内置年份。

**手动**：下载 [Releases](https://github.com/duany2026/obsidian-monthly-tasks/releases/latest) 里的 `monthly-tasks-*.zip`，解压到库的 `.obsidian/plugins/monthly-tasks/`，重启后启用。

**BRAT**：添加 `duany2026/obsidian-monthly-tasks` 即可跟随更新。

---

## 更新日志

见 [CHANGELOG.md](./CHANGELOG.md)——Release 说明也从同一处提取。

## 发布打包

推 `x.y.z` 标签即触发打包（tag 必须与 `manifest.json` version 逐字相同、不带 `v`，`versions.json` 须登记该版）。Release 挂 `main.js`、`manifest.json`、`styles.css` 三份独立文件 + 手动安装 zip（**不含 `data.json`**，避免新用户继承作者设置）。

## 作者

**duany**（[@duany2026](https://github.com/duany2026)）· 反馈：<https://github.com/duany2026/obsidian-monthly-tasks/issues>

## License

MIT — 见 [LICENSE](./LICENSE)。改代码前请读 [CONTRIBUTING.md](./CONTRIBUTING.md)。
