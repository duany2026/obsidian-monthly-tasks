/*
 * ============================================================
 * 月历任务插件 (Monthly Tasks Plugin)
 * ============================================================
 *
 * 插件功能：滴答清单风格的月视图任务管理，支持农历、节假日和调休显示
 * 版本：1.6.0
 * 作者：duany
 * 许可证：MIT
 *
 * 源码说明：本文件即唯一源码，直接手工维护，没有构建步骤；
 * 文件内的 CommonJS 模块兼容层（__defProp / __export 等）仅供 Obsidian 加载使用，请勿删除。
 *
 * 功能特性：
 *   ✨ 月视图日历展示 - 5-6周动态网格布局，清晰展示每月任务
 *   🌙 农历显示 - 支持中国传统农历日期
 *   🎉 节假日标注 - 自动识别法定节假日和调休日
 *   📝 任务管理 - 快速创建、完成、删除任务
 *   🎨 多优先级 - 高/中/普通三个优先级
 *   📅 跨天任务 - 起止日期区间内每日重复显示（超长区间仅挂载首尾日）
 *   🌗 深色模式 - 自动适配 Obsidian 主题
 *
 * 代码架构：
 *
 * 1. TaskModel (TaskParser.ts)
 *    - 任务数据模型和解析工具函数
 *    - 包含：generateTaskId, parsePriority, cleanTaskContent（同时剥行尾 #tag 得类别）
 *    - 提取日期：extractDueDate, extractStartDate
 *    - 任务判断：isTaskLine, isTaskCompleted, isMultiDayTask
 *    - 工具函数：groupTasksByDate, getMultiDayDuration, isOverdue
 *
 * 2. TaskParser
 *    - 解析Obsidian库中的任务
 *    - 缓存管理：parseAllTasks, invalidateCache
 *    - 文件操作：createTask, createTaskForDate, getOrCreateDefaultTaskFile
 *
 * 3. Calendar
 *    - 生成月历网格数据（5-6周动态行数）
 *    - 工具函数：getDaysInMonth, getFirstDayOfMonth, generateMonthCalendar
 *    - 日期工具：isToday, isWeekend, formatDate
 *
 * 4. LunarCalendar
 *    - 农历转换（内置1900-2100年数据）
 *    - 工具函数：solarToLunar, getLunarInfo, getLunarDayText
 *
 * 5. HolidayManager
 *    - 节假日管理（数据源链：holiday-cn 社区源 → timor.tech 备份源 → holidays.json 内置兜底）
 *    - 查询：getHolidayInfo, formatDate
 *    - 网络获取：fetchYearFromSources, ensureYearData, updateFromNetwork
 *
 * 6. MonthlyView
 *    - 月历视图渲染
 *    - 视图管理：onOpen, onClose, refresh
 *    - 交互处理：openCreateTaskModal, openDatePicker
 *    - 渲染函数：renderCalendarGrid, renderDayCell, renderTaskItem
 *
 *
 * 7. CreateTaskModal
 *    - 创建任务弹窗
 *    - 表单字段：任务内容、日期、时间、优先级
 *    - 提交处理：onSubmit
 *
 * 8. MonthlyTasksPlugin
 *    - 插件主类
 *    - 生命周期：onload, onunload
 *    - 设置管理：loadSettings, saveSettings
 *
 * 9. MonthlyTasksSettingTab
 *     - 插件设置界面
 *     - 渲染：display
 *     - 设置项：每月第一天、日期格式、农历显示、节假日等
 *
 * ============================================================
 */

var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ---- 模块导出：Obsidian 通过 module.exports.default 获取插件主类 ----
var main_exports = {};
__export(main_exports, {
  default: () => MonthlyTasksPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

var import_obsidian = require("obsidian");

/**
 * ============================================================
 * i18n - 界面文案表与取词函数
 * ============================================================
 * 约定：
 * - zh-CN 是权威源语言，zh-TW/en 缺 key 时自动回退 zh-CN（不会白屏）
 * - 只翻译「界面显示」，凡是要写进笔记的格式串（`## 2026年10月` 月份节标题、
 *   `2026年任务列表.md` 文件名、默认「任务」文件夹名）一律不进表：
 *   这些一旦随 UI 语言变化，用户已有笔记立刻读不到
 * - 占位符统一 {token}，不用裸 JS 表达式
 */
var I18N = {
  "zh-CN": {
    "cmd.open": "\u6253\u5f00\u6708\u5386\u4efb\u52a1\u89c6\u56fe",
    "cmd.refresh": "\u5237\u65b0\u6708\u5386\u4efb\u52a1\u89c6\u56fe",
    "cmd.toggle": "\u5faa\u73af\u5207\u6362\u6708\u5386\u89c6\u56fe\uff08\u5927\u6708 / \u5c0f\u6708 / \u5927\u5468 / \u5c0f\u5468\uff09",
    "error.badDateConsole": "\u6708\u5386\u4efb\u52a1\uff1a\u65e0\u6cd5\u8bc6\u522b\u7684\u65e5\u671f\u4efb\u52a1\u884c ({path}:{line}): {line}",
    "error.builtinHoliday": "\u6708\u5386\u4efb\u52a1\uff1a\u5185\u7f6e\u8282\u5047\u65e5\u6570\u636e\u8bfb\u53d6\u5931\u8d25\uff08holidays.json \u7f3a\u5931\u6216\u635f\u574f\uff09\uff0c\u5bf9\u5e94\u5e74\u4efd\u5c06\u4f9d\u8d56\u7f51\u7edc\u6570\u636e\u6e90",
    "error.createFail": "\u521b\u5efa\u4efb\u52a1\u5931\u8d25:",
    "error.delayRefresh": "\u5ef6\u8fdf\u5237\u65b0\u5931\u8d25:",
    "error.deleteFail": "\u5220\u9664\u4efb\u52a1\u5931\u8d25:",
    "error.deleteOldFail": "\u5220\u9664\u539f\u4efb\u52a1\u884c\u5931\u8d25:",
    "error.fileNotFound": "\u6587\u4ef6\u4e0d\u5b58\u5728: {path}",
    "error.fileNotFound2": "\u6587\u4ef6\u4e0d\u5b58\u5728: {path}",
    "error.folderCreate": "\u5728\u6587\u4ef6\u5939\u300c{folder}\u300d\u521b\u5efa\u4efb\u52a1\u6587\u4ef6\u5931\u8d25:",
    "error.holidayApi": "\u8282\u5047\u65e5\u6570\u636e\uff1a{year} \u5e74 API \u8c03\u7528\u5931\u8d25",
    "error.holidayApiEmpty": "\u8282\u5047\u65e5\u6570\u636e\uff1a{year} \u5e74 API \u8fd4\u56de\u4e86 holiday \u5b57\u6bb5\u4f46\u672a\u89e3\u6790\u51fa\u4efb\u4f55\u6709\u6548\u6761\u76ee\uff0c\u54cd\u5e94\u7ed3\u6784\u53ef\u80fd\u5df2\u53d8\u5316",
    "error.holidayApiFormat": "API\u683c\u5f0f\u9519\u8bef",
    "error.holidayCN": "\u6708\u5386\u4efb\u52a1\uff1aholiday-cn \u6570\u636e\u6e90\u83b7\u53d6 {year} \u5e74\u5931\u8d25\uff0c\u5c1d\u8bd5 timor.tech",
    "error.holidayCNFormat": "holiday-cn \u6570\u636e\u683c\u5f0f\u9519\u8bef",
    "error.holidayTimeout1": "\u8bf7\u6c42\u8d85\u65f6\uff088s\uff09\uff1a{year}\u5e74\u8282\u5047\u65e5\u6570\u636e",
    "error.holidayTimeout2": "\u8bf7\u6c42\u8d85\u65f6\uff088s\uff09\uff1a{year}\u5e74 holiday-cn \u6570\u636e",
    "error.holidaysDataFormat": "\u6708\u5386\u4efb\u52a1\uff1aholidaysData \u4e2d {year} \u5e74\u7684\u6570\u636e\u683c\u5f0f\u975e\u6cd5\uff0c\u5df2\u5ffd\u7565",
    "error.holidaysDataKey": "\u6708\u5386\u4efb\u52a1\uff1aholidaysData \u4e2d\u952e\u300c{year}\u300d\u4e0d\u662f\u5408\u6cd5\u5e74\u4efd\uff0c\u5df2\u5ffd\u7565",
    "error.holidaysJsonFormat": "\u6708\u5386\u4efb\u52a1\uff1aholidays.json \u4e2d {year} \u5e74\u7684\u6570\u636e\u683c\u5f0f\u975e\u6cd5\uff0c\u5df2\u5ffd\u7565",
    "error.lineInvalid1": "\u884c\u53f7\u5df2\u5931\u6548\uff0c\u8be5\u884c\u4e0d\u662f\u4efb\u52a1\uff1a{line}",
    "error.lineInvalid2": "\u884c\u53f7\u5df2\u5931\u6548\uff0c\u8be5\u884c\u4e0d\u662f\u76ee\u6807\u4efb\u52a1\uff1a{line}",
    "error.lineInvalidDel1": "\u884c\u53f7\u5df2\u5931\u6548\uff0c\u8be5\u884c\u4e0d\u662f\u4efb\u52a1\uff0c\u62d2\u7edd\u5220\u9664\uff1a{line}",
    "error.lineInvalidDel2": "\u884c\u53f7\u5df2\u5931\u6548\uff0c\u8be5\u884c\u4e0d\u662f\u76ee\u6807\u4efb\u52a1\uff0c\u62d2\u7edd\u5220\u9664\uff1a{line}",
    "error.lineRange": "\u884c\u53f7\u8d85\u51fa\u8303\u56f4: {line}",
    "error.loadTasks": "\u52a0\u8f7d\u4efb\u52a1\u5931\u8d25:",
    "error.noteSaveFail": "\u5907\u6CE8\u4FDD\u5B58\u5931\u8D25:",
    "error.oversizedConsole": "\u6708\u5386\u4efb\u52a1\uff1a\u8de8\u5929\u4efb\u52a1\u533a\u95f4 {start} ~ {due} \u8d85\u8fc7 {limit} \u5929\uff0c\u4ec5\u6302\u8f7d\u9996\u5c3e\u4e24\u65e5 ({path}:{line}): {content}",
    "error.parseFile": "\u89e3\u6790\u6587\u4ef6\u5931\u8d25: {path}",
    "error.postCreateRefresh": "\u521b\u5efa\u540e\u5237\u65b0\u89c6\u56fe\u5931\u8d25:",
    "error.rawLineNotFound": "\u6309 rawLine \u672a\u627e\u5230\u4efb\u52a1\u884c: {path}",
    "error.refreshHoliday": "\u5237\u65b0\u8282\u5047\u65e5\u6570\u636e\u5931\u8d25:",
    "error.settingsLoad": "\u8bbe\u7f6e\u52a0\u8f7d\u5931\u8d25\uff0c\u4f7f\u7528\u9ed8\u8ba4\u8bbe\u7f6e:",
    "error.settingsSave": "\u8bbe\u7f6e\u4fdd\u5b58\u5931\u8d25:",
    "error.toggleFail": "\u5207\u6362\u4efb\u52a1\u72b6\u6001\u5931\u8d25:",
    "holiday.workday": "\u73ed",
    "lunar.branch.1": "\u5b50",
    "lunar.branch.10": "\u9149",
    "lunar.branch.11": "\u620c",
    "lunar.branch.12": "\u4ea5",
    "lunar.branch.2": "\u4e11",
    "lunar.branch.3": "\u5bc5",
    "lunar.branch.4": "\u536f",
    "lunar.branch.5": "\u8fb0",
    "lunar.branch.6": "\u5df3",
    "lunar.branch.7": "\u5348",
    "lunar.branch.8": "\u672a",
    "lunar.branch.9": "\u7533",
    "lunar.day.1": "\u521d\u4e00",
    "lunar.day.10": "\u521d\u5341",
    "lunar.day.11": "\u5341\u4e00",
    "lunar.day.12": "\u5341\u4e8c",
    "lunar.day.13": "\u5341\u4e09",
    "lunar.day.14": "\u5341\u56db",
    "lunar.day.15": "\u5341\u4e94",
    "lunar.day.16": "\u5341\u516d",
    "lunar.day.17": "\u5341\u4e03",
    "lunar.day.18": "\u5341\u516b",
    "lunar.day.19": "\u5341\u4e5d",
    "lunar.day.2": "\u521d\u4e8c",
    "lunar.day.20": "\u4e8c\u5341",
    "lunar.day.21": "\u5eff\u4e00",
    "lunar.day.22": "\u5eff\u4e8c",
    "lunar.day.23": "\u5eff\u4e09",
    "lunar.day.24": "\u5eff\u56db",
    "lunar.day.25": "\u5eff\u4e94",
    "lunar.day.26": "\u5eff\u516d",
    "lunar.day.27": "\u5eff\u4e03",
    "lunar.day.28": "\u5eff\u516b",
    "lunar.day.29": "\u5eff\u4e5d",
    "lunar.day.3": "\u521d\u4e09",
    "lunar.day.30": "\u4e09\u5341",
    "lunar.day.4": "\u521d\u56db",
    "lunar.day.5": "\u521d\u4e94",
    "lunar.day.6": "\u521d\u516d",
    "lunar.day.7": "\u521d\u4e03",
    "lunar.day.8": "\u521d\u516b",
    "lunar.day.9": "\u521d\u4e5d",
    "lunar.leap": "\u95f0{monthName}\u6708",
    "lunar.month.1": "\u6b63",
    "lunar.month.10": "\u5341",
    "lunar.month.11": "\u51ac",
    "lunar.month.12": "\u814a",
    "lunar.month.2": "\u4e8c",
    "lunar.month.3": "\u4e09",
    "lunar.month.4": "\u56db",
    "lunar.month.5": "\u4e94",
    "lunar.month.6": "\u516d",
    "lunar.month.7": "\u4e03",
    "lunar.month.8": "\u516b",
    "lunar.month.9": "\u4e5d",
    "lunar.monthSuffix": "{monthName}\u6708",
    "lunar.rangeError": "\u5e74\u4efd\u8d85\u51fa\u652f\u6301\u8303\u56f4\uff081900-2100\uff09",
    "lunar.stem.1": "\u7532",
    "lunar.stem.10": "\u7678",
    "lunar.stem.2": "\u4e59",
    "lunar.stem.3": "\u4e19",
    "lunar.stem.4": "\u4e01",
    "lunar.stem.5": "\u620a",
    "lunar.stem.6": "\u5df1",
    "lunar.stem.7": "\u5e9a",
    "lunar.stem.8": "\u8f9b",
    "lunar.stem.9": "\u58ec",
    "lunar.zodiac.1": "\u9f20",
    "lunar.zodiac.10": "\u9e21",
    "lunar.zodiac.11": "\u72d7",
    "lunar.zodiac.12": "\u732a",
    "lunar.zodiac.2": "\u725b",
    "lunar.zodiac.3": "\u864e",
    "lunar.zodiac.4": "\u5154",
    "lunar.zodiac.5": "\u9f99",
    "lunar.zodiac.6": "\u86c7",
    "lunar.zodiac.7": "\u9a6c",
    "lunar.zodiac.8": "\u7f8a",
    "lunar.zodiac.9": "\u7334",
    "modal.create.add": "\u6dfb\u52a0\u4efb\u52a1",
    "modal.create.allDay": "\u5168\u5929",
    "modal.create.cancel": "\u53d6\u6d88",
    "modal.create.catMore": "\u66f4\u591a",
    "modal.create.category": "\u7c7b\u522b",
    "modal.create.categoryAria": "\u7c7b\u522b {label}",
    "modal.create.collapse": "\u6536\u8d77",
    "modal.create.dateLine": "{m}\u6708{day}\u65e5 \xb7 {weekday}",
    "modal.create.delete": "\u5220\u9664\u4efb\u52a1",
    "modal.create.displayDate": "{y}/{m}/{d}",
    "modal.create.edit": "\u7f16\u8f91\u4efb\u52a1",
    "modal.create.empty": "\u4efb\u52a1\u5185\u5bb9\u4e0d\u80fd\u4e3a\u7a7a\uff08\u5143\u6570\u636e\u6807\u8bb0\u5df2\u88ab\u81ea\u52a8\u5265\u79bb\uff09",
    "modal.create.endBeforeStart": "\u7ed3\u675f\u65e5\u671f\u4e0d\u80fd\u65e9\u4e8e\u5f00\u59cb\u65e5\u671f",
    "modal.create.endBeforeStartTime": "\u7ed3\u675f\u65f6\u95f4\u987b\u665a\u4e8e\u5f00\u59cb\u65f6\u95f4",
    "modal.create.endNeedToggle": "\u5148\u52fe\u9009\u8de8\u5929",
    "modal.create.existingCount": "\u8be5\u65e5\u5df2\u6709 {n} \u4e2a\u4efb\u52a1",
    "modal.create.expand": "\u5c55\u5f00",
    "modal.create.fail": "\u521b\u5efa\u4efb\u52a1\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5",
    "modal.create.fillBoth": "\u8bf7\u540c\u65f6\u586b\u5199\u5f00\u59cb\u4e0e\u7ed3\u675f\u65f6\u95f4",
    "modal.create.goto": "\u8df3\u8f6c\u5230\u6587\u6863",
    "modal.create.high": "\u9ad8",
    "modal.create.medium": "\u4e2d",
    "modal.create.multiDay": "\u8de8\u5929\u4efb\u52a1",
    "modal.create.noDateMark": "\u8be5\u4efb\u52a1\u6ca1\u6709\u65e5\u671f\u6807\u8bb0\uff0c\u65e0\u6cd5\u5b9a\u4f4d\u7f16\u8f91",
    "modal.create.none": "\u666e\u901a",
    "modal.create.note": "\u5907\u6CE8",
    "modal.create.noteAdd": "\uFF0B\u6DFB\u52A0\u5907\u6CE8",
    "modal.create.noteAria": "\u4E3A\u8FD9\u6761\u4EFB\u52A1\u5199\u5907\u6CE8",
    "modal.create.notePlaceholder": "\u8F93\u5165\u5907\u6CE8\uff0c\u53EF\u591A\u884C...",
    "modal.create.placeholder": "\u8f93\u5165\u4efb\u52a1\u5185\u5bb9...",
    "modal.create.pleaseSelect": "\u8bf7\u9009\u62e9\u65e5\u671f",
    "modal.create.priority": "\u4f18\u5148\u7ea7",
    "modal.create.save": "\u4fdd\u5b58",
    "modal.create.setTime": "+ \u8bbe\u7f6e\u65f6\u95f4",
    "modal.create.time": "\u65f6\u95f4",
    "modal.create.to": "\u81f3",
    "modal.create.toggleComplete": "\u5207\u6362\u5b8c\u6210\u72b6\u6001",
    "modal.create.toggleFail": "\u64cd\u4f5c\u5931\u8d25\uff0c\u8be5\u4efb\u52a1\u53ef\u80fd\u5df2\u88ab\u4fee\u6539\uff0c\u5c06\u5237\u65b0\u5217\u8868",
    "modal.create.viewAll": "\u67e5\u770b\u5168\u90e8 {n} \u4e2a\u4efb\u52a1 \u25be",
    "modal.create.weekday.fri": "\u5468\u4e94",
    "modal.create.weekday.mon": "\u5468\u4e00",
    "modal.create.weekday.sat": "\u5468\u516d",
    "modal.create.weekday.sun": "\u5468\u65e5",
    "modal.create.weekday.thu": "\u5468\u56db",
    "modal.create.weekday.tue": "\u5468\u4e8c",
    "modal.create.weekday.wed": "\u5468\u4e09",
    "modal.date.confirm": "\u786e\u5b9a",
    "modal.date.currentYear": "\u5f53\u524d\u5e74\u4efd: {year}",
    "modal.date.month": "\u6708\u4efd",
    "modal.date.monthSuffix": "{m}\u6708",
    "modal.date.title": "\u9009\u62e9\u65e5\u671f",
    "modal.date.year": "\u5e74\u4efd",
    "modal.date.yearSuffix": "{y}\u5e74",
    "modal.filter.all": "\u5168\u90e8",
    "modal.filter.selected": "\u5df2\u9009 {n}",
    "modal.filter.title": "\u6309\u7c7b\u522b\u7b5b\u9009",
    "modal.filter.untagged": "\u65e0\u6807\u7b7e",
    "notice.badDate": "\u6708\u5386\u4efb\u52a1\uff1a\u53d1\u73b0 \U0001f4c5/\U0001f6eb \u540e\u65e5\u671f\u65e0\u6cd5\u8bc6\u522b\uff08\u542b\u975e\u6cd5\u65e5\u671f\u5982 2026-02-30\uff09\u7684\u4efb\u52a1\u884c\uff0c\u5df2\u5ffd\u7565\uff08\u8be6\u60c5\u89c1\u63a7\u5236\u53f0\uff09",
    "notice.cantOpenView": "\u6708\u5386\u4efb\u52a1\uff1a\u65e0\u6cd5\u6253\u5f00\u89c6\u56fe\uff0c\u8bf7\u91cd\u542f Obsidian \u540e\u91cd\u8bd5",
    "notice.catExists": "\u7c7b\u522b\u300c{name}\u300d\u5df2\u5b58\u5728",
    "notice.catInvalid": "\u7c7b\u522b\u540d\u4e0d\u5408\u6cd5\uff1a\u4e0d\u80fd\u4e3a\u7a7a\u3001\u4e0d\u80fd\u542b\u7a7a\u683c\u6216 #\u3001\u4e0d\u80fd\u662f\u7eaf\u6570\u5b57",
    "notice.createdRefreshFail": "\u4efb\u52a1\u5df2\u521b\u5efa\uff0c\u5237\u65b0\u5931\u8d25\u8bf7\u624b\u52a8\u5207\u6362\u6708\u4efd",
    "notice.editSavedBut": "\u7f16\u8f91\u5df2\u4fdd\u5b58\uff0c\u4f46\u539f\u4efb\u52a1\u884c\u672a\u80fd\u81ea\u52a8\u5220\u9664\uff0c\u8bf7\u68c0\u67e5\u662f\u5426\u91cd\u590d",
    "notice.holidayAutoFail": "\u8282\u5047\u65e5\u6570\u636e\u81ea\u52a8\u5237\u65b0\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u6216\u5728\u8bbe\u7f6e\u4e2d\u624b\u52a8\u5237\u65b0",
    "notice.holidayPartial": "\u8282\u5047\u65e5\u6570\u636e\u5df2\u5237\u65b0\uff08{ok}/{total} \u5e74\u6210\u529f\uff09",
    "notice.holidayRefreshFail": "\u5237\u65b0\u8282\u5047\u65e5\u6570\u636e\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc",
    "notice.holidayRefreshed": "\u8282\u5047\u65e5\u6570\u636e\u5df2\u5237\u65b0\uff01",
    "notice.opFail": "\u64cd\u4f5c\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5",
    "notice.oversized": "\u6708\u5386\u4efb\u52a1\uff1a\u8de8\u5929\u4efb\u52a1\u533a\u95f4\u8d85\u8fc7 {limit} \u5929\uff0c\u4ec5\u663e\u793a\u5f00\u59cb\u4e0e\u7ed3\u675f\u65e5\u671f\uff08\u8be6\u60c5\u89c1\u63a7\u5236\u53f0\uff09",
    "notice.settingsLoadFail": "\u8bbe\u7f6e\u52a0\u8f7d\u5931\u8d25\uff0c\u5df2\u56de\u9000\u9ed8\u8ba4\u8bbe\u7f6e",
    "notice.settingsSaveFail": "\u8bbe\u7f6e\u4fdd\u5b58\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u78c1\u76d8\u7a7a\u95f4\u4e0e\u6587\u4ef6\u6743\u9650",
    "settings.archive.desc": "\u51b3\u5b9a\u65b0\u4efb\u52a1\u5199\u5165\u54ea\u4e2a\u6587\u4ef6\u3002\u5207\u6362\u540e\u4e0d\u5f71\u54cd\u5df2\u6709\u6587\u4ef6\uff0c\u5386\u53f2\u4efb\u52a1\u4ecd\u4f1a\u5168\u90e8\u663e\u793a\u3002",
    "settings.archive.month": "\u6309\u6708\uff082026\u5e7410\u6708\u4efb\u52a1\u5217\u8868.md\uff09",
    "settings.archive.year": "\u6309\u5e74\uff082026\u5e74\u4efb\u52a1\u5217\u8868.md\uff09",
    "settings.autoHoliday.desc": "\u542f\u52a8\u65f6\u9884\u53d6\u4eca\u5e74\u524d\u540e\u4e09\u5e74\u7684\u8282\u5047\u65e5\u6570\u636e\uff08\u6570\u636e\u6e90\uff1aholiday-cn \u2192 timor.tech\uff09\uff1b\u6d4f\u89c8\u5176\u4ed6\u5e74\u4efd\u65f6\u4e5f\u4f1a\u6309\u9700\u83b7\u53d6\u7f3a\u5931\u5e74\u4efd\u7684\u6570\u636e",
    "settings.autoHoliday.name": "\u542f\u52a8\u65f6\u81ea\u52a8\u5237\u65b0\u8282\u5047\u65e5",
    "settings.catAdd": "\u6dfb\u52a0",
    "settings.catColor": "\u989c\u8272 {name}",
    "settings.catDelete": "\u5220\u9664",
    "settings.catDeleteAria": "\u5220\u9664\u7c7b\u522b {name}",
    "settings.catDown": "\u4e0b\u79fb {name}",
    "settings.catEmpty": "\u6682\u65e0\u5df2\u77e5\u7c7b\u522b\uff0c\u7528\u4e0b\u65b9\u8f93\u5165\u6846\u6dfb\u52a0",
    "settings.catKnown.desc": "\u7ef4\u62a4\u521b\u5efa\u5f39\u7a97\u4e0e\u6f0f\u6597\u9762\u677f\u7684\u987a\u5e8f\u548c\u989c\u8272\u3002\u7c7b\u522b\u672c\u8eab\u662f\u4efb\u52a1\u884c\u5c3e\u7684 #\u6807\u7b7e\uff0c\u5728\u8fd9\u91cc\u589e\u5220\u4e0d\u4f1a\u4fee\u6539\u4efb\u4f55\u7b14\u8bb0\u3002",
    "settings.catKnown.name": "\u5df2\u77e5\u7c7b\u522b",
    "settings.catPlaceholder": "\u65b0\u7c7b\u522b\u540d\u79f0\uff0c\u5982\uff1a\u5065\u8eab",
    "settings.catSwatch": "\u8272\u53f7 {n}",
    "settings.catUp": "\u4e0a\u79fb {name}",
    "settings.defaultAllDay.desc": "\u65b0\u5efa\u4efb\u52a1\u65f6\u9ed8\u8ba4\u4e3a\u5168\u5929\u4efb\u52a1\uff08\u4e0d\u5e26\u5177\u4f53\u65f6\u95f4\uff09",
    "settings.defaultAllDay.name": "\u9ed8\u8ba4\u5168\u5929\u4efb\u52a1",
    "settings.firstDow.desc": "\u8bbe\u7f6e\u65e5\u5386\u6bcf\u5468\u7684\u8d77\u59cb\u65e5",
    "settings.firstDow.name": "\u6bcf\u5468\u7b2c\u4e00\u5929",
    "settings.folder.dead": "{folder}\uff08\u5df2\u5931\u6548\uff09",
    "settings.folder.default": "\u9ed8\u8ba4\uff08\u4efb\u52a1\uff09",
    "settings.folder.desc": "\u9009\u62e9\u4efb\u52a1\u6587\u4ef6\u7684\u5b58\u50a8\u4f4d\u7f6e\u3002\u5982\u679c\u5df2\u6709\u5e74\u5ea6\u4efb\u52a1\u6587\u4ef6\uff0c\u63d2\u4ef6\u4f1a\u4f18\u5148\u4f7f\u7528\u5b83\u3002",
    "settings.hideStrike.desc": "\u6253\u5f00\u540e\u5df2\u5b8c\u6210\u4efb\u52a1\u9690\u85cf\u5220\u9664\u7ebf\uff08\u540c\u65f6\u9690\u85cf\u8fc7\u671f\u4efb\u52a1\u7684\u7ea2\u8272\u7ad6\u7ebf\uff1b\u5b8c\u6210\u6001\u672c\u8eab\u4ecd\u6709\u53cd\u9988\uff1a\u624b\u673a\u7aef\u5de6\u7f18\u7070\u7ad6\u6761 + \u53d8\u6697\uff09",
    "settings.hideStrike.name": "\u5df2\u5b8c\u6210\u9690\u85cf\u5220\u9664\u7ebf",
    // 语言选项名：三种语言里取值刻意相同（各自显示自己的写法），
    // 别"顺手"按当前语言翻译，否则英文界面下会出现 English -> 英文
    "settings.loading": "\u52a0\u8f7d\u4e2d...",
    "settings.refreshBtn": "\u5237\u65b0",
    "settings.refreshHoliday.desc": "\u4ece holiday-cn / timor.tech \u6570\u636e\u6e90\u83b7\u53d6\u6700\u65b0\u8282\u5047\u65e5\u6570\u636e",
    "settings.refreshHoliday.name": "\u5237\u65b0\u8282\u5047\u65e5\u6570\u636e",
    "settings.section.archive": "\u4efb\u52a1\u5f52\u6863\u5468\u671f",
    "settings.section.category": "\u7c7b\u522b\u7ba1\u7406",
    "settings.section.display": "\u663e\u793a",
    "settings.section.folder": "\u4efb\u52a1\u6587\u4ef6\u5939",
    "settings.section.holiday": "\u8282\u5047\u65e5\u6570\u636e",
    "settings.section.storage": "\u4efb\u52a1\u4e0e\u5b58\u50a8",
    "settings.showCompleted.desc": "\u5728\u6708\u5386\u4e2d\u663e\u793a\u5df2\u5b8c\u6210\u7684\u4efb\u52a1",
    "settings.showCompleted.name": "\u663e\u793a\u5df2\u5b8c\u6210\u4efb\u52a1",
    "settings.showHoliday.desc": "\u6807\u6ce8\u6cd5\u5b9a\u8282\u5047\u65e5\u548c\u8c03\u4f11\u4fe1\u606f",
    "settings.showHoliday.name": "\u663e\u793a\u8282\u5047\u65e5",
    "settings.showLunar.desc": "\u5728\u65e5\u671f\u4e0b\u65b9\u663e\u793a\u519c\u5386\u65e5\u671f\u548c\u8282\u6c14",
    "settings.showLunar.name": "\u663e\u793a\u519c\u5386",
    "settings.tasksLimit.desc": "\u6bcf\u4e2a\u65e5\u671f\u683c\u5b50\u6700\u591a\u663e\u793a\u7684\u4efb\u52a1\u6570\u91cf\uff1b\u5f53\u5929\u9762\u677f\u7684\u4efb\u52a1\u5217\u8868\u8d85\u8fc7\u8fd9\u4e2a\u6570\u5c31\u9ed8\u8ba4\u6536\u8d77\uff0c\u300c\u67e5\u770b\u5168\u90e8\u300d\u4e5f\u6309\u5b83\u51fa\u73b0",
    "settings.tasksLimit.name": "\u6bcf\u65e5\u4efb\u52a1\u663e\u793a\u6570\u91cf",
    "settings.view.desc": "\u6253\u5f00\u6708\u5386\u65f6\u9ed8\u8ba4\u4f7f\u7528\u54ea\u4e00\u6863\u89c6\u56fe\u3002\u9876\u680f\u5207\u6362\u89c6\u56fe\u540e\u8fd9\u91cc\u4f1a\u8ddf\u7740\u53d8\u6210\u4f60\u6700\u540e\u7528\u7684\u90a3\u4e00\u6863\uff0c\u4e0b\u6b21\u6253\u5f00\u5c31\u505c\u5728\u90a3\u513f\u3002",
    "settings.view.name": "\u9ed8\u8ba4\u89c6\u56fe",
    "view.agenda.addOne": "\u6dfb\u52a0",
    "view.agenda.clearFilterAria": "\u6E05\u9664\u5F53\u524D\u7C7B\u522B\u7B5B\u9009",
    "view.agenda.emptyDay": "\u8fd9\u5929\u6ca1\u5b89\u6392",
    "view.agenda.emptyFiltered": "\u5F53\u524D\u7B5B\u9009\u4E0B\u8FD9\u5929\u6CA1\u6709\u4EFB\u52A1",
    "view.agenda.hasTaskDot": "\u8fd9\u5929\u6709\u5b89\u6392",
    "view.agenda.manageDay": "\u7ba1\u7406",
    "view.agenda.overdueDot": "\u8fd9\u5929\u6709\u903e\u671f\u672a\u5b8c\u6210",
    "view.cell.category": "\u7c7b\u522b\uff1a{category}",
    "view.cell.duration": "{days}\u5929",
    "view.cell.loadError": "\u4efb\u52a1\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u67e5\u770b\u63a7\u5236\u53f0",
    "view.cell.timeDuration": "{time} \xb7 {days}\u5929",
    "view.header.nextMonth": "\u4e0b\u6708",
    "view.header.nextWeek": "\u4e0b\u4e00\u5468",
    "view.header.pickView": "\u5207\u6362\u89c6\u56fe",
    "view.header.prevMonth": "\u4e0a\u6708",
    "view.header.prevWeek": "\u4e0a\u4e00\u5468",
    "view.header.thisWeek": "\u56de\u5230\u672c\u5468",
    "view.header.title": "\u6708\u5386\u4efb\u52a1",
    "view.header.titleTip": "\u70b9\u51fb\u5feb\u901f\u5207\u6362\u65e5\u671f",
    "view.header.today": "\u56de\u5230\u672c\u6708",
    "view.menu.title": "\u89c6\u56fe",
    "view.mode.agenda": "\u5c0f\u6708\u89c6\u56fe",
    "view.mode.bigWeek": "\u5927\u5468\u89c6\u56fe",
    "view.mode.desc.agenda": "\u6574\u6708\u94fa\u6ee1\u5c4f\u5e55\uff0c\u4efb\u52a1\u5728\u4e0b\u65b9\u660e\u7ec6\u533a",
    "view.mode.desc.bigWeek": "\u53ea\u770b\u4e00\u5468\uff0c\u4efb\u52a1\u5199\u5728\u683c\u5b50\u91cc",
    "view.mode.desc.list": "\u6574\u6708\u94fa\u6ee1\u5c4f\u5e55\uff0c\u4efb\u52a1\u5199\u5728\u683c\u5b50\u91cc",
    "view.mode.desc.week": "\u53ea\u770b\u4e00\u5468\uff0c\u4efb\u52a1\u5728\u4e0b\u65b9\u660e\u7ec6\u533a",
    "view.mode.list": "\u5927\u6708\u89c6\u56fe",
    "view.mode.week": "\u5c0f\u5468\u89c6\u56fe",
    "view.month.1": "1\u6708",
    "view.month.10": "10\u6708",
    "view.month.11": "11\u6708",
    "view.month.12": "12\u6708",
    "view.month.2": "2\u6708",
    "view.month.3": "3\u6708",
    "view.month.4": "4\u6708",
    "view.month.5": "5\u6708",
    "view.month.6": "6\u6708",
    "view.month.7": "7\u6708",
    "view.month.8": "8\u6708",
    "view.month.9": "9\u6708",
    "view.month.title": "{year}\u5e74 {monthName}",
    "view.week.load": "\u5171 {n} \u9879 \u00b7 \u5b8c\u6210 {m}",
    "view.week.number": "\u7b2c {n} \u5468",
    "view.week.relative.next": "\u4e0b\u5468",
    "view.week.relative.prev": "\u4e0a\u5468",
    "view.week.relative.this": "\u672c\u5468",
    "view.week.title": "{a} \u2013 {b}",
    "view.weekday.fri": "\u4e94",
    "view.weekday.mon": "\u4e00",
    "view.weekday.sat": "\u516d",
    "view.weekday.sun": "\u65e5",
    "view.weekday.thu": "\u56db",
    "view.weekday.tue": "\u4e8c",
    "view.weekday.wed": "\u4e09"
  },
  "zh-TW": {
    "cmd.open": "\u958b\u555f\u6708\u66c6\u4efb\u52d9\u8996\u5716",
    "cmd.refresh": "\u91cd\u65b0\u6574\u7406\u6708\u66c6\u4efb\u52d9\u8996\u5716",
    "cmd.toggle": "\u8ff4\u5708\u5207\u63db\u6708\u66c6\u6aa2\u8996\uff08\u5927\u6708 / \u5c0f\u6708 / \u5927\u9031 / \u5c0f\u9031\uff09",
    "error.badDateConsole": "\u6708\u66c6\u4efb\u52d9\uff1a\u7121\u6cd5\u8b58\u5225\u7684\u65e5\u671f\u4efb\u52d9\u884c ({path}:{line}): {line}",
    "error.builtinHoliday": "\u6708\u66c6\u4efb\u52d9\uff1a\u5167\u5efa\u7bc0\u5047\u65e5\u6578\u64da\u8b80\u53d6\u5931\u6557\uff08holidays.json \u7f3a\u5931\u6216\u640d\u58de\uff09\uff0c\u5c0d\u61c9\u5e74\u4efd\u5c07\u4f9d\u8cf4\u7db2\u8def\u6578\u64da\u6e90",
    "error.createFail": "\u5efa\u7acb\u4efb\u52d9\u5931\u6557\uff1a",
    "error.delayRefresh": "\u5ef6\u9072\u91cd\u65b0\u6574\u7406\u5931\u6557\uff1a",
    "error.deleteFail": "\u522a\u9664\u4efb\u52d9\u5931\u6557\uff1a",
    "error.deleteOldFail": "\u522a\u9664\u539f\u4efb\u52d9\u884c\u5931\u6557\uff1a",
    "error.fileNotFound": "\u6a94\u6848\u4e0d\u5b58\u5728\uff1a{path}",
    "error.fileNotFound2": "\u6a94\u6848\u4e0d\u5b58\u5728\uff1a{path}",
    "error.folderCreate": "\u5728\u8cc7\u6599\u593e\u300c{folder}\u300d\u5efa\u7acb\u4efb\u52d9\u6a94\u6848\u5931\u6557\uff1a",
    "error.holidayApi": "\u7bc0\u5047\u65e5\u6578\u64da\uff1a{year} \u5e74 API \u547c\u53eb\u5931\u6557",
    "error.holidayApiEmpty": "\u7bc0\u5047\u65e5\u6578\u64da\uff1a{year} \u5e74 API \u50b3\u56de\u4e86 holiday \u6b04\u4f4d\u4f46\u672a\u89e3\u6790\u51fa\u4efb\u4f55\u6709\u6548\u689d\u76ee\uff0c\u56de\u61c9\u7d50\u69cb\u53ef\u80fd\u5df2\u8b8a\u5316",
    "error.holidayApiFormat": "API \u683c\u5f0f\u932f\u8aa4",
    "error.holidayCN": "\u6708\u66c6\u4efb\u52d9\uff1aholiday-cn \u6578\u64da\u6e90\u53d6\u5f97 {year} \u5e74\u5931\u6557\uff0c\u5617\u8a66 timor.tech",
    "error.holidayCNFormat": "holiday-cn \u6578\u64da\u683c\u5f0f\u932f\u8aa4",
    "error.holidayTimeout1": "\u8acb\u6c42\u903e\u6642\uff088s\uff09\uff1a{year}\u5e74\u7bc0\u5047\u65e5\u6578\u64da",
    "error.holidayTimeout2": "\u8acb\u6c42\u903e\u6642\uff088s\uff09\uff1a{year}\u5e74 holiday-cn \u6578\u64da",
    "error.holidaysDataFormat": "\u6708\u66c6\u4efb\u52d9\uff1aholidaysData \u4e2d {year} \u5e74\u7684\u6578\u64da\u683c\u5f0f\u975e\u6cd5\uff0c\u5df2\u5ffd\u7565",
    "error.holidaysDataKey": "\u6708\u66c6\u4efb\u52d9\uff1aholidaysData \u4e2d\u9375\u300c{year}\u300d\u4e0d\u662f\u5408\u6cd5\u5e74\u4efd\uff0c\u5df2\u5ffd\u7565",
    "error.holidaysJsonFormat": "\u6708\u66c6\u4efb\u52d9\uff1aholidays.json \u4e2d {year} \u5e74\u7684\u6578\u64da\u683c\u5f0f\u975e\u6cd5\uff0c\u5df2\u5ffd\u7565",
    "error.lineInvalid1": "\u884c\u865f\u5df2\u5931\u6548\uff0c\u8a72\u884c\u4e0d\u662f\u4efb\u52d9\uff1a{line}",
    "error.lineInvalid2": "\u884c\u865f\u5df2\u5931\u6548\uff0c\u8a72\u884c\u4e0d\u662f\u76ee\u6a19\u4efb\u52d9\uff1a{line}",
    "error.lineInvalidDel1": "\u884c\u865f\u5df2\u5931\u6548\uff0c\u8a72\u884c\u4e0d\u662f\u4efb\u52d9\uff0c\u62d2\u7d55\u522a\u9664\uff1a{line}",
    "error.lineInvalidDel2": "\u884c\u865f\u5df2\u5931\u6548\uff0c\u8a72\u884c\u4e0d\u662f\u76ee\u6a19\u4efb\u52d9\uff0c\u62d2\u7d55\u522a\u9664\uff1a{line}",
    "error.lineRange": "\u884c\u865f\u8d85\u51fa\u7bc4\u570d\uff1a{line}",
    "error.loadTasks": "\u8f09\u5165\u4efb\u52d9\u5931\u6557\uff1a",
    "error.noteSaveFail": "\u5099\u8A3B\u5132\u5B58\u5931\u6557\uFF1A",
    "error.oversizedConsole": "\u6708\u66c6\u4efb\u52d9\uff1a\u8de8\u5929\u4efb\u52d9\u5340\u9593 {start} ~ {due} \u8d85\u904e {limit} \u5929\uff0c\u50c5\u639b\u8f09\u9996\u5c3e\u5169\u65e5 ({path}:{line}): {content}",
    "error.parseFile": "\u89e3\u6790\u6a94\u6848\u5931\u6557\uff1a{path}",
    "error.postCreateRefresh": "\u5efa\u7acb\u5f8c\u91cd\u65b0\u6574\u7406\u8996\u5716\u5931\u6557\uff1a",
    "error.rawLineNotFound": "\u6309 rawLine \u672a\u627e\u5230\u4efb\u52d9\u884c\uff1a{path}",
    "error.refreshHoliday": "\u91cd\u65b0\u6574\u7406\u7bc0\u5047\u65e5\u6578\u64da\u5931\u6557\uff1a",
    "error.settingsLoad": "\u8a2d\u5b9a\u8f09\u5165\u5931\u6557\uff0c\u4f7f\u7528\u9810\u8a2d\u503c\uff1a",
    "error.settingsSave": "\u8a2d\u5b9a\u5132\u5b58\u5931\u6557\uff1a",
    "error.toggleFail": "\u5207\u63db\u4efb\u52d9\u72c0\u614b\u5931\u6557\uff1a",
    "holiday.workday": "\u73ed",
    "lunar.branch.1": "\u5b50",
    "lunar.branch.10": "\u9149",
    "lunar.branch.11": "\u620c",
    "lunar.branch.12": "\u4ea5",
    "lunar.branch.2": "\u4e11",
    "lunar.branch.3": "\u5bc5",
    "lunar.branch.4": "\u536f",
    "lunar.branch.5": "\u8fb0",
    "lunar.branch.6": "\u5df3",
    "lunar.branch.7": "\u5348",
    "lunar.branch.8": "\u672a",
    "lunar.branch.9": "\u7533",
    "lunar.day.1": "\u521d\u4e00",
    "lunar.day.10": "\u521d\u5341",
    "lunar.day.11": "\u5341\u4e00",
    "lunar.day.12": "\u5341\u4e8c",
    "lunar.day.13": "\u5341\u4e09",
    "lunar.day.14": "\u5341\u56db",
    "lunar.day.15": "\u5341\u4e94",
    "lunar.day.16": "\u5341\u516d",
    "lunar.day.17": "\u5341\u4e03",
    "lunar.day.18": "\u5341\u516b",
    "lunar.day.19": "\u5341\u4e5d",
    "lunar.day.2": "\u521d\u4e8c",
    "lunar.day.20": "\u4e8c\u5341",
    "lunar.day.21": "\u5eff\u4e00",
    "lunar.day.22": "\u5eff\u4e8c",
    "lunar.day.23": "\u5eff\u4e09",
    "lunar.day.24": "\u5eff\u56db",
    "lunar.day.25": "\u5eff\u4e94",
    "lunar.day.26": "\u5eff\u516d",
    "lunar.day.27": "\u5eff\u4e03",
    "lunar.day.28": "\u5eff\u516b",
    "lunar.day.29": "\u5eff\u4e5d",
    "lunar.day.3": "\u521d\u4e09",
    "lunar.day.30": "\u4e09\u5341",
    "lunar.day.4": "\u521d\u56db",
    "lunar.day.5": "\u521d\u4e94",
    "lunar.day.6": "\u521d\u516d",
    "lunar.day.7": "\u521d\u4e03",
    "lunar.day.8": "\u521d\u516b",
    "lunar.day.9": "\u521d\u4e5d",
    "lunar.leap": "\u958f{monthName}\u6708",
    "lunar.month.1": "\u6b63",
    "lunar.month.10": "\u5341",
    "lunar.month.11": "\u51ac",
    "lunar.month.12": "\u81d8",
    "lunar.month.2": "\u4e8c",
    "lunar.month.3": "\u4e09",
    "lunar.month.4": "\u56db",
    "lunar.month.5": "\u4e94",
    "lunar.month.6": "\u516d",
    "lunar.month.7": "\u4e03",
    "lunar.month.8": "\u516b",
    "lunar.month.9": "\u4e5d",
    "lunar.monthSuffix": "{monthName}\u6708",
    "lunar.rangeError": "\u5e74\u4efd\u8d85\u51fa\u652f\u63f4\u7bc4\u570d\uff081900-2100\uff09",
    "lunar.stem.1": "\u7532",
    "lunar.stem.10": "\u7678",
    "lunar.stem.2": "\u4e59",
    "lunar.stem.3": "\u4e19",
    "lunar.stem.4": "\u4e01",
    "lunar.stem.5": "\u620a",
    "lunar.stem.6": "\u5df1",
    "lunar.stem.7": "\u5e9a",
    "lunar.stem.8": "\u8f9b",
    "lunar.stem.9": "\u58ec",
    "lunar.zodiac.1": "\u9f20",
    "lunar.zodiac.10": "\u96de",
    "lunar.zodiac.11": "\u72d7",
    "lunar.zodiac.12": "\u8c6c",
    "lunar.zodiac.2": "\u725b",
    "lunar.zodiac.3": "\u864e",
    "lunar.zodiac.4": "\u5154",
    "lunar.zodiac.5": "\u9f8d",
    "lunar.zodiac.6": "\u86c7",
    "lunar.zodiac.7": "\u99ac",
    "lunar.zodiac.8": "\u7f8a",
    "lunar.zodiac.9": "\u7334",
    "modal.create.add": "\u65b0\u589e\u4efb\u52d9",
    "modal.create.allDay": "\u5168\u5929",
    "modal.create.cancel": "\u53d6\u6d88",
    "modal.create.catMore": "\u66f4\u591a",
    "modal.create.category": "\u985e\u5225",
    "modal.create.categoryAria": "\u985e\u5225 {label}",
    "modal.create.collapse": "\u6536\u8d77",
    "modal.create.dateLine": "{m}\u6708{day}\u65e5 \xb7 {weekday}",
    "modal.create.delete": "\u522a\u9664\u4efb\u52d9",
    "modal.create.displayDate": "{y}/{m}/{d}",
    "modal.create.edit": "\u7de8\u8f2f\u4efb\u52d9",
    "modal.create.empty": "\u4efb\u52d9\u5167\u5bb9\u4e0d\u80fd\u70ba\u7a7a\uff08\u5143\u6578\u64da\u6a19\u8a18\u5df2\u88ab\u81ea\u52d5\u525d\u96e2\uff09",
    "modal.create.endBeforeStart": "\u7d50\u675f\u65e5\u671f\u4e0d\u80fd\u65e9\u65bc\u958b\u59cb\u65e5\u671f",
    "modal.create.endBeforeStartTime": "\u7d50\u675f\u6642\u9593\u9808\u665a\u65bc\u958b\u59cb\u6642\u9593",
    "modal.create.endNeedToggle": "\u5148\u52fe\u9078\u8de8\u5929",
    "modal.create.existingCount": "\u8a72\u65e5\u5df2\u6709 {n} \u500b\u4efb\u52d9",
    "modal.create.expand": "\u5c55\u958b",
    "modal.create.fail": "\u5efa\u7acb\u4efb\u52d9\u5931\u6557\uff0c\u8acb\u91cd\u8a66",
    "modal.create.fillBoth": "\u8acb\u540c\u6642\u586b\u5beb\u958b\u59cb\u8207\u7d50\u675f\u6642\u9593",
    "modal.create.goto": "\u8df3\u8f49\u5230\u6587\u6a94",
    "modal.create.high": "\u9ad8",
    "modal.create.medium": "\u4e2d",
    "modal.create.multiDay": "\u8de8\u5929\u4efb\u52d9",
    "modal.create.noDateMark": "\u8a72\u4efb\u52d9\u6c92\u6709\u65e5\u671f\u6a19\u8a18\uff0c\u7121\u6cd5\u5b9a\u4f4d\u7de8\u8f2f",
    "modal.create.none": "\u666e\u901a",
    "modal.create.note": "\u5099\u8A3B",
    "modal.create.noteAdd": "\uFF0B\u65B0\u589E\u5099\u8A3B",
    "modal.create.noteAria": "\u70BA\u9019\u689D\u4EFB\u52D9\u5BEB\u5099\u8A3B",
    "modal.create.notePlaceholder": "\u8F38\u5165\u5099\u8A3B\uFF0C\u53EF\u591A\u884C...",
    "modal.create.placeholder": "\u8f38\u5165\u4efb\u52d9\u5167\u5bb9\u2026",
    "modal.create.pleaseSelect": "\u8acb\u9078\u64c7\u65e5\u671f",
    "modal.create.priority": "\u512a\u5148\u7d1a",
    "modal.create.save": "\u5132\u5b58",
    "modal.create.setTime": "+ \u8a2d\u5b9a\u6642\u9593",
    "modal.create.time": "\u6642\u9593",
    "modal.create.to": "\u81f3",
    "modal.create.toggleComplete": "\u5207\u63db\u5b8c\u6210\u72c0\u614b",
    "modal.create.toggleFail": "\u64cd\u4f5c\u5931\u6557\uff0c\u8a72\u4efb\u52d9\u53ef\u80fd\u5df2\u88ab\u4fee\u6539\uff0c\u5c07\u91cd\u65b0\u6574\u7406\u5217\u8868",
    "modal.create.viewAll": "\u6aa2\u8996\u5168\u90e8 {n} \u500b\u4efb\u52d9 \u25be",
    "modal.create.weekday.fri": "\u9031\u4e94",
    "modal.create.weekday.mon": "\u9031\u4e00",
    "modal.create.weekday.sat": "\u9031\u516d",
    "modal.create.weekday.sun": "\u9031\u65e5",
    "modal.create.weekday.thu": "\u9031\u56db",
    "modal.create.weekday.tue": "\u9031\u4e8c",
    "modal.create.weekday.wed": "\u9031\u4e09",
    "modal.date.confirm": "\u78ba\u5b9a",
    "modal.date.currentYear": "\u76ee\u524d\u5e74\u4efd\uff1a{year}",
    "modal.date.month": "\u6708\u4efd",
    "modal.date.monthSuffix": "{m}\u6708",
    "modal.date.title": "\u9078\u64c7\u65e5\u671f",
    "modal.date.year": "\u5e74\u4efd",
    "modal.date.yearSuffix": "{y}\u5e74",
    "modal.filter.all": "\u5168\u90e8",
    "modal.filter.selected": "\u5df2\u9078 {n}",
    "modal.filter.title": "\u6309\u985e\u5225\u7be9\u9078",
    "modal.filter.untagged": "\u7121\u6a19\u7c64",
    "notice.badDate": "\u6708\u66c6\u4efb\u52d9\uff1a\u767c\u73fe \U0001f4c5/\U0001f6eb \u5f8c\u65e5\u671f\u7121\u6cd5\u8b58\u5225\uff08\u542b\u975e\u6cd5\u65e5\u671f\u5982 2026-02-30\uff09\u7684\u4efb\u52d9\u884c\uff0c\u5df2\u5ffd\u7565\uff08\u8a73\u60c5\u898b\u4e3b\u63a7\u53f0\uff09",
    "notice.cantOpenView": "\u6708\u66c6\u4efb\u52d9\uff1a\u7121\u6cd5\u958b\u555f\u8996\u5716\uff0c\u8acb\u91cd\u555f Obsidian \u5f8c\u91cd\u8a66",
    "notice.catExists": "\u985e\u5225\u300c{name}\u300d\u5df2\u5b58\u5728",
    "notice.catInvalid": "\u985e\u5225\u540d\u4e0d\u5408\u6cd5\uff1a\u4e0d\u80fd\u70ba\u7a7a\u3001\u4e0d\u80fd\u542b\u7a7a\u683c\u6216 #\u3001\u4e0d\u80fd\u662f\u7d14\u6578\u5b57",
    "notice.createdRefreshFail": "\u4efb\u52d9\u5df2\u5efa\u7acb\uff0c\u91cd\u65b0\u6574\u7406\u5931\u6557\u8acb\u624b\u52d5\u5207\u63db\u6708\u4efd",
    "notice.editSavedBut": "\u7de8\u8f2f\u5df2\u5132\u5b58\uff0c\u4f46\u539f\u4efb\u52d9\u884c\u672a\u80fd\u81ea\u52d5\u522a\u9664\uff0c\u8acb\u6aa2\u67e5\u662f\u5426\u91cd\u8907",
    "notice.holidayAutoFail": "\u7bc0\u5047\u65e5\u6578\u64da\u81ea\u52d5\u91cd\u65b0\u6574\u7406\u5931\u6557\uff0c\u8acb\u6aa2\u67e5\u7db2\u8def\u6216\u5728\u8a2d\u5b9a\u4e2d\u624b\u52d5\u91cd\u65b0\u6574\u7406",
    "notice.holidayPartial": "\u7bc0\u5047\u65e5\u6578\u64da\u5df2\u91cd\u65b0\u6574\u7406\uff08{ok}/{total} \u5e74\u6210\u529f\uff09",
    "notice.holidayRefreshFail": "\u91cd\u65b0\u6574\u7406\u7bc0\u5047\u65e5\u6578\u64da\u5931\u6557\uff0c\u8acb\u6aa2\u67e5\u7db2\u8def",
    "notice.holidayRefreshed": "\u7bc0\u5047\u65e5\u6578\u64da\u5df2\u91cd\u65b0\u6574\u7406\uff01",
    "notice.opFail": "\u64cd\u4f5c\u5931\u6557\uff0c\u8acb\u91cd\u8a66",
    "notice.oversized": "\u6708\u66c6\u4efb\u52d9\uff1a\u8de8\u5929\u4efb\u52d9\u5340\u9593\u8d85\u904e {limit} \u5929\uff0c\u50c5\u986f\u793a\u958b\u59cb\u8207\u7d50\u675f\u65e5\u671f\uff08\u8a73\u60c5\u898b\u4e3b\u63a7\u53f0\uff09",
    "notice.settingsLoadFail": "\u8a2d\u5b9a\u8f09\u5165\u5931\u6557\uff0c\u5df2\u56de\u9000\u9810\u8a2d\u503c",
    "notice.settingsSaveFail": "\u8a2d\u5b9a\u5132\u5b58\u5931\u6557\uff0c\u8acb\u6aa2\u67e5\u78c1\u789f\u7a7a\u9593\u8207\u6a94\u6848\u6b0a\u9650",
    "settings.archive.desc": "\u6c7a\u5b9a\u65b0\u4efb\u52d9\u5beb\u5165\u54ea\u500b\u6a94\u6848\u3002\u5207\u63db\u5f8c\u4e0d\u5f71\u97ff\u5df2\u6709\u6a94\u6848\uff0c\u6b77\u53f2\u4efb\u52d9\u4ecd\u6703\u5168\u90e8\u986f\u793a\u3002",
    "settings.archive.month": "\u6309\u6708\uff082026\u5e7410\u6708\u4efb\u52d9\u5217\u8868.md\uff09",
    "settings.archive.year": "\u6309\u5e74\uff082026\u5e74\u4efb\u52d9\u5217\u8868.md\uff09",
    "settings.autoHoliday.desc": "\u555f\u52d5\u6642\u9810\u53d6\u4eca\u5e74\u524d\u5f8c\u4e09\u5e74\u7684\u7bc0\u5047\u65e5\u6578\u64da\uff08\u6578\u64da\u6e90\uff1aholiday-cn \u2192 timor.tech\uff09\uff1b\u700f\u89bd\u5176\u4ed6\u5e74\u4efd\u6642\u4e5f\u6703\u6309\u9700\u53d6\u5f97\u7f3a\u5931\u5e74\u4efd\u7684\u6578\u64da",
    "settings.autoHoliday.name": "\u555f\u52d5\u6642\u81ea\u52d5\u91cd\u65b0\u6574\u7406\u7bc0\u5047\u65e5",
    "settings.catAdd": "\u65b0\u589e",
    "settings.catColor": "\u984f\u8272 {name}",
    "settings.catDelete": "\u522a\u9664",
    "settings.catDeleteAria": "\u522a\u9664\u985e\u5225 {name}",
    "settings.catDown": "\u4e0b\u79fb {name}",
    "settings.catEmpty": "\u66ab\u7121\u5df2\u77e5\u985e\u5225\uff0c\u7528\u4e0b\u65b9\u8f38\u5165\u6846\u65b0\u589e",
    "settings.catKnown.desc": "\u7dad\u8b77\u5efa\u7acb\u5f48\u7a97\u8207\u6f0f\u6597\u9762\u677f\u7684\u9806\u5e8f\u548c\u984f\u8272\u3002\u985e\u5225\u672c\u8eab\u662f\u4efb\u52d9\u884c\u5c3e\u7684 #\u6a19\u7c64\uff0c\u5728\u9019\u88e1\u589e\u522a\u4e0d\u6703\u4fee\u6539\u4efb\u4f55\u7b46\u8a18\u3002",
    "settings.catKnown.name": "\u5df2\u77e5\u985e\u5225",
    "settings.catPlaceholder": "\u65b0\u985e\u5225\u540d\u7a31\uff0c\u5982\uff1a\u5065\u8eab",
    "settings.catSwatch": "\u8272\u865f {n}",
    "settings.catUp": "\u4e0a\u79fb {name}",
    "settings.defaultAllDay.desc": "\u65b0\u5efa\u4efb\u52d9\u6642\u9810\u8a2d\u70ba\u5168\u5929\u4efb\u52d9\uff08\u4e0d\u5e36\u5177\u9ad4\u6642\u9593\uff09",
    "settings.defaultAllDay.name": "\u9810\u8a2d\u5168\u5929\u4efb\u52d9",
    "settings.firstDow.desc": "\u8a2d\u5b9a\u65e5\u66c6\u6bcf\u9031\u7684\u8d77\u59cb\u65e5",
    "settings.firstDow.name": "\u6bcf\u9031\u7b2c\u4e00\u5929",
    "settings.folder.dead": "{folder}\uff08\u5df2\u5931\u6548\uff09",
    "settings.folder.default": "\u9810\u8a2d\uff08\u4efb\u52d9\uff09",
    "settings.folder.desc": "\u9078\u64c7\u4efb\u52d9\u6a94\u6848\u7684\u5132\u5b58\u4f4d\u7f6e\u3002\u5982\u679c\u5df2\u6709\u5e74\u5ea6\u4efb\u52d9\u6a94\u6848\uff0c\u5916\u639b\u6703\u512a\u5148\u4f7f\u7528\u5b83\u3002",
    "settings.hideStrike.desc": "\u958b\u555f\u5f8c\u5df2\u5b8c\u6210\u4efb\u52d9\u96b1\u85cf\u522a\u9664\u7dda\uff08\u540c\u6642\u96b1\u85cf\u904e\u671f\u4efb\u52d9\u7684\u7d05\u8272\u8c4e\u7dda\uff1b\u5b8c\u6210\u614b\u672c\u8eab\u4ecd\u6709\u56de\u994b\uff1a\u624b\u6a5f\u7aef\u5de6\u7de3\u7070\u8c4e\u689d + \u8b8a\u6697\uff09",
    "settings.hideStrike.name": "\u5df2\u5b8c\u6210\u96b1\u85cf\u522a\u9664\u7dda",
    // 语言选项名：三种语言里取值刻意相同（各自显示自己的写法），
    // 别"顺手"按当前语言翻译，否则英文界面下会出现 English -> 英文
    "settings.loading": "\u8f09\u5165\u4e2d\u2026",
    "settings.refreshBtn": "\u91cd\u65b0\u6574\u7406",
    "settings.refreshHoliday.desc": "\u5f9e holiday-cn / timor.tech \u6578\u64da\u6e90\u53d6\u5f97\u6700\u65b0\u7bc0\u5047\u65e5\u6578\u64da",
    "settings.refreshHoliday.name": "\u91cd\u65b0\u6574\u7406\u7bc0\u5047\u65e5\u6578\u64da",
    "settings.section.archive": "\u4efb\u52d9\u6b78\u6a94\u9031\u671f",
    "settings.section.category": "\u985e\u5225\u7ba1\u7406",
    "settings.section.display": "\u986f\u793a",
    "settings.section.folder": "\u4efb\u52d9\u8cc7\u6599\u593e",
    "settings.section.holiday": "\u7bc0\u5047\u65e5\u6578\u64da",
    "settings.section.storage": "\u4efb\u52d9\u8207\u5132\u5b58",
    "settings.showCompleted.desc": "\u5728\u6708\u66c6\u4e2d\u986f\u793a\u5df2\u5b8c\u6210\u7684\u4efb\u52d9",
    "settings.showCompleted.name": "\u986f\u793a\u5df2\u5b8c\u6210\u4efb\u52d9",
    "settings.showHoliday.desc": "\u6a19\u8a3b\u6cd5\u5b9a\u7bc0\u5047\u65e5\u548c\u8abf\u4f11\u8cc7\u8a0a",
    "settings.showHoliday.name": "\u986f\u793a\u7bc0\u5047\u65e5",
    "settings.showLunar.desc": "\u5728\u65e5\u671f\u4e0b\u65b9\u986f\u793a\u8fb2\u66c6\u65e5\u671f\u548c\u7bc0\u6c23",
    "settings.showLunar.name": "\u986f\u793a\u8fb2\u66c6",
    "settings.tasksLimit.desc": "\u6bcf\u500b\u65e5\u671f\u683c\u4f4d\u6700\u591a\u986f\u793a\u7684\u4efb\u52d9\u6578\u91cf\uff1b\u7576\u5929\u9762\u677f\u7684\u4efb\u52d9\u6e05\u55ae\u8d85\u904e\u9019\u500b\u6578\u5c31\u9810\u8a2d\u6536\u8d77\uff0c\u300c\u67e5\u770b\u5168\u90e8\u300d\u4e5f\u4f9d\u5b83\u51fa\u73fe",
    "settings.tasksLimit.name": "\u6bcf\u65e5\u4efb\u52d9\u986f\u793a\u6578\u91cf",
    "settings.view.desc": "\u958b\u555f\u6708\u66c6\u6642\u9810\u8a2d\u4f7f\u7528\u54ea\u4e00\u6a94\u6aa2\u8996\u3002\u9802\u6b04\u5207\u63db\u6aa2\u8996\u5f8c\u9019\u88e1\u6703\u8ddf\u8457\u8b8a\u6210\u4f60\u6700\u5f8c\u4f7f\u7528\u7684\u90a3\u4e00\u6a94\uff0c\u4e0b\u6b21\u958b\u555f\u5c31\u505c\u5728\u90a3\u88e1\u3002",
    "settings.view.name": "\u9810\u8a2d\u6aa2\u8996",
    "view.agenda.addOne": "\u6dfb\u52a0",
    "view.agenda.clearFilterAria": "\u6E05\u9664\u76EE\u524D\u985E\u5225\u7BE9\u9078",
    "view.agenda.emptyDay": "\u9019\u5929\u6c92\u5b89\u6392",
    "view.agenda.emptyFiltered": "\u76EE\u524D\u7BE9\u9078\u4E0B\u9019\u5929\u6C92\u6709\u4EFB\u52D9",
    "view.agenda.hasTaskDot": "\u9019\u5929\u6709\u5b89\u6392",
    "view.agenda.manageDay": "\u7ba1\u7406",
    "view.agenda.overdueDot": "\u9019\u5929\u6709\u903e\u671f\u672a\u5b8c\u6210",
    "view.cell.category": "\u985e\u5225\uff1a{category}",
    "view.cell.duration": "{days}\u5929",
    "view.cell.loadError": "\u4efb\u52d9\u8f09\u5165\u5931\u6557\uff0c\u8acb\u67e5\u770b\u4e3b\u63a7\u53f0",
    "view.cell.timeDuration": "{time} \xb7 {days}\u5929",
    "view.header.nextMonth": "\u4e0b\u6708",
    "view.header.nextWeek": "\u4e0b\u4e00\u9031",
    "view.header.pickView": "\u5207\u63db\u6aa2\u8996",
    "view.header.prevMonth": "\u4e0a\u6708",
    "view.header.prevWeek": "\u4e0a\u4e00\u9031",
    "view.header.thisWeek": "\u56de\u5230\u672c\u9031",
    "view.header.title": "\u6708\u66c6\u4efb\u52d9",
    "view.header.titleTip": "\u9ede\u64ca\u5feb\u901f\u5207\u63db\u65e5\u671f",
    "view.header.today": "\u56de\u5230\u672c\u6708",
    "view.menu.title": "\u6aa2\u8996",
    "view.mode.agenda": "\u5c0f\u6708\u6aa2\u8996",
    "view.mode.bigWeek": "\u5927\u9031\u6aa2\u8996",
    "view.mode.desc.agenda": "\u6574\u6708\u92ea\u6eff\u87a2\u5e55\uff0c\u4efb\u52d9\u5728\u4e0b\u65b9\u660e\u7d30\u5340",
    "view.mode.desc.bigWeek": "\u53ea\u770b\u4e00\u9031\uff0c\u4efb\u52d9\u5beb\u5728\u683c\u5b50\u88e1",
    "view.mode.desc.list": "\u6574\u6708\u92ea\u6eff\u87a2\u5e55\uff0c\u4efb\u52d9\u5beb\u5728\u683c\u5b50\u88e1",
    "view.mode.desc.week": "\u53ea\u770b\u4e00\u9031\uff0c\u4efb\u52d9\u5728\u4e0b\u65b9\u660e\u7d30\u5340",
    "view.mode.list": "\u5927\u6708\u6aa2\u8996",
    "view.mode.week": "\u5c0f\u9031\u6aa2\u8996",
    "view.month.1": "1\u6708",
    "view.month.10": "10\u6708",
    "view.month.11": "11\u6708",
    "view.month.12": "12\u6708",
    "view.month.2": "2\u6708",
    "view.month.3": "3\u6708",
    "view.month.4": "4\u6708",
    "view.month.5": "5\u6708",
    "view.month.6": "6\u6708",
    "view.month.7": "7\u6708",
    "view.month.8": "8\u6708",
    "view.month.9": "9\u6708",
    "view.month.title": "{year}\u5e74 {monthName}",
    "view.week.load": "\u5171 {n} \u9805 \u00b7 \u5b8c\u6210 {m}",
    "view.week.number": "\u7b2c {n} \u9031",
    "view.week.relative.next": "\u4e0b\u9031",
    "view.week.relative.prev": "\u4e0a\u9031",
    "view.week.relative.this": "\u672c\u9031",
    "view.week.title": "{a} \u2013 {b}",
    "view.weekday.fri": "\u4e94",
    "view.weekday.mon": "\u4e00",
    "view.weekday.sat": "\u516d",
    "view.weekday.sun": "\u65e5",
    "view.weekday.thu": "\u56db",
    "view.weekday.tue": "\u4e8c",
    "view.weekday.wed": "\u4e09"
  },
  "en": {
    "cmd.open": "Open Monthly Tasks View",
    "cmd.refresh": "Refresh Monthly Tasks View",
    "cmd.toggle": "Cycle monthly view (Month Cells / Month Agenda / Week Cells / Week Agenda)",
    "error.badDateConsole": "Monthly Tasks: Unrecognizable date task line ({path}:{line}): {line}",
    "error.builtinHoliday": "Monthly Tasks: Built-in holiday data read failed (holidays.json missing or corrupted), corresponding year will rely on network data source",
    "error.createFail": "Create task failed:",
    "error.delayRefresh": "Delayed refresh failed:",
    "error.deleteFail": "Delete task failed:",
    "error.deleteOldFail": "Delete original task line failed:",
    "error.fileNotFound": "File not found: {path}",
    "error.fileNotFound2": "File not found: {path}",
    "error.folderCreate": "Create task file in folder \"{folder}\" failed:",
    "error.holidayApi": "Holiday data: {year} API call failed",
    "error.holidayApiEmpty": "Holiday data: {year} API returned holiday field but no valid entries parsed, response structure may have changed",
    "error.holidayApiFormat": "API format error",
    "error.holidayCN": "Monthly Tasks: holiday-cn data source fetch {year} failed, trying timor.tech",
    "error.holidayCNFormat": "holiday-cn data format error",
    "error.holidayTimeout1": "Request timeout (8s): {year} holiday data",
    "error.holidayTimeout2": "Request timeout (8s): {year} holiday-cn data",
    "error.holidaysDataFormat": "Monthly Tasks: {year} data format in holidaysData is invalid, ignored",
    "error.holidaysDataKey": "Monthly Tasks: key \"{year}\" in holidaysData is not a valid year, ignored",
    "error.holidaysJsonFormat": "Monthly Tasks: {year} data format in holidays.json is invalid, ignored",
    "error.lineInvalid1": "Line number invalid, line is not a task: {line}",
    "error.lineInvalid2": "Line number invalid, line is not target task: {line}",
    "error.lineInvalidDel1": "Line number invalid, line is not a task, delete refused: {line}",
    "error.lineInvalidDel2": "Line number invalid, line is not target task, delete refused: {line}",
    "error.lineRange": "Line number out of range: {line}",
    "error.loadTasks": "Load tasks failed:",
    "error.noteSaveFail": "Save note failed:",
    "error.oversizedConsole": "Monthly Tasks: Multi-day task range {start} ~ {due} exceeds {limit} days, only mounting start and end dates ({path}:{line}): {content}",
    "error.parseFile": "Parse file failed: {path}",
    "error.postCreateRefresh": "Post-create refresh view failed:",
    "error.rawLineNotFound": "Task line not found by rawLine: {path}",
    "error.refreshHoliday": "Refresh holiday data failed:",
    "error.settingsLoad": "Settings load failed, using defaults:",
    "error.settingsSave": "Settings save failed:",
    "error.toggleFail": "Toggle task status failed:",
    "holiday.workday": "Work",
    "lunar.branch.1": "Zi",
    "lunar.branch.10": "You",
    "lunar.branch.11": "Xu",
    "lunar.branch.12": "Hai",
    "lunar.branch.2": "Chou",
    "lunar.branch.3": "Yin",
    "lunar.branch.4": "Mao",
    "lunar.branch.5": "Chen",
    "lunar.branch.6": "Si",
    "lunar.branch.7": "Wu",
    "lunar.branch.8": "Wei",
    "lunar.branch.9": "Shen",
    "lunar.day.1": "1st",
    "lunar.day.10": "10th",
    "lunar.day.11": "11th",
    "lunar.day.12": "12th",
    "lunar.day.13": "13th",
    "lunar.day.14": "14th",
    "lunar.day.15": "15th",
    "lunar.day.16": "16th",
    "lunar.day.17": "17th",
    "lunar.day.18": "18th",
    "lunar.day.19": "19th",
    "lunar.day.2": "2nd",
    "lunar.day.20": "20th",
    "lunar.day.21": "21st",
    "lunar.day.22": "22nd",
    "lunar.day.23": "23rd",
    "lunar.day.24": "24th",
    "lunar.day.25": "25th",
    "lunar.day.26": "26th",
    "lunar.day.27": "27th",
    "lunar.day.28": "28th",
    "lunar.day.29": "29th",
    "lunar.day.3": "3rd",
    "lunar.day.30": "30th",
    "lunar.day.4": "4th",
    "lunar.day.5": "5th",
    "lunar.day.6": "6th",
    "lunar.day.7": "7th",
    "lunar.day.8": "8th",
    "lunar.day.9": "9th",
    "lunar.leap": "Leap {monthName}",
    "lunar.month.1": "1st",
    "lunar.month.10": "10th",
    "lunar.month.11": "11th",
    "lunar.month.12": "12th",
    "lunar.month.2": "2nd",
    "lunar.month.3": "3rd",
    "lunar.month.4": "4th",
    "lunar.month.5": "5th",
    "lunar.month.6": "6th",
    "lunar.month.7": "7th",
    "lunar.month.8": "8th",
    "lunar.month.9": "9th",
    "lunar.monthSuffix": "{monthName}",
    "lunar.rangeError": "Year out of supported range (1900-2100)",
    "lunar.stem.1": "Jia",
    "lunar.stem.10": "Gui",
    "lunar.stem.2": "Yi",
    "lunar.stem.3": "Bing",
    "lunar.stem.4": "Ding",
    "lunar.stem.5": "Wu",
    "lunar.stem.6": "Ji",
    "lunar.stem.7": "Geng",
    "lunar.stem.8": "Xin",
    "lunar.stem.9": "Ren",
    "lunar.zodiac.1": "Rat",
    "lunar.zodiac.10": "Rooster",
    "lunar.zodiac.11": "Dog",
    "lunar.zodiac.12": "Pig",
    "lunar.zodiac.2": "Ox",
    "lunar.zodiac.3": "Tiger",
    "lunar.zodiac.4": "Rabbit",
    "lunar.zodiac.5": "Dragon",
    "lunar.zodiac.6": "Snake",
    "lunar.zodiac.7": "Horse",
    "lunar.zodiac.8": "Goat",
    "lunar.zodiac.9": "Monkey",
    "modal.create.add": "Add Task",
    "modal.create.allDay": "All Day",
    "modal.create.cancel": "Cancel",
    "modal.create.catMore": "More",
    "modal.create.category": "Category",
    "modal.create.categoryAria": "Category {label}",
    "modal.create.collapse": "Collapse",
    "modal.create.dateLine": "{m}/{day} \xb7 {weekday}",
    "modal.create.delete": "Delete Task",
    "modal.create.displayDate": "{m}/{d}/{y}",
    "modal.create.edit": "Edit Task",
    "modal.create.empty": "Task content cannot be empty (metadata stripped)",
    "modal.create.endBeforeStart": "End date cannot be earlier than start date",
    "modal.create.endBeforeStartTime": "End time must be later than start time",
    "modal.create.endNeedToggle": "Tick multi-day first",
    "modal.create.existingCount": "{n} tasks on this day",
    "modal.create.expand": "Expand",
    "modal.create.fail": "Create task failed, please retry",
    "modal.create.fillBoth": "Please fill in both start and end time",
    "modal.create.goto": "Jump to Document",
    "modal.create.high": "High",
    "modal.create.medium": "Medium",
    "modal.create.multiDay": "Multi-day Task",
    "modal.create.noDateMark": "This task has no date marker, cannot locate for editing",
    "modal.create.none": "Normal",
    "modal.create.note": "Note",
    "modal.create.noteAdd": "+ Add note",
    "modal.create.noteAria": "Add a note to this task",
    "modal.create.notePlaceholder": "Write a note, multiple lines allowed...",
    "modal.create.placeholder": "Enter task content\u2026",
    "modal.create.pleaseSelect": "Please select date",
    "modal.create.priority": "Priority",
    "modal.create.save": "Save",
    "modal.create.setTime": "+ Set Time",
    "modal.create.time": "Time",
    "modal.create.to": "to",
    "modal.create.toggleComplete": "Toggle completion status",
    "modal.create.toggleFail": "Operation failed, task may have been modified, refreshing list",
    "modal.create.viewAll": "View all {n} tasks \u25be",
    "modal.create.weekday.fri": "Friday",
    "modal.create.weekday.mon": "Monday",
    "modal.create.weekday.sat": "Saturday",
    "modal.create.weekday.sun": "Sunday",
    "modal.create.weekday.thu": "Thursday",
    "modal.create.weekday.tue": "Tuesday",
    "modal.create.weekday.wed": "Wednesday",
    "modal.date.confirm": "OK",
    "modal.date.currentYear": "Current Year: {year}",
    "modal.date.month": "Month",
    "modal.date.monthSuffix": "{m}",
    "modal.date.title": "Select Date",
    "modal.date.year": "Year",
    "modal.date.yearSuffix": "{y}",
    "modal.filter.all": "All",
    "modal.filter.selected": "{n} Selected",
    "modal.filter.title": "Filter by Category",
    "modal.filter.untagged": "No Tag",
    "notice.badDate": "Monthly Tasks: Found task with unrecognizable \U0001f4c5/\U0001f6eb date (including invalid dates like 2026-02-30), ignored (see console)",
    "notice.cantOpenView": "Monthly Tasks: Cannot open view, please restart Obsidian and try again",
    "notice.catExists": "Category \"{name}\" already exists",
    "notice.catInvalid": "Invalid category name: cannot be empty, cannot contain spaces or #, cannot be pure numbers",
    "notice.createdRefreshFail": "Task created, refresh failed, please switch month manually",
    "notice.editSavedBut": "Edit saved, but original task line could not be auto-deleted, please check for duplicates",
    "notice.holidayAutoFail": "Holiday data auto-refresh failed, please check network or refresh manually in settings",
    "notice.holidayPartial": "Holiday data refreshed ({ok}/{total} years successful)",
    "notice.holidayRefreshFail": "Refresh holiday data failed, please check network",
    "notice.holidayRefreshed": "Holiday data refreshed!",
    "notice.opFail": "Operation failed, please retry",
    "notice.oversized": "Monthly Tasks: Multi-day range exceeds {limit} days, showing start and end only (see console)",
    "notice.settingsLoadFail": "Settings load failed, reverted to defaults",
    "notice.settingsSaveFail": "Settings save failed, please check disk space and file permissions",
    "settings.archive.desc": "Determines which file new tasks are written to. Switching doesn't affect existing files, historical tasks will still all display.",
    "settings.archive.month": "By Month (2026\u5e7410\u6708\u4efb\u52a1\u5217\u8868.md)",
    "settings.archive.year": "By Year (2026\u5e74\u4efb\u52a1\u5217\u8868.md)",
    "settings.autoHoliday.desc": "Prefetch holiday data for three years before and after this year on startup (data source: holiday-cn \u2192 timor.tech); also fetch missing year data on demand when browsing other years",
    "settings.autoHoliday.name": "Auto-refresh Holidays on Startup",
    "settings.catAdd": "Add",
    "settings.catColor": "Color {name}",
    "settings.catDelete": "Delete",
    "settings.catDeleteAria": "Delete Category {name}",
    "settings.catDown": "Move Down {name}",
    "settings.catEmpty": "No known categories yet, add with input box below",
    "settings.catKnown.desc": "Maintain order and color for create modal and filter panel. Categories themselves are #tags at end of task lines, adding/deleting here won't modify any notes.",
    "settings.catKnown.name": "Known Categories",
    "settings.catPlaceholder": "New category name, e.g.: Fitness",
    "settings.catSwatch": "Swatch {n}",
    "settings.catUp": "Move Up {name}",
    "settings.defaultAllDay.desc": "New tasks default to all-day (no specific time)",
    "settings.defaultAllDay.name": "Default All Day Task",
    "settings.firstDow.desc": "Set calendar week start day",
    "settings.firstDow.name": "First Day of Week",
    "settings.folder.dead": "{folder} (Invalid)",
    "settings.folder.default": "Default (Tasks)",
    "settings.folder.desc": "Select storage location for task files. If yearly task file already exists, plugin will prioritize using it.",
    "settings.hideStrike.desc": "When enabled, hide strikethrough for completed tasks (also hides red vertical line for overdue tasks; completed state still has feedback: gray vertical bar on left edge + dimmed on mobile)",
    "settings.hideStrike.name": "Hide Strikethrough for Completed",
    // 语言选项名：三种语言里取值刻意相同（各自显示自己的写法），
    // 别"顺手"按当前语言翻译，否则英文界面下会出现 English -> 英文
    "settings.loading": "Loading\u2026",
    "settings.refreshBtn": "Refresh",
    "settings.refreshHoliday.desc": "Get latest holiday data from holiday-cn / timor.tech data source",
    "settings.refreshHoliday.name": "Refresh Holiday Data",
    "settings.section.archive": "Task Archive Period",
    "settings.section.category": "Category Management",
    "settings.section.display": "Display",
    "settings.section.folder": "Task Folder",
    "settings.section.holiday": "Holiday Data",
    "settings.section.storage": "Tasks & Storage",
    "settings.showCompleted.desc": "Show completed tasks in calendar",
    "settings.showCompleted.name": "Show Completed Tasks",
    "settings.showHoliday.desc": "Mark legal holidays and make-up workday information",
    "settings.showHoliday.name": "Show Holidays",
    "settings.showLunar.desc": "Show lunar date and solar terms below date",
    "settings.showLunar.name": "Show Lunar Calendar",
    "settings.tasksLimit.desc": "Maximum tasks shown per date cell; the day panel also collapses its task list beyond this number and shows \"View all\" at the same threshold",
    "settings.tasksLimit.name": "Tasks Per Day Limit",
    "settings.view.desc": "Which view the calendar opens with. Switching views from the header updates this to the one you last used.",
    "settings.view.name": "Default view",
    "view.agenda.addOne": "Add",
    "view.agenda.clearFilterAria": "Clear current category filter",
    "view.agenda.emptyDay": "Nothing planned",
    "view.agenda.emptyFiltered": "No tasks on this day under the current filter",
    "view.agenda.hasTaskDot": "Plans on this day",
    "view.agenda.manageDay": "Manage",
    "view.agenda.overdueDot": "Overdue on this day",
    "view.cell.category": "Category: {category}",
    "view.cell.duration": "{days}d",
    "view.cell.loadError": "Failed to load tasks, check console",
    "view.cell.timeDuration": "{time} \xb7 {days}d",
    "view.header.nextMonth": "Next Month",
    "view.header.nextWeek": "Next week",
    "view.header.pickView": "Switch view",
    "view.header.prevMonth": "Prev Month",
    "view.header.prevWeek": "Prev week",
    "view.header.thisWeek": "This week",
    "view.header.title": "Monthly Tasks",
    "view.header.titleTip": "Click to jump to date",
    "view.header.today": "Today",
    "view.menu.title": "View",
    "view.mode.agenda": "Month \u00b7 Agenda",
    "view.mode.bigWeek": "Week \u00b7 Cells",
    "view.mode.desc.agenda": "Whole month, tasks in the list below",
    "view.mode.desc.bigWeek": "One week only, tasks written in the cells",
    "view.mode.desc.list": "Whole month, tasks written in the cells",
    "view.mode.desc.week": "One week only, tasks in the list below",
    "view.mode.list": "Month \u00b7 Cells",
    "view.mode.week": "Week \u00b7 Agenda",
    "view.month.1": "Jan",
    "view.month.10": "Oct",
    "view.month.11": "Nov",
    "view.month.12": "Dec",
    "view.month.2": "Feb",
    "view.month.3": "Mar",
    "view.month.4": "Apr",
    "view.month.5": "May",
    "view.month.6": "Jun",
    "view.month.7": "Jul",
    "view.month.8": "Aug",
    "view.month.9": "Sep",
    "view.month.title": "{monthName} {year}",
    "view.week.load": "{n} items \u00b7 {m} done",
    "view.week.number": "Week {n}",
    "view.week.relative.next": "Next week",
    "view.week.relative.prev": "Last week",
    "view.week.relative.this": "This week",
    "view.week.title": "{a} \u2013 {b}",
    "view.weekday.fri": "Fri",
    "view.weekday.mon": "Mon",
    "view.weekday.sat": "Sat",
    "view.weekday.sun": "Sun",
    "view.weekday.thu": "Thu",
    "view.weekday.tue": "Tue",
    "view.weekday.wed": "Wed"
  }
};

/** 当前界面语言（loadSettings 里由 resolveLanguage 定，随 Obsidian 设置）*/
var I18N_LANG = "zh-CN";

/**
 * 取词：I18N_LANG 缺该 key 时回退 zh-CN；两处都没有则返回 key 本身（便于发现漏翻）
 * 名字用 tr 而非 t：本文件已有多处 `for (const t of ...)` 与 `(t) => ...`，
 * 单字母 t 会被这些局部变量遮蔽，块内调用 t() 直接抛 TypeError
 * @param key - 文案 key
 * @param vars - 占位值，如 { n: 3 } 替换 "{n}"
 */
function tr(key, vars) {
  var dict = I18N[I18N_LANG] || I18N["zh-CN"];
  var s = dict[key];
  if (s === undefined) s = I18N["zh-CN"][key];
  if (s === undefined) return key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, function (m0, name) {
    return vars[name] === undefined || vars[name] === null ? m0 : String(vars[name]);
  });
}

/**
 * 把 Obsidian 的界面语言码归一到本插件支持的三种：zh-CN / zh-TW / en
 * - getLanguage() 在不同版本里可能是 "zh-CN"/"zh-cn"/"zh-Hant"/"zh-TW" 等写法，
 *   故先取语族再判书写：带 hant/tw/hk/mo 的一律繁体，其余 zh 走简体
 * - 未收录的语言（ja/de/...）回退 zh-CN：本项目文案以简中为源语言，
 *   回退到英文反而更差（英文条目是人工二次翻译，覆盖率与简中不对等）
 */
function resolveLanguage(code) {
  if (!code || typeof code !== "string") return "zh-CN";
  const lower = code.toLowerCase();
  if (lower.indexOf("zh") !== 0 && lower.indexOf("cn") !== 0 && lower.indexOf("tw") !== 0 && lower.indexOf("hk") !== 0) {
    return lower.indexOf("en") === 0 ? "en" : "zh-CN";
  }
  if (/hant|tw|hk|mo/.test(lower)) return "zh-TW";
  return "zh-CN";
}

/**
 * 依据设置项算出实际生效语言并写入 I18N_LANG。
 * getLanguage 自 Obsidian 1.8.7 才有，而本插件 minAppVersion 是 0.15.0，
 * 老版本上直接调用会 TypeError，故先判存在、缺失时退回 navigator.language
 */
function applyLanguage(setting) {
  let code;
  if (setting && setting !== "auto") {
    code = setting;
  } else {
    try {
      code = typeof import_obsidian.getLanguage === "function" ? import_obsidian.getLanguage() : (navigator.language || "zh-CN");
    } catch (e) {
      code = navigator.language || "zh-CN";
    }
  }
  I18N_LANG = resolveLanguage(code);
  applyBadgeLocale();
  return I18N_LANG;
}

/**
 * 调休徽章文案。styles.css 里 .day-cell.workday::after 用的是
 * content: var(--mt-badge-work, '班')，值由这里写入 —— CSS 的 content 是编译期常量，
 * 插件没有本地化入口，写死 '班' 会让英文界面冒出一个孤零零的汉字。
 * JSON.stringify 负责补外层引号，最终落到 content 上的是带引号的字符串字面量。
 */
function applyBadgeLocale() {
  try {
    document.documentElement.style.setProperty("--mt-badge-work", JSON.stringify(tr("holiday.workday")));
  } catch (e) {
    // 拿不到 document（极端情况）时退回 CSS 里的 '班' 兜底值，不影响其余渲染
  }
}

// ==================== 任务数据模型 ====================

/**
 * 生成任务唯一ID
 * @param filePath - 任务所在文件路径
 * @param lineNumber - 任务所在行号
 * @returns 唯一标识符格式：filepath:linenumber
 */
function generateTaskId(filePath, lineNumber) {
  return `${filePath}:${lineNumber}`;
}

/**
 * 解析任务优先级
 * 🔴 高优先级 - 红色圆点标记
 * 🟡 中优先级 - 黄色圆点标记
 * 无标记 - 普通优先级
 * @param content - 任务内容
 * @returns 优先级值：0(普通)、2(中)、3(高)
 */
function parsePriority(content) {
  if (content.includes("\u{1F534}")) {
    return 3 /* HIGH */;
  }
  if (content.includes("\u{1F7E1}")) {
    return 2 /* MEDIUM */;
  }
  return 0 /* NONE */;
}

/* 非补零日期归一化：2026-4-5 → 2026-04-05 */
function normalizeDateStr(s) {
  const parts = s.split("-");
  return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
}
/* 日期合法性校验：形状合法但值非法（2026-13-45、2026-02-30）的字符串若直接
   作为分组键，任何月历格子都查不到它，任务会在月历中静默消失 */
function isValidDateStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
/* 时间归一化：9:00 → 09:00，保证字符串比较与排序正确 */
function normalizeTimeStr(t) {
  return t.replace(/\d{1,2}:\d{1,2}/g, (m) => {
    const [h, min] = m.split(":");
    return `${h.padStart(2, "0")}:${min.padStart(2, "0")}`;
  });
}
/* 首次遇到无法解析的 📅 日期时提示一次，避免每次解析重复弹窗 */
let invalidDateNoticeShown = false;

/**
 * 清理任务内容，移除所有元数据标记，并剥出类别标签
 * 保留任务的核心文本内容；日期兼容补零与不补零两种写法
 *
 * 类别约定（批次二 2.2 / 2.4）：
 * - 只认「行尾标签串」：连续写在行末的一串 #tag 才是类别候选；写在行首或正文中段
 *   （如被日期标记隔断）的 #tag 按正文处理，不误伤手写习惯，也不会被重拼后改变归属。
 * - 每任务至多一个类别：取行尾串里第一个合法标签作类别，其余标签留在正文原样显示。
 * - 标签规则沿用 Obsidian：前导必须有空白、不含空格、非纯数字，中文可用。
 * @returns { content, category } category 为不含 # 的标签名，无标签时为 ""
 */
function cleanTaskContent(rawLine) {
  // 以「去掉尾部空白」后的偏移为准定位标签，再回到原串截取，避免尾随空格错位
  const norm = rawLine.replace(/\s+$/u, "");
  const bodyOnly = norm.replace(/^\s*- \[[ x]\]\s*/i, "");
  const prefixLen = norm.length - bodyOnly.length;
  let category = "";
  let cleanedLine = norm;
  // 行尾标签串：形如 " #生活 #其它"（每个标签前都必须有空白，故行首 #xxx 不在此列）
  const run = bodyOnly.match(/(?:\s#[^\s#]+)+$/u);
  if (run) {
    let offset = 0;
    for (const raw of run[0].match(/\s(#[^\s#]+)/gu)) {
      const name = raw.trim().slice(1);
      // 纯数字不是合法标签（Obsidian 规则），在本串里继续往后找一个合法的
      if (/^\d+$/.test(name)) {
        offset += raw.length;
        continue;
      }
      category = name;
      // 只剥这一个标签：其余标签留在正文里（拼接时它们会落到日期标记之前，
      // 下次解析不再属于行尾串，因此「解析→重拼」不会让类别在两个标签间来回翻转）
      const at = run.index + offset;
      cleanedLine = norm.slice(0, prefixLen + at) + norm.slice(prefixLen + at + raw.length);
      break;
    }
  }
  // 与 CreateTaskModal 提交侧的剥离保持一致：🟢 优先级、➕ 创建日期 / ✅ 完成日期
  // （Tasks 插件格式）一并清理，避免外部格式粘贴后 emoji 混入任务显示文本
  const content = cleanedLine.replace(/^\s*- \[[ x]\]\s*/i, "").replace(/📅\s*\d{4}-\d{1,2}-\d{1,2}/gu, "").replace(/⏳\s*\d{4}-\d{1,2}-\d{1,2}/gu, "").replace(/🛫\s*\d{4}-\d{1,2}-\d{1,2}/gu, "").replace(/➕\s*\d{4}-\d{1,2}-\d{1,2}/gu, "").replace(/✅\s*\d{4}-\d{1,2}-\d{1,2}/gu, "").replace(/⏰\s*[^\s📅🛫🔴🟡✅🟢➕]+(?:\s*~\s*[^\s📅🛫🔴🟡✅🟢➕]+)?/gu, "").replace(/🔴|🟡|🟢/gu, "").replace(/\s+/g, " ").trim();
  return { content, category };
}

/**
 * 提取截止日期（📅标记），归一化为 YYYY-MM-DD
 * @param rawLine - 原始任务行
 * @returns 日期字符串 YYYY-MM-DD 或 undefined
 */
function extractDueDate(rawLine) {
  const match = rawLine.match(/📅\s*(\d{4}-\d{1,2}-\d{1,2})/u);
  if (!match) return void 0;
  const normalized = normalizeDateStr(match[1]);
  // 值非法（如 2026-02-30）：返回 undefined 走「含 📅 但无法解析」的提示通道，
  // 避免成为任何格子都查不到的分组键而在月历中静默消失
  return isValidDateStr(normalized) ? normalized : void 0;
}

/**
 * 提取开始日期（🛫标记）- 用于跨天任务，归一化为 YYYY-MM-DD
 * @param rawLine - 原始任务行
 * @returns 日期字符串 YYYY-MM-DD 或 undefined
 */
function extractStartDate(rawLine) {
  const match = rawLine.match(/🛫\s*(\d{4}-\d{1,2}-\d{1,2})/u);
  if (!match) return void 0;
  const normalized = normalizeDateStr(match[1]);
  // 同 extractDueDate：值非法时丢弃，走提示通道，跨天任务退化为截止日单日挂载
  return isValidDateStr(normalized) ? normalized : void 0;
}

/**
 * 提取时间信息（⏰标记），归一化为 HH:MM~HH:MM
 * @param rawLine - 原始任务行
 * @returns 时间字符串或 undefined
 */
function extractTime(rawLine) {
  // 支持两种时间格式：
  //   ⏰ 09:00~12:00  （无空格，本插件生成格式）
  //   ⏰ 09:00 ~ 12:00（带空格，用户手写或外部粘贴格式）
  // 遇到 📅/🛫/🔴/🟡/✅ 等其它 emoji 标记时停止；未补零时间归一化为 HH:MM
  const match = rawLine.match(/⏰\s*([^\s📅🛫🔴🟡✅🟢➕]+(?:\s*~\s*[^\s📅🛫🔴🟡✅🟢➕]+)?)/u);
  if (!match) return void 0;
  // 全角 ～ 归一为 ~ 并去掉 ~ 两侧空格
  const compact = match[1].replace(/～/g, "~").replace(/\s*~\s*/g, "~").trim();
  // 仅接受 HH:MM 或 HH:MM~HH:MM：time 参与同日排序键，垃圾值（⏰ 明天、日期串、
  // 中文区间等）会插进 HH:MM 序列中间，让「按时间排序」失去意义，直接丢弃
  if (!/^\d{1,2}:\d{1,2}(~\d{1,2}:\d{1,2})?$/.test(compact)) return void 0;
  return normalizeTimeStr(compact);
}

/**
 * 判断是否为任务行
 * 匹配格式：- [ ] 或 - [x]（支持大小写）
 * @param line - 文本行
 * @returns 是否为任务
 */
function isTaskLine(line) {
  return /^\s*- \[[ x]\]\s*/i.test(line);
}

/**
 * 收某任务行下方紧跟的引用块（v1.6.0 批次二：任务备注）。
 * 归属规则只有一条：从 startIdx 起「连续」的以 > 开头的行才算该任务的备注，
 * 中间夹了任何非引用行（空行、任务行、普通段落）即止——section 首行、文件头、
 * 隔了别的行的引用块一律不归属、不显示，老笔记里的说明性引用不会莫名变成备注。
 * > 后的空格可无（手打 >文本 很常见）。多行以 \n 合并，写回时逐行补 > 前缀（批次三）。
 */
function collectNoteAfter(lines, startIdx) {
  const parts = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*>/.test(line)) break;
    parts.push(line.replace(/^\s*>\s?/, '').replace(/\r$/, '').trimEnd());
  }
  while (parts.length && parts[parts.length - 1] === '') parts.pop();
  return parts.length ? parts.join('\n') : '';
}

/**
 * 备注文本（多行以 \n 合并）→ 写回用的原文行数组（批次三）。
 * 归一化掉 \r\n / \r，裁掉尾部空行；返回空数组 = 清除备注。
 */
function noteTextToLines(text) {
  const parts = String(text == null ? "" : text).replace(/\r\n?/g, "\n").split("\n");
  while (parts.length && parts[parts.length - 1].trim() === "") parts.pop();
  return parts;
}
/**
 * 定位任务行（批次三：备注写回的唯一寻址入口）。
 * 缓存的 lineNumber 在文件被别处加过行之后就会集体错位，所以判定顺序与
 * _deleteTaskByRawLineImpl 同口径：先试缓存行号（必须是任务行且与 rawLine 去尾空白
 * 相等），不中则全文件找同文任务行、取离缓存行号最近的一条；都找不到返回 -1。
 */
function findTaskLineIdx(lines, task) {
  const norm = (s) => s.replace(/\s+$/, "");
  const want = norm(task.rawLine == null ? "" : task.rawLine);
  const n = task.lineNumber;
  if (n >= 0 && n < lines.length && isTaskLine(lines[n]) && norm(lines[n]) === want) return n;
  let idx = -1;
  let best = Infinity;
  for (let i = 0; i < lines.length; i++) {
    if (!isTaskLine(lines[i]) || norm(lines[i]) !== want) continue;
    const dist = n >= 0 ? Math.abs(i - n) : 0;
    if (idx === -1 || dist < best) {
      idx = i;
      best = dist;
    }
  }
  return idx;
}
/**
 * 把某任务行下方**自己那段**备注块整体替换为新内容（原地增删行，不重建文件）。
 * 删旧块从 start 起按 > 连续性取，写新块逐行补 "> " 前缀；CRLF 文件里新行行尾
 * 补 \r（split("\n") 后每行自带 \r，补上才不混入裸 \n）。
 * @returns 实际替换掉的旧行数（0 = 该任务原本没有备注）
 */
function writeNoteAfter(lines, taskIdx, noteText, crlf) {
  let end = taskIdx + 1;
  while (end < lines.length && /^\s*>/.test(lines[end])) end++;
  const removed = end - (taskIdx + 1);
  if (removed > 0) lines.splice(taskIdx + 1, removed);
  const body = noteTextToLines(noteText);
  if (body.length) {
    const block = body.map((l) => {
      const text = l === "" ? ">" : "> " + l;
      return crlf ? text + "\r" : text;
    });
    lines.splice(taskIdx + 1, 0, ...block);
  }
  return removed;
}

/**
 * 判断任务是否已完成
 * @param line - 文本行
 * @returns 是否已完成
 */
function isTaskCompleted(line) {
  return /^\s*- \[x\]\s*/i.test(line);
}

/* 跨天任务挂载天数上限：超过后仅挂载首尾两日。手写的超长区间（如 1900-2100）
   整段挂载会生成数万条 map 记录并逐条渲染进格子，把内存与渲染时间线性放大 */
const MULTI_DAY_MOUNT_LIMIT = 366;
let oversizedRangeNoticeShown = false;

/**
 * 将任务列表按日期分组
 * @param tasks - 任务数组
 * @returns Map<日期, 任务数组>
 */
function groupTasksByDate(tasks) {
  const map = /* @__PURE__ */ new Map();
  const mountTask = (ds, task) => {
    const arr = map.get(ds) || [];
    arr.push(task);
    map.set(ds, arr);
  };
  for (const task of tasks) {
    // 仅有 🛫（无 📅）的任务按开始日期单日挂载，不再静默不可见
    if (!task.dueDate && !task.startDate)
      continue;
    // 跨天任务挂载到 [startDate, dueDate] 闭区间每日，使中间日与结束日也可见，
    // renderTaskItem 依据 task.dueDate 判定末日并加 multi-day-end 类（首日类已随箭头一并移除）。
    // dueDate 缺失时不进跨天分支（上方已保证，本分支按开始日期单日挂载）
    if (task.startDate && task.dueDate && task.startDate !== task.dueDate) {
      const [sy, sm, sd] = task.startDate.split("-").map(Number);
      const [ey, em, ed] = task.dueDate.split("-").map(Number);
      const start = new Date(sy, sm - 1, sd);
      const end = new Date(ey, em - 1, ed);
      // 防御：startDate > dueDate 时回退为单日挂载，避免无限循环
      if (end >= start) {
        // 超长区间退化为仅挂载首尾两日（首次给用户可见提示，其余记日志）
        const spanDays = Math.round((end - start) / (1e3 * 60 * 60 * 24)) + 1;
        if (spanDays > MULTI_DAY_MOUNT_LIMIT) {
          mountTask(task.startDate, task);
          mountTask(task.dueDate, task);
          if (!oversizedRangeNoticeShown) {
            oversizedRangeNoticeShown = true;
            new import_obsidian.Notice(tr("notice.oversized", { limit: MULTI_DAY_MOUNT_LIMIT }));
          }
          console.warn(tr("error.oversizedConsole", { start: task.startDate, due: task.dueDate, limit: MULTI_DAY_MOUNT_LIMIT, path: task.filePath, line: task.lineNumber + 1, content: task.content }));
          continue;
        }
        const cur = new Date(start);
        while (cur <= end) {
          mountTask(formatDate(cur), task);
          cur.setDate(cur.getDate() + 1);
        }
        continue;
      }
    }
    const displayDate = task.startDate || task.dueDate;
    const existing = map.get(displayDate) || [];
    existing.push(task);
    map.set(displayDate, existing);
  }
  for (const [date, dateTasks] of map) {
    dateTasks.sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }
      if (a.time && b.time) {
        return a.time.localeCompare(b.time);
      }
      if (a.time) return -1;
      if (b.time) return 1;
      return a.lineNumber - b.lineNumber;
    });
    map.set(date, dateTasks);
  }
  return map;
}
/**
 * 由日期推导归档周期标识，年度/月度共用同一条文件名拼接路径。
 * 注意：周期由被点击的日期推导（不是从"今天"），所以翻到别的月份点日期会写进那个月的文件。
 * @param date - Date 对象
 * @param period - "year" | "month"
 * @returns 年度 "2026"；月度 "2026年10月"（月补零）
 */
function getPeriodId(date, period) {
  const y = String(date.getFullYear());
  if (period === "month") {
    const m = String(date.getMonth() + 1).padStart(2, "0");
    return `${y}\u5E74${m}\u6708`;
  }
  return y;
}
/**
 * 判断是否为跨天任务
 * 跨天任务有开始日期（🛫）且与截止日期不同
 * @param task - 任务对象
 * @returns 是否为跨天任务
 */
function isMultiDayTask(task) {
  // 仅 🛫 无 📅 的任务按开始日期单日挂载，不视为跨天（避免 duration 对 undefined 日期计算出 NaN）
  return !!task.startDate && !!task.dueDate && task.startDate !== task.dueDate;
}

/**
 * 获取跨天任务的天数
 * @param task - 任务对象
 * @returns 任务跨越的天数（最小为1）
 */
function getMultiDayDuration(task) {
  if (!isMultiDayTask(task))
    return 1;
  // 使用本地时间构造日期，避免 new Date("YYYY-MM-DD") 在不同浏览器中
  // 被解析为 UTC 00:00 导致夏令时切换日 diffTime 不是 24 小时整数倍。
  const [sy, sm, sd] = task.startDate.split("-").map(Number);
  const [ey, em, ed] = task.dueDate.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const diffTime = end.getTime() - start.getTime();
  // 防御性：startDate > dueDate 时返回至少 1，避免下游渲染异常
  return Math.max(1, Math.round(diffTime / (1e3 * 60 * 60 * 24)) + 1);
}

/**
 * 判断任务是否已过期
 * @param dateStr - 日期字符串 YYYY-MM-DD
 * @returns 是否已过期
 */
function isOverdue(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // 使用本地时间构造，避免 new Date("YYYY-MM-DD") 解析为 UTC 导致时区偏差
  const [y, m, d] = dateStr.split("-").map(Number);
  const checkDate = new Date(y, m - 1, d);
  return checkDate < today;
}

/**
 * ============================================================
 * TaskParser - 任务解析器
 * ============================================================
 * 负责解析Obsidian库中的任务，管理缓存，提供创建任务功能
 * 
 * 主要功能：
 * - parseAllTasks()：解析所有任务（带5秒缓存）
 * - createTask()：创建新任务，自动按月份分组到年度任务列表
 * - createTaskForDate()：在指定日期创建任务
 * - getOrCreateDefaultTaskFile()：获取或创建归档任务列表文件（年度或月度）
 * 
 * 任务文件格式：
 * - 文件路径：任务/2026年任务列表.md
 * - 月份分组：## 2026年04月
 * - 任务格式：- [ ] 任务名 📅 2026-04-21
 * - 分隔符：---
 * ============================================================
 */
var TaskParser = class {
  // 5秒缓存
  constructor(app, plugin) {
    // plugin 用于读取 taskFilePeriod（归档粒度）；缺省时一律按年度行为
    this.plugin = plugin || null;
    this.cache = null;
    this.lastParseTime = 0;
    this.CACHE_DURATION = 5e3;
    this.app = app;
    // 任务文件路径缓存：键为 `${period}|${periodId}`，年度/月度互不覆盖
    this.taskFileCache = /* @__PURE__ */ new Map();
    // 写操作串行化队列：避免 createTask/toggleTask/deleteTask 并发读写导致后写覆盖先写丢失任务
    this.writeQueue = Promise.resolve();
    // 批次三：编辑「先建后删」的新行交接凭证（create 写、delete 消费）。
    // v1.5.4：调用方在 create 之后同步取走、再显式传给 deleteTaskByRawLine（options.created）。
    // 之所以不再让 delete 自己去读：两条编辑链路并发时（B建→A建→B删→A删）这个单槽会被
    // 后写者覆盖，排在队列里的 B删读到的却是 A 的坐标，可能把 A 刚保存的行当成旧行删掉
    this.lastCreatedInfo = null;
    // 进行中的全库解析 Promise：供并发调用复用，避免缓存失效窗口内重复全库扫描
    this.parsingPromise = null;
  }
  /**
   * 解析所有文件中的任务
   * @param forceRefresh 是否强制刷新缓存
   */
  async parseAllTasks(forceRefresh = false) {
    if (!forceRefresh && this.cache && Date.now() - this.lastParseTime < this.CACHE_DURATION) {
      return this.cache;
    }
    // in-flight 去重：缓存失效后的短暂窗口内，视图渲染与文件变更事件可能并发触发
    // 多次全库遍历 + 全文读取（大库/移动端明显卡顿），并发调用复用同一次解析
    // forceRefresh 语义优先：显式要求重解时不复用在途解析——在途任务可能始于
    // 上一次文件写入之前，复用会让「写完立刻读」拿到旧结果（实测：监听器抢占解析时
    // 新任务延迟数秒才出现）；非 force 路径的并发去重收益保持不变
    if (this.parsingPromise && !forceRefresh) {
      return this.parsingPromise;
    }
    this.parsingPromise = (async () => {
      // 并发序号守卫：forceRefresh 允许另起在途解析后，先启动的（内容较旧的）
      // 解析可能更晚完成；写缓存前校验「自己仍是最后启动的那次」，旧快照不得覆盖新结果
      const mySeq = (this.parseSeq = (this.parseSeq || 0) + 1);
      try {
        const tasks = [];
        const files = this.app.vault.getMarkdownFiles();
        for (const file of files) {
          // 单文件错误隔离：单个文件解析失败（如已被删除、内容异常）不应导致整个任务列表为空
          try {
            const fileTasks = await this.parseFile(file);
            tasks.push(...fileTasks);
          } catch (e) {
            console.error(tr("error.parseFile", { path: file.path }), e);
          }
        }
        if (mySeq !== this.parseSeq) {
          return this.cache;
        }
        const taskMap = groupTasksByDate(tasks);
        const now = Date.now();
        this.cache = {
          tasks,
          taskMap,
          parseTime: now
        };
        this.lastParseTime = now;
        return this.cache;
      } finally {
        this.parsingPromise = null;
      }
    })();
    return this.parsingPromise;
  }
  /**
   * 解析单个文件中的任务
   */
  async parseFile(file) {
    const tasks = [];
    const cache = this.app.metadataCache.getFileCache(file);
    // 预筛：metadataCache 已就绪且文件不含任何列表项（listItems 缺失或为空）时直接跳过。
    // Obsidian 对「没有任何列表项的普通笔记」根本不生成 listItems 字段，此前仅判断
    // cache.listItems 为真值会漏掉这批数量最多的文件、仍走全文读取；缓存未就绪
    // （cache 为空）时仍回退全文扫描，保证新建文件首解析不丢任务
    if (cache && (!cache.listItems || cache.listItems.length === 0)) {
      return tasks;
    }
    if (cache && cache.listItems && !cache.listItems.some((item) => this.isTaskItem(item))) {
      return tasks;
    }
    const content = await this.app.vault.cachedRead(file);
    const lines = content.split("\n");
    if (cache && cache.listItems) {
      for (const item of cache.listItems) {
        if (!this.isTaskItem(item))
          continue;
        const lineNumber = item.position.start.line;
        const line = lines[lineNumber];
        if (!line || !isTaskLine(line))
          continue;
        const task = this.parseTaskLine(line, file.path, lineNumber);
        if (task) {
          // 备注（v1.6.0 批次二）：listItems 只认列表项、看不到引用块，
          // 从任务行的下一行起按原文补收；与逐行扫描分支同一套规则，
          // 保证缓存命中/未命中两条分支结果一致
          task.note = collectNoteAfter(lines, lineNumber + 1);
          tasks.push(task);
        }
      }
    } else {
      // metadataCache 未就绪（新建文件首次解析）或无 listItems 时，回退逐行扫描，
      // 避免任务创建后短时间内月历不显示
      // 维护代码块边界标志，跳过 ``` 围栏内的伪任务行，避免误收/误改代码块内容
      let inFence = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*```/.test(line)) {
          inFence = !inFence;
          continue;
        }
        if (inFence) continue;
        if (!isTaskLine(line)) continue;
        const task = this.parseTaskLine(line, file.path, i);
        if (task) {
          task.note = collectNoteAfter(lines, i + 1);
          tasks.push(task);
        }
      }
    }
    return tasks;
  }
  /**
   * 检查列表项是否为任务
   */
  isTaskItem(item) {
    return item.task !== void 0;
  }
  /**
   * 解析单行任务
   */
  parseTaskLine(line, filePath, lineNumber) {
    const dueDate = extractDueDate(line);
    const startDate = extractStartDate(line);
    const time = extractTime(line);
    const { content, category } = cleanTaskContent(line);
    // 含 📅/🛫 但日期无法解析（含形状合法但值非法，如 2026-02-30）：
    // 不静默丢弃，首次给出提示，其余仅记日志
    const badDue = !dueDate && line.includes("📅");
    const badStart = !startDate && line.includes("🛫");
    if (badDue || badStart) {
      if (!invalidDateNoticeShown) {
        invalidDateNoticeShown = true;
        new import_obsidian.Notice(tr("notice.badDate"));
      }
      console.warn(tr("error.badDateConsole", { path: filePath, line: lineNumber + 1, line: line }));
    }
    if (!content)
      return null;
    return {
      id: generateTaskId(filePath, lineNumber),
      content,
      // 类别：行尾 #tag 剥出的标签名（无标签为 ""）；仅参与显示与筛选
      category,
      rawLine: line,
      filePath,
      lineNumber,
      completed: isTaskCompleted(line),
      startDate,
      dueDate,
      time,
      priority: parsePriority(line),
      // 备注（v1.6.0 批次二）：任务行下方紧跟的 > 引用块，由 parseFile
      // 两个分支经 collectNoteAfter 回填；无备注为空字符串
      note: "",
      createdAt: Date.now()
    };
  }
  /**
   * 切换任务完成状态
   */
  async toggleTask(task) {
    // 串行化：避免与 createTask/deleteTask 并发读写同一文件导致后写覆盖先写
    const run = () => this._toggleTaskImpl(task);
    this.writeQueue = this.writeQueue.then(run, run);
    return this.writeQueue;
  }
  async _toggleTaskImpl(task) {
    try {
      const file = this.app.vault.getAbstractFileByPath(task.filePath);
      if (!(file instanceof import_obsidian.TFile)) {
        console.error(tr("error.fileNotFound", { path: task.filePath }));
        return false;
      }
      const content = await this.app.vault.read(file);
      const lines = content.split("\n");
      if (task.lineNumber >= lines.length) {
        console.error(tr("error.lineRange", { line: task.lineNumber }));
        return false;
      }
      const line = lines[task.lineNumber];
      // 行号失效校验：若该行已不是任务行（文件被改），拒绝操作避免误改正文
      if (!isTaskLine(line)) {
        console.error(tr("error.lineInvalid1", { line: task.lineNumber }));
        return false;
      }
      // 任务身份校验：若该行内容与任务原始行不一致（行号偏移指向了其他任务），拒绝操作
      // 比较时去除尾部空白，避免 Obsidian "Trim trailing whitespace on save" 等自动格式化导致误判
      if (task.rawLine && task.rawLine.replace(/\s+$/, "") !== line.replace(/\s+$/, "")) {
        console.error(tr("error.lineInvalid2", { line: task.lineNumber }));
        return false;
      }
      let newLine;
      if (isTaskCompleted(line)) {
        newLine = line.replace(/- \[[xX]\]/, "- [ ]");
      } else {
        newLine = line.replace(/- \[ \]/, "- [x]");
      }
      // 若替换未生效（行内容不匹配），避免静默成功
      if (newLine === line) return false;
      lines[task.lineNumber] = newLine;
      await this.app.vault.modify(file, lines.join("\n"));
      this.invalidateCache();
      return true;
    } catch (error) {
      console.error(tr("error.toggleFail"), error);
      return false;
    }
  }
  /**
   * 删除指定任务（按行号删除）
   */
  async deleteTask(task) {
    // 串行化：避免与其他写操作并发导致基于过期文件内容删除
    const run = () => this._deleteTaskImpl(task);
    this.writeQueue = this.writeQueue.then(run, run);
    return this.writeQueue;
  }
  async _deleteTaskImpl(task) {
    try {
      const file = this.app.vault.getAbstractFileByPath(task.filePath);
      if (!(file instanceof import_obsidian.TFile)) {
        console.error(tr("error.fileNotFound", { path: task.filePath }));
        return false;
      }
      const content = await this.app.vault.read(file);
      const lines = content.split("\n");
      if (task.lineNumber >= lines.length) {
        console.error(tr("error.lineRange", { line: task.lineNumber }));
        return false;
      }
      // 删除该行；若删除后上下相邻行均为空行，收掉一个，自愈存量孤儿空行
      // 行号失效校验：若该行已不是任务行（文件被改），拒绝操作避免误删正文
      const lineToDelete = lines[task.lineNumber];
      if (!isTaskLine(lineToDelete)) {
        console.error(tr("error.lineInvalidDel1", { line: task.lineNumber }));
        return false;
      }
      // 任务身份校验：若该行内容与任务原始行不一致（行号偏移指向了其他任务），拒绝删除
      // 比较时去除尾部空白，避免 Obsidian 自动格式化导致误判
      if (task.rawLine && task.rawLine.replace(/\s+$/, "") !== lineToDelete.replace(/\s+$/, "")) {
        console.error(tr("error.lineInvalidDel2", { line: task.lineNumber }));
        return false;
      }
      const hadCRLF = /\r$/.test(lineToDelete);
      const blankLine = hadCRLF ? "\r" : "";
      lines.splice(task.lineNumber, 1);
      // v1.6.0 批次三：删任务不连带删备注——内容丢了最心疼。紧跟它的 > 块
      // 去掉前缀降级成普通段落留在原地。行间补空行：连续两个非空行会被 Markdown
      // 按「惰性续行」并成一段，多行备注会糊成一行；且降级后的文字若紧贴上一条
      // 任务行，会被并进那条任务的正文。
      let demoted = 0;
      while (task.lineNumber + demoted < lines.length && /^[ \t]*>/.test(lines[task.lineNumber + demoted])) {
        const raw = lines[task.lineNumber + demoted];
        const eol = /\r$/.test(raw) ? "\r" : "";
        const stripped = raw.replace(/\r$/, "").replace(/^[ \t]*>[ \t]?/, "").replace(/[ \t]+$/, "");
        if (stripped !== "") lines[task.lineNumber + demoted] = stripped + eol;
        else lines[task.lineNumber + demoted] = blankLine;
        demoted++;
      }
      if (demoted > 0 && lines[task.lineNumber].trim() !== "") {
        lines.splice(task.lineNumber, 0, blankLine);
      }
      // 自愈：上下皆空行时收掉其后那个（只碰空行，连续多空行随多次删除逐步收敛）。
      // 基准下移到降级块末尾：任务行已被摘掉，紧跟降级块的那一行才是「下一行」
      const selfHealIdx = task.lineNumber + demoted;
      const prevLine = lines[selfHealIdx - 1];
      const nextLine = lines[selfHealIdx];
      if (prevLine !== undefined && nextLine !== undefined &&
          prevLine.trim() === "" && nextLine.trim() === "") {
        lines.splice(selfHealIdx, 1);
      }
      await this.app.vault.modify(file, lines.join("\n"));
      this.invalidateCache();
      return true;
    } catch (error) {
      console.error(tr("error.deleteFail"), error);
      return false;
    }
  }
  /**
   * 批次三：编辑「先建后删」的旧行删除入口。
   * 新行插入后旧行 lineNumber 常发生偏移（同文件新行可能排在旧行之前），
   * 直接 deleteTask(task) 会被行号身份校验判为失效。策略：读一次文件 →
   * 先试 preferredLineNumber（命中即用）；否则全文件找与 rawLine（去尾空白）
   * 相等且为任务行的行——多处相同取离 preferredLineNumber 最近的一条。
   * 找不到返回 false。排 writeQueue 串行，与勾选/删除/创建互斥。
   */
  // 批次三：options.created 传入本次链路刚写入的新行坐标；它与 rawLine 逐字节相同时
  // 也不得删除——那正是用户刚保存的结果
  async deleteTaskByRawLine(filePath, rawLine, preferredLineNumber, options) {
    const run = () => this._deleteTaskByRawLineImpl(filePath, rawLine, preferredLineNumber, options);
    this.writeQueue = this.writeQueue.then(run, run);
    return this.writeQueue;
  }
  async _deleteTaskByRawLineImpl(filePath, rawLine, preferredLineNumber, options) {
    try {
      const norm = (s) => s.replace(/\s+$/, "");
      const want = norm(rawLine);
      // 批次三：先建的新行可能与旧 rawLine 逐字节相同（只改了其他字段时），不排除会
      // 误删刚落盘的新行导致编辑静默失效（9a 探针实锤）。令牌是「本次链路那一条新行」
      // 的坐标，所以按 filePath + text + index 三重匹配，只排除这一条，别的同名行照删
      const createdToken = options && options.created ? options.created : null;
      const tokenApplies = !!(createdToken && createdToken.filePath === filePath && createdToken.text === want);
      const isNewRow = (n) => tokenApplies && createdToken.index === n;
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof import_obsidian.TFile)) {
        console.error(tr("error.fileNotFound2", { path: filePath }));
        return false;
      }
      const content = await this.app.vault.read(file);
      const linesArr = content.split("\n");
      let idx = -1;
      if (preferredLineNumber >= 0 && preferredLineNumber < linesArr.length &&
          isTaskLine(linesArr[preferredLineNumber]) && norm(linesArr[preferredLineNumber]) === want &&
          !isNewRow(preferredLineNumber)) {
        idx = preferredLineNumber;
      } else {
        // 全文件兜底：同名任务多行时，取离 preferredLineNumber 最近的一条，
        // 而不是固定取首条——固定取首条会让用户删/改 B、实际删掉更靠前的 A（内容相同，
        // 用户难以察觉）。preferred 无效（-1）时退化为原来的「取首条」
        let bestDist = Infinity;
        for (let n = 0; n < linesArr.length; n++) {
          if (!isTaskLine(linesArr[n]) || norm(linesArr[n]) !== want || isNewRow(n)) continue;
          const dist = preferredLineNumber >= 0 ? Math.abs(n - preferredLineNumber) : 0;
          if (idx === -1 || dist < bestDist) {
            idx = n;
            bestDist = dist;
          }
        }
      }
      if (idx === -1) {
        console.error(tr("error.rawLineNotFound", { path: filePath }));
        return false;
      }
      // v1.6.0 批次三：编辑=先建新行再删旧行，备注要跟着新行走。默认（直接删除任务）
      // 走 _deleteTaskImpl 的降级保留策略；只有编辑链路显式 dropNote 才连着备注块一起删，
      // 由调用方把同一份内容写到新行下方，避免出现「降级副本 + 新行副本」两份。
      if (options && options.dropNote) {
        let dn = idx + 1;
        while (dn < linesArr.length && /^[ \t]*>/.test(linesArr[dn])) {
          linesArr.splice(dn, 1);
        }
      }
      linesArr.splice(idx, 1);
      // 与 _deleteTaskImpl 同款孤儿空行自愈
      const prevLine = linesArr[idx - 1];
      const nextLine = linesArr[idx];
      if (prevLine !== undefined && nextLine !== undefined &&
          prevLine.trim() === "" && nextLine.trim() === "") {
        linesArr.splice(idx, 1);
      }
      await this.app.vault.modify(file, linesArr.join("\n"));
      this.invalidateCache();
      return true;
    } catch (error) {
      console.error(tr("error.deleteOldFail"), error);
      return false;
    }
  }
  /**
   * v1.6.0 批次三：写回某任务的备注（> 引用块）。排进 writeQueue 与勾选/删除/创建互斥，
   * 成功后 invalidateCache —— 备注增删会让后续行号集体错位，不立刻重解析就会出现
   * 「点别的任务改错行」，这条是批次二遗留风险（计划 §五.2）的收口。
   * @param task - 只需 filePath / rawLine / lineNumber 三个定位字段
   * @param noteText - 新备注原文（多行以 \n 分隔）；空串 = 清除备注
   */
  async updateTaskNote(task, noteText) {
    const run = () => this._updateTaskNoteImpl(task, noteText);
    this.writeQueue = this.writeQueue.then(run, run);
    return this.writeQueue;
  }
  async _updateTaskNoteImpl(task, noteText) {
    try {
      const file = this.app.vault.getAbstractFileByPath(task.filePath);
      if (!(file instanceof import_obsidian.TFile)) {
        console.error(tr("error.fileNotFound", { path: task.filePath }));
        return false;
      }
      const content = await this.app.vault.read(file);
      const lines = content.split("\n");
      const idx = findTaskLineIdx(lines, task);
      if (idx === -1) {
        // 定位不到就什么都不写：宁可保存失败让用户重试，也不能把备注挂到别的任务上
        console.error(tr("error.rawLineNotFound", { path: task.filePath }));
        return false;
      }
      writeNoteAfter(lines, idx, noteText, content.includes("\r\n"));
      await this.app.vault.modify(file, lines.join("\n"));
      this.invalidateCache();
      return true;
    } catch (error) {
      console.error(tr("error.noteSaveFail"), error);
      return false;
    }
  }
  /**
   * 在指定文件中创建新任务
   */
  async createTask(filePath, content, dueDate, isAllDay, time, priority, startDate, category, completed, note) {
    // 串行化：避免与其他写操作并发导致后写覆盖先写丢失任务
    const run = () => this._createTaskImpl(filePath, content, dueDate, isAllDay, time, priority, startDate, category, completed, note);
    this.writeQueue = this.writeQueue.then(run, run);
    return this.writeQueue;
  }
  async _createTaskImpl(filePath, content, dueDate, isAllDay, time, priority, startDate, category, completed, note) {
    try {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof import_obsidian.TFile)) {
        console.error(tr("error.fileNotFound2", { path: filePath }));
        return false;
      }
      let fileContent = await this.app.vault.read(file);
      // 批次三：记录新行落点（0 基行号），供编辑「先建后删」排除刚写入的新行
      let createdIndex = -1;
      // 归一化入参日期（防外部调用传不补零格式），保证排序比较与月份标题匹配正确
      const normDate = (s) => /^\d{4}-\d{1,2}-\d{1,2}$/.test(s) ? normalizeDateStr(s) : s;
      dueDate = normDate(dueDate);
      startDate = startDate ? normDate(startDate) : startDate;
      // 任务格式：内容 + [优先级emoji] + 🛫 开始日期 + ⏰ 时间 + 📅 结束日期
      let priorityMarker = priority === 3 ? "\u{1F534} " : priority === 2 ? "\u{1F7E1} " : "";
      let dateMarker = startDate && startDate !== dueDate
        ? `\u{1F6EB} ${startDate} `
        : "";
      let timeMarker = time && !isAllDay ? `\u23F0 ${time} ` : "";
      // dueDate 缺失时不写 📅 标记（防御：当前调用链恒传有效日期，但本方法是公共入队入口）
      const dueMarker = dueDate ? `\u{1F4C5} ${dueDate}` : "";
      // 标记顺序约定：内容 → 优先级emoji → 🛫 → ⏰ → 📅 → #标签（与解析层行尾取标签互为逆操作）
      const categoryMarker = category ? ` #${category}` : "";
      // 批次三：编辑=删除+重建，重建必须保留勾选态——已完成任务写 `- [x]`；
      // 新建链路 completed 为 undefined（falsy），行为与旧版逐字节一致
      let taskLine = `- [${completed ? "x" : " "}] ${content} ${priorityMarker}${dateMarker}${timeMarker}${dueMarker}${categoryMarker}`.trimEnd();
      // v1.6.0 批次三：编辑=删除+重建时备注必须跟着新行走（否则改一次日期备注就没了）。
      // 这里只把备注渲染成待写回的原文行数组，具体插入位置由各分支按 CRLF 补 \r。
      const noteBody = noteTextToLines(note);
      
      // 确定用于排序和插入的日期：跨天任务用开始日期，普通任务用截止日期
      const isMultiDay = startDate && startDate !== dueDate;
      const sortDate = isMultiDay ? startDate : dueDate;
      
      if (sortDate) {
        const [y, m] = sortDate.split("-");
        const monthSection = `## ${y}\u5E74${m}\u6708`;
        // 查找月份section位置：兼容用户手动创建的无前导零月份标题（如 "## 2026年4月"），
        // 避免与插件生成的 "## 2026年04月" 重复创建同月 section。
        // 两处模式都必须锚定行尾（[ \t]*\r?$ 兼容 CRLF）：否则用户手写的日期级标题
        // "## 2026年1月1日 元旦计划会" 会被当成 1 月节，新任务被塞进那段纪要下面
        const sectionMatch = fileContent.match(new RegExp(`^## ${y}\u5E740*${parseInt(m)}\u6708[ \\t]*\\r?$`, "m"));
        const sectionIdx = sectionMatch ? sectionMatch.index : -1;
        if (sectionIdx === -1) {
          // 月份section不存在，需要创建
          // 找到所有月份section的位置（锚定行首+行尾，避免误匹配 ### 、行中或日期级标题）
          const monthRegex = /^## (\d{4})\u5E74(\d{1,2})\u6708[ \t]*\r?$/gm;
          const months = [];
          let match;
          while ((match = monthRegex.exec(fileContent)) !== null) {
            months.push({ year: parseInt(match[1]), month: parseInt(match[2]), pos: match.index });
          }
          const newYear = parseInt(y);
          const newMonth = parseInt(m);
          let insertPos = fileContent.length;
          // 找到第一个比新月份大的section
          for (const mo of months) {
            if (mo.year > newYear || (mo.year === newYear && mo.month > newMonth)) {
              insertPos = mo.pos;
              break;
            }
          }
          // 在该位置前插入新月份section
          // 行尾跟随文件主行尾（CRLF 库不混入裸 \n）；空行按需补齐，相邻已有空行不再追加
          const eol = fileContent.includes("\r\n") ? "\r\n" : "\n";
          // 插入点前已有分隔符（下一月份section的前置---，或文件尾悬挂的---）时复用它，
          // 不再自带---前缀，避免产生连续两个分隔符；插入点在文件中部时（仅当用户手工删过
          // 分隔符），新section尾部都要补---供下一月份使用，否则后续追加的任务会被算进下月section
          const before = fileContent.slice(0, insertPos);
          const sepBefore = /(?:^|\n)---[ \t]*$/.test(before.replace(/(?:[ \t]*\r?\n)+$/, ""));
          const leadBlank = /(?:^|\n)[ \t]*\r?\n$/.test(before) ? "" : eol;
          const tailSep = insertPos < fileContent.length ? `---${eol}${eol}` : "";
          // 备注行逐行补 > 前缀；CRLF 文件里 taskLine 本身不带 \r（靠 eol 分隔），
          // 所以这里统一用 eol 连接，不重复补 \r
          const noteStr = noteBody.length ? noteBody.map((l) => (l === "" ? ">" : "> " + l)).join(eol) + eol : "";
          const newSection = sepBefore
            ? `${leadBlank}${monthSection}${eol}${eol}${taskLine}${eol}${noteStr}${eol}${tailSep}`
            : `${leadBlank}---${eol}${eol}${monthSection}${eol}${eol}${taskLine}${eol}${noteStr}${eol}${tailSep}`;
          fileContent = fileContent.slice(0, insertPos) + newSection + fileContent.slice(insertPos);
          createdIndex = (fileContent.slice(0, insertPos + newSection.indexOf(taskLine)).match(/\n/g) || []).length;
        } else {
          // 月份section已存在，按日期时间排序插入
          const afterSection = fileContent.slice(sectionIdx);
          // 月份分界用行首 "---" 匹配（兼容 LF/CRLF）：CRLF 换行的文件里 indexOf("\n---\n") 永远失配，
          // section 会一直延伸到文件尾，导致任务被插进后面的月份 section
          const sepMatch = afterSection.match(/^---[ \t]*\r?$/m);
          const sectionEnd = sepMatch && sepMatch.index > 1 ? sectionIdx + sepMatch.index - 1 : fileContent.length;
          const sectionContent = fileContent.slice(sectionIdx, sectionEnd);
          const newTime = time && !isAllDay ? time.split("~")[0] : null;
          // 在section内找到第一个日期大于新日期的行，在其前面插入
          const lines = sectionContent.split("\n");
          let insertIdx = lines.length;
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line.startsWith("- [")) continue;
            // 获取任务的排序日期：跨天任务取开始日期，普通任务取截止日期
            // 复用提取器：支持不补零日期并归一化，保证与 sortDate 的字符串比较正确
            const existingSortDate = extractStartDate(line) || extractDueDate(line) || null;
            if (!existingSortDate) continue;
            if (existingSortDate > sortDate) {
              insertIdx = i;
              break;
            }
            if (existingSortDate === sortDate) {
              const taskTimeRaw = extractTime(line);
              const taskTime = taskTimeRaw ? taskTimeRaw.split("~")[0] : null;
              if (newTime && taskTime && newTime < taskTime) {
                insertIdx = i;
                break;
              }
              if (newTime && !taskTime) {
                insertIdx = i;
                break;
              }
            }
          }
          // 与文件主行尾一致：CRLF 库中 split("\n") 后各行自带 \r，新行同样补上，
          // 避免 CRLF 文件里混入裸 \n（git diff 整段变更、其它按行处理的插件不可预期）
          const useCRLF = fileContent.includes("\r\n");
          const taskLineWithEol = useCRLF ? taskLine + "\r" : taskLine;
          // 任务之间不再补空行（「空一行」旧约定已取消；存量空行由删除侧自愈清理）
          const parts = [taskLineWithEol];
          if (insertIdx >= lines.length) {
            // 段末插入：越过尾部既有空行（原为 --- 前的分隔行），
            // 使既有空行落在新任务之后而非被顶到前面
            while (insertIdx > 0 && lines[insertIdx - 1].trim() === "") insertIdx--;
          }
          // v1.6.0 批次三（计划 §四.3 提的坑）：排序循环只对 "- [" 行取坐标，
          // 所以 insertIdx 天然落在任务行上或备注块之后，正常不会劈开「任务 + 备注」。
          // 这里仍加一道方向确定的保险：万一 insertIdx 指到 > 行（段末回退等边界），
          // 就整段向后越过它——新行绝不能夹在备注行与它的宿主任务之间，那会让归属
          // 当场失效。只向后不向前：向前退到块首才会真把备注和宿主隔开。
          const isNoteLine = (s) => /^[ \t]*>/.test(s);
          if (insertIdx > 0 && insertIdx < lines.length && isNoteLine(lines[insertIdx])) {
            while (insertIdx < lines.length && isNoteLine(lines[insertIdx])) insertIdx++;
          }
          if (noteBody.length) {
            parts.push(...noteBody.map((l) => {
              const text = l === "" ? ">" : "> " + l;
              return useCRLF ? text + "\r" : text;
            }));
          }
          lines.splice(insertIdx, 0, ...parts);
          fileContent = fileContent.slice(0, sectionIdx) + lines.join("\n") + fileContent.slice(sectionEnd);
          createdIndex = (fileContent.slice(0, sectionIdx).match(/\n/g) || []).length + insertIdx;
        }
      } else {
        // 无日期兜底（当前调用链不可达，公共入队入口保留）：文件已以换行结尾时不能再补
        // eol，否则新行前多出一个空行；createdIndex 用换行数精确算，不用 split().length
        const eol = fileContent.includes("\r\n") ? "\r\n" : "\n";
        const needEol = fileContent.length > 0 && !/\r?\n$/.test(fileContent);
        createdIndex = (fileContent.match(/\n/g) || []).length + (needEol ? 1 : 0);
        fileContent = fileContent + (needEol ? eol : "") + taskLine + eol;
      }
      await this.app.vault.modify(file, fileContent);
      // 一次性交接给紧随其后的编辑删除步骤（调用方取走后经 options.created 显式传回）
      this.lastCreatedInfo = createdIndex >= 0 ? { filePath, index: createdIndex, text: taskLine } : null;
      this.invalidateCache();
      return true;
    } catch (error) {
      console.error(tr("error.createFail"), error);
      return false;
    }
  }
  /**
   * 在指定日期创建任务（自动选择或创建按年月归类的文件）
   */
  async createTaskForDate(date, content, isAllDay = true, time, priority, endDate, customFolderPath, category, completed, note) {
    // 串行化整个流程（含年度任务文件创建）：并发创建同一文件时 vault.create 会竞态抛"已存在"，
    // 并入 writeQueue 后第二个请求必能在 findTaskFile 命中首个创建结果
    const run = () => this._createTaskForDateImpl(date, content, isAllDay, time, priority, endDate, customFolderPath, category, completed, note);
    this.writeQueue = this.writeQueue.then(run, run);
    return this.writeQueue;
  }
  async _createTaskForDateImpl(date, content, isAllDay, time, priority, endDate, customFolderPath, category, completed, note) {
    const dateStr = this.formatDate(date);
    const endDateStr = endDate ? this.formatDate(endDate) : dateStr;
    // 一律写入归档任务列表（年度或月度，由设置决定），跳过日记查找：保证任务统一归集
    // （日记中已有的任务仍会被 parseAllTasks 全库扫描正常显示）
    const defaultFile = await this.getOrCreateDefaultTaskFile(date, customFolderPath);
    if (defaultFile) {
      // 直接调用 _createTaskImpl 而非 createTask：本方法已在 writeQueue 链中执行，
      // 若再经 createTask 二次入队会形成 Q2 等待 Q1、Q1 等待 Q2 的死锁，
      // 导致任务永不写入文件、弹窗按钮永久禁用。
      return this._createTaskImpl(defaultFile, content, endDateStr, isAllDay, time, priority, dateStr, category, completed, note);
    }
    return false;
  }
  /**
   * 获取或创建默认任务文件（统一存储在年度任务列表）
   * 优先在整个库中查找已存在的年度任务文件，支持文件被移动后的场景
   * @param date - 日期对象
   * @param customFolderPath - 自定义任务文件夹路径（可选）
   */
  async getOrCreateDefaultTaskFile(date, customFolderPath) {
    const now = date || new Date();
    const period = this.plugin ? this.plugin.settings.taskFilePeriod : "year";
    const periodId = getPeriodId(now, period);
    const targetFileName = `${periodId}${period === "month" ? "" : "\u5E74"}\u4EFB\u52A1\u5217\u8868.md`;

    // 1. 使用缓存查找已存在的任务文件（传入 customFolderPath 用于消歧）
    const existingPath = this.findTaskFile(periodId, customFolderPath);
    if (existingPath) {
      return existingPath;
    }
    
    // 2. 如果没找到，在指定位置或默认位置创建
    // 自定义文件夹可能已被删除或父路径是文件，导致 ensureFolderExists 抛错；
    // 失败时回退到默认「任务」文件夹，保证任务仍可创建。
    const candidates = customFolderPath ? [customFolderPath, `\u4EFB\u52A1`] : [`\u4EFB\u52A1`];
    for (const folderPath of candidates) {
      const filePath = `${folderPath}/${targetFileName}`;
      try {
        await this.ensureFolderExists(folderPath);
        // 行尾跟随库内已有年度任务文件（CRLF 库首文件即混行尾的源头）；无参照文件时用 LF
        let fileEol = "\n";
        for (const cachedPath of this.taskFileCache.values()) {
          const sibling = this.app.vault.getAbstractFileByPath(cachedPath);
          if (sibling instanceof import_obsidian.TFile) {
            const head = await this.app.vault.cachedRead(sibling);
            if (head.includes("\r\n")) fileEol = "\r\n";
            break;
          }
        }
        const initialContent = `# ${targetFileName.slice(0, -3)}

> 由「月历任务」插件自动创建。

`.replace(/\n/g, fileEol);
        await this.app.vault.create(filePath, initialContent);
        // 缓存新创建的文件路径（键含粒度，年度/月度互不覆盖）
        this.taskFileCache.set(`${period}|${periodId}`, filePath);
        return filePath;
      } catch (error) {
        console.error(tr("error.folderCreate", { folder: folderPath }), error);
        if (folderPath === candidates[candidates.length - 1]) {
          return null;
        }
      }
    }
    return null;
  }
  /**
   * 确保文件夹存在
   */
  async ensureFolderExists(folderPath) {
    const parts = folderPath.split("/");
    let currentPath = "";
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const folder = this.app.vault.getAbstractFileByPath(currentPath);
      if (!folder) {
        await this.app.vault.createFolder(currentPath);
      }
    }
  }
  /**
   * 使缓存失效
   */
  invalidateCache() {
    this.cache = null;
    this.lastParseTime = 0;
    // 清除任务文件路径缓存
    this.taskFileCache.clear();
  }
  /**
   * 查找任务文件（使用缓存；文件名由周期标识推导，年度/月度共用一条代码路径）
   * 优先返回位于 customFolderPath 下的文件，避免在多同名文件场景下选错。
   * @param periodId - 周期标识（"2026" 或 "2026年10月"）
   * @param customFolderPath - 自定义任务文件夹路径（可选）
   * @returns 文件路径或 null
   */
  findTaskFile(periodId, customFolderPath) {
    const period = this.plugin ? this.plugin.settings.taskFilePeriod : "year";
    const cacheKey = `${period}|${periodId}`;
    const targetFileName = `${periodId}${period === "month" ? "" : "\u5E74"}\u4EFB\u52A1\u5217\u8868.md`;
    const normalizedCustom = customFolderPath ? customFolderPath.replace(/\/+$/, "") : "";

    // 1. 检查缓存
    if (this.taskFileCache.has(cacheKey)) {
      const cachedPath = this.taskFileCache.get(cacheKey);
      const file = this.app.vault.getAbstractFileByPath(cachedPath);
      if (file instanceof import_obsidian.TFile) {
        // 若指定了 customFolderPath，需校验缓存命中位于该文件夹下；
        // 若不一致则忽略缓存，继续走全库搜索流程。
        if (!normalizedCustom || this.isPathInFolder(cachedPath, normalizedCustom)) {
          return cachedPath;
        }
      }
      // 缓存的文件不存在或不在指定文件夹下，清除缓存
      this.taskFileCache.delete(cacheKey);
    }

    // 2. 在整个库中搜索
    const files = this.app.vault.getMarkdownFiles();
    // 2a. 若指定了 customFolderPath，优先返回位于该文件夹下的同名文件
    if (normalizedCustom) {
      for (const file of files) {
        if (file.name === targetFileName && this.isPathInFolder(file.path, normalizedCustom)) {
          this.taskFileCache.set(cacheKey, file.path);
          return file.path;
        }
      }
    }
    // 2b. 否则（或未在指定文件夹下找到）回退到第一条同名文件命中
    for (const file of files) {
      if (file.name === targetFileName) {
        this.taskFileCache.set(cacheKey, file.path);
        return file.path;
      }
    }

    return null;
  }
  /**
   * 判断给定文件路径是否位于指定文件夹下（含子孙文件夹）
   * @param filePath - 文件完整路径
   * @param folderPath - 文件夹路径（不含尾部斜杠）
   */
  isPathInFolder(filePath, folderPath) {
    if (!folderPath) return true;
    const fp = filePath.replace(/^\/+/, "");
    const fpParts = fp.split("/");
    const folderParts = folderPath.replace(/^\/+/, "").replace(/\/+$/, "").split("/").filter(Boolean);
    if (folderParts.length === 0) return true;
    if (fpParts.length <= folderParts.length) return false;
    for (let i = 0; i < folderParts.length; i++) {
      if (fpParts[i] !== folderParts[i]) return false;
    }
    return true;
  }
  /**
   * 格式化日期
   */
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
};

var import_obsidian2 = require("obsidian");

// ==================== 日历工具模块 ====================

/** 星期名称数组（周日到周六）*/
/** 星期名，下标 0=周日 … 6=周六。必须是函数：见文件顶部 i18n 说明；
 * 用 view.weekday.* 而不是 lunar.month.*——「二」在这两处译文不同 */
function weekdayNames() {
  return [
    tr("view.weekday.sun"),
    tr("view.weekday.mon"),
    tr("view.weekday.tue"),
    tr("view.weekday.wed"),
    tr("view.weekday.thu"),
    tr("view.weekday.fri"),
    tr("view.weekday.sat")
  ];
}

/** 月份名称数组（1月到12月）*/
/** 月名，下标 0=1月 … 11=12月；同理必须是函数 */
function monthNames() {
  return [
    tr("view.month.1"),
    tr("view.month.2"),
    tr("view.month.3"),
    tr("view.month.4"),
    tr("view.month.5"),
    tr("view.month.6"),
    tr("view.month.7"),
    tr("view.month.8"),
    tr("view.month.9"),
    tr("view.month.10"),
    tr("view.month.11"),
    tr("view.month.12")
  ];
}

/**
 * 获取指定月份的总天数
 * @param year - 年份
 * @param month - 月份（0-11）
 * @returns 该月的天数
 */
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * 获取月份第一天是星期几
 * @param year - 年份
 * @param month - 月份（0-11）
 * @returns 星期几（0=周日，1=周一...6=周六）
 */
function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

/**
 * 判断日期是否为今天
 * @param date - 待检测的日期
 * @returns 是否为今天
 */
function isToday(date) {
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

/**
 * 判断日期是否为周末（周六或周日）
 * @param date - 待检测的日期
 * @returns 是否为周末
 */
function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * 格式化日期为 YYYY-MM-DD 字符串
 * @param date - 日期对象
 * @returns 格式化的日期字符串
 */
/**
 * 批次三：YYYY-MM-DD → 本地 Date。
 * 不用 new Date(str)——那按 UTC 解析，东八区会整体偏早 8 小时，日期差一天
 */
function dateFromStr(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 生成月历数据网格（6周42天）
 * 包含上月补齐、本月完整、下月补齐
 * @param year - 年份
 * @param month - 月份（0-11）
 * @param firstDayOfWeek - 每周第一天（0=周日，1=周一）
 * @returns 月历对象，包含年、月、日数组、周数
 */
function generateMonthCalendar(year, month, firstDayOfWeek = 1) {
  const days = [];
  const firstDay = new Date(year, month, 1);
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayWeekday = getFirstDayOfMonth(year, month);

  // 计算需要从上月显示的天数
  let daysFromPrevMonth = firstDayWeekday - firstDayOfWeek;
  if (daysFromPrevMonth < 0) {
    daysFromPrevMonth += 7;
  }

  // 上月的年份和月份
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);

  // 添加上月补齐的日期
  for (let i = daysFromPrevMonth - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const date = new Date(prevYear, prevMonth, day);
    days.push({
      date, day, month: prevMonth, year: prevYear,
      isCurrentMonth: false,
      isToday: isToday(date),
      isWeekend: isWeekend(date),
      dayOfWeek: date.getDay()
    });
  }

  // 添加本月的日期
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    days.push({
      date, day, month, year,
      isCurrentMonth: true,
      isToday: isToday(date),
      isWeekend: isWeekend(date),
      dayOfWeek: date.getDay()
    });
  }

  // 补齐到整周：5 周月份只渲染 5 行，不固定补出第 6 周空占位
  //（CSS 侧 grid-auto-rows 随实际周数出行，矮面板下第 6 周不再吃掉高度）
  const remainingDays = (7 - days.length % 7) % 7;
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  for (let day = 1; day <= remainingDays; day++) {
    const date = new Date(nextYear, nextMonth, day);
    days.push({
      date, day, month: nextMonth, year: nextYear,
      isCurrentMonth: false,
      isToday: isToday(date),
      isWeekend: isWeekend(date),
      dayOfWeek: date.getDay()
    });
  }

  return { year, month, days, weekCount: days.length / 7 };
}

/**
 * 获取上个月的年份和月份
 * @param year - 当前年份
 * @param month - 当前月份（0-11）
 * @returns 上个月的年份和月份
 */
function getPrevMonth(year, month) {
  if (month === 0) {
    return { year: year - 1, month: 11 };
  }
  return { year, month: month - 1 };
}

/**
 * 获取下个月的年份和月份
 * @param year - 当前年份
 * @param month - 当前月份（0-11）
 * @returns 下个月的年份和月份
 */
function getNextMonth(year, month) {
  if (month === 11) {
    return { year: year + 1, month: 0 };
  }
  return { year, month: month + 1 };
}

/**
 * 获取当前的年份和月份
 * @returns 当前年月对象
 */
function getCurrentYearMonth() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth()
  };
}
function getMonthTitle(year, month) {
  return tr("view.month.title", { year: year, monthName: monthNames()[month] });
}
/**
 * v1.7.0：把任意日期收进「它所在的那一周」的起点。周视图的锚点只存周起点
 * （YYYY-MM-DD），不存整条周数组：锚点可变、派生数据每次现算，避免两份状态打架。
 * firstDayOfWeek 沿用设置（日/一/六），与星期表头同源，切换起始日时周视图自然跟着翻。
 */
function weekStartFrom(date, firstDayOfWeek) {
  const fdow = [0, 1, 6].includes(firstDayOfWeek) ? firstDayOfWeek : 0;
  const diff = (date.getDay() - fdow + 7) % 7;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() - diff);
  return formatDate(d);
}
/** 周起点 + 6 天 = 周末日；入参是锚点字符串，返回本地 Date（dateFromStr 同口径，避开 UTC 偏移） */
function weekEndFrom(startKey) {
  const d = dateFromStr(startKey);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6);
}
/** 标题「10/5 – 10/11」：紧凑月/日，两端都带月，跨年周也读得通 */
function getWeekTitle(startKey) {
  const s = dateFromStr(startKey);
  const e = weekEndFrom(startKey);
  const p = (x) => String(x.getMonth() + 1) + "/" + String(x.getDate());
  return tr("view.week.title", { a: p(s), b: p(e) });
}

/** 农历月名，下标 0=正月 … 11=腊月 */
function lunarMonthNames() {
  return [
    tr("lunar.month.1"),
    tr("lunar.month.2"),
    tr("lunar.month.3"),
    tr("lunar.month.4"),
    tr("lunar.month.5"),
    tr("lunar.month.6"),
    tr("lunar.month.7"),
    tr("lunar.month.8"),
    tr("lunar.month.9"),
    tr("lunar.month.10"),
    tr("lunar.month.11"),
    tr("lunar.month.12")
  ];
}
/** 农历日名，下标 0=初一 … 29=三十 */
function lunarDayNames() {
  return [
    tr("lunar.day.1"),
    tr("lunar.day.2"),
    tr("lunar.day.3"),
    tr("lunar.day.4"),
    tr("lunar.day.5"),
    tr("lunar.day.6"),
    tr("lunar.day.7"),
    tr("lunar.day.8"),
    tr("lunar.day.9"),
    tr("lunar.day.10"),
    tr("lunar.day.11"),
    tr("lunar.day.12"),
    tr("lunar.day.13"),
    tr("lunar.day.14"),
    tr("lunar.day.15"),
    tr("lunar.day.16"),
    tr("lunar.day.17"),
    tr("lunar.day.18"),
    tr("lunar.day.19"),
    tr("lunar.day.20"),
    tr("lunar.day.21"),
    tr("lunar.day.22"),
    tr("lunar.day.23"),
    tr("lunar.day.24"),
    tr("lunar.day.25"),
    tr("lunar.day.26"),
    tr("lunar.day.27"),
    tr("lunar.day.28"),
    tr("lunar.day.29"),
    tr("lunar.day.30")
  ];
}
/** 天干，下标 0=甲 … 9=癸；英文取拼音（文化专名直译无意义） */
function tianGan() {
  return [
    tr("lunar.stem.1"),
    tr("lunar.stem.2"),
    tr("lunar.stem.3"),
    tr("lunar.stem.4"),
    tr("lunar.stem.5"),
    tr("lunar.stem.6"),
    tr("lunar.stem.7"),
    tr("lunar.stem.8"),
    tr("lunar.stem.9"),
    tr("lunar.stem.10")
  ];
}
/** 地支，下标 0=子 … 11=亥 */
function diZhi() {
  return [
    tr("lunar.branch.1"),
    tr("lunar.branch.2"),
    tr("lunar.branch.3"),
    tr("lunar.branch.4"),
    tr("lunar.branch.5"),
    tr("lunar.branch.6"),
    tr("lunar.branch.7"),
    tr("lunar.branch.8"),
    tr("lunar.branch.9"),
    tr("lunar.branch.10"),
    tr("lunar.branch.11"),
    tr("lunar.branch.12")
  ];
}
/** 生肖，下标 0=鼠 … 11=猪 */
function zodiacAnimals() {
  return [
    tr("lunar.zodiac.1"),
    tr("lunar.zodiac.2"),
    tr("lunar.zodiac.3"),
    tr("lunar.zodiac.4"),
    tr("lunar.zodiac.5"),
    tr("lunar.zodiac.6"),
    tr("lunar.zodiac.7"),
    tr("lunar.zodiac.8"),
    tr("lunar.zodiac.9"),
    tr("lunar.zodiac.10"),
    tr("lunar.zodiac.11"),
    tr("lunar.zodiac.12")
  ];
}
/**
 * 农历传统节日：m-d → 名称。这里刻意保持简体中文（数据层），
 * 展示时经 translateHolidayName 转换；切语言不需要重写任何已缓存数据。
 */
var TRADITIONAL_HOLIDAYS = {
  "1-1": "\u6625\u8282",
  "1-15": "\u5143\u5BB5",
  "2-2": "\u9F99\u62AC\u5934",
  "5-5": "\u7AEF\u5348",
  "7-7": "\u4E03\u5915",
  "7-15": "\u4E2D\u5143",
  "8-15": "\u4E2D\u79CB",
  "9-9": "\u91CD\u9633",
  "10-1": "\u5BD2\u8863",
  "10-15": "\u4E0B\u5143",
  "12-8": "\u814A\u516B",
  "12-23": "\u5C0F\u5E74"
};
var LUNAR_INFO = [
  48424,29984,59984,45733,25776,43440,109156,22176,46480,47778,29984,55894,45648,42160,107701,10960,
  22192,23378,55952,125223,59680,53840,53973,42336,11104,109908,27968,60048,62626,59680,27238,21168,
  42352,103781,46496,27968,95763,29840,110903,43312,21168,86454,43728,22176,121428,47680,46224,54450,
  43344,43735,21344,43728,109733,23328,55888,125475,54432,22872,43376,21856,22358,44368,27936,30036,
  59984,25760,25843,43440,44455,22176,46736,47909,46368,45648,45748,42160,43704,10960,22224,88726,
  55952,55584,59732,53840,58586,42336,11104,12118,27984,60048,62757,59680,53856,21219,42352,44392,
  13728,27984,46741,29840,26928,43444,21168,42416,43746,22176,56663,47680,46224,54581,43344,21200,
  21972,43856,47785,23840,55888,125094,54432,51536,43492,21856,43856,44450,27936,30294,29264,25776,
  25973,51888,21920,22243,46736,62763,46368,45648,118966,42160,19120,11189,23248,46752,55970,55584,
  59991,53840,42320,107733,19296,23376,93475,60560,63784,59680,53856,86374,42352,19808,79444,30032,
  29840,29875,26928,43703,21168,42416,43941,22176,46672,47780,46240,55640,43344,21200,22230,43856,
  23200,23892,55888,54432,58579,51552,52455,21856,43856,109861,27936,59984,29348,26800,27000,19120,
  21936,87398,46752,29984,47444,46160,43184,42226,19120
];
function getLunarYearDays(year) {
  let sum = 348;
  const info = LUNAR_INFO[year - 1900];
  for (let i = 32768; i > 8; i >>= 1) {
    sum += info & i ? 1 : 0;
  }
  return sum + getLeapDays(year);
}
function getLeapDays(year) {
  if (getLeapMonth(year)) {
    return LUNAR_INFO[year - 1900] & 65536 ? 30 : 29;
  }
  return 0;
}
function getLeapMonth(year) {
  return LUNAR_INFO[year - 1900] & 15;
}
function getLunarMonthDays(year, month) {
  return LUNAR_INFO[year - 1900] & (1 << (month + 3)) ? 30 : 29;
}
function solarToLunar(date) {
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  let day = date.getDate();
  if (year < 1900 || year > 2100) {
    throw new Error(tr("lunar.rangeError"));
  }
  // 用 UTC 时间计算偏移天数，避免 DST 时区下本地午夜与基准点相差非整天导致 offset 偏差 1 天
  const dateUtcMs = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const baseUtcMs = Date.UTC(1900, 0, 31);
  let offset = Math.floor((dateUtcMs - baseUtcMs) / 864e5);
  let lunarYear = 1900;
  let daysInYear = getLunarYearDays(lunarYear);
  while (offset >= daysInYear) {
    offset -= daysInYear;
    lunarYear++;
    daysInYear = getLunarYearDays(lunarYear);
  }
  const leapMonth = getLeapMonth(lunarYear);
  let isLeap = false;
  let lunarMonth = 1;
  for (let i = 1; i <= 12; i++) {
    let daysInMonth = getLunarMonthDays(lunarYear, i);
    if (offset < daysInMonth) {
      lunarMonth = i;
      isLeap = false;
      break;
    }
    offset -= daysInMonth;
    if (leapMonth === i) {
      let leapDays = getLeapDays(lunarYear);
      if (offset < leapDays) {
        lunarMonth = i;
        isLeap = true;
        break;
      }
      offset -= leapDays;
    }
  }
  const lunarDay = offset + 1;
  const ganIndex = (lunarYear - 4) % 10;
  const zhiIndex = (lunarYear - 4) % 12;
  // 干支年/生肖按当前语言取词（英文为拼音与动物名）
  const ganZhiYear = tianGan()[ganIndex] + diZhi()[zhiIndex];
  const zodiac = zodiacAnimals()[zhiIndex];
  return {
    year: lunarYear,
    month: lunarMonth,
    day: lunarDay,
    isLeap,
    ganZhiYear,
    zodiac
  };
}
function getLunarDayText(lunarDate) {
  // 防御：1900 年 1 月 offset 为负导致 day <= 0 时返回空串，避免渲染 "undefined"
  if (lunarDate.day < 1 || lunarDate.day > 30) return "";
  if (lunarDate.day === 1) {
    const monthName = lunarMonthNames()[lunarDate.month - 1];
    return lunarDate.isLeap ? tr("lunar.leap", { monthName: monthName }) : tr("lunar.monthSuffix", { monthName: monthName });
  }
  return lunarDayNames()[lunarDate.day - 1];
}
/**
 * 节假日展示名 zh-CN → 英文。同一节日各数据源写法不一（「清明」vs「清明节」、
 * timor.tech 还会给出「天安节」「端午」之类的变体），所以译文允许多个中文键。
 * 覆盖不到的名称原样显示：这是第三方数据，宁可留中文也不要编一个错的英文名。
 */
var HOLIDAY_NAME_EN = {
  "\u5143\u65E6": "New Year's Day",
  "\u6625\u8282": "Spring Festival",
  "\u9664\u5915": "New Year's Eve",
  "\u5143\u5BB5": "Lantern Festival",
  "\u5143\u5BB5\u8282": "Lantern Festival",
  "\u9F99\u62AC\u5934": "Dragon Raises Head",
  "\u6E05\u660E": "Qingming Festival",
  "\u6E05\u660E\u8282": "Qingming Festival",
  "\u52B3\u52A8\u8282": "Labor Day",
  "\u4E94\u4E00\u52B3\u52A8\u8282": "Labor Day",
  "\u7AEF\u5348": "Dragon Boat Festival",
  "\u7AEF\u5348\u8282": "Dragon Boat Festival",
  "\u4E03\u5915": "Qixi Festival",
  "\u4E2D\u5143": "Ghost Festival",
  "\u79CB\u62A5": "Ghost Festival",
  "\u4E2D\u79CB": "Mid-Autumn Festival",
  "\u4E2D\u79CB\u8282": "Mid-Autumn Festival",
  "\u91CD\u9633": "Double Ninth Festival",
  "\u91CD\u9633\u8282": "Double Ninth Festival",
  "\u5BD2\u8863": "Winter Clothing Festival",
  "\u4E0B\u5143": "Lower Yuan Festival",
  "\u51AC\u81F3": "Winter Solstice",
  "\u5C0F\u5E74": "Little New Year",
  "\u5357\u65B9\u5C0F\u5E74": "Little New Year",
  "\u814A\u516B": "Laba Festival",
  "\u56FD\u5E86": "National Day",
  "\u56FD\u5E86\u8282": "National Day",
  "\u5341\u4E00\u56FD\u5E86\u8282": "National Day",
  "\u5973\u795E\u8282": "Goddess Festival",
  "\u5987\u5973\u8282": "Women's Day",
  "\u513F\u7AE5\u8282": "Children's Day",
  "\u6559\u5E08\u8282": "Teachers' Day",
  "\u5EFA\u519B\u8282": "Army Day",
  "\u60DC\u5149\u8282": "Light-sparing Festival",
  "\u7231\u7433\u8282": "Ailin Festival",
  "\u56DE\u9E4B\u8282": "Hui Festival",
  "\u6653\u516B\u8282": "Xiao and Ba Festival",
  "\u73AF\u5883\u65E5": "Environment Day",
  "\u5468\u672B": "Weekend",
  "\u5047\u65E5": "Holiday",
  "\u8282\u5047\u65E5": "Public Holiday",
  "\u73ED": "Work",
  "\u4F11": "Rest",
  "\u8C03\u4F11": "Make-up Day"
};

/** 同上，zh-CN → zh-TW 的用词/字形差异（腊八→臘八、国庆→國慶、调休→調休…） */
var HOLIDAY_NAME_TW = {
  "\u56FD\u5E86": "\u570B\u6176",
  "\u56FD\u5E86\u8282": "\u570B\u6176\u7BC0",
  "\u5341\u4E00\u56FD\u5E86\u8282": "\u5341\u4E00\u570B\u6176\u7BC0",
  "\u52B3\u52A8\u8282": "\u52DE\u52D5\u7BC0",
  "\u4E94\u4E00\u52B3\u52A8\u8282": "\u4E94\u4E00\u52DE\u52D5\u7BC0",
  "\u814A\u516B": "\u8129\u516B",
  "\u9F99\u62AC\u5934": "\u9F8D\u64C1\u982D",
  "\u513F\u7AE5\u8282": "\u5152\u7AE5\u7BC0",
  "\u6559\u5E08\u8282": "\u6559\u5E2B\u7BC0",
  "\u5EFA\u519B\u8282": "\u570B\u8ECD\u6230\u65E5",
  "\u5973\u795E\u8282": "\u5973\u795E\u7BC0",
  "\u5987\u5973\u8282": "\u5973\u5B69\u5B50\u7BC0",
  "\u56DE\u9E4B\u8282": "\u56DE\u9D00\u7BC0",
  "\u6653\u516B\u8282": "\u66C9\u516B\u7BC0",
  "\u73AF\u5883\u65E5": "\u74B0\u5883\u65E5",
  "\u60DC\u5149\u8282": "\u61B8\u5149\u7BC0",
  "\u51AC\u81F3": "\u61AC\u81F3",
  "\u5143\u5BB5\u8282": "\u5143\u5BB5\u7BC0",
  "\u7AEF\u5348\u8282": "\u7AEF\u5348\u7BC0",
  "\u4E2D\u79CB\u8282": "\u4E2D\u79CB\u7BC0",
  "\u91CD\u9633\u8282": "\u91CD\u967D\u7BC0",
  "\u6E05\u660E\u8282": "\u6E05\u660E\u7BC0",
  "\u8282\u5047\u65E5": "\u7BC0\u5047\u65E5",
  "\u5468\u672B": "\u9031\u672B",
  "\u8C03\u4F11": "\u8ABF\u4F11"
};

/**
 * 展示层翻译：zh-CN 节日/调休名 → 当前语言显示名。
 * 名称来源有三：内置 holidays.json、TRADITIONAL_HOLIDAYS、holiday-cn / timor.tech
 * 网络返回。后两者不受控，所以表外名称原样返回，而不是回落成 key 或空串。
 * 注意：只用于**渲染**，写回 data.json 的 name 必须保持 zh-CN 原值。
 */
function translateHolidayName(name) {
  if (typeof name !== "string" || !name) return name;
  if (I18N_LANG === "zh-CN") return name;
  if (I18N_LANG === "en") return HOLIDAY_NAME_EN[name] || name;
  return HOLIDAY_NAME_TW[name] || name;
}

function getTraditionalHoliday(lunarDate) {
  // 闰月不匹配传统节日：传统节日只对应正序月，闰五月初五不应误报为"端午"
  if (lunarDate.isLeap) return void 0;
  // 除夕：农历腊月最后一天（腊月可能是29天小月或30天大月）
  if (lunarDate.month === 12) {
    const daysInMonth = getLunarMonthDays(lunarDate.year, 12);
    if (lunarDate.day === daysInMonth) {
      return "\u9664\u5915";
    }
  }
  const key = `${lunarDate.month}-${lunarDate.day}`;
  return TRADITIONAL_HOLIDAYS[key];
}
function getLunarInfo(date) {
  try {
    const lunarDate = solarToLunar(date);
    const holiday = getTraditionalHoliday(lunarDate);
    if (holiday) {
      return {
        // text 走展示层翻译；festivalName 保留 zh-CN 原值，供需要比对名称的调用方用
        text: translateHolidayName(holiday),
        isFestival: true,
        festivalName: holiday
      };
    }
    return {
      text: getLunarDayText(lunarDate),
      isFestival: false
    };
  } catch (e) {
    return {
      text: "",
      isFestival: false
    };
  }
}
function isSpecialLunarDay(date) {
  try {
    const lunarDate = solarToLunar(date);
    return lunarDate.day === 1 || lunarDate.day === 15;
  } catch (e) {
    return false;
  }
}

// 内置节假日兜底数据已外置为插件目录下的 holidays.json（2007 年起的历史年份由网络数据源覆盖），由 loadSettings 中的 loadBuiltinHolidays 读取

/**
 * ============================================================
 * HolidayManager - 节假日管理器
 * ============================================================
 * 负责管理中国法定节假日和调休信息
 * 
 * 节假日类型：
 * - LEGAL：法定节假日（带薪休假）
 * - WEEKEND：周末（正常休息）
 * - WORKDAY：调休工作日
 * 
 * 数据来源（按优先级，任一源成功即采用）：
 * - 网络源 1：holiday-cn（社区维护，跟随国务院公告及时更新，覆盖 2007 年至今，经 jsDelivr CDN）
 * - 网络源 2：timor.tech API（备份源）
 * - 内置兜底：插件目录 holidays.json（2022-2026 官方数据，与代码分离；官方未发布年份不写预测数据）
 *
 * 主要功能：
 * - getHolidayInfo(date)：获取指定日期的节假日信息（类型+名称）
 * - fetchYearFromSources(year)：按源顺序从网络获取
 * - ensureYearData(year)：无缓存年份按需取数（浏览触发，不升级已有数据）
 * - updateFromNetwork(year)：启动/手动刷新入口
 * ============================================================
 */
var HolidayManager = class {
  constructor() {
    this.cache = /* @__PURE__ */ new Map();
    // 失败缓存：year -> 失败时间戳，TTL 内不重试，过期后允许重新请求
    this.failureCache = /* @__PURE__ */ new Map();
    this.FAILURE_TTL = 5 * 60 * 1e3;
    // 进行中的请求：year -> Promise<boolean>（是否实际取回新数据），并发调用复用同一 Promise
    this.fetchingYears = /* @__PURE__ */ new Map();
  }
  /**
   * 确保某年节假日数据可用（无缓存则从数据源获取）。
   * @returns 是否实际取回并写入了新数据：缓存已就绪 / 获取失败 / TTL 内跳过均为 false。
   * 调用方（renderCalendarGrid）据此决定是否补刷，false 时补刷无意义且会形成重入。
   */
  async ensureYearData(year) {
    // 已有缓存（内置/持久化/本会话取回）直接返回——浏览触发的按需获取不升级已有数据，
    // 避免「默认不联网」变成每次浏览都请求；升级只走启动预取/手动刷新（updateFromNetwork）
    if (this.cache.has(year)) return false;
    // 失败缓存未过期则跳过，避免网络故障时每月导航都重发 8s 请求
    const failedAt = this.failureCache.get(year);
    if (failedAt && Date.now() - failedAt < this.FAILURE_TTL) return false;
    return this._requestYear(year);
  }
  /**
   * 发起某年的网络获取（ensureYearData 与 updateFromNetwork 共用通道）：
   * 并发调用复用同一 Promise；成功/失败都记账 failureCache，保持缓存状态一致。
   * @returns 是否实际取回并写入了新数据
   */
  _requestYear(year) {
    // 复用进行中的 Promise，避免并发重复请求
    const existing = this.fetchingYears.get(year);
    if (existing) return existing;
    const p = (async () => {
      try {
        const apiData = await this.fetchYearFromSources(year);
        if (apiData && apiData.length > 0) {
          this.cache.set(year, apiData);
          this.failureCache.delete(year);
          return true;
        } else {
          // API 返回空：记为失败，TTL 后允许重试
          this.failureCache.set(year, Date.now());
        }
      } catch (e) {
        console.warn(tr("error.holidayApi", { year: year }), e);
        this.failureCache.set(year, Date.now());
      } finally {
        this.fetchingYears.delete(year);
      }
      return false;
    })();
    this.fetchingYears.set(year, p);
    return p;
  }
  async fetchFromAPI(year) {
    // 单次网络抖动时重试 1 次（500ms 后），提升节假日数据获取成功率
    try {
      return await this._doFetchOnce(year);
    } catch (e1) {
      await new Promise((r) => setTimeout(r, 500));
      return this._doFetchOnce(year);
    }
  }
  /**
   * 统一 JSON 请求：走 Obsidian requestUrl 而非浏览器 fetch——
   * 移动端 WebView 下 fetch 受目标站 CORS 头限制，requestUrl 由宿主转发不受此限，
   * 也是插件审核规范要求。requestUrl 无超时参数，用 Promise.race 包一层 8s 超时，
   * 覆盖整个请求流程；race 已为落后方挂好结算处理，不会产生未捕获的 Promise 拒绝
   */
  async _fetchJson(url, timeoutMs, timeoutLabel) {
    let timeoutId;
    try {
      const res = await Promise.race([
        import_obsidian2.requestUrl({ url }),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(timeoutLabel)), timeoutMs);
        })
      ]);
      if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
      return res.json;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  async _doFetchOnce(year) {
    const url = `https://timor.tech/api/holiday/year/${year}`;
    // 8 秒超时（见 _fetchJson）：避免 timor.tech 不可达时长时间挂起，
    // 同时确保 fetchingYears 锁能尽快释放，不影响后续获取
    const json = await this._fetchJson(url, 8e3, tr("error.holidayTimeout1", { year: year }));
    if (json.code !== 0 || !json.holiday) throw new Error(tr("error.holidayApiFormat"));
    const holidays = [];
    for (const [key, info] of Object.entries(json.holiday)) {
      // 不依赖 key 的形状（timor.tech 现为 MM-DD 长度 5，属隐式契约）：
      // 直接按 info.date 是否为合法 YYYY-MM-DD 判断，键格式变化时条目不会被静默丢弃
      if (info && /^\d{4}-\d{2}-\d{2}$/.test(info.date)) {
        if (info.holiday === true) {
          // 节假日命名归一化：timor.tech API 对春节假期每日返回「初一」「初二」…「初七」，
          // 与 2022-2024 年统一标注「春节」的风格不一致，这里统一改为「春节」。
          // 「除夕」单独保留，与历史数据保持一致。
          let name = info.name || key;
          if (/^初(?:[一二三四五六七八九]|十)$/.test(name)) {
            name = "春节";
          }
          holidays.push({ date: info.date, name, type: "legal" /* LEGAL */, isOff: true });
        } else if (info.holiday === false) {
          holidays.push({ date: info.date, name: "班", type: "workday" /* WORKDAY */, isOff: false });
        }
      }
    }
    if (holidays.length === 0) {
      console.warn(tr("error.holidayApiEmpty", { year: year }), json);
    }
    return holidays.sort((a, b) => a.date.localeCompare(b.date));
  }
  /**
   * 按源顺序从网络获取某年节假日数据：holiday-cn（社区维护，2007 年至今）→ timor.tech。
   * 任一源成功即返回；全部失败返回 null（调用方按失败处理）。
   * 源链的意义：内置数据不再承担逐年维护义务，新年份由社区数据源自动覆盖
   */
  async fetchYearFromSources(year) {
    try {
      const cn = await this._fetchHolidayCN(year);
      if (cn && cn.length > 0) return cn;
    } catch (e) {
      console.warn(tr("error.holidayCN", { year: year }), e);
    }
    const timor = await this.fetchFromAPI(year);
    if (timor && timor.length > 0) return timor;
    return null;
  }
  /**
   * holiday-cn 数据源（jsDelivr CDN）
   * 格式：{ year, papers, days: [{ name, date, isOffDay }] }，days 按公告条目给出，
   * 可能含跨年条目（如 2023.json 里的 2022-12-31 元旦）——按 date 归属，调用方按相邻年查找
   * 取 @master 引用：历史年份的社区修正（公告勘误）能同步进来
   */
  async _fetchHolidayCN(year) {
    const url = `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`;
    // 同样走 requestUrl + 8s 超时（见 _fetchJson）
    const json = await this._fetchJson(url, 8e3, tr("error.holidayTimeout2", { year: year }));
    if (!json || !Array.isArray(json.days)) throw new Error(tr("error.holidayCNFormat"));
    const holidays = [];
    for (const d of json.days) {
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue;
      if (d.isOffDay === true) {
        holidays.push({ date: d.date, name: d.name || "假日", type: "legal" /* LEGAL */, isOff: true });
      } else if (d.isOffDay === false) {
        holidays.push({ date: d.date, name: "班", type: "workday" /* WORKDAY */, isOff: false });
      }
    }
    return holidays.sort((a, b) => a.date.localeCompare(b.date));
  }
  /**
   * 获取指定日期的节假日信息
   */
  getHolidayInfo(date) {
    const dateStr = this.formatDate(date);
    const year = date.getFullYear();
    // 跨年调休（如 API 把 2027 年元旦调休的 2026-12-31"班"存入 2027 年数组）需查找相邻年份缓存，
    // 避免按日期所在年查找时漏掉调休日。内置数据无跨年条目，该场景来自 API 返回数据。
    const holidays = [
      ...(this.cache.get(year - 1) || []),
      ...(this.cache.get(year) || []),
      ...(this.cache.get(year + 1) || [])
    ];
    return holidays.find((h) => h.date === dateStr);
  }
  /**
   * 格式化日期为 YYYY-MM-DD
   */
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  /**
   * 更新节假日数据（从网络）——启动预取/手动刷新入口
   */
  async updateFromNetwork(year) {
    // 与浏览触发的获取共用 _requestYear 通道（并发去重 + failureCache 记账）：
    // 此前独立发请求，手动刷新与浏览触发可能并发重复请求同一源
    return this._requestYear(year);
  }
};

var VIEW_TYPE_MONTHLY = "monthly-tasks-view";

// 视图切换按钮的两态图标（lucide calendar / list 的路径子集，与顶部其他图标同
// 一套 stroke 规格，不引第三方图标库）。agenda = 当前在条视图、点了去日程；
// list = 当前在日程视图、点了回条视图。
/* v1.7.0：视图模式常量（settings.viewMode 的合法取值，顺序即菜单/循环顺序）。
   list=大月（整月 + 任务写进格子）agenda=小月（整月 + 格子只出圆点，文字在明细区）
   week=小周（只留所在那一行的周格子，明细区不变）。
   v1.7.1：bigWeek=大周（只有一周 8 格：左上「本周」标题块 + 7 个日子格，
   任务写进格子里，整块可上下滚）。
   数组顺序即菜单顺序与命令循环顺序：先按范围（月 → 周）分组，组内「大」在前，
   与用户口径「大月 / 小月 / 大周 / 小周」一致。 */
var VIEW_MODES = ["list", "agenda", "bigWeek", "week"];
var WEEK_TOGGLE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><line x1="8" y1="15" x2="8" y2="15.01"></line><line x1="12" y1="15" x2="12" y2="15.01"></line><line x1="16" y1="15" x2="16" y2="15.01"></line></svg>';
var AGENDA_TOGGLE_ICONS = {
  agenda: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
  list: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>',
  week: WEEK_TOGGLE_ICON,
  // 大周：日历外框 + 一行两列的分栏与内容点（与「小周」那张「一行三点」区分开）
  bigWeek: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><line x1="12" y1="10" x2="12" y2="22"></line><line x1="7" y1="15" x2="7" y2="15.01"></line><line x1="17" y1="15" x2="17" y2="15.01"></line></svg>'
};

/**
 * 星期全称（周日/周一…）。v1.7.1 大周视图的格子里没有列头可借，每格自带星期；
 * 明细区吸顶行原本就有一份同样的数组，这里抽成函数供两处共用。
 */
function weekdayFullNames() {
  return [
    tr("modal.create.weekday.sun"),
    tr("modal.create.weekday.mon"),
    tr("modal.create.weekday.tue"),
    tr("modal.create.weekday.wed"),
    tr("modal.create.weekday.thu"),
    tr("modal.create.weekday.fri"),
    tr("modal.create.weekday.sat")
  ];
}
/**
 * 锚点周在其公历年里的第几周：含 1 月 1 日的那一周就是第 1 周，
 * 按 firstDayOfWeek 切分（与格子口径一致，不是 ISO 周）。
 * 跨年那一周（如 2025-12-28 – 2026-01-03）归给它所包含的那个元旦的年份，
 * 所以它是 2026 年的第 1 周，而不是 2025 年的第 53 周——不会出现「一年 53 周」的怪数。
 */
function weekNumberOfYear(startKey, firstDayOfWeek) {
  const anchor = dateFromStr(startKey);
  const jan1WeekStart = (y) => weekStartFrom(new Date(y, 0, 1), firstDayOfWeek);
  // 只有「周起始日早于本周所属元旦」这一种越界情形：锚点周其实属于下一年
  let year = anchor.getFullYear();
  if (dateFromStr(jan1WeekStart(year + 1)).getTime() <= anchor.getTime()) year += 1;
  const yearStart = dateFromStr(jan1WeekStart(year));
  return Math.floor(Math.round((anchor.getTime() - yearStart.getTime()) / 864e5) / 7) + 1;
}
/**
 * 「本周」块标题行的两段文案：左边相对名（本周 / 上周 / 下周），右边年内周数。
 * 相对名只覆盖作差 ±1 的三档——再远就退到「第 N 周」当标题（用户原话：不要「上上周」），
 * 此时右侧不再重复标数，否则会出现「第 3 周 · 第 3 周」。
 */
function weekSummaryTitles(startKey, firstDayOfWeek) {
  const num = tr("view.week.number", { n: weekNumberOfYear(startKey, firstDayOfWeek) });
  const todayStart = weekStartFrom(new Date(), firstDayOfWeek);
  const diffWeeks = Math.round((dateFromStr(startKey).getTime() - dateFromStr(todayStart).getTime()) / (7 * 864e5));
  const rel = diffWeeks === 0 ? tr("view.week.relative.this") : diffWeeks === -1 ? tr("view.week.relative.prev") : diffWeeks === 1 ? tr("view.week.relative.next") : null;
  if (rel) return { title: rel, num };
  return { title: num, num: "" };
}
/** 视图模式的显示名（菜单行、设置项、命令标题共用一处定义，避免三处文案漂移） */
function viewModeLabel(mode) {
  return tr("view.mode." + mode);
}

// 明细区「＋ 添加」按钮的加号图标（lucide plus 路径子集，stroke 规格同上）
var AGENDA_ADD_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
// 明细区吸顶行「管理」按钮的列表图标（lucide list 路径子集）：
// 不用加号——加号只承诺"新建"，而这颗按钮打开的面板里既能改也能删也能跳转。
var AGENDA_MANAGE_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>';

/**
 * ============================================================
 * MonthlyView - 月历视图
 * ============================================================
 * 渲染月历网格，显示每日任务，支持任务创建和日期导航
 * 
 * 视图结构：
 * - 头部：月份标题（YYYY.MM格式）、上一月/下一月按钮、今天按钮
 * - 周头部：日/一/二/三/四/五/六
 * - 日历网格：5-6周动态行数 × 7列
 * 
 * 每日单元格显示：
 * - 日期数字（今天高亮）
 * - 农历信息（可配置显示）
 * - 节假日标签（法定/调休）
 * - 任务列表（已完成划线显示）
 * 
 * 主要功能：
 * - refreshView()：刷新视图数据
 * - renderCalendar()：渲染月历网格
 * - renderDayCell()：渲染单个日期单元格
 * - renderTaskItem()：渲染任务项
 * - openCreateTaskModal()：打开创建任务弹窗
 * - openDatePicker()：打开日期选择器
 * ============================================================
 */
var MonthlyView = class extends import_obsidian2.ItemView {
  constructor(leaf, taskParser, plugin) {
    super(leaf);
    this.taskParser = taskParser;
    this.plugin = plugin;
    const { year, month } = getCurrentYearMonth();
    this.currentYear = year;
    this.currentMonth = month;
  }
  /**
   * 获取视图类型
   */
  getViewType() {
    return VIEW_TYPE_MONTHLY;
  }
  /**
   * 获取显示文本
   */
  getDisplayText() {
    return tr("view.header.title");
  }
  /**
   * 获取图标
   */
  getIcon() {
    return "calendar";
  }
  /**
   * 视图加载
   */
  async onOpen() {
    // 类别筛选为视图内存态（不持久化）：空集=全部；重开视图回「全部」
    this.activeCategories = /* @__PURE__ */ new Set();
    // 使用自有字段 rootEl，而非覆写 ItemView 基类的 containerEl（视图根元素，含视图头部）：
    // 框架后续经 view.containerEl 操作视图时必须拿到正确元素
    this.rootEl = this.contentEl.createDiv("monthly-tasks-container");
    // 视图形态与选中日：root class 决定样式作用域，selectedDate 决定明细区看哪天。
    // 两者都必须在首次 render 之前就位，否则第一帧会按条视图渲染再翻牌（闪一下）
    this.applyViewModeClass();
    this.convergeSelectedDate();
    // 小周是冷启动默认值也可能命中的视图，锚点必须在首帧前就位
    if (this.isWeekFamily()) this.ensureWeekAnchor();
    await this.render();
  }
  /**
   * 视图关闭
   */
  async onClose() {
    // 递增 renderRequestId 使进行中的渲染 await 后判定失效（myRequestId !== this.renderRequestId），
    // 避免向已分离 DOM 继续添加节点
    this.renderRequestId = (this.renderRequestId || 0) + 1;
    // 清理 toggleTask 中可能挂起的延迟刷新定时器，避免向已分离 DOM 渲染
    if (this.pendingTimers && this.pendingTimers.size > 0) {
      for (const t of this.pendingTimers) clearTimeout(t);
      this.pendingTimers.clear();
    }
    // 托管弹窗挂在框架层不随 rootEl 回收：视图关闭时一并收起，避免失联
    this.closeActivePopup();
    this.rootEl.empty();
  }
  /** 关闭本视图挂出的所有托管弹窗（日期跳转 / 类别筛选）；两个面板改挂 Modal 后
   * 仍保留此入口：onClose、header 重建与回归测试统一从这里收起 */
  closeActivePopup() {
    for (const cls of [DatePickerModal, CategoryFilterModal, ViewMenuModal]) {
      if (cls.activeInstances) {
        for (const inst of Array.from(cls.activeInstances)) {
          try { inst.close(); } catch (e) {
          }
        }
      }
    }
  }
  /**
   * 扫描当前解析结果里的类别（批次二⑤）：类别 = 任务行尾 #tag 剥出的 category。
   * 顺序 = 设置里已知类别的次序 → 其余按任务解析顺序。只认笔记里的标签：
   * 设置里删掉某类别不碰笔记，也不影响这里能否发现残留标签（标签仍在就仍能筛）。
   */
  scanCategories() {
    const cache = this.taskParser.cache;
    const found = [];
    if (cache && cache.tasks) {
      for (const t of cache.tasks) {
        if (t.category && !found.includes(t.category)) {
          found.push(t.category);
        }
      }
    }
    const known = (this.plugin.settings.categories || []).map((c) => c.name).filter((n) => found.includes(n));
    return known.concat(found.filter((n) => !known.includes(n)));
  }
  /** 视图选择菜单：与类别面板同一套 Modal 托管纪律（系统返回键/Esc/遮罩都能关） */
  renderViewMenuPopup(anchorEl) {
    if (ViewMenuModal.activeInstances && ViewMenuModal.activeInstances.size > 0) {
      for (const inst of Array.from(ViewMenuModal.activeInstances)) {
        try { inst.close(); } catch (e) {
        }
      }
      return;
    }
    for (const cls of [CategoryFilterModal, DatePickerModal]) {
      if (cls.activeInstances) {
        for (const inst of Array.from(cls.activeInstances)) {
          try { inst.close(); } catch (e) {
          }
        }
      }
    }
    new ViewMenuModal(this.app, this, anchorEl).open();
  }
  /** 类别多选面板：真机反馈回退——body 浮层不接系统返回键/Esc，改挂 Obsidian Modal
   * （弹窗管理器统一接管关闭途径），行内保持多选不关、点「全部」即关 */
  renderCategoryPopup(anchorEl) {
    // 再点漏斗 = 收起（沿用浮层时代的交互）；与日期弹窗互斥
    if (CategoryFilterModal.activeInstances && CategoryFilterModal.activeInstances.size > 0) {
      for (const inst of Array.from(CategoryFilterModal.activeInstances)) {
        try { inst.close(); } catch (e) {
        }
      }
      return;
    }
    if (DatePickerModal.activeInstances) {
      for (const inst of Array.from(DatePickerModal.activeInstances)) {
        try { inst.close(); } catch (e) {
        }
      }
    }
    new CategoryFilterModal(this.app, this, anchorEl).open();
  }
  /** 应用筛选：只改状态与角标；重渲由调用方触发（避免双重重绘） */
  setCategoryFilter(set) {
    this.activeCategories = set;
    if (this.filterBtnEl)
      this.applyFilterButtonState(this.filterBtnEl);
  }
  applyFilterButtonState(funnelBtn) {
    // ::after 小圆点角标：不展开面板也能看出「当前不是全部」
    if (this.activeCategories && this.activeCategories.size > 0)
      funnelBtn.addClass("filter-active");
    else
      funnelBtn.removeClass("filter-active");
  }
  /**
   * 在每次网格画完后收敛漏斗的存在性：
   * - 类别从 0 → ≥1，或从 ≥1 → 0：整体重建 header（只走 renderHeader 一条路径，
   *   避免手工克隆节点带来的监听器/样式漂移；仅在状态翻转时发生，不是每帧）
   * - 翻转即重建网格并递归补画一次；补画帧里状态与按钮一致，不再翻转，深度封顶
   */
  updateFilterButton() {
    const should = this.scanCategories().length > 0;
    const hasBtn = !!this.filterBtnEl;
    if (should === hasBtn) {
      if (this.filterBtnEl)
        this.applyFilterButtonState(this.filterBtnEl);
      return;
    }
    this.closeActivePopup();
    this.rebuildHeader();
    this.applyViewModeClass();
    this.renderCalendarGrid();
  }
  /**
   * 渲染整个视图
   */
  async render() {
    const langChanged = this.lastLang !== I18N_LANG;
    const firstDayChanged = this.lastFirstDayOfWeek !== this.plugin.settings.firstDayOfWeek;
    // 视图形态每次渲染都对齐一次（幂等）：root class 与切换按钮图标只在重建分支里
    // 恢复的话，「不重建 header 但 settings.viewMode 变了」的路径（设置页改值、
    // 外部 loadData 后 loadSettings）会留下上一个视图的类名——实机测出来过。
    this.applyViewModeClass();
    this.applyViewToggleIcon();
    if (this.rootEl.childElementCount === 0) {
      this.renderHeader();
      this.renderWeekdayHeader();
      this.gridEl = this.rootEl.createDiv("calendar-grid");
      this.applyViewModeClass();
      this.lastFirstDayOfWeek = this.plugin.settings.firstDayOfWeek;
      this.lastLang = I18N_LANG;
    } else if (langChanged) {
      // 语言变了必须整块重建：「今日」按钮、左右箭头 aria-label、漏斗按钮的
      // title 都只在 renderHeader 里生成一次，只换星期表头会留下一堆旧语言
      // （实测切到 zh-TW 后表头已变、顶部仍是 Today）
      this.closeActivePopup();
      this.rootEl.empty();
      this.gridEl = null;
      this.detailEl = null;
      this.renderHeader();
      this.renderWeekdayHeader();
      this.gridEl = this.rootEl.createDiv("calendar-grid");
      // rootEl.empty() 之后 .view-agenda 随子节点一起没了，必须补回：否则
      // 「类别数 0↔≥1 翻转 + 语言切换」这类重建路径会把日程视图打回条视图样式
      this.applyViewModeClass();
      this.lastFirstDayOfWeek = this.plugin.settings.firstDayOfWeek;
      this.lastLang = I18N_LANG;
    } else if (firstDayChanged) {
      // 只改每周起始日：列会错位，重建星期表头即可，头部文字不受影响
      const oldHeader = this.rootEl.querySelector(".weekday-header");
      if (oldHeader) oldHeader.remove();
      this.renderWeekdayHeader();
      // 周视图还要重算锚点：整月的行切分随起始日整体平移，旧锚点（如周六起的 10-04）
      // 在周一为始的网格里没有对应行，visibleDays 会退到合成兜底、列与表头错位
      if (this.isWeekFamily()) {
        this.ensureWeekAnchor();
        const t2 = this.headerEl.querySelector(".month-title");
        if (t2) t2.textContent = this.headerTitleText();
      }
      this.lastFirstDayOfWeek = this.plugin.settings.firstDayOfWeek;
    }
    await this.renderCalendarGrid();
  }
  /**
   * 渲染头部导航
   */
  renderHeader() {
    this.headerEl = this.rootEl.createDiv("monthly-header");
    const leftGroup = this.headerEl.createDiv("header-btn-group");
    const prevBtn = leftGroup.createDiv("nav-btn prev-btn");
    prevBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
    prevBtn.setAttribute("aria-label", this.isWeekFamily() ? tr("view.header.prevWeek") : tr("view.header.prevMonth"));
    prevBtn.addEventListener("click", () => this.navigatePeriod(-1));
    const titleEl = this.headerEl.createDiv("month-title");
    titleEl.textContent = this.headerTitleText();
    titleEl.addClass("clickable");
    titleEl.setAttribute("title", tr("view.header.titleTip"));
    titleEl.addEventListener("click", () => this.openDatePicker());
    const rightGroup = this.headerEl.createDiv("header-btn-group");
    const nextBtn = rightGroup.createDiv("nav-btn next-btn");
    nextBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    nextBtn.setAttribute("aria-label", this.isWeekFamily() ? tr("view.header.nextWeek") : tr("view.header.nextMonth"));
    nextBtn.addEventListener("click", () => this.navigatePeriod(1));
    const todayBtn = rightGroup.createDiv("today-btn");
    // 真机反馈回退：图标化并未省下标题区（.month-title flex:1 吃掉余量），四字文案
    // 可读性更好，恢复 v1.4.2 文本按钮
    // v1.7.0：周视图下同一颗按钮语义变成「回到本周」（四字，宽度不跳），文案分开
    todayBtn.textContent = this.isWeekFamily() ? tr("view.header.thisWeek") : tr("view.header.today");
    todayBtn.setAttribute("title", this.isWeekFamily() ? tr("view.header.thisWeek") : tr("view.header.today"));
    todayBtn.addEventListener("click", () => this.goToToday());
    // 漏斗筛选按钮（批次二⑤）：当前解析结果里出现 ≥1 个类别才渲染——纯无标签工作流
    // 永远看不到它；渲染与去留由 updateFilterButton 在每次网格渲染前统一收敛
    this.filterBtnEl = null;
    if (this.scanCategories().length > 0) {
      const funnelBtn = rightGroup.createDiv("nav-btn filter-btn");
      funnelBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>';
      funnelBtn.setAttribute("aria-label", tr("modal.filter.title"));
      funnelBtn.setAttribute("title", tr("modal.filter.title"));
      funnelBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.renderCategoryPopup(funnelBtn);
      });
      this.filterBtnEl = funnelBtn;
      this.applyFilterButtonState(funnelBtn);
    }
    // 视图切换按钮（v1.6.0 批次一）：原右上角的 × 已取消——Obsidian 标签页自带关闭，
    // 插件再放一个 × 既冗余又容易误触（closeView 随之删除，它只有这一处调用）。
    // 图标指向「去处」而非「当前」：条视图下画日历图标（点了去日程），日程视图下画列表图标。
    const viewBtn = rightGroup.createDiv("nav-btn view-toggle-btn");
    this.viewToggleBtnEl = viewBtn;
    this.applyViewToggleIcon(viewBtn);
    // v1.7.0：三个（v1.7.1 起四个）视图不再是「两点一线」的循环，按钮改为唤出视图菜单：
    // 一眼能看见全部去处、当前在哪一档，误触一次就能退回；循环切换仍保留给命令面板。
    viewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.renderViewMenuPopup(viewBtn);
    });
  }
  /** 顶栏标题文案：月视图=「2026年 10月」，周视图=「10/5 – 10/11」 */
  headerTitleText() {
    return this.isWeekFamily() ? getWeekTitle(this.weekAnchor()) : getMonthTitle(this.currentYear, this.currentMonth);
  }
  /** 左右箭头统一入口：月视图按月走，周视图按周走（±7 天） */
  async navigatePeriod(direction) {
    if (this.isWeekFamily()) {
      await this.navigateWeek(direction);
    } else {
      await this.navigateMonth(direction);
    }
  }
  /**
   * 打开日期选择器
   */
  openDatePicker() {
    // 真机反馈回退：整屏 Modal 恢复 v1.4.2 形态——Modal 由 Obsidian 弹窗管理器接管，
    // 系统返回键/Esc/遮罩点击天然关闭；锚定浮层不自带这套生命周期，手机上关不掉
    if (CategoryFilterModal.activeInstances) {
      for (const inst of Array.from(CategoryFilterModal.activeInstances)) {
        try { inst.close(); } catch (e) {
        }
      }
    }
    const modal = new DatePickerModal(this.app, this.currentYear, this.currentMonth, async (year, month) => {
      this.currentYear = year;
      this.currentMonth = month;
      this.convergeSelectedDate();
      if (this.isWeekFamily()) this.ensureWeekAnchor();
      await this.renderCalendarGrid();
    });
    modal.open();
  }
  /**
   * 刷新视图
   * @param force 是否强制重新渲染整个视图
   */
  async refresh(force = false) {
    if (force) {
      this.taskParser.invalidateCache();
      await this.render();
    } else {
      await this.renderCalendarGrid();
    }
  }
  /**
   * 渲染星期标题
   */
  renderWeekdayHeader() {
    // 大周视图没有列头：格子是 2 列（手机）/ 4 列（桌面）排布，列与星期不再
    // 一一对应，星期写在每格抬头（见 renderDayCell 的 bigWeek 分支）。
    if (this.isBigWeek()) return;
    const weekdayEl = document.createElement("div");
    weekdayEl.className = "weekday-header";
    const firstDayOfWeek = this.plugin.settings.firstDayOfWeek;
    for (let i = 0; i < 7; i++) {
      const dayEl = weekdayEl.createDiv("weekday-cell");
      const dayIndex = (firstDayOfWeek + i) % 7;
      dayEl.textContent = weekdayNames()[dayIndex];
      if (dayIndex === 0 || dayIndex === 6) {
        dayEl.addClass("weekend");
      }
    }
    // 插入到 gridEl 之前，确保顺序为 header → weekday-header → grid
    if (this.gridEl) {
      this.rootEl.insertBefore(weekdayEl, this.gridEl);
    } else {
      this.rootEl.appendChild(weekdayEl);
    }
  }
  /**
   * 渲染月历网格
   */
  /**
   * v1.5.2 方案A：删除线开关热切换时只增删 .completed-strike 类名，
   * 不重建网格/弹窗（完成态灰条+变暗由 .completed 恒承担，与开关无关）
   */
  _applyStrikeClasses() {
    const strike = this.plugin.settings.showCompletedStrike;
    const targets = [...document.querySelectorAll(".day-cell .task-item.completed"),
      ...document.querySelectorAll(".existing-task-item.completed"),
      // 明细区的勾选行也走同一条删除线开关（v1.6.0 批次二）：
      // 日程视图里已完成 = 变暗 + 按开关决定是否划线，与条视图口径一致
      ...document.querySelectorAll(".agenda-item.completed")];
    for (const el of targets) {
      if (strike) el.removeClass("completed-strike");
      else el.addClass("completed-strike");
    }
  }

  /**
   * 当前该画哪些格子。月视图 = generateMonthCalendar 的整月（5 或 6 行）；
   * 周视图 = 同一个 42 天数组里切出锚点所在的那一行（7 格）。
   * 刻意复用整月数组而不是另写一个「生成一周」的函数：农历、节假日、补位、
   * isToday、列对齐（firstDayOfWeek）全部与月视图同源，小周与大月看到的
   * 同一天必然一模一样，不会出现「月视图有节日名、周视图没有」这类分叉。
   */
  visibleDays(calendar) {
    if (!this.isWeekFamily()) return calendar.days;
    const start = this.weekAnchor();
    const at = calendar.days.findIndex((d) => formatDate(d.date) === start);
    if (at < 0) {
      // 锚点不在本月网格内（跨月周：如锚点 10/26 而当前显示 11 月）——
      // 按锚点自身造 7 天，字段与 generateMonthCalendar 完全同构
      const days = [];
      const base = dateFromStr(start);
      for (let i = 0; i < 7; i++) {
        const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
        days.push({
          date,
          day: date.getDate(),
          month: date.getMonth(),
          year: date.getFullYear(),
          isCurrentMonth: date.getMonth() === this.currentMonth,
          isToday: isToday(date),
          isWeekend: isWeekend(date),
          dayOfWeek: date.getDay()
        });
      }
      return days;
    }
    return calendar.days.slice(at, at + 7);
  }
  /**
   * header 序列的唯一重建入口（v1.7.0 从 updateFilterButton 里抽出）。
   * 视图切换也要走它：顶栏的箭头 aria-label、「回到本月/本周」文案、视图按钮图标
   * 都只在 renderHeader 里生成一次，只改 root class 会留下上一个视图的头部措辞。
   */
  rebuildHeader() {
    this.rootEl.empty();
    this.gridEl = null;
    this.detailEl = null;
    this.renderHeader();
    this.renderWeekdayHeader();
    this.gridEl = this.rootEl.createDiv("calendar-grid");
    this.applyViewModeClass();
    this.lastFirstDayOfWeek = this.plugin.settings.firstDayOfWeek;
    this.lastLang = I18N_LANG;
  }
  async renderCalendarGrid() {
    await this._renderCalendarGridCore();
    // v1.5.2 方案A：网格重绘后把当前删除线开关态补挂到 .completed 元素上
    this._applyStrikeClasses();
  }
  async _renderCalendarGridCore() {
    // 自增 requestId：快速切换月份时，旧请求完成后会因 requestId 不匹配而丢弃渲染结果
    this.renderRequestId = (this.renderRequestId || 0) + 1;
    const myRequestId = this.renderRequestId;
    const titleEl = this.headerEl.querySelector(".month-title");
    if (titleEl) {
      titleEl.textContent = this.headerTitleText();
    }
    this.gridEl.empty();
    const calendar = generateMonthCalendar(this.currentYear, this.currentMonth, this.plugin.settings.firstDayOfWeek);
    // 42 天网格可能跨年（如查看 12 月时下月溢出日期属次年），对所有涉及的年份都按需 ensure，
    // 避免溢出日期无节假日标注
    const yearsToEnsure = /* @__PURE__ */ new Set([this.currentYear]);
    for (const day of this.visibleDays(calendar)) {
      yearsToEnsure.add(day.date.getFullYear());
    }
    // 按需获取不阻塞渲染：网格先按现有缓存画出来（浏览到的年份若无缓存数据，
    // 如 2022 年以前、2027 年以后，从数据源拉取该年），取回后若视图仍在本月
    // 仅补刷一次网格。已有内置/缓存数据的年份不发起请求，
    // 保持「默认不联网」的浏览体验；ensureYearData 返回是否实际取回新数据，
    // 缓存已就绪/获取失败时均为 false，不会触发补刷（无重入循环）
    const ensured = Promise.all(Array.from(yearsToEnsure).map((y) => this.plugin.holidayManager.ensureYearData(y)));
    ensured.then((fetched) => {
      if (fetched.some(Boolean) && myRequestId === this.renderRequestId && this.rootEl && this.rootEl.isConnected) {
        this.renderCalendarGrid();
      }
    }).catch(() => {
    });
    // 使用缓存（false）：文件变化事件会通过 invalidateCache() 主动清空缓存，
    // 因此切换月份时无需强制刷新，避免每次遍历整个 vault。
    let taskMap;
    try {
      taskMap = await this.taskParser.parseAllTasks(false);
    } catch (e) {
      console.error(tr("error.loadTasks"), e);
      if (myRequestId !== this.renderRequestId) return;
      this.gridEl.empty();
      const errEl = this.gridEl.createDiv("error-hint");
      errEl.textContent = tr("view.cell.loadError");
      return;
    }
    if (myRequestId !== this.renderRequestId) return;
    // 大周视图要统计「这一周共几项、完成几项」：跨天任务在起止区间内每天都挂一次，
    // 所以按任务对象去重（同一个 task 引用只数一遍），口径与格子里铺出来的条数无关。
    const weekTaskSet = this.isBigWeek() ? /* @__PURE__ */ new Set() : null;
    for (const day of this.visibleDays(calendar)) {
      const dateStr = formatDate(day.date);
      let tasks = taskMap.taskMap.get(dateStr) || [];
      // v1.6.0 批次四：日程视图要区分「这天空」和「这天有内容但被筛掉了」，
      // 后者整格淡掉。只传一个布尔以外的信息没必要，长度 > 0 就够用。
      const hadBeforeFilter = tasks.length;
      // 类别筛选在「取到当日全量之后、渲染之前」一处生效：+N 计数、格子 overflow 判定、
      // 「该日已有 N 个任务」列表全部基于筛选后集合（未筛选项不进弹窗列表）
      if (this.activeCategories && this.activeCategories.size > 0) {
        tasks = tasks.filter((x) => this.activeCategories.has(x.category));
      }
      this.renderDayCell(day, tasks, hadBeforeFilter);
      if (weekTaskSet) for (const t of tasks) weekTaskSet.add(t);
    }
    // 大周的「本周」块放在格子之后画：它要读上面那一循环的统计结果，
    // 但插到网格最前面，视觉上仍是左上角第一格（与日子格同构：标题行 + 内容行）。
    if (weekTaskSet) {
      this.gridEl.insertBefore(this.renderWeekSummaryCell(weekTaskSet), this.gridEl.firstChild);
    }

    // 明细区（v1.6.0 批次二）：网格画完再画它，DOM 顺序天然是
    // header → weekday-header → grid → agenda-detail。
    // 任务集合与格子同源（同一份筛选后的 tasks），绝不会出现「格子有点、明细为空」
    if (this.isCompactCell()) {
      let dayTasks = taskMap.taskMap.get(this.selectedDate) || [];
      if (this.activeCategories && this.activeCategories.size > 0) {
        dayTasks = dayTasks.filter((x) => this.activeCategories.has(x.category));
      }
      this.renderAgendaDetail(dayTasks);
    } else {
      this.removeAgendaDetail();
    }

    // 解析完成后再收敛漏斗：类别首次出现/清零的这一帧重建 header，
    // updateFilterButton 内部会递归补画一次（状态一致后不再递归，深度封顶 2）
    this.updateFilterButton();
  }
  /**
   * 渲染日期格子
   */
  renderDayCell(day, tasks, hadBeforeFilter) {
    const cellEl = this.gridEl.createDiv("day-cell");
    const agenda = this.isCompactCell();
    const dateKey = formatDate(day.date);
    if (!day.isCurrentMonth) {
      cellEl.addClass("other-month");
    }
    if (day.isToday) {
      cellEl.addClass("today");
    }
    const holidayInfo = this.plugin.settings.showHoliday ? this.plugin.holidayManager.getHolidayInfo(day.date) : null;
    if (holidayInfo) {
      if (holidayInfo.type === "legal" /* LEGAL */) {
        cellEl.addClass("holiday");
      } else if (holidayInfo.type === "workday" /* WORKDAY */) {
        cellEl.addClass("workday");
      }
    } else if (day.isWeekend) {
      cellEl.addClass("weekend");
    } else {
      cellEl.addClass("weekday");
    }
    const headerEl = cellEl.createDiv("day-header");
    const headerRow = headerEl.createDiv("day-header-row");
    // 大周视图没有列头（2/4 列排布，列与星期对不上号），星期名回到格子里自带。
    if (this.isBigWeek()) {
      const wdEl = headerRow.createDiv("bigweek-weekday");
      wdEl.textContent = weekdayFullNames()[day.date.getDay()];
    }
    const dayNumEl = headerRow.createDiv("day-number");
    dayNumEl.textContent = String(day.day);
    if (this.plugin.settings.showLunar) {
      const lunarInfo = getLunarInfo(day.date);
      const lunarEl = headerRow.createDiv("lunar-info");
      lunarEl.textContent = lunarInfo.text;
      if (isSpecialLunarDay(day.date) && !lunarInfo.isFestival) {
        lunarEl.addClass("special-lunar");
      }
    }
    if (this.plugin.settings.showHoliday && holidayInfo && holidayInfo.type === "legal" /* LEGAL */) {
      const holidayNameEl = headerEl.createDiv("holiday-name");
      holidayNameEl.textContent = translateHolidayName(holidayInfo.name);
    }
    // ---- 日程视图（v1.6.0 批次一）：格子里不铺任务行，只在底部放一枚圆点 ----
    // 不创建 .day-tasks 容器：它带 flex:1，留着会把点顶到不确定的位置；.day-cell
    // 本身是 flex-direction: column，点作为末子元素 + margin-top:auto 沉底。
    // 数据源用完整 tasks（不是 displayTasksList）：否则关掉「显示已完成任务」会让
    // 含已完成任务的那些天的点整个消失。
    if (agenda) {
      const filtering = this.activeCategories && this.activeCategories.size > 0;
      if (tasks.length > 0) {
        const markEl = cellEl.createDiv("day-mark");
        // 红点判定必须带「本格日期 == 任务截止日」这一半：跨天任务在它占用的每一天
        // 都出现在 tasks 里（groupTasksByDate 按闭区间逐日挂载），只判 isOverdue(dueDate)
        // 会让一个逾期跨天任务在它占的每一天都变红，连排一片。
        const overdueHere = tasks.some((t) => !t.completed && t.dueDate && t.dueDate === dateKey && isOverdue(t.dueDate));
        if (overdueHere) {
          markEl.addClass("overdue-mark");
          markEl.setAttribute("aria-label", tr("view.agenda.overdueDot"));
        } else {
          markEl.setAttribute("aria-label", tr("view.agenda.hasTaskDot"));
        }
      }
      // 未命中筛选但筛选前有内容 → 整格淡出（计划 §2.1 最后一行）。
      // 判定放在点之后：淡出只解释「为什么这格没有点」，不改变点的有无本身。
      // 真·空格不加这个类，否则整月会一起变灰，反而看不出谁被筛掉了。
      if (filtering && tasks.length === 0 && hadBeforeFilter > 0) {
        cellEl.addClass("filter-miss");
      }
      if (dateKey === this.selectedDate) {
        cellEl.addClass("sel");
      }
      // 点格子 = 选中该天（不再直接开创建弹窗；创建走明细区吸顶行的「＋ 添加」）。
      // 条视图保持原行为：点空白格子仍直接开创建弹窗。
      cellEl.addEventListener("click", () => {
        if (this.selectDay(dateKey)) {
          this.renderCalendarGrid();
        }
      });
      return;
    }
    const tasksEl = cellEl.createDiv("day-tasks");
    let displayTasksList = tasks;
    if (!this.plugin.settings.showCompletedTasks) {
      displayTasksList = tasks.filter((t) => !t.completed);
    }
    const limit = this.plugin.settings.tasksPerDayLimit;
    // 保持 displayTasksList 原始排序（time/lineNumber），用 Set 标记跨天任务。
    // 跨天任务不占 tasksPerDayLimit 配额（避免挤占单日任务），但施加软上限（limit）防止极端场景撑爆格子。
    // 单日任务用独立计数器，超过 limit 的部分计入 remainingCount。
    const multiDaySet = new Set(displayTasksList.filter((t) => isMultiDayTask(t)));
    let multiDayShown = 0;
    let singleDayShown = 0;
    let remainingCount = 0;
    for (const task of displayTasksList) {
      if (multiDaySet.has(task)) {
        if (multiDayShown < limit) {
          this.renderTaskItem(tasksEl, task, day.date);
          multiDayShown++;
        } else {
          remainingCount++;
        }
      } else {
        if (singleDayShown < limit) {
          this.renderTaskItem(tasksEl, task, day.date);
          singleDayShown++;
        } else {
          remainingCount++;
        }
      }
    }
    if (remainingCount > 0) {
      const moreEl = tasksEl.createDiv("more-tasks");
      moreEl.textContent = `+${remainingCount}`;
      // +N more 独立点击：打开任务面板查看被截断的任务，不冒泡触发空格子创建逻辑
      // 传与格子同一份 displayTasksList（按 showCompletedTasks 过滤），
      // 弹窗内「该日已有 N 个任务」的计数与格子实际显示保持一致
      moreEl.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openCreateTaskModal(day.date, displayTasksList);
      });
    }
    cellEl.addEventListener("click", (e) => {
      if (e.target.closest(".task-item") || e.target.closest(".more-tasks")) {
        return;
      }
      this.openCreateTaskModal(day.date, displayTasksList);
    });
  }
  /**
   * 渲染任务项
   */
  /**
   * 大周视图左上角的「本周」块（v1.7.1）。
   * ------------------------------------------------------------
   * 与日子格同构：一行标题 + 几行内容，占满第一格，不空着、也不伪装成一个日子
   * （无排期、不可点、无边框、底色更浅）。三行内容自上而下：
   *   1) 本周 / 上周 / 下周 / 第 N 周 —— 文字，永远不是数字；右侧灰字标年内第几周
   *   2) 周区间 10/6 – 10/12 —— 顶栏已有，这里再给一次是因为块本身要能自立读解
   *   3) 共 N 项 · 完成 M + 一条发丝进度线 —— 这一周的负载
   * v1.7.2 去掉了农历月那一行：手机上「八月 – 九月」被读成公历八九月，
   * 而且日子格里已有廿四/廿五…与月初标记，这行是重复信息。
   * 数字来自调用方传进的去重集合：跨天任务在这周里占 3 天也只算 1 项。
   */
  renderWeekSummaryCell(taskSet) {
    const start = this.weekAnchor();
    const el = this.gridEl.createDiv("day-cell week-summary");
    const total = taskSet.size;
    let done = 0;
    for (const t of taskSet) if (t.completed) done++;
    const titles = weekSummaryTitles(start, this.plugin.settings.firstDayOfWeek);
    const titleRow = el.createDiv("day-header-row");
    titleRow.createDiv("week-summary-title").textContent = titles.title;
    // 周数走标题行右侧的灰字：与日子格那行（周日 / 4 / 廿四）同构，
    // 也不新增行、不长高度（手机端这一格的高度是要省着用的）
    if (titles.num) titleRow.createDiv("week-summary-num").textContent = titles.num;
    el.createDiv("week-summary-range").textContent = getWeekTitle(start);
    const loadEl = el.createDiv("week-summary-load");
    loadEl.textContent = tr("view.week.load", { n: total, m: done });
    const bar = el.createDiv("week-summary-bar");
    // 0 项时不画线（画一条空槽会让人以为「有安排但都未完成」）；100% 时填满整槽
    if (total > 0) {
      bar.createDiv("week-summary-bar-fill").style.width = Math.round(done / total * 100) + "%";
    } else {
      bar.addClass("is-empty");
    }
    return el;
  }
  renderTaskItem(container, task, dayDate) {
    const taskEl = container.createDiv("task-item");
    // v1.5.2 方案A：.completed 只表意"已完成"（手机端 = 左缘灰竖条 + 变暗），不再受
    // 删除线开关门控；删除线通道拆给 .completed-strike（仅开关关闭时叠加）。
    // 此前开关打开（默认）时已完成任务在日历里毫无反馈，是本批要修的根因
    if (task.completed) {
      taskEl.addClass("completed");
      if (!this.plugin.settings.showCompletedStrike) taskEl.addClass("completed-strike");
    }
    if (!this.plugin.settings.showCompletedStrike && task.dueDate && isOverdue(task.dueDate) && !task.completed) {
      taskEl.addClass("overdue");
    }
    taskEl.addClass(`priority-bg-${task.priority}`);
    const multiDay = isMultiDayTask(task);
    const duration = multiDay ? getMultiDayDuration(task) : 1;
    if (multiDay) {
      taskEl.addClass("multi-day-task");
      // v1.7.3：首日不再加 multi-day-start —— 它唯一的用途是挂尾部「 →」箭头，
      // 而箭头既占宽度又与「N天」信息重复（天数行两端统一后天天可见）。
      // 尾日记号保留：左缘渐变条改浅收尾，是纯视觉信息、不占文字盒。
      if (dayDate && formatDate(dayDate) === task.dueDate) {
        taskEl.addClass("multi-day-end");
      }
    }
    const contentEl = taskEl.createDiv("task-content");
    // 批次三⑦：(N天) 后缀并入时间行。实测后缀宽 22.5~25px，会把批次四抠出的
    // 文字盒吃回去；并入 .task-time 后文字行零成本（手机端时间行本就整行换行）。
    // 跨天但无时间的任务也建时间行只显天数，信息不丢；桌面端观感不变（同一位置）
    contentEl.textContent = task.content;
    const timeHead = task.time ? task.time.split("~")[0] : "";
    if (task.time || multiDay) {
      const timeEl = taskEl.createDiv("task-time");
      timeEl.textContent = multiDay ? (timeHead ? tr("view.cell.timeDuration", { time: timeHead, days: duration }) : tr("view.cell.duration", { days: duration })) : timeHead;
    }
    contentEl.setAttribute("title", task.content);
    // 类别（v1.5.4 起两端统一）：格子里只画一条左缘色带，不再放 #标签 文字——
    // 窄格里一行只塞得下四五个汉字，文字标签会把任务名挤掉；而文字标签本来是给
    // 筛选功能对照用的，那个用途由弹窗列表与筛选面板承担。
    // 这里只留 --mt-cat-color 与 has-category 两个钩子，色带本体在 styles.css 的
    // 「日历格子里的类别：左缘色带」段用 ::after 画（不占布局）。
    if (task.category) {
      const catColor = resolveCategoryColor(task.category, this.plugin.settings.categories);
      taskEl.style.setProperty("--mt-cat-color", catColor);
      taskEl.addClass("has-category");
    }
    taskEl.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleTask(task);
    });
  }
  /**
   * 切换任务完成状态
   */
  async toggleTask(task) {
    // 并发防护：同一任务在切换过程中（读-改-写）再次点击会导致竞态，
    // 用文件路径+行号作为键，期间重复点击直接忽略。
    const taskKey = `${task.filePath}:${task.lineNumber}`;
    if (this.togglingTasks && this.togglingTasks.has(taskKey)) return;
    if (!this.togglingTasks) this.togglingTasks = /* @__PURE__ */ new Set();
    this.togglingTasks.add(taskKey);
    try {
      const success = await this.taskParser.toggleTask(task);
      if (success) {
        // 状态变化即反馈，不再弹成功提示；失败路径的 Notice 保留
        // 立即失效任务缓存，确保延迟刷新读取最新数据（避免 200ms 内渲染过期缓存）
        this.taskParser.invalidateCache();
        // 视图已关闭（await 期间 onClose 已执行）：跳过延迟刷新，避免操作已分离 DOM
        // pendingTimers 在 onClose 中已 clear()，但 Set 实例仍存在，所以用 isConnected 判断
        if (!this.rootEl || !this.rootEl.isConnected) return;
        // 跟踪定时器 ID 供 onClose 清理，避免视图关闭后仍向已分离 DOM 渲染
        if (!this.pendingTimers) this.pendingTimers = /* @__PURE__ */ new Set();
        const timerId = setTimeout(async () => {
          if (this.pendingTimers) this.pendingTimers.delete(timerId);
          // try/catch 防止 refresh 抛错变成未处理 Promise rejection 污染控制台
          try {
            await this.refresh();
          } catch (e) {
            console.error(tr("error.delayRefresh"), e);
          }
        }, 200);
        this.pendingTimers.add(timerId);
      } else {
        new import_obsidian2.Notice(tr("notice.opFail"));
      }
    } finally {
      this.togglingTasks.delete(taskKey);
    }
  }
  /**
   * 打开创建任务弹窗
   */
  openCreateTaskModal(date, existingTasks = [], editTask = null) {
    const modal = new CreateTaskModal(this.app, date, async (content, isAllDay, time, priority, endDate, category, editOld, noteText) => {
      const customFolderPath = this.plugin.settings.customTaskFolder || void 0;
      // v1.6.0 手机端反馈版：备注改在弹窗里写（noteText 恒为字符串，收起时是空串）。
      // 编辑态逐项比对「任务行本身」有没有变——只有备注变就走 updateTaskNote 原地
      // 写回：先建后删那条链路会重排行号、换 createdAt，只为改一行备注不值得。
      // 判定宁可漏判（落到重建路径，结果仍正确）不可误判（用户的改动被吞掉）
      if (editOld) {
        const nextNote = noteTextToLines(noteText).join("\n");
        const oldNote = noteTextToLines(editOld.note).join("\n");
        const fmtD = (s) => s ? formatDate(dateFromStr(String(s))) : "";
        const newStart = formatDate(modal.date);
        const newDue = endDate ? formatDate(endDate) : newStart;
        const rowSame = content === editOld.content
          && (category || "") === (editOld.category || "")
          && priority === editOld.priority
          && (isAllDay ? "" : time || "") === (editOld.time || "")
          && fmtD(editOld.startDate || editOld.dueDate) === newStart
          && fmtD(editOld.dueDate) === newDue;
        if (rowSame) {
          if (nextNote === oldNote) return;
          const kept = await this.taskParser.updateTaskNote(editOld, nextNote);
          if (!kept) throw new Error("updateTaskNote returned false");
          try {
            await this.refresh(true);
          } catch (refreshErr) {
            console.error(tr("error.postCreateRefresh"), refreshErr);
            new import_obsidian2.Notice(tr("notice.createdRefreshFail"), 3e3);
          }
          return;
        }
      }
      const success = await this.taskParser.createTaskForDate(modal.date, content, isAllDay, time, priority, endDate, customFolderPath, category, editOld ? editOld.completed : void 0, noteText || void 0);
      if (success) {
        // 批次三：编辑=先建新行、再删旧行（3.4 定稿）。删除只认 rawLine：新行插入后
        // 旧行行号常发生偏移；删不到不判失败——新行已在，重复行可见、可手动删除
        if (editOld) {
          // 令牌必须在 await 之后、下一次入队之前同步取走：晚一步就会被并发链路的 create 覆盖
          const createdToken = this.taskParser.lastCreatedInfo;
          this.taskParser.lastCreatedInfo = null;
          // dropNote：新行已带上同一份备注，旧行那段必须一起摘掉，否则文件里会
          // 出现「降级副本 + 新行副本」两份；无备注时该选项无副作用
          const removed = await this.taskParser.deleteTaskByRawLine(editOld.filePath, editOld.rawLine, editOld.lineNumber, { created: createdToken, dropNote: true });
          if (!removed) new import_obsidian2.Notice(tr("notice.editSavedBut"), 5e3);
        }
        // 任务出现在日历中即反馈，不再弹成功提示；refresh 失败仍有单独提示
        // refresh 失败不应让用户误以为任务创建失败（任务已写入文件），
        // 单独捕获并提示，避免抛错进入 .catch 导致用户重试产生重复任务
        try {
          await this.refresh(true);
        } catch (refreshErr) {
          console.error(tr("error.postCreateRefresh"), refreshErr);
          new import_obsidian2.Notice(tr("notice.createdRefreshFail"), 3e3);
        }
      } else {
        // 抛错让 CreateTaskModal 的 .catch 分支接管：保留弹窗、回滚 submitted/disabled 状态，允许用户重试
        throw new Error("createTaskForDate returned false");
      }
    }, this.plugin, existingTasks, editTask);
    modal.open();
  }
  /**
   * 导航到上/下月
   */
  async navigateMonth(direction) {
    if (direction < 0) {
      const prev = getPrevMonth(this.currentYear, this.currentMonth);
      this.currentYear = prev.year;
      this.currentMonth = prev.month;
    } else {
      const next = getNextMonth(this.currentYear, this.currentMonth);
      this.currentYear = next.year;
      this.currentMonth = next.month;
    }
    // 钳制到农历支持的 1900-2100，与日期选择器的年份范围保持一致
    // 按（年,月）整体钳制：只钳年份会把月份留在越界侧（如 2100-12 下月变成 2100-01）
    if (this.currentYear < 1900) {
      this.currentYear = 1900;
      this.currentMonth = 0;
    } else if (this.currentYear > 2100) {
      this.currentYear = 2100;
      this.currentMonth = 11;
    }
    // 日程视图：选中日跟着月份走，否则会出现「网格已翻月、明细还在上一月某天」
    this.convergeSelectedDate();
    // 周视图：月都换了，锚点没有留在旧周的道理（convergeSelectedDate 已把选中日
    // 拉进新月，这里据它重算锚点，标题与网格自然对齐）
    if (this.isWeekFamily()) this.ensureWeekAnchor();
    await this.renderCalendarGrid();
  }
  /**
   * 回到今天
   */
  async goToToday() {
    const { year, month } = getCurrentYearMonth();
    this.currentYear = year;
    this.currentMonth = month;
    this.convergeSelectedDate();
    // 「回到本周」：周视图下锚点强制回到含今天那一周（ensureWeekAnchor 走 selectedDate=今天）
    if (this.isWeekFamily()) this.weekStart = weekStartFrom(new Date(), this.plugin.settings.firstDayOfWeek);
    await this.renderCalendarGrid();
  }
  /**
   * 视图模式（v1.6.0 批次一）
   * ----------------------------------------------------------
   * 两个视图共用同一套 DOM 骨架（header → weekday-header → grid → 明细区），
   * 切换只改 rootEl 上的 .view-agenda 类 + 重画网格，不重建视图；所有日程视图
   * 样式都带 .view-agenda 前缀，条视图一行样式都不碰。
   * 状态源是 settings.viewMode（单一真相），视图上不另存副本，避免两处不同步。
   */
  isAgenda() {
    return this.plugin.settings.viewMode === "agenda";
  }
  /** 小周视图（v1.7.0）：上半屏只留所在那一行的周格子，下半屏明细区与小月完全一致 */
  isWeek() {
    return this.plugin.settings.viewMode === "week";
  }
  /**
   * 大周视图（v1.7.1）：同样只看一周，但这一周摊成 8 格（左上「本周」标题块 +
   * 7 个日子格），任务写在格子里，没有下方明细区。
   * 与 .view-agenda 那一族无关：格子渲染走大月那条路径（renderTaskItem），
   * 只有「看哪一周」的锚点逻辑与小周共用。
   */
  isBigWeek() {
    return this.plugin.settings.viewMode === "bigWeek";
  }
  /**
   * 「按周过」的判定：顶栏标题=周区间、箭头按周翻页、锚点维护、visibleDays
   * 只取 7 天——小周与大周这些行为完全一致，故共用一个谓词，避免每处写两遍。
   * 注意：格子里画不画圆点、要不要明细区是 isCompactCell() 的事，两者正交。
   */
  isWeekFamily() {
    const m = this.plugin.settings.viewMode;
    return m === "week" || m === "bigWeek";
  }
  /**
   * 「格子只出圆点」的判定：小月与小周共用同一套格子渲染与明细区，
   * 差异只在网格给几行。所以原来所有 isAgenda() 的渲染分支一律换成这个，
   * 新增的 .view-week 类只用来管行高与顶栏文案，不再多开一条渲染分支。
   */
  isCompactCell() {
    const m = this.plugin.settings.viewMode;
    return m === "agenda" || m === "week";
  }
  /** 按钮图标改为「当前视图」的自证（菜单形态下按钮是入口，不再是「去处」） */
  applyViewToggleIcon(btn) {
    const el = btn || this.viewToggleBtnEl;
    if (!el) return;
    const mode = VIEW_MODES.includes(this.plugin.settings.viewMode) ? this.plugin.settings.viewMode : "list";
    el.innerHTML = AGENDA_TOGGLE_ICONS[mode] || AGENDA_TOGGLE_ICONS.list;
    const label = tr("view.header.pickView") + " · " + viewModeLabel(mode);
    el.setAttribute("aria-label", label);
    el.setAttribute("title", label);
    // .is-agenda 保留原义（当前不是条视图），条视图下按钮回到无强调态
    el.toggleClass("is-agenda", mode !== "list");
  }
  /** 命令面板用：按 VIEW_MODES 顺序循环（菜单是主入口，循环留给键盘用户一键到底） */
  async toggleViewMode() {
    const cur = VIEW_MODES.includes(this.plugin.settings.viewMode) ? this.plugin.settings.viewMode : "list";
    const next = VIEW_MODES[(VIEW_MODES.indexOf(cur) + 1) % VIEW_MODES.length];
    await this.setViewMode(next);
  }
  /** 视图模式的唯一写入口：菜单与命令都走这里，避免两处各自 saveSettings */
  async setViewMode(mode) {
    if (!VIEW_MODES.includes(mode)) mode = "list";
    if (this.plugin.settings.viewMode === mode) return;
    this.plugin.settings.viewMode = mode;
    await this.plugin.saveSettings();
    // 进紧凑格子类视图时若从未选中过日子，先把选中日收敛到当前月内（否则明细区空白）
    if (this.isCompactCell() && !this.selectedDate) this.convergeSelectedDate();
    // 进周视图：锚点若无或不属当前月，收到当前月（切出周视图不动锚点，回来还在同一周）
    if (this.isWeekFamily()) this.ensureWeekAnchor();
    this.closeActivePopup();
    this.rebuildHeader();
    this.applyViewModeClass();
    this.applyViewToggleIcon();
    await this.renderCalendarGrid();
  }
  /** root class 的唯一写入口：header 重建、语言切换重绘后都要靠它恢复视图形态 */
  applyViewModeClass() {
    if (!this.rootEl) return;
    this.rootEl.toggleClass("view-agenda", this.isCompactCell());
    this.rootEl.toggleClass("view-week", this.isWeek());
    this.rootEl.toggleClass("view-bigweek", this.isBigWeek());
  }
  /** 周锚点（YYYY-MM-DD，视图内存态）：小周视图显示哪一周由它决定 */
  weekAnchor() {
    return this.weekStart || this.convergeSelectedDateAndReturn();
  }
  /** 锚点缺失或不合法时按 selectedDate / 今天补一个（不在 render 路径里改状态，故单独成式） */
  convergeSelectedDateAndReturn() {
    const base = this.selectedDate ? dateFromStr(this.selectedDate) : new Date();
    this.weekStart = weekStartFrom(base, this.plugin.settings.firstDayOfWeek);
    return this.weekStart;
  }
  /** 进周视图时把锚点收进「当前显示的那个月」：避免切视图瞬间屏幕跳到别周 */
  ensureWeekAnchor() {
    if (!this.selectedDate) this.convergeSelectedDate();
    this.weekStart = weekStartFrom(dateFromStr(this.selectedDate), this.plugin.settings.firstDayOfWeek);
  }
  /**
   * 按周导航：锚点 ±7 天，再把 currentYear/Month 跟到锚点所在月——
   * 否则跨月周（10/26–11/1）走下一周时网格列语义、日期选择器仍停在旧月。
   */
  async navigateWeek(direction) {
    const cur = dateFromStr(this.weekAnchor());
    const next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + direction * 7);
    this.selectedDate = formatDate(next);
    this.weekStart = weekStartFrom(next, this.plugin.settings.firstDayOfWeek);
    this.currentYear = next.getFullYear();
    this.currentMonth = next.getMonth();
    await this.renderCalendarGrid();
  }
  /**
   * 选中日（日程视图专用）。入参是 YYYY-MM-DD 字符串而不是 Date：格子渲染时
   * 已经算好了 dateKey（与 taskMap 的键同格式），再转一次 Date 只会多一次往返；
   * 而且把 Date 传进来会被 formatDate 当成字符串直接抛错（实机点格子时踩到）。
   * 返回是否真的变了，调用方据此决定要不要重画。
   */
  selectDay(key) {
    if (!key || this.selectedDate === key) return false;
    this.selectedDate = key;
    // 周视图下点格子可能点到「锚点之外」的日期（跨月周里相邻周的日子不会出现在
    // 本视图，但日期选择器/明细区跳转会）：锚点跟着走，屏幕不留在原地
    if (this.isWeekFamily()) {
      const anchor = this.weekAnchor();
      if (weekStartFrom(dateFromStr(key), this.plugin.settings.firstDayOfWeek) !== anchor) {
        this.weekStart = weekStartFrom(dateFromStr(key), this.plugin.settings.firstDayOfWeek);
      }
    }
    return true;
  }
  /**
   * 明细区（v1.6.0 批次二）：日程视图的下半屏，读 selectedDate 那一天。
   * ------------------------------------------------------------
   * 结构：吸顶日期行（＋ 添加）→ 任务条目（勾选圈 + 原文 + 类别 pill，
   * 备注作为宿主的附属卡片跟在条目下方）。三件套之外一律不画：不渲染时间行、
   * 不渲染 priority-bg-*、不渲染跨天竖条（计划 §2.3 的颜色预算）。
   * 已完成任务照常列出（打勾 + 变暗），不跟随 showCompletedTasks 隐藏——
   * 格子里的圆点用的是完整 tasks，明细若藏掉已完成就会出现「格子有点、点开却说
   * 这天没安排」的自相矛盾，这条比省两行字重要。
   * 文本一律 textContent/createEl 构建，不拼 innerHTML（备注是用户数据）。
   */
  renderAgendaDetail(tasks) {
    if (!this.detailEl || !this.detailEl.isConnected) {
      this.detailEl = this.rootEl.createDiv("agenda-detail");
    }
    const detail = this.detailEl;
    detail.empty();
    const [y, m, d] = (this.selectedDate || "").split("-").map(Number);
    const dayDate = new Date(y, m - 1, d);
    // ---- 吸顶日期行 ----
    const headEl = detail.createDiv("agenda-day-head");
    const titleRow = headEl.createDiv("agenda-day-title");
    const weekday = [
      tr("modal.create.weekday.sun"), tr("modal.create.weekday.mon"), tr("modal.create.weekday.tue"),
      tr("modal.create.weekday.wed"), tr("modal.create.weekday.thu"), tr("modal.create.weekday.fri"),
      tr("modal.create.weekday.sat")
    ][dayDate.getDay()];
    titleRow.textContent = tr("modal.create.dateLine", { m, day: d, weekday });
    const holidayInfo = this.plugin.settings.showHoliday ? this.plugin.holidayManager.getHolidayInfo(dayDate) : null;
    if (holidayInfo) {
      titleRow.createSpan({ text: ` \xB7 ${translateHolidayName(holidayInfo.name)}` });
    }
    // 筛选中的类别以小 pill 挂在吸顶行右侧（＋ 添加左边）：不新增横条、不占额外高度，
    // 点它等于清除筛选（计划 §四.3 的防呆三处之一）。不用顶部横条是因为横条要从明细区扣 28px
    if (this.activeCategories && this.activeCategories.size > 0) {
      const chips = headEl.createDiv("agenda-filter-chips");
      for (const name of Array.from(this.activeCategories)) {
        const label = name === "" ? tr("modal.filter.untagged") : "#" + name;
        const chip = chips.createSpan({ cls: "agenda-filter-chip", text: label });
        chip.setAttribute("role", "button");
        chip.setAttribute("tabindex", "0");
        chip.setAttribute("aria-label", tr("view.agenda.clearFilterAria"));
        chip.setAttribute("title", tr("view.agenda.clearFilterAria"));
        if (name !== "") {
          chip.style.setProperty("--mt-cat-color", resolveCategoryColor(name, this.plugin.settings.categories));
        } else {
          chip.addClass("agenda-filter-chip-none");
        }
        const clear = (e) => {
          e.stopPropagation();
          this.setCategoryFilter(new Set());
          this.renderCalendarGrid();
        };
        chip.addEventListener("click", clear);
        chip.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            clear(e);
          }
        });
      }
    }
    // 吸顶行那颗按钮承担两件事，文案跟着状态走：
    //  - 这天有任务 → 「管理」＋列表图标。它打开的是同一个当天面板（列表 + 新建框），
    //    用户从那里编辑/跳转/删除。早期这里写的是「添加」＋加号，等于把入口钉死在
    //    "新建"上，于是「日程视图没有编辑功能」成了合理结论，并为此多加了一枚行铅笔。
    //  - 这天没任务 → 面板里没什么可管理，退回「添加」＋加号。
    const hasTasks = !!(tasks && tasks.length > 0);
    const addBtnLabel = hasTasks ? tr("view.agenda.manageDay") : tr("view.agenda.addOne");
    const addBtn = headEl.createDiv("agenda-add-btn");
    addBtn.setAttribute("role", "button");
    addBtn.setAttribute("tabindex", "0");
    addBtn.setAttribute("aria-label", addBtnLabel);
    addBtn.innerHTML = hasTasks ? AGENDA_MANAGE_ICON : AGENDA_ADD_ICON;
    addBtn.createSpan({ text: addBtnLabel });
    const startCreate = () => this.openCreateTaskModal(dayDate, tasks);
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startCreate();
    });
    addBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        startCreate();
      }
    });
    // ---- 空状态：不给空白框 ----
    if (!tasks || tasks.length === 0) {
      const emptyEl = detail.createDiv("agenda-empty");
      // 空态分两种：这天本来没安排 / 有内容但被当前筛掉了。文案不区分会让人以为
      // 筛选没生效（计划 §四.3）
      const filtering = this.activeCategories && this.activeCategories.size > 0;
      emptyEl.createDiv({
        cls: "agenda-empty-text",
        text: tr(filtering ? "view.agenda.emptyFiltered" : "view.agenda.emptyDay")
      });
      const emptyAdd = emptyEl.createDiv("agenda-add-btn");
      emptyAdd.setAttribute("role", "button");
      emptyAdd.setAttribute("tabindex", "0");
      emptyAdd.innerHTML = AGENDA_ADD_ICON;
      emptyAdd.createSpan({ text: tr("modal.create.add") });
      emptyAdd.addEventListener("click", startCreate);
      emptyAdd.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          startCreate();
        }
      });
      return;
    }
    // ---- 条目列表 ----
    const listEl = detail.createDiv("agenda-list");
    for (const task of tasks) {
      this.renderAgendaEntry(listEl, task, tasks, dayDate);
    }
  }
  /**
   * 一条任务 + 它的备注（备注是宿主的附属，不独立成条目——这样桌面端双列时
   * 两者永远同列，不会被网格拆到两个栏里）。
   * 无备注不画「＋ 写备注」幽灵行——它常年白占一行，明细区可显示的内容反而变少（反馈①）。
   * 行本身只承担一个动作：点开 = 打开这一天的面板（与吸顶行「管理」同一个界面，
   * 从列表里那条的铅笔进编辑）。早先这里另有一套「按行直开编辑态」的入口
   * （行铅笔 + 点行进单条编辑），它把同一个弹窗拆成"这一条"和"这一天"两副面孔，
   * 于是出现两个几乎一样的界面依次弹出；入口统一到「这一天」后已删除。
   */
  renderAgendaEntry(container, task, allTasks, dayDate) {
    const entryEl = container.createDiv("agenda-entry");
    const itemEl = entryEl.createDiv("agenda-item");
    if (task.completed) itemEl.addClass("completed");
    const checkEl = itemEl.createEl("input", {
      cls: "agenda-check",
      attr: { type: "checkbox", "aria-label": tr("modal.create.toggleComplete") }
    });
    checkEl.checked = task.completed;
    checkEl.addEventListener("change", async () => {
      // 写入期间禁用，防连点竞态；失败回滚勾选态（与弹窗列表同一套口径）
      if (checkEl.disabled) return;
      checkEl.disabled = true;
      try {
        await this.toggleTask(task);
      } finally {
        if (checkEl.isConnected) checkEl.disabled = false;
      }
    });
    // 点整行 = 直接编辑这一条（勾选圈只负责勾选，点它不触发整行动作）。
    // 真机反馈：点任务与点「管理」出来的是同一个新建态，想编辑还要再找铅笔——
    // "点击一步，却走了两步"。现在行点击带着 editTask 进面板，「管理」仍是新建态
    itemEl.addEventListener("click", (e) => {
      if (e.target === checkEl) return;
      this.openCreateTaskModal(dayDate, allTasks, task);
    });
    const textEl = itemEl.createEl("span", { cls: "agenda-text", text: task.content });
    textEl.setAttribute("title", task.content);
    // 类别 pill：明细区是整行宽，不需要格子里那条 3px 色带，直接写 #类别名。
    // 这里必须新写一套（.agenda-cat），不能沿用 .day-cell .task-category——
    // 后者在色带段里被 display:none 掉了
    if (task.category) {
      const catEl = itemEl.createSpan({ cls: "agenda-cat", text: `#${task.category}` });
      catEl.setAttribute("title", tr("view.cell.category", { category: task.category }));
      catEl.style.setProperty("--mt-cat-color", resolveCategoryColor(task.category, this.plugin.settings.categories));
    }
    // 行尾不再放铅笔：编辑入口收敛到「这一天」的面板里（见函数注释）
    // 只读备注卡片：有备注才出现。点它不做任何事（点行 = 编辑，读字不用弹窗），
    // 所以不再是 role=button，也不挂 tabindex
    if (task.note) {
      const noteEl = entryEl.createDiv("agenda-note");
      noteEl.textContent = task.note;
      noteEl.setAttribute("title", task.note);
    }
  }
  /** 切回条视图时明细区必须整块摘掉，留着会把网格挤成半屏 */
  removeAgendaDetail() {
    if (this.detailEl) {
      this.detailEl.remove();
      this.detailEl = null;
    }
  }
  /**
   * 把选中日收敛进当前月：含今天则选今天，否则选该月 1 号。
   * 换月（navigateMonth / 日期选择器 / goToToday）必须走这里，否则会出现
   * 「网格已是 11 月、明细还在 10 月 4 日」的错位。
   */
  convergeSelectedDate() {
    const today = new Date();
    if (today.getFullYear() === this.currentYear && today.getMonth() === this.currentMonth) {
      this.selectedDate = formatDate(today);
      return;
    }
    this.selectedDate = formatDate(new Date(this.currentYear, this.currentMonth, 1));
  }
};

/**
 * ============================================================
 * CreateTaskModal - 创建任务弹窗
 * ============================================================
 * 用于在月历视图中创建新任务
 * 
 * 表单字段：
 * - 任务内容（必填）：文本输入框
 * - 日期：日期选择器，默认选中当前点击的日期
 * - 时间（可选）：时间选择器
 * - 优先级：
 *   - 无：普通任务
 *   - 中：🟡黄色标记
 *   - 高：🔴红色标记
 * 
 * 任务格式：
 * - 创建到年度任务列表（任务/2026年任务列表.md）
 * - 自动按月份分组（## 2026年04月）
 * - 任务格式：- [ ] 任务名 📅 2026-04-21
 * ============================================================
 */
/**
 * ============================================================
 * DatePickerModal - 日期选择器
 * ============================================================
 * 月份导航弹窗，允许用户选择跳转的目标月份
 *
 * 实现：全部逻辑集中在 onOpen() 内（年份步进、12 个月份按钮、
 * 取消/确定），样式以行内 style 设置为主，选择结果经 onSubmit 回调。
 *
 * 样式类（styles.css 中仅 modal-buttons 有规则，其余为行内样式）：
 * - date-picker-modal：弹窗容器
 * - modal-title：标题
 * - picker-section / year-input-wrapper / month-grid：年份与月份区块
 * - modal-buttons：底部按钮组
 * ============================================================
 */
var DatePickerModal = class extends import_obsidian3.Modal {
  constructor(app, currentYear, currentMonth, onSubmit) {
    super(app);
    this.year = currentYear;
    this.month = currentMonth;
    this.onSubmit = onSubmit;
    const now = new Date();
    this.currentYear = now.getFullYear();
    this.currentMonth = now.getMonth();
  }
  
  // 检测是否为暗色模式
  isDarkMode() {
    return document.body.classList.contains('theme-dark');
  }
  
  onOpen() {
    // 登记活动实例：onunload 时关闭仍打开的弹窗，避免卸载后残留可交互但已失联的 DOM
    if (!DatePickerModal.activeInstances) DatePickerModal.activeInstances = /* @__PURE__ */ new Set();
    DatePickerModal.activeInstances.add(this);
    const { contentEl, modalEl } = this;
    const isDark = this.isDarkMode();
    
    modalEl.addClass("date-picker-modal");
    // 与 CreateTaskModal 一致：收掉框架自带的 X 关闭按钮与空头部占位（新版弹窗结构
    // .modal > .modal-header-button + .modal-header，会撑出顶部空白并显示冗余 X；
    // 关闭途径仍有取消/确定/ESC/遮罩/系统返回键）。
    // 注意：本弹窗内容构建在 contentEl（.modal-content）内，故不移除 .modal-content/.modal-title
    const sweepChrome = () => {
      if (!this.containerEl) return;
      this.containerEl.querySelectorAll(".modal-header-button, .modal-close-button").forEach((el) => el.remove());
      const header = this.modalEl.querySelector(":scope > .modal-header");
      if (header) header.remove();
    };
    sweepChrome();
    requestAnimationFrame(sweepChrome);
    setTimeout(sweepChrome, 100);
    modalEl.style.background = "var(--background-primary)";
    modalEl.style.padding = "32px";
    modalEl.style.borderRadius = "24px";
    modalEl.style.width = "420px";
    modalEl.style.maxWidth = "92vw";
    modalEl.style.border = "none";
    modalEl.style.boxShadow = isDark 
      ? "0 25px 80px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)"
      : "0 25px 80px rgba(0, 0, 0, 0.35)";
    modalEl.style.margin = "auto";
    contentEl.empty();
    
    // 颜色配置
    const colors = isDark ? {
      text: '#e2e8f0',
      textMuted: '#94a3b8',
      bg: '#1e293b',
      bgLight: '#334155',
      border: '#475569',
      inputBg: '#1e293b',
      inputBorder: '#475569',
      btnBg: '#334155',
      btnHover: '#475569',
      btnCancel: '#334155',
      btnCancelHover: '#475569',
      wrapperBg: '#334155',
      wrapperBorder: '#475569'
    } : {
      text: '#374151',
      textMuted: '#6B7280',
      bg: '#F9FAFB',
      bgLight: '#F3F4F6',
      border: '#E5E7EB',
      inputBg: 'white',
      inputBorder: '#D1D5DB',
      btnBg: '#F9FAFB',
      btnHover: '#F3F4F6',
      btnCancel: '#F1F5F9',
      btnCancelHover: '#E2E8F0',
      wrapperBg: '#F9FAFB',
      wrapperBorder: '#E5E7EB'
    };
    
    // 标题
    const titleEl = contentEl.createDiv("modal-title");
    titleEl.textContent = tr("modal.date.title");
    titleEl.style.fontSize = "20px";
    titleEl.style.fontWeight = "700";
    titleEl.style.textAlign = "center";
    titleEl.style.marginBottom = "28px";
    titleEl.style.paddingBottom = "20px";
    titleEl.style.borderBottom = "2px solid var(--background-modifier-border)";
    titleEl.style.color = "var(--text-normal)";
    
    // 年份区域
    const yearSection = contentEl.createDiv("picker-section");
    yearSection.style.marginBottom = "28px";
    
    const yearLabel = yearSection.createEl("div", { text: tr("modal.date.year") });
    yearLabel.style.fontSize = "13px";
    yearLabel.style.fontWeight = "600";
    yearLabel.style.color = colors.textMuted;
    yearLabel.style.textAlign = "center";
    yearLabel.style.marginBottom = "16px";
    
    const yearInputWrapper = yearSection.createDiv("year-input-wrapper");
    yearInputWrapper.style.display = "flex";
    yearInputWrapper.style.alignItems = "center";
    yearInputWrapper.style.justifyContent = "center";
    yearInputWrapper.style.gap = "16px";
    yearInputWrapper.style.padding = "8px";
    
    const yearDecBtn = yearInputWrapper.createEl("button", { text: "\u2212" });
    yearDecBtn.style.width = "40px";
    yearDecBtn.style.height = "40px";
    yearDecBtn.style.fontSize = "18px";
    yearDecBtn.style.fontWeight = "600";
    yearDecBtn.style.color = colors.text;
    yearDecBtn.style.background = colors.inputBg;
    yearDecBtn.style.border = `2px solid ${colors.inputBorder}`;
    yearDecBtn.style.borderRadius = "10px";
    yearDecBtn.style.cursor = "pointer";
    yearDecBtn.style.display = "flex";
    yearDecBtn.style.alignItems = "center";
    yearDecBtn.style.justifyContent = "center";
    yearDecBtn.style.transition = "all 0.2s ease";
    yearDecBtn.style.outline = "none";
    yearDecBtn.style.boxShadow = "none";
    
    const yearInput = yearInputWrapper.createEl("input", {
      attr: {
        type: "number",
        value: String(this.year),
        min: "1900",
        max: "2100"
      }
    });
    yearInput.style.width = "120px";
    yearInput.style.height = "40px";
    yearInput.style.padding = "0 14px";
    yearInput.style.fontSize = "20px";
    yearInput.style.fontWeight = "700";
    yearInput.style.textAlign = "center";
    yearInput.style.color = colors.text;
    yearInput.style.background = colors.inputBg;
    yearInput.style.border = `2px solid ${colors.inputBorder}`;
    yearInput.style.borderRadius = "10px";
    yearInput.style.outline = "none";
    yearInput.style.transition = "all 0.2s ease";
    yearInput.style.boxSizing = "border-box";
    
    const yearIncBtn = yearInputWrapper.createEl("button", { text: "+" });
    yearIncBtn.style.width = "40px";
    yearIncBtn.style.height = "40px";
    yearIncBtn.style.fontSize = "18px";
    yearIncBtn.style.fontWeight = "600";
    yearIncBtn.style.color = colors.text;
    yearIncBtn.style.background = colors.inputBg;
    yearIncBtn.style.border = `2px solid ${colors.inputBorder}`;
    yearIncBtn.style.borderRadius = "10px";
    yearIncBtn.style.cursor = "pointer";
    yearIncBtn.style.display = "flex";
    yearIncBtn.style.alignItems = "center";
    yearIncBtn.style.justifyContent = "center";
    yearIncBtn.style.transition = "all 0.2s ease";
    yearIncBtn.style.outline = "none";
    yearIncBtn.style.boxShadow = "none";
    
    const currentYearHint = yearSection.createEl("div", {
      text: tr("modal.date.currentYear", { year: this.currentYear })
    });
    currentYearHint.style.textAlign = "center";
    currentYearHint.style.fontSize = "12px";
    currentYearHint.style.color = colors.textMuted;
    currentYearHint.style.marginTop = "12px";
    currentYearHint.style.fontWeight = "500";
    
    // 按钮悬停效果
    const btnHoverStyle = (btn) => {
      btn.addEventListener("mouseenter", () => {
        btn.style.background = isDark ? "rgba(59, 130, 246, 0.2)" : "#EFF6FF";
        btn.style.borderColor = isDark ? "rgba(59, 130, 246, 0.5)" : "#93C5FD";
        btn.style.color = "#60a5fa";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = colors.inputBg;
        btn.style.borderColor = colors.inputBorder;
        btn.style.color = colors.text;
      });
    };
    btnHoverStyle(yearDecBtn);
    btnHoverStyle(yearIncBtn);
    
    yearDecBtn.addEventListener("click", () => {
      this.year = Math.max(1900, this.year - 1);
      yearInput.value = String(this.year);
      refreshMonthStyles();
    });
    yearIncBtn.addEventListener("click", () => {
      this.year = Math.min(2100, this.year + 1);
      yearInput.value = String(this.year);
      refreshMonthStyles();
    });
    yearInput.addEventListener("change", () => {
      let val = parseInt(yearInput.value);
      if (isNaN(val)) val = this.currentYear;
      val = Math.max(1900, Math.min(2100, val));
      this.year = val;
      yearInput.value = String(val);
      refreshMonthStyles();
    });
    
    // 月份区域
    const monthSection = contentEl.createDiv("picker-section");
    monthSection.style.marginBottom = "28px";
    
    const monthLabel = monthSection.createEl("div", { text: tr("modal.date.month") });
    monthLabel.style.fontSize = "13px";
    monthLabel.style.fontWeight = "600";
    monthLabel.style.color = colors.textMuted;
    monthLabel.style.textAlign = "center";
    monthLabel.style.marginBottom = "16px";
    
    const monthGrid = monthSection.createDiv("month-grid");
    monthGrid.style.display = "grid";
    monthGrid.style.gridTemplateColumns = "repeat(4, 1fr)";
    monthGrid.style.gap = "12px";
    
    const monthLabels = monthNames();
    
    // 月份按钮着色集中在这里：绿色=当前选中，蓝色=今天所在月（仅当年）。
    // 年份 +/- 、输入变化、点击选中后都调用它整体重绘，
    // 否则旧高亮会残留在已切换走的年份视图上
    const refreshMonthStyles = () => {
      monthGrid.querySelectorAll("button").forEach((btn, idx) => {
        btn.style.color = colors.text;
        btn.style.background = colors.wrapperBg;
        btn.style.borderColor = "transparent";
        btn.style.boxShadow = "none";
        btn.style.transform = "none";
        if (idx === this.month) {
          // 选中月份 - 绿色（与今天所在月重合时优先显示选中）
          btn.style.color = "white";
          btn.style.background = "linear-gradient(135deg, #10b981, #059669)";
          btn.style.borderColor = "#34d399";
          btn.style.boxShadow = "0 0 0 3px rgba(16, 185, 129, 0.2), 0 4px 12px rgba(16, 185, 129, 0.35)";
          btn.style.transform = "scale(1.05)";
        } else if (this.year === this.currentYear && idx === this.currentMonth) {
          // 今天所在月（须同年）- 蓝色
          btn.style.color = "white";
          btn.style.background = "linear-gradient(135deg, #3b82f6, #2563eb)";
          btn.style.borderColor = "#60a5fa";
          btn.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.2), 0 4px 12px rgba(59, 130, 246, 0.35)";
          btn.style.transform = "scale(1.05)";
        }
      });
    };

    for (let m = 0; m < 12; m++) {
      const monthBtn = monthGrid.createEl("button", { text: monthLabels[m] });
      monthBtn.style.padding = "16px 8px";
      monthBtn.style.fontSize = "14px";
      monthBtn.style.fontWeight = "600";
      monthBtn.style.borderRadius = "12px";
      monthBtn.style.cursor = "pointer";
      monthBtn.style.border = "2px solid transparent";
      monthBtn.style.transition = "all 0.2s ease";
      monthBtn.style.display = "flex";
      monthBtn.style.alignItems = "center";
      monthBtn.style.justifyContent = "center";
      monthBtn.style.outline = "none";
      monthBtn.style.boxShadow = "none";
      
      monthBtn.addEventListener("mouseenter", () => {
        if (!(this.year === this.currentYear && m === this.currentMonth) && m !== this.month) {
          monthBtn.style.background = colors.btnHover;
          monthBtn.style.transform = "translateY(-2px)";
          monthBtn.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.1)";
        }
      });
      
      monthBtn.addEventListener("mouseleave", () => {
        if (!(this.year === this.currentYear && m === this.currentMonth) && m !== this.month) {
          monthBtn.style.background = colors.wrapperBg;
          monthBtn.style.transform = "none";
          monthBtn.style.boxShadow = "none";
        }
      });
      
      monthBtn.addEventListener("click", () => {
        this.month = m;
        refreshMonthStyles();
      });
    }
    refreshMonthStyles();
    
    // 按钮组
    const btnGroup = contentEl.createDiv("modal-buttons");
    btnGroup.style.display = "flex";
    btnGroup.style.gap = "16px";
    btnGroup.style.justifyContent = "center";
    btnGroup.style.marginTop = "8px";
    
    const cancelBtn = btnGroup.createEl("button", { text: tr("modal.create.cancel") });
    cancelBtn.style.padding = "14px 32px";
    cancelBtn.style.fontSize = "15px";
    cancelBtn.style.fontWeight = "600";
    cancelBtn.style.borderRadius = "12px";
    cancelBtn.style.cursor = "pointer";
    cancelBtn.style.border = "none";
    cancelBtn.style.minWidth = "100px";
    cancelBtn.style.background = colors.btnCancel;
    cancelBtn.style.color = isDark ? "#94a3b8" : "#64748B";
    cancelBtn.style.transition = "all 0.2s ease";
    
    cancelBtn.addEventListener("mouseenter", () => {
      cancelBtn.style.background = colors.btnCancelHover;
      cancelBtn.style.color = isDark ? "#e2e8f0" : "#475569";
    });
    cancelBtn.addEventListener("mouseleave", () => {
      cancelBtn.style.background = colors.btnCancel;
      cancelBtn.style.color = isDark ? "#94a3b8" : "#64748B";
    });
    cancelBtn.addEventListener("click", () => this.close());
    
    const confirmBtn = btnGroup.createEl("button", { text: tr("modal.date.confirm") });
    confirmBtn.style.padding = "14px 32px";
    confirmBtn.style.fontSize = "15px";
    confirmBtn.style.fontWeight = "600";
    confirmBtn.style.borderRadius = "12px";
    confirmBtn.style.cursor = "pointer";
    confirmBtn.style.border = "none";
    confirmBtn.style.minWidth = "100px";
    confirmBtn.style.background = "linear-gradient(135deg, #3b82f6, #2563eb)";
    confirmBtn.style.color = "white";
    confirmBtn.style.boxShadow = "0 4px 14px rgba(59, 130, 246, 0.35)";
    confirmBtn.style.transition = "all 0.2s ease";
    
    confirmBtn.addEventListener("mouseenter", () => {
      confirmBtn.style.background = "linear-gradient(135deg, #2563eb, #1d4ed8)";
      confirmBtn.style.transform = "translateY(-1px)";
      confirmBtn.style.boxShadow = "0 6px 20px rgba(59, 130, 246, 0.45)";
    });
    confirmBtn.addEventListener("mouseleave", () => {
      confirmBtn.style.background = "linear-gradient(135deg, #3b82f6, #2563eb)";
      confirmBtn.style.transform = "none";
      confirmBtn.style.boxShadow = "0 4px 14px rgba(59, 130, 246, 0.35)";
    });
    confirmBtn.addEventListener("click", () => {
      // 防止双击导致 onSubmit 触发两次（close 异步前仍可接收点击）
      if (confirmBtn.disabled) return;
      confirmBtn.disabled = true;
      this.onSubmit(this.year, this.month);
      this.close();
    });
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    if (DatePickerModal.activeInstances && DatePickerModal.activeInstances.has(this)) {
      DatePickerModal.activeInstances.delete(this);
    }
  }
};

/**
 * ============================================================
 * CreateTaskModal - 创建任务弹窗
 * ============================================================
 * 用于在月历视图中创建新任务
 * 
 * 表单字段：
 * - 任务内容（必填）：文本输入框
 * - 日期：日期选择器，默认选中当前点击的日期
 * - 时间（可选）：时间选择器
 * - 优先级：
 *   - 无：普通任务
 *   - 中：🟡黄色标记
 *   - 高：🔴红色标记
 * 
 * 任务格式：
 * - 创建到年度任务列表（任务/2026年任务列表.md）
 * - 自动按月份分组（## 2026年04月）
 * - 任务格式：- [ ] 任务名 📅 2026-04-21
 * ============================================================
 */

/**
 * ============================================================
 * CategoryFilterModal - 类别筛选面板（真机反馈：浮层改挂 Modal）
 * ============================================================
 * 锚定漏斗按钮下方居中显示；多选即时生效、面板保持打开；
 * 「全部」为终结性重置，点完即关。关闭途径：系统返回键 / Esc / 点遮罩。
 * ============================================================
 */
/** v1.5.3：用户要求减少动效时，筛选面板跳过进/出场动画（其余交互不变） */
function CF_MOTION_OFF() {
  try {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (e) {
    return false;
  }
}

/**
 * v1.5.3：WAAPI 动画的 startTime 要等合成器出帧才结算；页面不可见/合成暂停时
 * 动画会永远停在 pending 首帧（实测视图 detach 重开后 startTime 恒为 null、
 * opacity 不动）。显式对齐到当前时间线，动画立即按时间推进，观感不受影响。
 */
function CF_KICK(anim) {
  try {
    if (anim && anim.startTime === null)
      anim.startTime = document.timeline.currentTime;
  } catch (e) {
  }
  return anim;
}

var CategoryFilterModal = class extends import_obsidian3.Modal {
  constructor(app, view, anchorEl) {
    super(app);
    this.view = view;
    this.anchorEl = anchorEl;
  }
  onOpen() {
    if (!CategoryFilterModal.activeInstances) CategoryFilterModal.activeInstances = /* @__PURE__ */ new Set();
    CategoryFilterModal.activeInstances.add(this);
    const { modalEl } = this;
    modalEl.addClass("category-filter-modal");
    const sweepChrome = () => {
      if (!this.containerEl) return;
      this.containerEl.querySelectorAll(".modal-header-button, .modal-close-button").forEach((el) => el.remove());
      const header = this.modalEl.querySelector(":scope > .modal-header");
      if (header) header.remove();
    };
    sweepChrome();
    requestAnimationFrame(sweepChrome);
    setTimeout(sweepChrome, 100);
    // v1.5.3 流畅性：先量尺寸再定位。旧序是「定位→画行→rAF 再修正」，
    // 面板会先跳到一个偏小的位置再撑开，观感上是一次突兀的位移。
    // 现在按行数预估尺寸，同帧完成定位，行渲染不再改变盒尺寸位置。
    this.renderRows();
    this.positionAt(modalEl, true);

    // v1.5.3：进/出场动画改用 Web Animations API（el.animate），而不是「加类 + CSS 过渡」。
    // 实测后者在本弹窗上不可靠：同一 JS 任务里改类再读计算样式，浏览器把两个状态
    // 当作首帧样式直接结算，过渡不触发（getAnimations() 为空、opacity 从 1 直接跳到 0）。
    // WAAPI 是显式时间线，动画一定跑，且能被 getAnimations() 验证，也便于减少动效时跳过。
    this.playEnter(modalEl);
  }
  /** 锚定到漏斗按钮正下方；越界翻到上方 / 收进屏内 */
  positionAt(modalEl, prefill = false) {
    modalEl.style.position = "fixed";
    modalEl.style.margin = "0";
    modalEl.style.top = "auto";
    modalEl.style.left = "auto";
    modalEl.style.width = "auto";
    modalEl.style.maxWidth = "92vw";

    // 预估尺寸（首帧定位前）：宽度=内容 min-width 180 + 内边距，高度=标题+行高×行数
    if (prefill) {
      const rows = (this.view.scanCategories().length || 0) + 2;
      modalEl.style.minWidth = "196px";
      modalEl.style.minHeight = `${Math.min(8 + 30 + rows * 34, window.innerHeight - 16)}px`;
    }
    const rect = this.anchorEl && this.anchorEl.getBoundingClientRect();
    const render = () => {
      let flipped = false;
      if (!modalEl.isConnected || !rect)
        return;
      const w = modalEl.offsetWidth || 200;
      const h = modalEl.offsetHeight || 200;
      let left = rect.left + rect.width / 2 - w / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      let top = rect.bottom + 6;
      // v1.5.3：贴底放不下就翻到按钮上方，缩放原点跟着换到底边中线，
      // 动画才始终"从按钮长出来"。注意必须带大括号——早前少写花括号时
      // flipped 恒为 true，原点永远是底边（自查发现）。
      if (top + h > window.innerHeight - 8) {
        top = Math.max(8, rect.top - h - 6);
        flipped = true;
      }
      modalEl.style.left = `${left}px`;
      modalEl.style.top = `${top}px`;

      modalEl.classList.toggle("cf-flip-up", flipped);
      // 定位完成后解除预估高度，避免面板比内容高一块
      modalEl.style.minHeight = "";
    };
    render();
    requestAnimationFrame(render);
  }
  renderRows() {
    if (this.isClosed) return;  // v1.5.3：淡出期间不再重渲染（动画期网格可能仍在刷新）
    const V = this.view;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("category-filter-popup");

    // v1.5.3 筛选面板美化：标题行 + 细分隔线；多选不自动关的语义不变。
    // 标题不参与逐行重建（renderRows 每次 empty() 后重画，成本可忽略）
    const titleRow = contentEl.createDiv("category-filter-title");
    titleRow.createSpan({ text: tr("modal.filter.title") });
    const selN = (V.activeCategories ? V.activeCategories.size : 0);
    titleRow.createSpan({
      cls: "category-filter-count",
      text: selN > 0 ? tr("modal.filter.selected", { n: selN }) : (V.scanCategories().length > 0 ? tr("modal.filter.all") : ""),
    });
    contentEl.createDiv("category-filter-sep");
    const cats = V.scanCategories();
    const active = V.activeCategories;
    const c0 = V.taskParser.cache;
    const hasUntagged = !!(c0 && c0.tasks && c0.tasks.some((t) => !t.category));
    const mkRow = (label, checked, color, onPick, noneDot) => {
      const row = contentEl.createDiv("category-filter-item");
      if (checked)
        row.addClass("selected");
      const dot = row.createDiv("category-dot");
      if (color) {
        dot.style.setProperty("--mt-cat-color", color);
        // v1.5.3：选中行左侧细条读行上的变量，故行也要写
        row.style.setProperty("--mt-cat-color", color);
      }
      else if (noneDot)
        dot.addClass("category-dot-none");
      else
        dot.addClass("category-dot-all");
      row.createDiv("category-name").textContent = label;
      const checkEl = row.createDiv("category-check");
      if (checked)
        checkEl.textContent = "\u2713";
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        onPick();
      });
    };
    mkRow(tr("modal.filter.all"), active.size === 0, null, () => {
      V.setCategoryFilter(/* @__PURE__ */ new Set());
      V.renderCalendarGrid();
      // 「全部」= 终结性重置，点完即关
      this.close();
    });
    if (hasUntagged) {
      mkRow(tr("modal.filter.untagged"), active.has(""), null, () => {
        const next = new Set(active);
        if (next.has("")) next.delete("");
        else next.add("");
        V.setCategoryFilter(next);
        V.renderCalendarGrid();
        this.renderRows();
      }, true);
    }
    for (const name of cats) {
      const color = resolveCategoryColor(name, V.plugin.settings.categories);
      mkRow(`#${name}`, active.has(name), color, () => {
        const next = new Set(active);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        V.setCategoryFilter(next);
        V.renderCalendarGrid();
        this.renderRows();
      });
    }
  }
  /**
   * v1.5.3：进场动画——从漏斗按钮一侧淡入 + 轻微位移缩放，160ms。
   * 缩放原点由 .cf-flip-up（面板翻到按钮上方时）决定，见 styles.css。
   */
  playEnter(modalEl) {
    if (CF_MOTION_OFF())
      return;
    try {
      CF_KICK(modalEl.animate([
        { opacity: 0, transform: "translateY(-6px) scale(0.96)" },
        { opacity: 1, transform: "none" },
      ], { duration: 160, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" }));
    } catch (e) {
    }
  }
  /** 出场动画：与进场对称的淡出微缩，遮罩同步淡到透明 */
  playLeave(modalEl, container) {
    const bg = container.querySelector(".modal-bg");
    try {
      const a1 = CF_KICK(modalEl.animate([
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "translateY(-5px) scale(0.97)" },
      ], { duration: 150, easing: "ease", fill: "forwards" }));
      if (bg)
        CF_KICK(bg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: "ease", fill: "forwards" }));
      // 保持可见直到动画结束（fill:forwards 已停在终态），随后由 close() 的定时器卸载
      void a1;
    } catch (e) {
    }
  }
  /**
   * v1.5.3 流畅性：接管收起动画。
   * 框架的 close() 在 onClose() 之后同步 remove 掉 .modal-container，淡出没有播放
   * 窗口（实测 Esc 后 30ms DOM 已空）。故覆写 close()：先用 WAAPI 播完 150ms 淡出，
   * 再调父类真正卸载。isClosed 挡住动画期间的逐行重渲染；activeInstances 立即
   * 摘除，动画期间再点漏斗能正常开新面板（互斥逻辑视其为已关）。
   */
  close() {
    if (this.closing)
      return;
    this.closing = true;
    this.isClosed = true;
    if (CategoryFilterModal.activeInstances)
      CategoryFilterModal.activeInstances.delete(this);
    const container = this.containerEl;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (container && container.isConnected && !reduce) {
      // 面板淡出微缩 + 遮罩淡出并行；两者都播完（或最迟 LEAVE_MS 超时兜底）才真正卸载
      this.playLeave(this.modalEl, container);
      setTimeout(() => {
        try { super.close(); } catch (e) {
        }
      }, 160);
    } else {
      super.close();
    }
  }
  onClose() {
    this.contentEl.empty();
    if (CategoryFilterModal.activeInstances && CategoryFilterModal.activeInstances.has(this)) {
      CategoryFilterModal.activeInstances.delete(this);
    }
  }
};

/**
 * ============================================================
 * ViewMenuModal - 视图选择菜单（v1.7.0）
 * ============================================================
 * 刻意不重新发明面板：与 CategoryFilterModal 同一套锚定 Modal 骨架
 * （sweepChrome 摘掉 Obsidian 自带标题栏/关闭钮、positionAt 先量尺寸再定位、
 * playEnter/playLeave 走 WAAPI 并尊重 prefers-reduced-motion、activeInstances
 * 做互斥与「再点一次=收起」）。好处：手机上系统返回键/Esc/遮罩点击天然可关，
 * 这条是 v1.5.x 用真机踩出来的教训，不该在新面板上重犯。
 * 单选语义：点一行即切视图并收起面板，当前视图行打勾 + 左侧细条强调。
 */
var ViewMenuModal = class extends import_obsidian3.Modal {
  constructor(app, view, anchorEl) {
    super(app);
    this.view = view;
    this.anchorEl = anchorEl;
  }
  onOpen() {
    if (!ViewMenuModal.activeInstances) ViewMenuModal.activeInstances = /* @__PURE__ */ new Set();
    ViewMenuModal.activeInstances.add(this);
    const { modalEl } = this;
    modalEl.addClass("category-filter-modal");
    modalEl.addClass("view-menu-modal");
    const sweepChrome = () => {
      if (!this.containerEl) return;
      this.containerEl.querySelectorAll(".modal-header-button, .modal-close-button").forEach((el) => el.remove());
      const header = this.modalEl.querySelector(":scope > .modal-header");
      if (header) header.remove();
    };
    sweepChrome();
    requestAnimationFrame(sweepChrome);
    setTimeout(sweepChrome, 100);
    this.renderRows();
    this.positionAt(modalEl, true);
    this.playEnter(modalEl);
  }
  positionAt(modalEl, prefill = false) {
    modalEl.style.position = "fixed";
    modalEl.style.margin = "0";
    modalEl.style.top = "auto";
    modalEl.style.left = "auto";
    modalEl.style.width = "auto";
    modalEl.style.maxWidth = "92vw";
    if (prefill) {
      // 预估尺寸只为压掉首帧跳动：行数 = 视图数 + 标题
      const rows = VIEW_MODES.length + 1;
      modalEl.style.minWidth = "232px";
      modalEl.style.minHeight = `${Math.min(8 + 30 + rows * 46, window.innerHeight - 16)}px`;
    }
    const rect = this.anchorEl && this.anchorEl.getBoundingClientRect();
    const render = () => {
      let flipped = false;
      if (!modalEl.isConnected || !rect)
        return;
      const w = modalEl.offsetWidth || 232;
      const h = modalEl.offsetHeight || 200;
      // 视图按钮在顶栏右侧：面板按按钮中线展开，越界则整体左移贴边（右侧留 8px）
      let left = rect.left + rect.width / 2 - w / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      let top = rect.bottom + 6;
      if (top + h > window.innerHeight - 8) {
        top = Math.max(8, rect.top - h - 6);
        flipped = true;
      }
      modalEl.style.left = `${left}px`;
      modalEl.style.top = `${top}px`;
      modalEl.classList.toggle("cf-flip-up", flipped);
      modalEl.style.minHeight = "";
    };
    render();
    requestAnimationFrame(render);
  }
  renderRows() {
    if (this.isClosed) return;
    const V = this.view;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("category-filter-popup", "view-menu-popup");
    const titleRow = contentEl.createDiv("category-filter-title");
    titleRow.createSpan({ text: tr("view.menu.title") });
    contentEl.createDiv("category-filter-sep");
    const cur = V.plugin.settings.viewMode;
    for (const mode of VIEW_MODES) {
      const row = contentEl.createDiv("category-filter-item vm-row");
      const on = mode === cur;
      if (on)
        row.addClass("selected");
      row.style.setProperty("--mt-cat-color", "var(--primary-500)");
      const iconEl = row.createDiv("vm-icon");
      iconEl.innerHTML = AGENDA_TOGGLE_ICONS[mode] || AGENDA_TOGGLE_ICONS.list;
      const textBox = row.createDiv("vm-text");
      textBox.createDiv("vm-name").textContent = viewModeLabel(mode);
      textBox.createDiv("vm-desc").textContent = tr("view.mode.desc." + mode);
      const checkEl = row.createDiv("category-check");
      if (on)
        checkEl.textContent = "\u2713";
      row.setAttribute("role", "button");
      row.setAttribute("aria-pressed", on ? "true" : "false");
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        this.close();
        V.setViewMode(mode);
      });
    }
  }
  playEnter(modalEl) {
    if (CF_MOTION_OFF())
      return;
    try {
      CF_KICK(modalEl.animate([
        { opacity: 0, transform: "translateY(-6px) scale(0.96)" },
        { opacity: 1, transform: "none" },
      ], { duration: 160, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" }));
    } catch (e) {
    }
  }
  playLeave(modalEl, container) {
    const bg = container.querySelector(".modal-bg");
    try {
      const a1 = CF_KICK(modalEl.animate([
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "translateY(-5px) scale(0.97)" },
      ], { duration: 150, easing: "ease", fill: "forwards" }));
      if (bg)
        CF_KICK(bg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: "ease", fill: "forwards" }));
      void a1;
    } catch (e) {
    }
  }
  close() {
    if (this.closing)
      return;
    this.closing = true;
    this.isClosed = true;
    if (ViewMenuModal.activeInstances)
      ViewMenuModal.activeInstances.delete(this);
    const container = this.containerEl;
    if (container && container.isConnected && !CF_MOTION_OFF()) {
      this.playLeave(this.modalEl, container);
      setTimeout(() => {
        try { super.close(); } catch (e) {
        }
      }, 160);
    } else {
      super.close();
    }
  }
  onClose() {
    this.contentEl.empty();
    if (ViewMenuModal.activeInstances && ViewMenuModal.activeInstances.has(this)) {
      ViewMenuModal.activeInstances.delete(this);
    }
  }
};

var CreateTaskModal = class extends import_obsidian3.Modal {
  constructor(app, date, onSubmit, plugin, existingTasks = [], editTask = null) {
    super(app);
    this.app = app;
    this.date = date;
    // 日期选择器的全局 click 关闭处理器，需在 close() 中清理避免泄漏
    this.datePickerCloseHandler = null;
    this.onSubmit = onSubmit;
    this.plugin = plugin;
    this.existingTasks = existingTasks;
    // 批次三：编辑目标任务（null=创建态）。同弹窗类内分支，不新增第二个弹窗类；
    // 预填全部在 onOpen 构建期完成（打开方式=以任务锚点日期重建本弹窗）
    this.editingTask = editTask;
    // 删除操作串行化链：避免并发删除时基于旧行号操作导致删错行
    this.deleteChain = Promise.resolve();
  }
  onOpen() {
    // 继承 Obsidian Modal：移动端系统返回键、ESC、点击遮罩关闭均由框架自动处理
    // 保存当前焦点元素，便于关闭后恢复焦点（无障碍/键盘导航）
    this.previouslyFocused = document.activeElement;
    const self = this;
    this.modalEl.addClass("create-task-modal");
    // 收掉 Modal 框架自带的空标题/内容占位（移动端会撑出弹窗顶部一大块空白）
    // 与右上角关闭按钮（已有取消按钮 + 返回键 + 点遮罩三种关闭方式，X 冗余）。
    // 注意：display:none 可能被主题/框架的 !important 压过、关闭按钮也可能在 onOpen 后才挂载，
    // 故直接从 DOM 移除（remove 对任何 CSS 免疫），并按 rAF/setTimeout 延迟重试
    if (this.titleEl && this.titleEl.parentElement) this.titleEl.remove();
    if (this.contentEl && this.contentEl.parentElement) this.contentEl.remove();
    const killCloseBtns = () => {
      if (!this.containerEl) return;
      // 该 Obsidian 版本的弹窗结构：.modal > [.modal-header-button(X 关闭钮) + .modal-header(>.modal-title) + .modal-content]
      // 这些框架装饰本弹窗全部不用：X 由返回键/取消/遮罩替代，头部与内容占位为空且会撑出顶部空白
      // （真机调试确认：X 类名不含 "close"，按结构精确移除，与旧日期弹窗的 sweepChrome 同口径；
      //  不用类名正则启发式扫描，避免未来弹窗内容新增含 close/header 字样的类名被误删）
      this.containerEl.querySelectorAll(".modal-header-button, .modal-header, .modal-title, .modal-content, .modal-close-button").forEach((el) => el.remove());
    };
    killCloseBtns();
    requestAnimationFrame(killCloseBtns);
    setTimeout(killCloseBtns, 100);
    setTimeout(killCloseBtns, 500);
    // 框架在移动端会给 .modal 预留内边距，弹窗内容自带留白，归零以复用原设计的间距
    this.modalEl.style.padding = "0";
    // v1.6.0 手机端反馈版：备注编辑从「明细区就地编辑」迁到本弹窗。
    // 声明提到函数级：日期抬头（下方）与备注区（任务输入框之后）两段都要读写它
    let noteHasContent = !!(this.editingTask && this.editingTask.note);
    let noteOpen = noteHasContent;
    let noteText = null;
    let applyNoteOpen = null;
    const dateInfoEl = this.modalEl.createDiv("modal-date-info");
    const weekday = [tr("modal.create.weekday.sun"), tr("modal.create.weekday.mon"), tr("modal.create.weekday.tue"), tr("modal.create.weekday.wed"), tr("modal.create.weekday.thu"), tr("modal.create.weekday.fri"), tr("modal.create.weekday.sat")][this.date.getDay()];
    const holidayInfo = this.plugin.holidayManager.getHolidayInfo(this.date);
    // 用 createEl + textContent 构建子节点，避免 holidayInfo.name（来自第三方 API / 用户可编辑数据）造成 XSS
    const dateMainEl = dateInfoEl.createDiv("date-main");
    dateMainEl.textContent = tr("modal.create.dateLine", { m: this.date.getMonth() + 1, day: this.date.getDate(), weekday: weekday });
    if (holidayInfo) {
      dateMainEl.createSpan({ text: ` \xB7 ${translateHolidayName(holidayInfo.name)}` });
    }
    if (this.existingTasks.length > 0) {
      const existingTasksEl = this.modalEl.createDiv("modal-existing-tasks");
      const titleRow = existingTasksEl.createDiv("existing-tasks-title-row");
      titleRow.createEl("div", { cls: "existing-tasks-title", text: tr("modal.create.existingCount", { n: this.existingTasks.length }) });
      // v1.5.2 曾因"列表吃掉输入框"按视口宽度默认折叠；现在这个面板是唯一的
      // 任务管理入口（编辑/跳转/删除都从这里进），折叠就等于把入口藏起来——
      // 用户看不到"这里能改"，于是又去别处加按钮。改为默认展开，
      // 折叠开关保留（想腾地方时仍可手动收）。
      // v1.5.4 真机反馈：折叠开关原来只有一颗 11px 的 ▾ 字符，窄屏上几乎看不见，
      // 也没有"可点"的暗示。改成胶囊按钮（chevron 图标 + 展开/收起 文案），整行仍可点，
      // 并补 role/tabindex/键盘：胶囊用 span 而非 button，避免点击冒泡到整行造成二次切换
      titleRow.setAttribute("role", "button");
      titleRow.setAttribute("tabindex", "0");
      const toggleEl = titleRow.createSpan({ cls: "existing-tasks-toggle" });
      import_obsidian3.setIcon(toggleEl, "chevron-down");
      const toggleTextEl = toggleEl.createSpan({ text: tr("modal.create.expand") });
      // v1.6.2 真机反馈：默认展开改回「按设置阈值决定」——当天任务数超过设置里的
      // 「每日任务显示数量」时默认收起，把首屏留给表单；没超过就默认展开。
      // 例外：带着编辑目标进来时恒展开——列表里的 .editing 高亮是"我在改哪条"
      // 的唯一指示，收起来等于把这条信息藏了（v1.6.0 的教训仍然成立）
      const listLimit = this.plugin.settings.tasksPerDayLimit;
      let listOpen = !!this.editingTask || this.existingTasks.length <= listLimit;
      const applyListOpen = () => {
        tasksListEl.style.display = listOpen ? "" : "none";
        toggleEl.toggleClass("is-open", listOpen);
        toggleTextEl.setText(listOpen ? tr("modal.create.collapse") : tr("modal.create.expand"));
        titleRow.setAttribute("aria-expanded", listOpen ? "true" : "false");
      };
      const toggleList = () => {
        listOpen = !listOpen;
        applyListOpen();
      };
      titleRow.addEventListener("click", toggleList);
      titleRow.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleList();
        }
      });
      const tasksListEl = existingTasksEl.createDiv("existing-tasks-list");
      // 「查看全部」阈值与折叠阈值同源，都读设置里的每日任务显示数量
      const LIMIT = listLimit;
      let showAll = false;
      const renderTasks = () => {
        tasksListEl.empty();
        const toShow = showAll ? this.existingTasks : this.existingTasks.slice(0, LIMIT);
        toShow.forEach((task) => {
          const taskEl = tasksListEl.createDiv("existing-task-item");
          // 就地切换后，"当前在改哪条"必须在列表里看得见——否则抬头标题与列表
          // 脱节，用户不知道表单里预填的是哪一条
          if (this.editingTask && task === this.editingTask) taskEl.addClass("editing");
          if (task.completed) {
            taskEl.addClass("completed");
            taskEl.toggleClass("completed-strike", !this.plugin.settings.showCompletedStrike);
          }
          if (task.priority > 0) taskEl.addClass(`priority-${task.priority}`);
          // 勾选框
          const checkboxEl = taskEl.createEl("input", { cls: "task-check-icon", attr: { type: "checkbox", "aria-label": tr("modal.create.toggleComplete") } });
          if (task.completed) checkboxEl.checked = true;
          checkboxEl.addEventListener("change", async () => {
            // 并发防护：写入期间禁用 checkbox，防止用户连点导致 rawLine 与文件不同步
            if (checkboxEl.disabled) return;
            checkboxEl.disabled = true;
            try {
              const ok = await this.plugin.taskParser.toggleTask(task);
              // 失败时回滚 checkbox 状态与 UI，避免与文件不一致
              if (!ok) {
                checkboxEl.checked = task.completed;
                new import_obsidian3.Notice(tr("modal.create.toggleFail"));
                setTimeout(() => renderTasks(), 200);
                return;
              }
              task.completed = !task.completed;
              // 同步更新 rawLine 中的勾选标记，避免二次切换时身份校验失败
              // （_toggleTaskImpl 依赖 task.rawLine === 文件当前行 做身份匹配）
              if (task.rawLine) {
                task.rawLine = task.rawLine.replace(
                  /^(\s*[-*]\s*\[)[ xX](\])/i,
                  `$1${task.completed ? "x" : " "}$2`
                );
              }
              if (task.completed) {
                taskEl.addClass("completed");
                taskEl.toggleClass("completed-strike", !this.plugin.settings.showCompletedStrike);
              } else {
                taskEl.removeClass("completed");
                taskEl.removeClass("completed-strike");
              }
            } finally {
              checkboxEl.disabled = false;
            }
          });
          // 任务文字
          const textEl = taskEl.createEl("span", { cls: "task-text", text: task.content });
          // 类别标签：这条宽列表是 #标签 文字的唯一去处（v1.5.4 起格子里只剩色带），
          // 用户在这里对照着看当日都有哪些类别，筛选面板用的也是同一批名字
          if (task.category) {
            const catEl = taskEl.createDiv("task-category");
            catEl.textContent = `#${task.category}`;
            catEl.setAttribute("title", tr("view.cell.category", { category: task.category }));
            const catColor = resolveCategoryColor(task.category, this.plugin.settings.categories);
            catEl.style.setProperty("--mt-cat-color", catColor);
            taskEl.style.setProperty("--mt-cat-color", catColor);
          }
          // 操作按钮区域
          const actionsEl = taskEl.createDiv("task-item-actions");
          // 批次三：编辑入口。基准日期用任务锚点（startDate||dueDate），不用
          // 被点格子——跨天虚拟挂载时两者不同会把任务平移走样（3.2.4）。
          // 就地切换编辑目标：以前是 close() 再开一个新弹窗，两副几乎一样的界面
          // 在同一位置前后闪过，用户读作「点了编辑又跳出创建界面」。
          const editBtn = actionsEl.createEl("button", { cls: "task-action-btn task-edit-btn", attr: { title: tr("modal.create.edit"), "aria-label": tr("modal.create.edit") } });
          editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>`;
          editBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const anchorStr = task.startDate || task.dueDate;
            if (!anchorStr) {
              new import_obsidian3.Notice(tr("modal.create.noDateMark"), 3e3);
              return;
            }
            // 再点一次自己 = 退回新建态。这个开关顶掉了原来那颗「取消编辑」
            // 按钮——它存在的唯一理由就是"从这一条退回这一天"，现在切换是
            // 就地做的，不需要第三个底部按钮
            if (this.editingTask === task) {
              this.switchToTask(null, null);
              return;
            }
            this.switchToTask(task, anchorStr);
          });
          // 跳转按钮
          const gotoBtn = actionsEl.createEl("button", { cls: "task-action-btn task-goto-btn", attr: { title: tr("modal.create.goto") } });
          gotoBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
          gotoBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const file = this.app.vault.getAbstractFileByPath(task.filePath);
            if (file) {
              const leaf = this.app.workspace.getLeaf(false);
              await leaf.openFile(file);
              // openFile 返回时编辑器可能尚未就绪，短暂重试，避免静默跳过定位
              let tries = 10;
              const focusTimer = setInterval(() => {
                const view = leaf.view;
                if (view && view.editor) {
                  clearInterval(focusTimer);
                  view.editor.setCursor({ line: task.lineNumber, ch: 0 });
                  view.editor.scrollIntoView({ from: { line: task.lineNumber, ch: 0 }, to: { line: task.lineNumber, ch: 0 } }, true);
                } else if (--tries <= 0) {
                  clearInterval(focusTimer);
                }
              }, 100);
            }
            this.close();
          });
          // 删除按钮
          const deleteBtn = actionsEl.createEl("button", { cls: "task-action-btn task-delete-btn", attr: { title: tr("modal.create.delete") } });
          deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>`;
          deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (deleteBtn.disabled) return;
            deleteBtn.disabled = true;
            // 串行化删除：确保前一次删除写入文件完成后再处理下一次，
            // 否则并发删除会基于旧文件内容/旧行号操作，可能删错行。
            this.deleteChain = this.deleteChain.then(async () => {
              const deletedLineNumber = task.lineNumber;
              const deletedFilePath = task.filePath;
              const ok = await this.plugin.taskParser.deleteTask(task);
              if (ok) {
                taskEl.addClass("task-deleting");
                await new Promise((r) => setTimeout(r, 200));
                const idx = this.existingTasks.indexOf(task);
                if (idx > -1) this.existingTasks.splice(idx, 1);
                // 修复：删除一行后，同文件中行号大于被删行的任务行号需 -1，
                // 否则后续删除会按失效的 lineNumber 操作。
                for (const t of this.existingTasks) {
                  if (t.filePath === deletedFilePath && t.lineNumber > deletedLineNumber) {
                    t.lineNumber -= 1;
                  }
                }
                const titleEl2 = titleRow.querySelector(".existing-tasks-title");
                if (titleEl2) titleEl2.textContent = tr("modal.create.existingCount", { n: this.existingTasks.length });
                renderTasks();
              } else {
                deleteBtn.disabled = false;
              }
            }).catch((err) => {
              console.error(tr("error.deleteFail"), err);
              deleteBtn.disabled = false;
            });
          });
        });
        // 展开/收起
        if (this.existingTasks.length > LIMIT) {
          const moreEl = tasksListEl.createDiv("existing-tasks-more");
          moreEl.textContent = showAll ? tr("modal.create.collapse") : tr("modal.create.viewAll", { n: this.existingTasks.length });
          moreEl.addEventListener("click", () => {
            showAll = !showAll;
            renderTasks();
          });
        }
      };
      applyListOpen();
      renderTasks();
    }

    const inputWrapper = this.modalEl.createDiv("task-input-wrapper");
    const inputEl = inputWrapper.createEl("input", {
      cls: "task-input",
      attr: {
        type: "text",
        placeholder: tr("modal.create.placeholder")
      }
    });
    // 批次三：编辑态预填内容（提交时复用同一套 emoji 剥离清洗，预填值已是
    // 解析层剥好的 task.content，不存在二次剥离问题）
    if (this.editingTask) {
      inputEl.value = this.editingTask.content;
    }
    // 备注区（反馈①③的落点）：收起态 = 一枚虚线胶囊，与「＋ 设置时间」同视觉族，
    // 不占额外行高；展开态 = 多行 textarea，字号 ≥16px（iOS WebKit 对 <16px 输入框
    // 聚焦强制放大整页）。编辑态原有备注自动展开并预填；胶囊收起后内容仍留在
    // textarea 里，保存照样写回——收起只是不占地方，不是放弃编辑
    const noteContainer = this.modalEl.createDiv("modal-note-container");
    const noteLabelEl = noteContainer.createEl("span", { cls: "note-label", text: tr("modal.create.note") });
    // 收起态 = 整宽幽灵框（真机反馈：小胶囊像浮在空白里，改与任务输入框同栏同尺寸）
    const noteShowBtn = noteContainer.createEl("button", { cls: "note-show-btn", type: "button" });
    noteShowBtn.createSpan({ cls: "note-ghost-text", text: tr("modal.create.noteAdd") });
    // rows=1 是留白的真凶：textarea 不带 rows 时浏览器默认 2 行，autosize 读到的
    // scrollHeight 把一行备注撑成 74px（实测），用户说的"上下空很大"就是这个
    noteText = noteContainer.createEl("textarea", {
      cls: "note-textarea",
      attr: { rows: "1", placeholder: tr("modal.create.notePlaceholder"), "aria-label": tr("modal.create.noteAria"), spellcheck: "false" }
    });
    noteText.value = noteHasContent ? this.editingTask.note : "";
    const autosizeNote = () => {
      noteText.style.height = "auto";
      noteText.style.height = Math.max(noteText.scrollHeight + 2, 36) + "px";
    };
    noteText.addEventListener("input", autosizeNote);
    applyNoteOpen = (focusNote) => {
      noteLabelEl.style.display = noteOpen ? "block" : "none";
      noteText.style.display = noteOpen ? "block" : "none";
      noteShowBtn.style.display = noteOpen ? "none" : "";
      if (noteOpen) {
        autosizeNote();
        if (focusNote) noteText.focus();
        // 光标落到文末（全选会把原文当占位符，改一句话要重打一遍很难受）
        noteText.setSelectionRange(noteText.value.length, noteText.value.length);
      }
    };
    noteShowBtn.addEventListener("click", () => {
      noteOpen = true;
      applyNoteOpen(true);
    });
    applyNoteOpen();
    let startTimeEl = null;
    let endTimeEl = null;
    let isAllDay = this.editingTask ? !this.editingTask.time : this.plugin.settings.defaultAllDayTask;
    let allDayCheckbox = null;
    // setTimeOpen 定义在时间区渲染块内，但编辑态同步块也要调它——提到函数级声明
    let setTimeOpen = null;
    // 真机反馈修正：编辑全天任务不再弹出时间区（v1.5.0 的「编辑态恒渲染」过头了）。
    // 渲染条件 = 默认全天关闭，或被编辑任务本身带 ⏰（后者必须渲染，否则保存会静默
    // 丢时间）。v1.5.2 起全天任务加时间改走时间区内的「+ 设置时间」，不再要求先关设置
    // v1.5.2 真机反馈：全天态不再展示置灰时间框（在手机上那就是"跳出的时间选择器"）。
    // 时间区默认折叠为一行「全天」勾选，点「+ 设置时间」才展开输入框；渲染条件不变：
    // 默认全天开启且编辑无时间任务时整段不出现（v1.5.1 行为保留）
    const renderTimeSection = !this.plugin.settings.defaultAllDayTask || this.editingTask && this.editingTask.time;
    if (renderTimeSection) {
      // 计算默认时间：系统时间取整到下一小时，结束时间+4小时（结束跨午夜截断到 23:59，
      // 避免 "22:00~02:00" 被结束时间校验拒绝）；23 点后开始时间不再 %24 回绕——
      // 回绕会生成已过去的「当天 00:00~04:00」，截断为 23:00~23:59
      const now = new Date();
      const defaultStartHour = Math.min(now.getMinutes() > 0 ? now.getHours() + 1 : now.getHours(), 23);
      const startPlus4 = defaultStartHour + 4;
      const defaultEndHour = startPlus4 > 23 ? 23 : startPlus4;
      const defaultEndMinute = startPlus4 > 23 ? 59 : 0;
      const defaultStartHourStr = String(defaultStartHour).padStart(2, "0");
      const defaultEndHourStr = String(defaultEndHour).padStart(2, "0");
      const defaultEndMinuteStr = String(defaultEndMinute).padStart(2, "0");
      const timeContainer = this.modalEl.createDiv("modal-time-container");
      const timeLabelEl = timeContainer.createEl("span", { cls: "time-label", text: tr("modal.create.time") });
      const timeWrapper = timeContainer.createDiv("time-input-wrapper");
      // 原生时间输入框
      startTimeEl = timeWrapper.createEl("input", { type: "time", cls: "time-native-input" });
      const defaultStartTime = `${defaultStartHourStr}:00`;
      startTimeEl.value = defaultStartTime;
      timeWrapper.createEl("span", { cls: "time-separator", text: tr("modal.create.to") });
      endTimeEl = timeWrapper.createEl("input", { type: "time", cls: "time-native-input" });
      const defaultEndTime = `${defaultEndHourStr}:${defaultEndMinuteStr}`;
      endTimeEl.value = defaultEndTime;
      const allDayToggle = timeContainer.createDiv("all-day-toggle");
      allDayCheckbox = allDayToggle.createEl("input", { attr: { type: "checkbox", "aria-label": tr("modal.create.allDay") } });
      allDayToggle.createEl("span", { text: tr("modal.create.allDay") });
      // 「+ 设置时间」：全天态下唯一的加时间入口，坐在勾选行右侧；
      // 时间框组默认折叠（display:none = 不进布局，手机上不再"跳出时间选择器"）
      const showTimeBtn = allDayToggle.createEl("button", { cls: "time-show-btn", type: "button", text: tr("modal.create.setTime") });
      showTimeBtn.style.display = "none";
      // 折叠开合：全天=「时间」标签与时间框整组隐藏，只剩勾选与加时间按钮
      setTimeOpen = () => {
        timeWrapper.style.display = isAllDay ? "none" : "flex";
        timeLabelEl.style.display = isAllDay ? "none" : "block";
        showTimeBtn.style.display = isAllDay ? "" : "none";
      };
      allDayCheckbox.checked = isAllDay;
      allDayCheckbox.addEventListener("change", (e) => {
        isAllDay = e.target.checked;
        startTimeEl.disabled = isAllDay;
        endTimeEl.disabled = isAllDay;
        setTimeOpen();
      });
      showTimeBtn.addEventListener("click", () => {
        allDayCheckbox.checked = false;
        isAllDay = false;
        startTimeEl.disabled = false;
        endTimeEl.disabled = false;
        setTimeOpen();
        startTimeEl.focus();
      });
      setTimeOpen();
    }
    if (this.editingTask && startTimeEl && endTimeEl) {
      // 批次三：编辑态时间区整体同步——有时间按 ~ 拆回填（extractTime 已归一化
      // HH:MM）；无时间（isAllDay=true）也要把勾选/禁用/透明度对齐，否则「默认
      // 非全天」设置下编辑全天任务会出现复选框未勾但提交按全天的观感不一致
      const tp0 = this.editingTask.time ? String(this.editingTask.time).split("~") : [];
      startTimeEl.value = tp0[0] || startTimeEl.value;
      endTimeEl.value = tp0[1] || endTimeEl.value;
      startTimeEl.disabled = isAllDay;
      endTimeEl.disabled = isAllDay;
      // v1.5.2：全天态改为折叠（时间框不进布局），透明度两行作废
      if (allDayCheckbox) { allDayCheckbox.checked = isAllDay; if (setTimeOpen) setTimeOpen(); }
    }
    const endDateContainer = this.modalEl.createDiv("modal-end-date");
    // v1.6.0 手机端反馈版：不再画「结束日期」标题行——标题与控件文案（跨天任务）
    // 说的是同一件事的两面，两行字叠着既多占一行又互相拆台。留控件、去标题，
    // 整块改成与优先级/类别同构的一行（勾选框 + 勾上后在右侧长出的日期触发器）。
    const endDateWrapper = endDateContainer.createDiv("end-date-wrapper");
    let endDate = void 0;
    let isMultiDay = false;
    const multiDayToggle = endDateWrapper.createDiv("multi-day-toggle");
    const multiDayCheckbox = multiDayToggle.createEl("input", { attr: { type: "checkbox", "aria-label": tr("modal.create.multiDay") } });
    multiDayToggle.createEl("span", { text: tr("modal.create.multiDay") });
    // 自定义日期选择器触发按钮
    // v1.6.2 真机反馈：结束日期原先勾上「跨天任务」才长出来，第一眼像"没居中"、
    // 甚至以为没有这个控件。改成常驻——未勾选时置灰不可点，勾上即点亮，
    // 位置从头到尾不动（占位文案也换成提示该先做什么）
    const endDateTrigger = endDateWrapper.createEl("div", {
      cls: "end-date-trigger is-disabled",
      text: tr("modal.create.endNeedToggle"),
      attr: { "aria-disabled": "true", tabindex: "-1" }
    });
    let pickerYear = this.date.getFullYear();
    let pickerMonth = this.date.getMonth();
    function formatDisplayDate(y, m, d) {
      return tr("modal.create.displayDate", { y: y, m: m + 1, d: d });
    }
    // 批次三：编辑跨天任务 → 勾上跨天、展开触发器、预填结束日期。
    // 开始日期不单独进表单（本期只做结束日期一侧，3.3⑥）：this.date 已是
    // 打开弹窗时传入的任务锚点，结束日期校验基准 self.date 天然正确
    if (this.editingTask && this.editingTask.startDate && this.editingTask.dueDate && this.editingTask.startDate !== this.editingTask.dueDate) {
      isMultiDay = true;
      endDate = dateFromStr(this.editingTask.dueDate);
      multiDayCheckbox.checked = true;
      endDateTrigger.removeClass("is-disabled");
      endDateTrigger.removeAttribute("aria-disabled");
      endDateTrigger.setAttribute("tabindex", "0");
      const eArr = this.editingTask.dueDate.split("-").map(Number);
      endDateTrigger.textContent = formatDisplayDate(eArr[0], eArr[1] - 1, eArr[2]);
      endDateTrigger.setAttribute("data-value", this.editingTask.dueDate);
    }
    // 更新日期网格（年月切换时调用，不重建弹出层）
    function updateGrid(popup) {
      const existingGrid = popup.querySelector(".date-picker-grid");
      if (existingGrid) existingGrid.remove();
      const grid = popup.createDiv("date-picker-grid");
      // 起始空格按设置「每周第一天」偏移，与主月历及上方星期标题保持一致
      const fdow = self.plugin.settings.firstDayOfWeek || 0;
      const firstDay = (new Date(pickerYear, pickerMonth, 1).getDay() - fdow + 7) % 7;
      const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
      for (let i = 0; i < firstDay; i++) grid.createDiv("picker-cell picker-empty");
      for (let d = 1; d <= daysInMonth; d++) {
        const cell = grid.createDiv("picker-cell");
        cell.textContent = String(d);
        const cellDate = new Date(pickerYear, pickerMonth, d);
        const cellKey = `${pickerYear}-${pickerMonth}-${d}`;
        if (cellKey === todayStr) cell.addClass("picker-cell-today");
        // 允许选择任意日期（包括过去的日期）
        cell.addEventListener("click", () => {
          const newEndDate = new Date(pickerYear, pickerMonth, d);
          // 校验结束日期不早于开始日期（self.date 为开始日期，self 在 open() 开头绑定 this）
          if (newEndDate < new Date(self.date.getFullYear(), self.date.getMonth(), self.date.getDate())) {
            new import_obsidian3.Notice(tr("modal.create.endBeforeStart"), 3e3);
            return;
          }
          endDate = newEndDate;
          const m = String(pickerMonth + 1).padStart(2, "0");
          const dd = String(d).padStart(2, "0");
          endDateTrigger.textContent = formatDisplayDate(pickerYear, pickerMonth, d);
          endDateTrigger.setAttribute("data-value", `${pickerYear}-${m}-${dd}`);
          popup.remove();
          // 真正移除全局 click 监听器，避免选中日期后监听器残留泄漏
          if (self.datePickerCloseHandler) {
            document.removeEventListener("click", self.datePickerCloseHandler);
          }
          self.datePickerCloseHandler = null;
        });
      }
    }
    function syncSelects(popup) {
      const yearSelect = popup.querySelector(".picker-select-year");
      const monthSelect = popup.querySelector(".picker-select-month");
      if (yearSelect) {
        // ◀▶ 翻月跨年后，年份选项（仅在弹层构建时生成 pickerYear±1）不含新年份，
        // 需重建选项，否则下拉停留在旧年份、与网格显示不一致
        const years = Array.from(yearSelect.options).map((o) => parseInt(o.value));
        if (!years.includes(pickerYear)) {
          yearSelect.replaceChildren();
          for (let y = pickerYear - 1; y <= pickerYear + 1; y++) {
            const opt = document.createElement("option");
            opt.value = String(y);
            opt.text = tr("modal.date.yearSuffix", { y: y });
            yearSelect.appendChild(opt);
          }
        }
        Array.from(yearSelect.options).forEach(o => { o.selected = o.value === String(pickerYear); });
      }
      if (monthSelect) {
        Array.from(monthSelect.options).forEach(o => { o.selected = o.value === String(pickerMonth); });
      }
    }
    function buildPopup() {
      // 挂到 document.body：modal 带 transform 会成为 fixed 后代的包含块，
      // 挂在 modal 内时「居中」相对 modal 而非视口，且会被 modal 的 overflow:hidden 裁掉
      const popup = document.body.createDiv("date-picker-popup");
      popup.style.display = "block";
      // 按触发器定位：出现在触发按钮下方，底部放不下时翻到上方；左右夹在视口内
      const rect = endDateTrigger.getBoundingClientRect();
      const estW = 320;
      const estH = 340;
      let left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - estW - 8));
      let top = rect.bottom + 6;
      if (top + estH > window.innerHeight) {
        top = Math.max(8, rect.top - estH - 6);
      }
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
      // 年月导航
      const navRow = popup.createDiv("date-picker-nav");
      const prevBtn = navRow.createEl("button", { cls: "picker-nav-btn", text: "\u25C0" });
      const yearSelect = navRow.createEl("select", { cls: "picker-select picker-select-year" });
      const monthSelect = navRow.createEl("select", { cls: "picker-select picker-select-month" });
      const nextBtn = navRow.createEl("button", { cls: "picker-nav-btn", text: "\u25B6" });
      for (let y = pickerYear - 1; y <= pickerYear + 1; y++) {
        const opt = yearSelect.createEl("option", { value: String(y), text: tr("modal.date.yearSuffix", { y: y }) });
        if (y === pickerYear) opt.selected = true;
      }
      for (let m = 0; m < 12; m++) {
        const opt = monthSelect.createEl("option", { value: String(m), text: tr("modal.date.monthSuffix", { m: m + 1 }) });
        if (m === pickerMonth) opt.selected = true;
      }
      prevBtn.addEventListener("click", () => {
        pickerMonth--;
        if (pickerMonth < 0) { pickerMonth = 11; pickerYear--; }
        syncSelects(popup);
        updateGrid(popup);
      });
      nextBtn.addEventListener("click", () => {
        pickerMonth++;
        if (pickerMonth > 11) { pickerMonth = 0; pickerYear++; }
        syncSelects(popup);
        updateGrid(popup);
      });
      yearSelect.addEventListener("change", () => { pickerYear = parseInt(yearSelect.value); updateGrid(popup); });
      monthSelect.addEventListener("change", () => { pickerMonth = parseInt(monthSelect.value); updateGrid(popup); });
      // 星期标题（跟随设置「每周第一天」轮转，与主月历一致）
      const weekRow = popup.createDiv("date-picker-week");
      const fdowHeader = self.plugin.settings.firstDayOfWeek || 0;
      const weekLabels = weekdayNames();
      weekLabels.slice(fdowHeader).concat(weekLabels.slice(0, fdowHeader)).forEach(d => {
        weekRow.createDiv("picker-week-day").textContent = d;
      });
      // 日期网格（首次渲染）
      updateGrid(popup);
      // 点击外部关闭（popup 已挂 document.body，需显式排除 popup 与触发按钮自身）
      self.datePickerCloseHandler = (e) => {
        if (!popup.contains(e.target) && !endDateTrigger.contains(e.target)) {
        popup.remove();
        document.removeEventListener("click", self.datePickerCloseHandler);
        self.datePickerCloseHandler = null;
        }
      };
      setTimeout(() => document.addEventListener("click", self.datePickerCloseHandler), 0);
      return popup;
    }
    function renderDatePicker() {
      const existing = document.body.querySelector(":scope > .date-picker-popup");
      if (existing) {
        if (self.datePickerCloseHandler) document.removeEventListener("click", self.datePickerCloseHandler);
        existing.remove();
        self.datePickerCloseHandler = null;
        return;
      }
      buildPopup();
    }
    endDateTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      // 置灰态被点到：抖一下勾选框，别让人以为按钮坏了
      if (!isMultiDay) {
        multiDayToggle.addClass("hint-shake");
        setTimeout(() => multiDayToggle.removeClass("hint-shake"), 450);
        return;
      }
      renderDatePicker();
    });
    multiDayCheckbox.addEventListener("change", (e) => {
      isMultiDay = e.target.checked;
      endDateTrigger.toggleClass("is-disabled", !isMultiDay);
      if (isMultiDay) {
        endDateTrigger.removeAttribute("aria-disabled");
        endDateTrigger.setAttribute("tabindex", "0");
        if (!endDate) endDateTrigger.textContent = tr("modal.create.pleaseSelect");
      } else {
        endDateTrigger.setAttribute("aria-disabled", "true");
        endDateTrigger.setAttribute("tabindex", "-1");
        endDateTrigger.textContent = tr("modal.create.endNeedToggle");
      }
      if (!isMultiDay) {
        endDate = void 0;
        const popup = document.body.querySelector(":scope > .date-picker-popup");
        if (popup) popup.remove();
        // 同步清理 this.datePickerCloseHandler，避免遗留全局监听器
        if (this.datePickerCloseHandler) {
          document.removeEventListener("click", this.datePickerCloseHandler);
          this.datePickerCloseHandler = null;
        }
      }
    });
    const priorityContainer = this.modalEl.createDiv("modal-priority");
    priorityContainer.createEl("span", { cls: "priority-label", text: tr("modal.create.priority") });
    const priorityGroup = priorityContainer.createDiv("priority-group");
    const priorities = [
      { value: 3, class: "priority-high", label: tr("modal.create.high") },
      { value: 2, class: "priority-medium", label: tr("modal.create.medium") },
      { value: 0, class: "priority-none", label: tr("modal.create.none") }
    ];
    // 批次三：编辑态初值取任务优先级；两处选中判断（wrapper / btn）同源，
    // 漏改任一处会出现 wrapper 高亮与按钮高亮不一致（3.3③）
    const initialPriority = this.editingTask ? this.editingTask.priority : 0;
    let selectedPriority = initialPriority;
    const priorityWrappers = [];
    priorities.forEach((p, index) => {
      const wrapper = priorityGroup.createDiv("priority-btn-wrapper");
      if (p.value === initialPriority)
        wrapper.addClass("selected");
      const btn = wrapper.createEl("button", {
        cls: `priority-btn ${p.class} ${p.value === initialPriority ? "selected" : ""}`,
        attr: { "aria-label": p.label }
      });
      const label = wrapper.createDiv("priority-btn-text");
      label.textContent = p.label;
      priorityWrappers.push(wrapper);
      wrapper.addEventListener("click", () => {
        selectedPriority = p.value;
        priorityWrappers.forEach((w) => {
          var _a;
          w.removeClass("selected");
          (_a = w.querySelector(".priority-btn")) == null ? void 0 : _a.removeClass("selected");
        });
        wrapper.addClass("selected");
        btn.addClass("selected");
      });
    });
    // 类别行（批次二③）：优先级下方一排小号胶囊。默认「无标签」= 不加 #tag =
    // 规范里的「工作」默认类（老文件零迁移，存储层无类别就是空串）；其余选项来自
    // settings.categories，顺序即设置页顺序。记住上次所选（仅内存，一期不持久化），
    // 连续建同类任务不用每次点。插件重启回「无标签」
    const categoryContainer = this.modalEl.createDiv("modal-category");
    categoryContainer.createEl("span", { cls: "category-label", text: tr("modal.create.category") });
    const categoryGroup = categoryContainer.createDiv("category-group");
    let categoryNames = (this.plugin.settings.categories || []).map((c) => c.name);
    // 批次三：手写标签可能不在设置「已知类别」里（如手敲 #阅读）：编辑态把它
    // 并进选项，否则重建保存会把原有类别静默丢掉（2.3⑦：设置只是选项源，不是白名单）
    if (this.editingTask && this.editingTask.category && categoryNames.indexOf(this.editingTask.category) < 0) {
      categoryNames = categoryNames.concat([this.editingTask.category]);
    }
    const catOptions = [{ value: "", label: tr("modal.filter.untagged") }].concat(categoryNames.map((n) => ({ value: n, label: `#${n}` })));
    let remembered = this.editingTask ? this.editingTask.category || "" : this.plugin.lastCategory || "";
    if (!catOptions.some((o) => o.value === remembered))
      remembered = "";
    let selectedCategory = remembered;
    const categoryChips = [];
    catOptions.forEach((o) => {
      const chip = categoryGroup.createEl("button", { cls: "category-chip", text: o.label, attr: { type: "button", "aria-label": tr("modal.create.categoryAria", { label: o.label }) } });
      const chipDot = chip.createSpan({ cls: "category-chip-dot" });
      if (o.value) {
        chipDot.style.setProperty("--mt-cat-color", resolveCategoryColor(o.value, this.plugin.settings.categories));
      } else {
        chipDot.addClass("category-chip-dot-none");
      }
      if (o.value === selectedCategory)
        chip.addClass("selected");
      categoryChips.push(chip);
      chip.addEventListener("click", () => {
        selectedCategory = o.value;
        categoryChips.forEach((c) => c.removeClass("selected"));
        chip.addClass("selected");
      });
    });
    // v1.6.2 真机反馈：类别一多（或名字一长）这排 chip 就往下堆，卡片被撑高。
    // 超过两行 → 默认折到一行，尾部挂「更多 N ⌄」；两行以内不出现开关。
    // 判定用真实布局量（offsetTop 变了就是换行），不靠猜字符宽度；DOM 顺序不动，
    // 只决定谁显示——但选中项必须留在可见行，否则表单里"选的是哪个"就找不到了
    const foldCategoryGroup = () => {
      const chips = [...categoryGroup.querySelectorAll(".category-chip")];
      if (chips.length < 3) return;
      const rowOf = (el) => Math.round(el.offsetTop / Math.max(el.offsetHeight, 1));
      const rows = new Set(chips.map(rowOf));
      if (rows.size < 3) return;   // 两行以内不折叠
      const firstRow = chips.filter((c) => rowOf(c) === rowOf(chips[0]));
      const selected = chips.find((c) => c.hasClass("selected"));
      // 折叠态也要看得见"当前选的是哪个"：选中项即便不在首行也不隐藏，
      // 它会自己换到第二行——最多两行，比把选择藏起来划算
      const hidden = chips.filter((c) => firstRow.indexOf(c) < 0 && c !== selected);
      if (!hidden.length) return;
      const toggle = categoryGroup.createEl("button", {
        cls: "category-chip category-more-btn", type: "button",
        attr: { "aria-expanded": "false" }
      });
      let open = false;
      const apply = () => {
        hidden.forEach((c) => { c.style.display = open ? "" : "none"; });
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        toggle.textContent = open ? tr("modal.create.collapse") + " \u2303" : tr("modal.create.catMore") + " " + hidden.length + " \u2304";
        toggle.toggleClass("is-open", open);
      };
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        open = !open;
        apply();
      });
      apply();
    };
    requestAnimationFrame(foldCategoryGroup);
    const btnGroup = this.modalEl.createDiv("modal-buttons");
    const cancelBtn = btnGroup.createEl("button", {
      cls: "btn-cancel",
      text: tr("modal.create.cancel")
    });
    cancelBtn.addEventListener("click", () => this.close());
    const confirmBtn = btnGroup.createEl("button", {
      cls: "btn-confirm",
      text: this.editingTask ? tr("modal.create.save") : tr("modal.create.add")
    });
    const submitTask = () => {
      // 防重复提交：双击或 Enter 连按时只生效一次
      if (submitTask.submitted) return;
      // 过滤换行符与连续空白：避免用户粘贴多行内容破坏 checklist 单行格式
      // 同时剥离用户输入中的任务元数据 emoji 标记（📅🛫⏰⏳🔴🟡及紧随的日期/时间），
      // 避免与插件自动拼接的元数据冲突，导致解析时拿到用户输入的错误日期/优先级。
      const rawContent = inputEl.value.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ");
      const content = rawContent
        // 剥离"emoji + 日期/时间"组合（含范围），字符类含优先级 emoji 以覆盖"🔴 2026-04-21"场景
        // 添加 /u 标志：emoji 为代理对字符，不加 /u 会被当作两个独立的代理项，可能误匹配其他字符
        .replace(/[📅🛫⏰⏳🔴🟡🟢]\s*\d{4}-\d{2}-\d{2}(?:\s*~\s*\d{4}-\d{2}-\d{2})?/gu, "")
        .replace(/[📅🛫⏰⏳🔴🟡🟢]\s*\d{1,2}:\d{2}(?:\s*~\s*\d{1,2}:\d{2})?/gu, "")
        // 兜底剥离孤立的元数据 emoji（无后续日期/时间的"📅 复盘"），避免与插件自动拼接的元数据冲突
        .replace(/[📅🛫⏰⏳🔴🟡🟢]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
      // v1.6.0 手机端反馈版：备注区就在标题下方，编辑态清空标题、只动备注是
      // 合法意图（边改标题边补两句备注）。识别出来沿用原标题提交；其余空内容照旧提示
      const noteOnly = !!this.editingTask && !content && noteText != null && noteText.value !== (this.editingTask.note || "");
      if (!content && !noteOnly) {
        new import_obsidian3.Notice(tr("modal.create.empty"), 3e3);
        inputEl.focus();
        return;
      }
      if (content || noteOnly) {
        let time = void 0;
        if (!isAllDay && startTimeEl && endTimeEl) {
          const s = startTimeEl.value;
          const e = endTimeEl.value;
          // 校验结束时间晚于开始时间（字符串比较适用于 HH:MM 格式）
          if (s && e && e <= s) {
            new import_obsidian3.Notice(tr("modal.create.endBeforeStartTime"), 3e3);
            return;
          }
          // 校验只填了开始或结束时间（半填），避免写入 "⏰ ~12:00" / "⏰ 09:00~" 破坏解析与排序
          if ((s && !e) || (!s && e)) {
            new import_obsidian3.Notice(tr("modal.create.fillBoth"), 3e3);
            return;
          }
          // 两者都为空视为不填时间，避免写入 "⏰ ~" 脏数据
          if (s && e) {
            time = `${s}~${e}`;
          }
        }
        submitTask.submitted = true;
        confirmBtn.disabled = true;
        // await onSubmit：确保 createTaskForDate 完成后再关闭弹窗，失败时回滚状态允许重试
        // 记住本次类别（内存态，下次打开弹窗预选）；提交链路把 category 交给视图回调
        this.plugin.lastCategory = selectedCategory;
        Promise.resolve(this.onSubmit(noteOnly ? this.editingTask.content : content, isAllDay, time, selectedPriority, endDate, selectedCategory, this.editingTask, noteText ? noteText.value : "")).then(() => {
          this.close();
        }).catch((err) => {
          console.error(tr("error.createFail"), err);
          new import_obsidian3.Notice(tr("modal.create.fail"), 3e3);
          submitTask.submitted = false;
          confirmBtn.disabled = false;
        });
      }
    };
    // 仅桌面端自动聚焦输入框：移动端聚焦会立即拉起输入法，遮挡弹窗且不易收起；
    // 移动端由用户点击输入框时再唤起键盘
    if (!import_obsidian3.Platform.isMobile) {
      setTimeout(() => {
        inputEl.focus();
      }, 100);
    }
    confirmBtn.addEventListener("click", submitTask);
    inputEl.addEventListener("keydown", (e) => {
      // 中文输入法选词确认的 Enter 不提交（isComposing / keyCode 229）：
      // 否则桌面端打拼音按回车上屏，会带着未确认的拼音直接创建任务
      if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) {
        submitTask();
      }
      // Escape 关闭由 Modal 基类统一处理，避免双重 close
    });
    // 注册到静态活动实例表，供插件卸载时统一清理
    if (!CreateTaskModal.activeInstances) CreateTaskModal.activeInstances = /* @__PURE__ */ new Set();
    CreateTaskModal.activeInstances.add(this);
  }

  /**
   * 就地切换编辑目标（列表里点另一条的铅笔），复用同一个弹窗实例重建主体。
   * 先摘掉日期浮层与它挂在 document 上的 click 监听，再换 date / editingTask，
   * 最后 modalEl.empty() + 重跑 onOpen。onOpen 的构建全程是往 modalEl 里
   * createDiv，框架装饰的移除按精确类名匹配且都有判空，二次调用既不会重复
   * 挂载也不会误删内容节点（activeInstances 是 Set，重复 add 无副作用）。
   */
  switchToTask(task, anchorStr) {
    if (this.datePickerCloseHandler) {
      document.removeEventListener("click", this.datePickerCloseHandler);
      this.datePickerCloseHandler = null;
    }
    const strayPopup = document.body.querySelector(":scope > .date-picker-popup");
    if (strayPopup) strayPopup.remove();
    this.editingTask = task;
    // anchorStr 为空 = 退回新建态，日期保持当前（不跳走）
    if (anchorStr) this.date = dateFromStr(anchorStr);
    this.modalEl.empty();
    this.onOpen();
  }

  onClose() {
    // 清理日期选择器的全局 click 监听器，避免泄漏
    if (this.datePickerCloseHandler) {
      document.removeEventListener("click", this.datePickerCloseHandler);
      this.datePickerCloseHandler = null;
    }
    // 浮层挂在 document.body 上，关闭弹窗时显式移除，避免残留可交互的孤儿浮层
    const strayPopup = document.body.querySelector(":scope > .date-picker-popup");
    if (strayPopup) strayPopup.remove();
    // modalEl 由 Modal 基类负责移除
    // 从静态活动实例表中摘除
    if (CreateTaskModal.activeInstances && CreateTaskModal.activeInstances.has(this)) {
      CreateTaskModal.activeInstances.delete(this);
    }
    // 恢复打开前的焦点元素
    if (this.previouslyFocused && typeof this.previouslyFocused.focus === "function") {
      try {
        this.previouslyFocused.focus();
      } catch (e) {
      }
    }
  }
};


/**
 * 默认设置配置
 * @property {boolean} showCompletedTasks - 是否显示已完成任务
 * @property {boolean} showCompletedStrike - 是否隐藏已完成任务的删除线（true=隐藏，对应设置项「已完成隐藏删除线」；v1.5.2 起为 false 时叠加 .completed-strike 删除线类，完成态基础反馈 .completed 恒加）
 * @property {boolean} defaultAllDayTask - 新建任务默认是否为全天任务
 * @property {number} firstDayOfWeek - 每周第一天（0=周日，1=周一）
 * @property {boolean} showLunar - 是否显示农历
 * @property {boolean} showHoliday - 是否显示节假日标注
 * @property {number} tasksPerDayLimit - 每日显示任务数量上限
 * @property {string} customTaskFolder - 自定义任务文件夹路径（为空则使用默认"任务"）
 * @property {boolean} autoUpdateHolidays - 启用时是否自动刷新节假日数据（数据源：holiday-cn → timor.tech；默认关闭，涉及第三方请求）
 * @property {Object} holidaysData - 节假日数据缓存（按年份存储）
 */
// 类别色板（批次二）：固定 8 色，不开放自由选色——控制复杂度，同时保证暗色下可辨。
var CATEGORY_PALETTE = [
  "#3b82f6",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#64748b"
];
/**
 * 取类别颜色：设置里配过名的一定用配置色（同一类别处处同色）；
 * 没配过名的（用户手敲的新标签）按标签名哈希取固定色板，保证稳定且不撞色于邻近项
 */
function resolveCategoryColor(name, categories) {
  for (const c of categories || []) {
    if (c && c.name === name)
      return c.color;
  }
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_PALETTE[h % CATEGORY_PALETTE.length];
}
var DEFAULT_SETTINGS = {
  // 视图模式："list"（大月：格子里铺任务行）| "agenda"（小月：格子只出一枚圆点，
  // 文字在下方明细区）| "bigWeek"（大周：一周 8 格，左上「本周」块 + 7 个铺任务的
  // 日子格）| "week"（小周：上半屏只留所在那一行的周格子）。
  // v1.6.0 新增、v1.7.0 扩到三值、v1.7.1 扩到四值；老 data.json 缺该键时由
  // Object.assign({}, DEFAULT_SETTINGS, loadedData) 取此默认值，不需额外兜底。
  viewMode: "list",
  // 界面语言：v1.7.2 起恒为 "auto"（跟随 Obsidian 界面语言），设置页不再提供选项；
  // 枚举值 "zh-CN" | "zh-TW" | "en" 仍被 applyLanguage/setLanguage 内部支持（测试与将来复用）
  language: "auto",
  showCompletedTasks: true,
  showCompletedStrike: true,
  defaultAllDayTask: true,
  firstDayOfWeek: 0,
  showLunar: true,
  showHoliday: true,
  tasksPerDayLimit: 5,
  customTaskFolder: "",
  autoUpdateHolidays: false,
  holidaysData: {},
  // 任务归档粒度："year"（默认，任务/2026年任务列表.md）| "month"（任务/2026年10月任务列表.md）
  taskFilePeriod: "year",
  // 已知类别列表（名称 + 颜色，顺序即弹窗/漏斗的显示顺序）。
  // 类别真身是内容里的 #tag：这里只是显示顺序与配色，删除此处条目不碰任何笔记
  categories: [
    { name: "\u751F\u6D3B", color: "#3b82f6" },
    { name: "\u5B66\u4E60", color: "#8b5cf6" }
  ]
};

/**
 * ============================================================
 * MonthlyTasksPlugin - 月历任务插件主类
 * ============================================================
 * Obsidian插件入口，管理插件生命周期和整体协调
 * 
 * 插件标识：
 * - VIEW_TYPE_MONTHLY = "monthly-tasks-view"
 * 
 * 生命周期：
 * - onload()：插件启动时调用
 *   - 加载设置（loadSettings）
 *   - 注册月历视图
 *   - 注册Ribbon按钮和命令
 *   - 监听vault变化事件（防抖500ms）
 * 
 * - onunload()：插件卸载时调用
 *   - 关闭月历视图
 * 
 * 核心组件：
 * - taskParser：TaskParser实例，解析和管理任务
 * - holidayManager：HolidayManager实例，管理节假日
 * 
 * 功能入口：
 * - ribbonIconEl：左侧Ribbon图标按钮
 * - addCommand：注册命令（跳转到今天等）
 * ============================================================
 */
var MonthlyTasksPlugin = class extends import_obsidian3.Plugin {
  /**
   * 插件加载
   */
  async onload() {
    // 初始化节假日管理器（每个插件实例独立）
    this.holidayManager = new HolidayManager();
    
    await this.loadSettings();
    // 启用插件时按需刷新节假日数据：
    // - 默认关闭（autoUpdateHolidays=false），避免向第三方 timor.tech 发请求的隐私/性能问题
    // - 仅在用户主动开启时异步执行，不阻塞插件加载
    if (this.settings.autoUpdateHolidays) {
      // 标记插件是否已卸载，IIFE 在每个 await 后检查，避免操作已销毁的对象
      this.unloaded = false;
      (async () => {
        const currentYear = new Date().getFullYear();
        const results = await Promise.all([
          this.holidayManager.updateFromNetwork(currentYear - 1),
          this.holidayManager.updateFromNetwork(currentYear),
          this.holidayManager.updateFromNetwork(currentYear + 1)
        ]);
        // 卸载后中止：不再访问 this.settings / this.saveSettings
        if (this.unloaded) return;
        const anySuccess = results.some((r) => r === true);
        if (anySuccess) {
          // 仅更新本次请求的三年，保留其他年份已有数据，避免 data.json 持续膨胀
          const newHolidaysData = { ...this.settings.holidaysData };
          for (const year of [currentYear - 1, currentYear, currentYear + 1]) {
            const holidays = this.holidayManager.cache.get(year);
            if (holidays) {
              newHolidaysData[year] = holidays;
            }
          }
          this.settings.holidaysData = newHolidaysData;
          await this.saveSettings();
        } else {
          // 全部失败时给用户可见的提示，避免默默无闻
          new import_obsidian3.Notice(tr("notice.holidayAutoFail"), 5e3);
        }
      })();
    }
    // 批次二③：上次所选类别（内存态，不持久化；视图/弹窗共享同一个插件实例）
    this.lastCategory = "";
    this.taskParser = new TaskParser(this.app, this);
    this.registerView(
      VIEW_TYPE_MONTHLY,
      (leaf) => new MonthlyView(leaf, this.taskParser, this)
    );
    this.ribbonIconEl = this.addRibbonIcon("calendar", tr("view.header.title"), () => {
      this.activateView();
    });
    this.addCommand({
      id: "open-monthly-view",
      name: tr("cmd.open"),
      callback: () => this.activateView()
    });
    this.addCommand({
      id: "refresh-monthly-view",
      name: tr("cmd.refresh"),
      callback: () => this.refreshView()
    });
    // v1.6.0 批次四：命令面板也能切视图。切语言时要与另两条一起 remove/re-add，
    // 否则命令标题会停在旧语言
    this.addCommand({
      id: "toggle-agenda-view",
      name: tr("cmd.toggle"),
      callback: () => this.toggleViewModeFromCommand()
    });
    this.settingTab = new MonthlyTasksSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
    // 合并 vault 事件监听器，使用防抖优化性能
    // refreshTimer 提升为实例字段，便于 onunload 中清理
    this.refreshTimer = null;
    const debouncedRefresh = () => {
      if (this.refreshTimer) clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => {
        this.taskParser.invalidateCache();
        this.refreshView();
        // 同步清除设置面板的文件夹列表缓存，确保新建/移动文件夹后选项及时更新
        if (this.settingTab) {
          this.settingTab.folderOptionsCache = null;
          this.settingTab.folderOptionsCacheTime = 0;
        }
      }, 500);
    };
    // 监听文件修改/创建：仅任务可能所在的文件（任务文件夹、日记、YYYY-MM-DD.md、
    // YYYY年任务列表.md）触发防抖刷新；其余普通笔记保存不再整库重解析——
    // 普通笔记里的手写任务在手动刷新/重开视图时仍会被全库扫描收录，不会丢
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof import_obsidian3.TFile && file.extension === "md" && this.isPossibleTaskFile(file)) {
          debouncedRefresh();
        }
      })
    );
    // 监听文件创建；文件夹（TFolder）创建不触发整库刷新，但也要清设置面板的
    // 文件夹列表缓存——否则新建文件夹后「任务文件夹」下拉要等 TTL 到期才能看到
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof import_obsidian3.TFile && file.extension === "md" && this.isPossibleTaskFile(file)) {
          debouncedRefresh();
        } else if (file instanceof import_obsidian3.TFolder && this.settingTab) {
          this.settingTab.folderOptionsCache = null;
          this.settingTab.folderOptionsCacheTime = 0;
        }
      })
    );
    // 删除/重命名保留全量兜底：事件中的路径可能已失效（rename 拿到的是旧路径），
    // 无法可靠判断是否任务文件，宁可信其有地刷一次
    this.registerEvent(
      this.app.vault.on("delete", () => {
        debouncedRefresh();
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", () => {
        debouncedRefresh();
      })
    );
    // 监听元数据缓存变化 - 确保文件移动后能正确刷新任务
    // 这是最关键的修复：当文件被移动时，metadataCache 需要时间更新
    // 监听 changed 事件可以确保在缓存更新完成后再刷新视图
    // 仅在文件位于任务相关路径时才触发刷新，避免全库 md 文件改动都引起防抖重置
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (!(file instanceof import_obsidian3.TFile) || file.extension !== "md") return;
        if (this.isPossibleTaskFile(file)) {
          debouncedRefresh();
        }
      })
    );
  }
  /**
   * 插件卸载
   * - 清理防抖定时器，避免卸载后定时器仍触发操作已销毁的视图
   * - 拆除本插件的视图叶子（detachLeavesOfType）：Obsidian 不会在禁用/重载插件时
   *   自动关闭视图，不拆会残留一个失联的死视图（与 important-days 同款处理）
   */
  onunload() {
    // 标记卸载，中止后台 IIFE（节假日自动刷新）
    this.unloaded = true;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    // 清理可能残留的 CreateTaskModal：调用 close() 完整回收 modalEl、overlay、全局 click 监听器
    // 兜底再删除 DOM 节点，避免 close 异常导致残留
    if (CreateTaskModal.activeInstances && CreateTaskModal.activeInstances.size > 0) {
      const instances = Array.from(CreateTaskModal.activeInstances);
      CreateTaskModal.activeInstances.clear();
      for (const inst of instances) {
        try {
          inst.close();
        } catch (e) {
        }
      }
    }
    // 真机反馈回退：类别筛选面板同样挂 Modal，卸载时关闭仍打开的实例
    if (CategoryFilterModal.activeInstances && CategoryFilterModal.activeInstances.size > 0) {
      const cfInstances = Array.from(CategoryFilterModal.activeInstances);
      CategoryFilterModal.activeInstances.clear();
      for (const inst of cfInstances) {
        try {
          inst.close();
        } catch (e) {
        }
      }
    }
    // 真机反馈回退：日期跳转恢复整屏 DatePickerModal，卸载时同样关闭仍打开的实例，
    // 避免残留可交互但已失联的弹窗
    if (DatePickerModal.activeInstances && DatePickerModal.activeInstances.size > 0) {
      const dpInstances = Array.from(DatePickerModal.activeInstances);
      DatePickerModal.activeInstances.clear();
      for (const inst of dpInstances) {
        try {
          inst.close();
        } catch (e) {
        }
      }
    }
    // 兜底清理：弹窗现宿主于 Obsidian Modal 容器内，卸载时残留实例已由上方 close() 回收，
    // 这里再扫一遍全文档防止异常路径漏网
    document.querySelectorAll(".create-task-modal").forEach((el) => {
      const container = el.closest(".modal-container");
      if (container) container.remove();
      else el.remove();
    });
    // 拆除本插件的所有视图叶子：禁用/重载后不残留失联的死视图
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_MONTHLY);
  }
  /**
   * 判断文件是否可能包含任务（用于过滤 metadataCache changed 事件）
   * 规则：
   * 1. 文件位于自定义任务文件夹或默认「任务」文件夹下
   * 2. 文件位于 Obsidian 内置「日记」插件配置的文件夹下
   * 3. 文件名形如 YYYY-MM-DD.md 或包含 YYYY年任务列表.md / YYYY年MM月任务列表.md
   * 其余路径的 md 文件改动不会触发实时刷新（modify/create/changed 三个事件统一按此过滤），
   * 手动刷新或重开视图时仍会全库扫描收录其中的任务
   */
  isPossibleTaskFile(file) {
    const p = file.path;
    if (!p) return false;
    const taskFolders = [];
    const custom = this.settings && this.settings.customTaskFolder;
    if (custom) taskFolders.push(custom);
    taskFolders.push("\u4EFB\u52A1");
    for (const folder of taskFolders) {
      if (p === folder || p.startsWith(folder + "/")) return true;
    }
    try {
      const dailyNotesPlugin = this.app.internalPlugins && this.app.internalPlugins.getPluginById && this.app.internalPlugins.getPluginById("daily-notes");
      const inst = dailyNotesPlugin && dailyNotesPlugin.instance;
      if (inst && inst.options && inst.options.folder) {
        const folder2 = inst.options.folder.replace(/\/+$/, "");
        if (folder2 && (p === folder2 || p.startsWith(folder2 + "/"))) return true;
      }
    } catch (e) {
    }
    const base = file.basename || "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(base)) return true;
    if (/^\d{4}\u5E74\u4EFB\u52A1\u5217\u8868$/.test(base)) return true;
    if (/^\d{4}\u5E74\d{2}\u6708\u4EFB\u52A1\u5217\u8868$/.test(base)) return true;
    return false;
  }
  /**
   * 切换界面语言并重绘所有受语言影响的入口。
   * 只改 I18N_LANG 是不够的：ribbon tooltip、命令面板标题在 addCommand 时
   * 就以字符串定稿，必须撤下来按新语言重注册。
   * @param setting - "auto" | "zh-CN" | "zh-TW" | "en"
   */
  async setLanguage(setting) {
    this.settings.language = setting;
    applyLanguage(setting);
    await this.saveSettings();
    if (this.ribbonIconEl) {
      this.ribbonIconEl.setAttr("title", tr("view.header.title"));
      this.ribbonIconEl.setAttr("aria-label", tr("view.header.title"));
    }
    // removeCommand 是 Obsidian 公开 API（实测 1.13.7 存在）；老版本没有时
    // 保留旧命令名，不至于因为切语言把整个插件搞崩
    if (typeof this.removeCommand === "function") {
      this.removeCommand("monthly-tasks:open-monthly-view");
      this.removeCommand("monthly-tasks:refresh-monthly-view");
      this.removeCommand("monthly-tasks:toggle-agenda-view");
    }
    this.addCommand({
      id: "open-monthly-view",
      name: tr("cmd.open"),
      callback: () => this.activateView()
    });
    this.addCommand({
      id: "refresh-monthly-view",
      name: tr("cmd.refresh"),
      callback: () => this.refreshView()
    });
    // v1.6.0 批次四：命令面板也能切视图。切语言时要与另两条一起 remove/re-add，
    // 否则命令标题会停在旧语言
    this.addCommand({
      id: "toggle-agenda-view",
      name: tr("cmd.toggle"),
      callback: () => this.toggleViewModeFromCommand()
    });
    this.refreshView();
    // 设置页若正开着，重绘成当前语言
    if (this.settingTab && this.settingTab.containerEl && this.settingTab.containerEl.childElementCount > 0) {
      this.settingTab.display();
    }
  }
  /**
   * 加载设置
   */
  async loadSettings() {
    // data.json 损坏或 JSON 解析失败时 loadData 抛错，回退到默认设置避免插件加载失败
    let loadedData;
    try {
      loadedData = await this.loadData();
    } catch (e) {
      console.error(tr("error.settingsLoad"), e);
      new import_obsidian3.Notice(tr("notice.settingsLoadFail"), 5e3);
      loadedData = {};
    }
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
    // 校验设置字段：用户手动编辑 data.json 可能写入越界值/错误类型，导致渲染异常
    for (const key of ["showCompletedTasks", "showCompletedStrike", "defaultAllDayTask", "showLunar", "showHoliday", "autoUpdateHolidays"]) {
      if (typeof this.settings[key] !== "boolean") {
        this.settings[key] = DEFAULT_SETTINGS[key];
      }
    }
    // v1.7.2 起界面语言只跟随 Obsidian：设置页不再有该选项，老 data.json 里存过的
    // 显式选择（zh-CN / en …）在这里统一归位成 auto，避免「看不见却生效」的语言锁定。
    // 内部/测试要临时指定语言，走 setLanguage()（它在 loadSettings 之后直接改内存态）。
    this.settings.language = "auto";
    applyLanguage(this.settings.language);
    // tasksPerDayLimit < 1 会让所有任务进入 +N 列表而格子无内容
    if (typeof this.settings.tasksPerDayLimit !== "number" || this.settings.tasksPerDayLimit < 1) {
      this.settings.tasksPerDayLimit = 5;
    }
    // firstDayOfWeek 仅接受 0(日)/1(一)/6(六)，其余值会导致星期行与网格错位
    if (![0, 1, 6].includes(this.settings.firstDayOfWeek)) {
      this.settings.firstDayOfWeek = 0;
    }
    // viewMode 枚举校验（对齐 firstDayOfWeek / taskFilePeriod 的写法）：手编 data.json
    // 写进非法值时回退大月视图，避免 root class 与渲染分支对不上。
    // v1.7.0：合法值来自 VIEW_MODES 常量，v1.7.1 加大周时这里不用改。
    if (!VIEW_MODES.includes(this.settings.viewMode)) {
      this.settings.viewMode = DEFAULT_SETTINGS.viewMode;
    }
    // taskFilePeriod 枚举校验：手编 data.json 写入 "week" 等非法值时回退按年
    if (this.settings.taskFilePeriod !== "month") {
      this.settings.taskFilePeriod = "year";
    }
    // categories 与现有字段同级校验：非数组回退默认；元素缺 name/color、名字非法（空/含空格/纯数字/带 #）或重名则跳过该条。
    // 注意：这里只校验「显示配置」，笔记里的 #tag 不受影响——删配置不删标签
    if (!Array.isArray(this.settings.categories)) {
      this.settings.categories = DEFAULT_SETTINGS.categories.map((c) => ({ name: c.name, color: c.color }));
    } else {
      const seenNames = /* @__PURE__ */ new Set();
      const validCats = [];
      for (const c of this.settings.categories) {
        if (!c || typeof c !== "object")
          continue;
        const name = typeof c.name === "string" ? c.name.trim() : "";
        if (!name || /\s/.test(name) || /^\d+$/.test(name) || name.includes("#") || seenNames.has(name))
          continue;
        seenNames.add(name);
        const color = CATEGORY_PALETTE.includes(c.color) ? c.color : CATEGORY_PALETTE[(seenNames.size - 1) % CATEGORY_PALETTE.length];
        validCats.push({ name, color });
      }
      this.settings.categories = validCats;
    }
    // customTaskFolder 含 \ 时 vault 永远查不到该路径（Obsidian 路径用 / 分隔），
    // 任务会写丢；归一为去掉首尾空白与尾部斜杠的合法相对路径，非法时回退默认
    if (typeof this.settings.customTaskFolder !== "string") {
      this.settings.customTaskFolder = "";
    } else {
      const normalized = this.settings.customTaskFolder.trim().replace(/\/+$/, "");
      this.settings.customTaskFolder = normalized && !normalized.includes("\\") && !normalized.startsWith("/") ? normalized : "";
    }
    // holidaysData 逐年校验：某年的值非数组或元素缺 date 字符串时，getHolidayInfo
    // 的展开操作会抛 TypeError，被渲染路径放大为整块月历不显示
    if (!this.settings.holidaysData || typeof this.settings.holidaysData !== "object" || Array.isArray(this.settings.holidaysData)) {
      this.settings.holidaysData = {};
    } else {
      for (const year of Object.keys(this.settings.holidaysData)) {
        // 非四位数字年份键（脏数据，如 "abc"/"2024abc"）会把垃圾灌进 HolidayManager 缓存，直接剔除
        if (!/^\d{4}$/.test(year)) {
          delete this.settings.holidaysData[year];
          console.warn(tr("error.holidaysDataKey", { year: year }));
          continue;
        }
        const holidays = this.settings.holidaysData[year];
        // 校验口径与 loadBuiltinHolidays（holidays.json）对齐：只查 date 会放过缺 name / type 的条目，
        // 后果是格子里渲染出 "undefined"（holiday-name），或 type 不匹配导致该日既不标假日也不标调休
        if (!Array.isArray(holidays) || !holidays.every((h) => h && typeof h.date === "string" && typeof h.name === "string" && typeof h.isOff === "boolean" && (h.type === "legal" || h.type === "workday"))) {
          delete this.settings.holidaysData[year];
          console.warn(tr("error.holidaysDataFormat", { year: year }));
        }
      }
    }
    if (this.settings.holidaysData) {
      for (const [year, holidays] of Object.entries(this.settings.holidaysData)) {
        if (!this.holidayManager.cache.has(parseInt(year))) {
          this.holidayManager.cache.set(parseInt(year), holidays);
        }
      }
    }
    await this.loadBuiltinHolidays();
  }
  /**
   * 读取插件目录下的内置节假日兜底数据（holidays.json，2022-2026 官方数据）。
   * 数据与代码分离：更新内置数据只需替换该 JSON 文件，不动代码；官方未发布年份不写预测，
   * 新年份由网络数据源（holiday-cn / timor.tech）自动覆盖。
   * 读取失败不阻塞插件（文件缺失/损坏时告警），对应年份退化为「无内置数据、依赖网络源」
   */
  async loadBuiltinHolidays() {
    try {
      const raw = await this.app.vault.adapter.read(`${this.manifest.dir}/holidays.json`);
      const data = JSON.parse(raw);
      for (const [year, holidays] of Object.entries(data)) {
        const y = parseInt(year);
        if (!Array.isArray(holidays) || !holidays.every((h) => h && typeof h.date === "string" && typeof h.name === "string" && typeof h.isOff === "boolean" && (h.type === "legal" || h.type === "workday"))) {
          console.warn(tr("error.holidaysJsonFormat", { year: year }));
          continue;
        }
        if (!this.holidayManager.cache.has(y)) {
          this.holidayManager.cache.set(y, holidays);
        }
      }
    } catch (e) {
      console.warn(tr("error.builtinHoliday"), e);
    }
  }
  /**
   * 保存设置
   */
  async saveSettings() {
    // 磁盘满/权限问题/文件被占用时 saveData 可能抛错，捕获后提示用户。
    // 不 re-throw：调用方（9 个 onChange + 1 个 IIFE）未 try/catch，re-throw 会变成 unhandled rejection 污染控制台。
    // Notice 已足够告知用户持久化失败，调用方继续执行 refreshView 基于内存新值渲染（可接受，下次重启会回滚）。
    try {
      await this.saveData(this.settings);
    } catch (e) {
      console.error(tr("error.settingsSave"), e);
      new import_obsidian3.Notice(tr("notice.settingsSaveFail"), 5e3);
    }
  }
  /**
   * 激活视图
   */
  async activateView() {
    const { workspace } = this.app;
    const existingLeaf = workspace.getLeavesOfType(VIEW_TYPE_MONTHLY)[0];
    if (existingLeaf) {
      workspace.revealLeaf(existingLeaf);
      return;
    }
    // 移动端/无右侧栏布局下 getRightLeaf 可能返回 null（manifest 声明支持移动端），
    // 回退到新建 leaf（新标签页打开），避免点击功能区图标「没反应」
    let leaf = workspace.getRightLeaf(false);
    if (!leaf) {
      leaf = workspace.getLeaf(true);
    }
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_MONTHLY });
      workspace.revealLeaf(leaf);
    } else {
      new import_obsidian3.Notice(tr("notice.cantOpenView"), 3e3);
    }
  }
  /**
   * v1.5.2 方案A：删除线开关热切换入口——对每个已加载视图做类名级更新，
   * 不做 refreshView 全量重绘（改前切一次开关要重建整个网格，手机端肉眼可见闪一下）
   */
  _applyStrikeToViews() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MONTHLY);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view && typeof view._applyStrikeClasses === "function") view._applyStrikeClasses();
    }
    // 弹窗里的 +N/已有任务列表不在视图 DOM 内：_applyStrikeClasses 用全局
    // querySelector 扫描已一并覆盖，此处无需额外处理
  }

  /**
   * 刷新视图
   * @param force 是否强制重新渲染整个视图
   */
  /**
   * v1.6.0 批次四：命令面板切视图。视图没开时先开（activateView 建 leaf 是异步的，
   * 不 await 会切不到），已开则对当前活动视图调 toggleViewMode。
   */
  async toggleViewModeFromCommand() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_MONTHLY)[0];
    if (!leaf) {
      await this.activateView();
      leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_MONTHLY)[0];
    }
    if (!leaf || !leaf.view || typeof leaf.view.toggleViewMode !== "function") return;
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    await leaf.view.toggleViewMode();
  }
  async refreshView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MONTHLY);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof MonthlyView) {
        await view.refresh(true);
      }
    }
  }
};

/**
 * ============================================================
 * MonthlyTasksSettingTab - 插件设置界面
 * ============================================================
 * 具体设置项以 display() 的实现为准（显示选项、农历与节假日、
 * 任务存储位置、节假日数据刷新等），此处不再罗列键名，避免注释与实现脱节。
 * ============================================================
 */
var MonthlyTasksSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    // 文件夹列表缓存（30s）：避免每次打开设置面板都调用 getAllLoadedFiles 全量遍历
    this.folderOptionsCache = null;
    this.folderOptionsCacheTime = 0;
    this.folderOptionsCacheTTL = 3e4;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    // v1.7.2：原来这里是一整块「使用提示」（10 条），手机端打开设置要先划一整屏
    // 才看到真正的开关。核心交互已随视图自带（点格子、明细区按钮有 aria-label、
    // 当天面板有占位文案），长文说明归 README。设置页只留设置。
    // 显示设置
    containerEl.createEl("h3", { text: tr("settings.section.display") });
    // v1.7.2：界面语言不再出现在设置页——插件文案直接跟随 Obsidian 的界面语言。
    // 少一个选项，也少一类「选了中文但 Obsidian 是英文」的错位；
    // setLanguage() 仍保留在插件实例上，供测试与将来需要时复用。
    // 默认视图（v1.7.0）：只管「下次打开月历是哪一档」；顶栏菜单切的是当前状态，
    // 不回写这里，避免用户点一下按钮就悄悄改掉了自己的默认设置
    new import_obsidian3.Setting(containerEl).setName(tr("settings.view.name")).setDesc(tr("settings.view.desc")).addDropdown((dropdown) => {
      for (const m of VIEW_MODES) {
        dropdown.addOption(m, viewModeLabel(m));
      }
      dropdown.setValue(this.plugin.settings.viewMode).onChange(async (value) => {
        // 走视图自己的 setViewMode，而不是「写 settings + refreshView」：顶栏的箭头
        // aria-label 与「回到本月/本周」只在 renderHeader 里生成，refreshView 不重建
        // header，会出现「网格已是周视图、顶栏还写着本月」的半拉子状态
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MONTHLY);
        if (!leaves.length) {
          this.plugin.settings.viewMode = VIEW_MODES.includes(value) ? value : DEFAULT_SETTINGS.viewMode;
          await this.plugin.saveSettings();
          return;
        }
        for (const leaf of leaves) {
          if (leaf.view instanceof MonthlyView) {
            await leaf.view.setViewMode(value);
          }
        }
      });
    });
    new import_obsidian3.Setting(containerEl).setName(tr("settings.showCompleted.name")).setDesc(tr("settings.showCompleted.desc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.showCompletedTasks).onChange(async (value) => {
      this.plugin.settings.showCompletedTasks = value;
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    new import_obsidian3.Setting(containerEl).setName(tr("settings.hideStrike.name")).setDesc(tr("settings.hideStrike.desc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.showCompletedStrike).onChange(async (value) => {
      this.plugin.settings.showCompletedStrike = value;
      await this.plugin.saveSettings();
      this.plugin._applyStrikeToViews();
    }));
    new import_obsidian3.Setting(containerEl).setName(tr("settings.showLunar.name")).setDesc(tr("settings.showLunar.desc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.showLunar).onChange(async (value) => {
      this.plugin.settings.showLunar = value;
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    new import_obsidian3.Setting(containerEl).setName(tr("settings.showHoliday.name")).setDesc(tr("settings.showHoliday.desc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.showHoliday).onChange(async (value) => {
      this.plugin.settings.showHoliday = value;
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    // 任务与存储设置
    containerEl.createEl("h3", { text: tr("settings.section.storage") });
    new import_obsidian3.Setting(containerEl).setName(tr("settings.defaultAllDay.name")).setDesc(tr("settings.defaultAllDay.desc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.defaultAllDayTask).onChange(async (value) => {
      this.plugin.settings.defaultAllDayTask = value;
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    new import_obsidian3.Setting(containerEl).setName(tr("settings.firstDow.name")).setDesc(tr("settings.firstDow.desc")).addDropdown((dropdown) => dropdown.addOption("0", tr("modal.create.weekday.sun")).addOption("1", tr("modal.create.weekday.mon")).addOption("6", tr("modal.create.weekday.sat")).setValue(String(this.plugin.settings.firstDayOfWeek)).onChange(async (value) => {
      this.plugin.settings.firstDayOfWeek = parseInt(value);
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    new import_obsidian3.Setting(containerEl).setName(tr("settings.tasksLimit.name")).setDesc(tr("settings.tasksLimit.desc")).addDropdown((dropdown) => dropdown.addOption("3", "3").addOption("4", "4").addOption("5", "5").addOption("6", "6").addOption("7", "7").addOption("8", "8").addOption("9", "9").addOption("10", "10").setValue(String(this.plugin.settings.tasksPerDayLimit)).onChange(async (value) => {
      this.plugin.settings.tasksPerDayLimit = parseInt(value);
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    // 类别管理（批次二⑦）：只维护「已知类别列表 + 顺序 + 颜色」。
    // 类别真身是任务行尾的 #tag：这里增删改都不碰任何笔记；删掉某类别只是取消它的排序与配色，
    // 笔记里残留的标签仍会被解析、仍出现在筛选面板（自动补到列表尾部）
    containerEl.createEl("h3", { text: tr("settings.section.category") });
    new import_obsidian3.Setting(containerEl).setName(tr("settings.catKnown.name")).setDesc(tr("settings.catKnown.desc"));
    const categoryListEl = containerEl.createDiv("mt-category-list");
    const renderCategoryList = () => {
      categoryListEl.empty();
      const cats = this.plugin.settings.categories;
      if (cats.length === 0) {
        categoryListEl.createDiv("mt-category-empty").textContent = tr("settings.catEmpty");
      }
      cats.forEach((cat, index) => {
        const row = categoryListEl.createDiv("mt-category-row");
        const dot = row.createDiv("mt-category-dot");
        dot.style.setProperty("--mt-cat-color", cat.color);
        row.createDiv("mt-category-name").textContent = `#${cat.name}`;
        // 颜色只从固定色板轮换选择，不开放自由取色（控制复杂度，并保证暗色模式可辨）
        const colorSel = row.createEl("select", { cls: "mt-category-color", attr: { "aria-label": tr("settings.catColor", { name: cat.name }) } });
        CATEGORY_PALETTE.forEach((c, ci) => {
          const opt = colorSel.createEl("option", { value: c });
          opt.textContent = tr("settings.catSwatch", { n: ci + 1 });
          if (c === cat.color)
            opt.selected = true;
        });
        colorSel.style.setProperty("--mt-cat-color", cat.color);
        colorSel.addEventListener("change", async () => {
          cat.color = colorSel.value;
          colorSel.style.setProperty("--mt-cat-color", cat.color);
          dot.style.setProperty("--mt-cat-color", cat.color);
          await this.plugin.saveSettings();
          this.plugin.refreshView();
        });
        const upBtn = row.createEl("button", { cls: "mt-category-btn", text: "↑", attr: { "aria-label": tr("settings.catUp", { name: cat.name }) } });
        upBtn.disabled = index === 0;
        upBtn.addEventListener("click", async () => {
          const arr = this.plugin.settings.categories;
          const tmp = arr[index - 1];
          arr[index - 1] = arr[index];
          arr[index] = tmp;
          await this.plugin.saveSettings();
          renderCategoryList();
        });
        const downBtn = row.createEl("button", { cls: "mt-category-btn", text: "↓", attr: { "aria-label": tr("settings.catDown", { name: cat.name }) } });
        downBtn.disabled = index === cats.length - 1;
        downBtn.addEventListener("click", async () => {
          const arr = this.plugin.settings.categories;
          const tmp2 = arr[index + 1];
          arr[index + 1] = arr[index];
          arr[index] = tmp2;
          await this.plugin.saveSettings();
          renderCategoryList();
        });
        const delBtn = row.createEl("button", { cls: "mt-category-btn mt-category-del", text: tr("settings.catDelete"), attr: { "aria-label": tr("settings.catDeleteAria", { name: cat.name }) } });
        delBtn.addEventListener("click", async () => {
          this.plugin.settings.categories.splice(index, 1);
          await this.plugin.saveSettings();
          this.plugin.refreshView();
          renderCategoryList();
        });
      });
      const addRow = categoryListEl.createDiv("mt-category-row mt-category-add");
      const nameInput = addRow.createEl("input", { cls: "mt-category-input", attr: { type: "text", placeholder: tr("settings.catPlaceholder") } });
      const addBtn = addRow.createEl("button", { cls: "mt-category-btn mt-category-addbtn", text: tr("settings.catAdd") });
      const doAdd = async () => {
        const raw = nameInput.value.trim();
        // 与 Obsidian 标签规则一致：非空、不含空格、非纯数字、不含 #；重名明确拒绝而非静默吞掉
        if (!raw || /\s/.test(raw) || /^\d+$/.test(raw) || raw.includes("#")) {
          new import_obsidian3.Notice(tr("notice.catInvalid"), 4e3);
          return;
        }
        if (this.plugin.settings.categories.some((c) => c.name === raw)) {
          new import_obsidian3.Notice(tr("notice.catExists", { name: raw }), 3e3);
          return;
        }
        const used = this.plugin.settings.categories.map((c) => c.color);
        const free = CATEGORY_PALETTE.find((c) => !used.includes(c));
        this.plugin.settings.categories.push({ name: raw, color: free || CATEGORY_PALETTE[this.plugin.settings.categories.length % CATEGORY_PALETTE.length] });
        await this.plugin.saveSettings();
        this.plugin.refreshView();
        renderCategoryList();
      };
      addBtn.addEventListener("click", doAdd);
      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229)
          doAdd();
      });
    };
    renderCategoryList();
    // 任务归档周期：决定新任务写入哪个文件；切换不影响已有文件
    new import_obsidian3.Setting(containerEl).setName(tr("settings.section.archive")).setDesc(tr("settings.archive.desc")).addDropdown((dropdown) => dropdown.addOption("year", tr("settings.archive.year")).addOption("month", tr("settings.archive.month")).setValue(this.plugin.settings.taskFilePeriod).onChange(async (value) => {
      this.plugin.settings.taskFilePeriod = value === "month" ? "month" : "year";
      await this.plugin.saveSettings();
      // 粒度切换后必须清路径缓存，否则新任务会写回旧粒度的文件
      this.plugin.taskParser.taskFileCache.clear();
      this.plugin.taskParser.invalidateCache();
      this.plugin.refreshView();
    }));
    // 自定义任务文件夹设置
    const folderOptions = this.getFolderOptions();
    new import_obsidian3.Setting(containerEl).setName(tr("settings.section.folder")).setDesc(tr("settings.folder.desc")).addDropdown((dropdown) => {
      dropdown.addOption("", tr("settings.folder.default"));
      for (const [path, name] of Object.entries(folderOptions)) {
        dropdown.addOption(path, name);
      }
      // 已保存的文件夹可能已被删除：补一个「已失效」占位项回显原路径——
      // 否则 setValue 选不中任何项，界面空白但旧值仍留在设置里，用户难以察觉
      const savedFolder = this.plugin.settings.customTaskFolder;
      if (savedFolder && !(savedFolder in folderOptions)) {
        dropdown.addOption(savedFolder, tr("settings.folder.dead", { folder: savedFolder }));
      }
      dropdown.setValue(savedFolder);
      dropdown.onChange(async (value) => {
        this.plugin.settings.customTaskFolder = value;
        await this.plugin.saveSettings();
        // 清除缓存，以便下次创建任务时重新查找
        this.plugin.taskParser.invalidateCache();
      });
    });
    // 节假日数据设置
    containerEl.createEl("h3", { text: tr("settings.section.holiday") });
    new import_obsidian3.Setting(containerEl).setName(tr("settings.autoHoliday.name")).setDesc(tr("settings.autoHoliday.desc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.autoUpdateHolidays).onChange(async (value) => {
      this.plugin.settings.autoUpdateHolidays = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName(tr("settings.refreshHoliday.name")).setDesc(tr("settings.refreshHoliday.desc")).addButton((button) => {
      button.setButtonText(tr("settings.refreshBtn"));
      button.buttonEl.addEventListener("click", async () => {
        const currentYear = new Date().getFullYear();
        button.setDisabled(true);
        button.setButtonText(tr("settings.loading"));
        try {
          // updateFromNetwork 内部 try/catch 吞掉异常返回 false，需检查返回值判断真实成败
          const results = await Promise.all([
            this.plugin.holidayManager.updateFromNetwork(currentYear - 1),
            this.plugin.holidayManager.updateFromNetwork(currentYear),
            this.plugin.holidayManager.updateFromNetwork(currentYear + 1)
          ]);
          if (results.some((r) => r === true)) {
            // 至少一年成功才合并保存：仅更新本次请求的三年，保留其他年份已有数据，避免 data.json 持续膨胀
            const newHolidaysData = { ...this.plugin.settings.holidaysData };
            for (const year of [currentYear - 1, currentYear, currentYear + 1]) {
              const holidays = this.plugin.holidayManager.cache.get(year);
              if (holidays) {
                newHolidaysData[year] = holidays;
              }
            }
            this.plugin.settings.holidaysData = newHolidaysData;
            await this.plugin.saveSettings();
            this.plugin.refreshView();
            const failedCount = results.filter((r) => r !== true).length;
            if (failedCount > 0) {
              new import_obsidian3.Notice(tr("notice.holidayPartial", { ok: results.length - failedCount, total: results.length }), 3e3);
            } else {
              new import_obsidian3.Notice(tr("notice.holidayRefreshed"), 3e3);
            }
          } else {
            new import_obsidian3.Notice(tr("notice.holidayRefreshFail"), 5e3);
          }
        } catch (e) {
          console.warn(tr("error.refreshHoliday"), e);
          new import_obsidian3.Notice(tr("notice.holidayRefreshFail"), 5e3);
        } finally {
          button.setDisabled(false);
          button.setButtonText(tr("settings.refreshBtn"));
        }
      });
    });

  }

  /**
   * 获取库中所有文件夹选项（带 30s 缓存）
   * 缓存命中时直接返回，避免每次打开设置面板都全量遍历 vault。
   * @returns {Object} 文件夹路径 -> 显示名称的映射
   */
  getFolderOptions() {
    // 1. 命中缓存直接返回
    const now = Date.now();
    if (this.folderOptionsCache && now - this.folderOptionsCacheTime < this.folderOptionsCacheTTL) {
      return this.folderOptionsCache;
    }

    const options = {};
    const folders = /* @__PURE__ */ new Set();

    // 2. 遍历所有文件，收集文件夹路径
    // 过滤隐藏目录：以「.」开头的路径段视为隐藏目录（如 .obsidian/.trash/.git 等），
    // 这些目录通常是系统/插件内部目录，不应作为任务文件夹候选
    const isHiddenPath = (p) => p.split("/").some((seg) => seg.startsWith("."));
    const files = this.app.vault.getAllLoadedFiles();
    for (const file of files) {
      if (file.parent) {
        let current = file.parent;
        while (current && current.path !== "/" && !isHiddenPath(current.path)) {
          folders.add(current.path);
          current = current.parent;
        }
      }
    }

    // 3. 排序并添加到选项
    const sortedFolders = Array.from(folders).sort();
    for (const folder of sortedFolders) {
      options[folder] = folder;
    }

    // 4. 写入缓存
    this.folderOptionsCache = options;
    this.folderOptionsCacheTime = now;
    return options;
  }
};
