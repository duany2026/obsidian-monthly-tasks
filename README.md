# 📅 obsidian-monthly-tasks

<div align="center">

**滴答清单风格的 Obsidian 月视图任务管理插件**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-0.15%2B-7c5cff.svg)](https://obsidian.md/)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.7-3178c6.svg)](https://www.typescriptlang.org/)

</div>

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 📅 **月历视图** | 7×6 网格布局，直观查看整月任务分布 |
| ✅ **任务管理** | 点击即可标记完成/未完成，支持一键创建新任务 |
| 🌙 **农历显示** | 自动显示农历日期、传统节日（春节/端午/中秋等） |
| 🎉 **节假日标注** | 内置法定节假日和调休上班日信息（2024-2027年） |
| 🔥 **优先级标记** | 高🔴 / 中🟡 / 普通 三级优先级，一目了然 |
| 📆 **跨天任务** | 支持创建跨多天的连续任务，横条可视化展示 |
| ⏰ **时间设定** | 支持全天任务或指定具体时间（小时:分钟） |
| 📱 **移动端适配** | 完美适配手机端 Obsidian，触控友好 |
| 🎨 **精美 UI** | 圆角卡片、渐变背景、流畅动画、深色模式支持 |

## 📸 截图

> （待补充截图）

## 🚀 安装方法

### 方法一：手动安装（推荐）

1. 下载本仓库的最新 Release
2. 解压到 Obsidian 仓库的 `.obsidian/plugins/monthly-tasks/` 目录
3. 在 **设置 → 社区插件** 中找到「月历任务」并启用

### 方法二：使用 BRAT 插件安装（开发者版本）

1. 安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件
2. 运行命令 `BRAT: Add a beta plugin for testing`
3. 粘贴本仓库地址：`https://github.com/duanydev/obsidian-monthly-tasks`
4. 启用插件

## 📖 使用指南

### 打开月历视图

- 点击左侧边栏的 **日历图标** 📅
- 或按 `Ctrl/Cmd + P` → 搜索「打开月历任务视图」

### 创建任务

#### 方式一：在笔记中手动编写（兼容 Tasks 插件格式）

```markdown
- [ ] 去超市买菜 📅 2026-04-22
- [x] 完成项目报告 🔴 📅 2026-04-20
- [ ] 团队会议 🟡 ⏰ 14:00 📅 2026-04-23
```

#### 方式二：在月历中点击日期直接创建

1. 在月历中点击任意日期格子
2. 输入任务内容
3. 选择优先级（高/中/普通）
4. 可选：指定时间 或 设为跨天任务
5. 点击「添加任务」

### 任务语法说明

| 标记 | 含义 | 示例 |
|------|------|------|
| `📅 YYYY-MM-DD` | 截止日期 | `📅 2026-04-22` |
| `⏰ HH:mm` | 具体时间 | `⏰ 09:30` |
| `🛫 YYYY-MM-DD` | 开始日期（跨天任务用） | `🛫 2026-04-20` |
| `⏫` 或 `🔴` | 高优先级 | `⏫ 重要任务` |
| `🔼` 或 `🟡` | 中优先级 | `🔼 一般任务` |

### 跨天任务

```markdown
- [ ] 公司年会 🛫 2026-05-01 📅 2026-05-03
```

跨天任务在月历中以**横条形式**显示，自动跨越多个日期格子。

### 设置选项

进入 **设置 → 社区插件 → 月历任务**：

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| 显示已完成任务 | 是否在月历中显示已完成任务（带删除线） | ✅ 开启 |
| 显示农历 | 是否显示农历日期和节气 | ✅ 开启 |
| 显示节假日 | 是否标注法定节假日和调休 | ✅ 开启 |
| 默认全天任务 | 新建任务是否默认为全天 | ✅ 开启 |
| 每周第一天 | 日历每周起始日（周一/周日） | 周一 |
| 每日任务数量 | 每个格子最多显示的任务数 | 5个 |

## 🗂️ 项目结构

```
obsidian-monthly-tasks/
├── src/
│   ├── main.ts            # 插件主入口、设置面板
│   ├── MonthlyView.ts     # 月历视图组件 + 弹窗
│   ├── TaskModel.ts       # 任务数据模型与纯函数工具
│   ├── TaskParser.ts      # Vault 文件扫描与任务解析
│   ├── Calendar.ts        # 月历生成算法与日期工具
│   ├── LunarCalendar.ts   # 公历→农历转换（1900-2100）
│   ├── HolidayManager.ts  # 法定节假日管理与调休数据
│   └── data/             # 数据文件目录（预留）
├── styles.css             # 完整样式表（含深色模式和移动端响应式）
├── manifest.json          # Obsidian 插件元数据
├── package.json           # Node.js 项目配置
├── esbuild.config.mjs     # ESBuild 编译配置
├── tsconfig.json          # TypeScript 配置
├── .gitignore             # Git 忽略规则
└── README.md              # 本文件
```

## 🛠️ 技术栈

| 技术 | 用途 |
|------|------|
| [TypeScript](https://www.typescriptlang.org/) | 主要开发语言 |
| [Obsidian Plugin API](://docs.obsidian.md/) | 视图注册、事件监听、设置存储 |
| [ESBuild](https://esbuild.github.io/) | TypeScript → JavaScript 编译打包 |
| 零运行时依赖 | 不依赖任何第三方 npm 包（仅开发时需要类型定义） |

### 兼容性

- **Obsidian**: v0.15.0 及以上
- **桌面端**: Windows / macOS / Linux
- **移动端**: iOS / Android（Obsidian Mobile）

## 📦 构建与开发

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 生产构建
npm run build

# 构建产物
# main.js        → 编译后的插件入口
# styles.css     → 样式文件（无需编译）
# manifest.json  → 插件元数据
```

构建后只需将 `main.js`、`styles.css`、`manifest.json` 三个文件复制到插件的安装目录即可。

## 🔄 更新日志

### v1.2.1 (2026-04-22)

- 🐛 修复设置页面 `containerEl` 解构 bug（高危：设置页面崩溃）
- 🐛 修复深色模式全天开关样式重复定义问题
- 🧹 清理 CSS 死代码（注释掉的彩条装饰、无用伪元素规则）
- 📝 源码全面添加 JSDoc 注释（7个 TypeScript 文件全覆盖）
- 📖 编写 GitHub 标准文档（README.md + .gitignore 优化）

### v1.2.0 (2026-04-22)

- ✨ 新增跨天任务支持（横条可视化展示）
- ✨ 新增时间选择器（精确到分钟）
- ✨ 新增三档优先级选择器
- 🎨 全面美化创建任务弹窗 UI
- 🐛 修复移动端时间选择器数字溢出问题
- 📱 移动端全面优化适配（弹窗、时间选择器、日期选择器）

### v1.1.0

- 🌙 农历显示功能（1900-2100 年）
- 🎉 传统节日自动识别
- 📅 法定节假日内置数据（2024-2027）
- 🔧 设置面板重构

### v1.0.0 (2026-04-19)

- 🎉 初始版本发布
- 📅 月历基础视图
- ✅ 任务创建与管理
- 📱 移动端基础适配

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。

---

<div align="center">

**Made with ❤️ by [duany](https://github.com/duanydev)**

如果你觉得这个插件有用，欢迎给一个 ⭐ Star！

</div>
