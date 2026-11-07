/*
 * ============================================================
 * 月历任务插件 (Monthly Tasks Plugin)
 * ============================================================
 *
 * 插件功能：滴答清单风格的月视图任务管理，支持农历、节假日和调休显示
 * 版本：1.8.5
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
 * 1. TaskModel
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
 *    - 节假日管理（数据源链：holiday-cn 社区源 → timor.tech 备份源 → 随 main.js 分发的内置兜底）
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
// module 是宿主 CommonJS 加载器注入的全局（不是浏览器全局），这里显式声明，
// 免得自动审核的 no-undef 把它当未定义变量。
/* global module -- 宿主以 CommonJS 加载 main.js，module 由加载器注入 */
var main_exports = {};
__export(main_exports, {
  default: () => MonthlyTasksPlugin
});
module.exports = __toCommonJS(main_exports);
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
    "cmd.open": "打开月历任务视图",
    "cmd.refresh": "刷新月历任务视图",
    "cmd.toggle": "循环切换月历视图（大月 / 小月 / 大周 / 小周 / 三天视图）",
    "error.badDateConsole": "月历任务：无法识别的日期任务行 ({path}:{line}): {text}",
    "error.builtinHoliday": "月历任务：插件目录下的 holidays.json 解析失败，已改用随包内置的节假日数据",
    "error.createFail": "创建任务失败:",
    "error.delayRefresh": "延迟刷新失败:",
    "error.deleteFail": "删除任务失败:",
    "error.deleteOldFail": "删除原任务行失败:",
    "error.fileNotFound": "文件不存在: {path}",
    "error.fileNotFound2": "文件不存在: {path}",
    "error.folderCreate": "在文件夹「{folder}」创建任务文件失败:",
    "error.holidayApi": "节假日数据：{year} 年 API 调用失败",
    "error.holidayApiEmpty": "节假日数据：{year} 年 API 返回了 holiday 字段但未解析出任何有效条目，响应结构可能已变化",
    "error.holidayApiFormat": "API格式错误",
    "error.holidayCN": "月历任务：holiday-cn 数据源获取 {year} 年失败，尝试 timor.tech",
    "error.holidayCNFormat": "holiday-cn 数据格式错误",
    "error.holidayTimeout1": "请求超时（8s）：{year}年节假日数据",
    "error.holidayTimeout2": "请求超时（8s）：{year}年 holiday-cn 数据",
    "error.holidaysDataFormat": "月历任务：holidaysData 中 {year} 年的数据格式非法，已忽略",
    "error.holidaysDataKey": "月历任务：holidaysData 中键「{year}」不是合法年份，已忽略",
    "error.holidaysJsonFormat": "月历任务：holidays.json 中 {year} 年的数据格式非法，已忽略",
    "error.lineInvalid1": "行号已失效，该行不是任务：{line}",
    "error.lineInvalid2": "行号已失效，该行不是目标任务：{line}",
    "error.lineInvalidDel1": "行号已失效，该行不是任务，拒绝删除：{line}",
    "error.lineInvalidDel2": "行号已失效，该行不是目标任务，拒绝删除：{line}",
    "error.lineRange": "行号超出范围: {line}",
    "error.loadTasks": "加载任务失败:",
    "error.noteSaveFail": "备注保存失败:",
    "error.oversizedConsole": "月历任务：跨天任务区间 {start} ~ {due} 超过 {limit} 天，仅挂载首尾两日 ({path}:{line}): {content}",
    "error.parseFile": "解析文件失败: {path}",
    "error.postCreateRefresh": "创建后刷新视图失败:",
    "error.rawLineNotFound": "按 rawLine 未找到任务行: {path}",
    "error.refreshHoliday": "刷新节假日数据失败:",
    "error.refreshView": "刷新月历视图失败:",
    "error.renderGrid": "重绘日历网格失败:",
    "error.settingsLoad": "设置加载失败，使用默认设置:",
    "error.settingsSave": "设置保存失败:",
    "error.toggleFail": "切换任务状态失败:",
    "file.autoCreated": "由「月历任务」插件自动创建。",
    "holiday.workday": "班",
    "lunar.branch.1": "子",
    "lunar.branch.10": "酉",
    "lunar.branch.11": "戌",
    "lunar.branch.12": "亥",
    "lunar.branch.2": "丑",
    "lunar.branch.3": "寅",
    "lunar.branch.4": "卯",
    "lunar.branch.5": "辰",
    "lunar.branch.6": "巳",
    "lunar.branch.7": "午",
    "lunar.branch.8": "未",
    "lunar.branch.9": "申",
    "lunar.day.1": "初一",
    "lunar.day.10": "初十",
    "lunar.day.11": "十一",
    "lunar.day.12": "十二",
    "lunar.day.13": "十三",
    "lunar.day.14": "十四",
    "lunar.day.15": "十五",
    "lunar.day.16": "十六",
    "lunar.day.17": "十七",
    "lunar.day.18": "十八",
    "lunar.day.19": "十九",
    "lunar.day.2": "初二",
    "lunar.day.20": "二十",
    "lunar.day.21": "廿一",
    "lunar.day.22": "廿二",
    "lunar.day.23": "廿三",
    "lunar.day.24": "廿四",
    "lunar.day.25": "廿五",
    "lunar.day.26": "廿六",
    "lunar.day.27": "廿七",
    "lunar.day.28": "廿八",
    "lunar.day.29": "廿九",
    "lunar.day.3": "初三",
    "lunar.day.30": "三十",
    "lunar.day.4": "初四",
    "lunar.day.5": "初五",
    "lunar.day.6": "初六",
    "lunar.day.7": "初七",
    "lunar.day.8": "初八",
    "lunar.day.9": "初九",
    "lunar.leap": "闰{monthName}月",
    "lunar.month.1": "正",
    "lunar.month.10": "十",
    "lunar.month.11": "冬",
    "lunar.month.12": "腊",
    "lunar.month.2": "二",
    "lunar.month.3": "三",
    "lunar.month.4": "四",
    "lunar.month.5": "五",
    "lunar.month.6": "六",
    "lunar.month.7": "七",
    "lunar.month.8": "八",
    "lunar.month.9": "九",
    "lunar.monthSuffix": "{monthName}月",
    "lunar.rangeError": "年份超出支持范围（1900-2100）",
    "lunar.stem.1": "甲",
    "lunar.stem.10": "癸",
    "lunar.stem.2": "乙",
    "lunar.stem.3": "丙",
    "lunar.stem.4": "丁",
    "lunar.stem.5": "戊",
    "lunar.stem.6": "己",
    "lunar.stem.7": "庚",
    "lunar.stem.8": "辛",
    "lunar.stem.9": "壬",
    "lunar.zodiac.1": "鼠",
    "lunar.zodiac.10": "鸡",
    "lunar.zodiac.11": "狗",
    "lunar.zodiac.12": "猪",
    "lunar.zodiac.2": "牛",
    "lunar.zodiac.3": "虎",
    "lunar.zodiac.4": "兔",
    "lunar.zodiac.5": "龙",
    "lunar.zodiac.6": "蛇",
    "lunar.zodiac.7": "马",
    "lunar.zodiac.8": "羊",
    "lunar.zodiac.9": "猴",
    "modal.create.add": "添加任务",
    "modal.create.allDay": "全天",
    "modal.create.cancel": "取消",
    "modal.create.catMore": "更多",
    "modal.create.category": "类别",
    "modal.create.categoryAria": "类别 {label}",
    "modal.create.collapse": "收起",
    "modal.create.dateLine": "{m}月{day}日 · {weekday}",
    "modal.create.delete": "删除任务",
    "task.deletedToast": "已删除",
    "task.undo": "撤销",
    "task.undoFail": "撤销失败，请手动补回",
    "modal.create.deleteFail": "删除失败，该任务可能已被修改，将刷新列表",
    "modal.create.displayDate": "{y}/{m}/{d}",
    "modal.create.edit": "编辑任务",
    "modal.create.empty": "任务内容不能为空（元数据标记已被自动剥离）",
    "modal.create.endBeforeStart": "结束日期不能早于开始日期",
    "modal.create.endBeforeStartTime": "结束时间须晚于开始时间",
    "modal.create.endNeedToggle": "先勾选跨天",
    "modal.create.existingCount": "该日已有 {n} 个任务",
    "modal.create.expand": "展开",
    "modal.create.fail": "创建任务失败，请重试",
    "modal.create.fillBoth": "请同时填写开始与结束时间",
    "modal.create.goto": "跳转到文档",
    "modal.create.high": "高",
    "modal.create.medium": "中",
    "modal.create.multiDay": "跨天任务",
    "modal.create.noDateMark": "该任务没有日期标记，无法定位编辑",
    "modal.create.none": "普通",
    "modal.create.note": "备注",
    "modal.create.noteAdd": "＋添加备注",
    "modal.create.noteAria": "为这条任务写备注",
    "modal.create.notePlaceholder": "输入备注，可多行...",
    "modal.create.placeholder": "输入任务内容...",
    "modal.create.pleaseSelect": "请选择日期",
    "modal.create.priority": "优先级",
    "modal.create.save": "保存",
    "modal.create.setTime": "+ 设置时间",
    "modal.create.time": "时间",
    "modal.create.timeInvalidKept": "任务里的时间值 {time} 不是有效的时钟时间，已原样保留；如需修改请直接编辑笔记中该行",
    "modal.create.to": "至",
    "modal.create.toggleComplete": "切换完成状态",
    "modal.create.toggleFail": "操作失败，该任务可能已被修改，将刷新列表",
    "modal.create.viewAll": "查看全部 {n} 个任务 ▾",
    "modal.create.weekday.fri": "周五",
    "modal.create.weekday.mon": "周一",
    "modal.create.weekday.sat": "周六",
    "modal.create.weekday.sun": "周日",
    "modal.create.weekday.thu": "周四",
    "modal.create.weekday.tue": "周二",
    "modal.create.weekday.wed": "周三",
    "modal.date.confirm": "确定",
    "modal.date.currentYear": "当前年份: {year}",
    "modal.date.month": "月份",
    "modal.date.monthSuffix": "{m}月",
    "modal.date.title": "选择日期",
    "modal.date.year": "年份",
    "modal.date.yearSuffix": "{y}年",
    "modal.filter.all": "全部",
    "modal.filter.selected": "已选 {n}",
    "modal.filter.title": "按类别筛选",
    "modal.filter.untagged": "无标签",
    "notice.badDate": "月历任务：发现 📅/🛫 后日期无法识别（含非法日期如 2026-02-30）的任务行，已忽略（详情见控制台）",
    "notice.cantOpenView": "月历任务：无法打开视图，请重启 Obsidian 后重试",
    "notice.catExists": "类别「{name}」已存在",
    "notice.catInvalid": "类别名不合法：不能为空、不能含空格或 #、不能是纯数字",
    "notice.createdRefreshFail": "任务已创建，刷新失败请手动切换月份",
    "notice.editSavedBut": "编辑已保存，但原任务行未能自动删除，请检查是否重复",
    "notice.holidayPartial": "节假日数据已刷新（{ok}/{total} 年成功）",
    "notice.holidayNoData": "节假日数据已更新；{years} 官方尚未公告，已跳过",
    "notice.holidayRefreshFail": "刷新节假日数据失败，请检查网络",
    "notice.holidayRefreshed": "节假日数据已刷新！",
    "notice.opFail": "操作失败，请重试",
    "notice.oversized": "月历任务：跨天任务区间超过 {limit} 天，仅显示开始与结束日期（详情见控制台）",
    "notice.settingsLoadFail": "设置加载失败，已回退默认设置",
    "notice.settingsBackup": "设置读取失败，已回退默认值；原文件已另存为 data.corrupt-时间戳.json，需要时可手动恢复",
    "notice.settingsBackupFail": "无法备份损坏的设置文件，已取消保存以保护原文件；请检查插件目录的文件权限与磁盘空间",
    "notice.settingsSaveFail": "设置保存失败，请检查磁盘空间与文件权限",
    "settings.archive.desc": "决定新任务写入哪个文件。切换后不影响已有文件，历史任务仍会全部显示。",
    "settings.archive.month": "按月（{file}）",
    "settings.archive.year": "按年（{file}）",
    "settings.autoHoliday.desc": "启动时预取今年前后三年的节假日数据（数据源：holiday-cn → timor.tech），不弹提示；浏览其他年份时也会按需获取缺失年份的数据",
    "settings.autoHoliday.name": "启动时自动刷新节假日",
    "settings.catAdd": "添加",
    "settings.catColor": "颜色 {name}",
    "settings.catColorNames": "蓝,紫,绿,橙,红,青,粉,灰",
    "settings.catDelete": "删除",
    "settings.catDeleteAria": "删除类别 {name}",
    "settings.catDown": "下移 {name}",
    "settings.catEmpty": "暂无已知类别，用下方输入框添加",
    "settings.catKnown.desc": "维护创建弹窗与漏斗面板的顺序和颜色。类别本身是任务行尾的 #标签，在这里增删不会修改任何笔记。",
    "settings.catKnown.name": "已知类别",
    "settings.catPlaceholder": "新类别名称，如：健身",
    "settings.catUp": "上移 {name}",
    "settings.defaultAllDay.desc": "新建任务时默认为全天任务（不带具体时间）",
    "settings.defaultAllDay.name": "默认全天任务",
    "settings.firstDow.desc": "设置日历每周的起始日",
    "settings.firstDow.name": "每周第一天",
    "settings.folder.dead": "{folder}（已失效）",
    "settings.folder.default": "默认（任务）",
    "settings.folder.desc": "选择任务文件的存储位置。如果已有年度任务文件，插件会优先使用它。",
    "settings.hideStrike.desc": "打开后已完成任务隐藏删除线（同时隐藏过期任务的红色竖线；完成态本身仍有反馈：手机端左缘灰竖条 + 变暗）",
    "settings.hideStrike.name": "已完成隐藏删除线",
    // 语言选项名：三种语言里取值刻意相同（各自显示自己的写法），
    // 别"顺手"按当前语言翻译，否则英文界面下会出现 English -> 英文
    "settings.loading": "加载中...",
    "settings.refreshBtn": "刷新",
    "settings.refreshHoliday.desc": "从 holiday-cn / timor.tech 数据源获取最新节假日数据",
    "settings.refreshHoliday.name": "刷新节假日数据",
    "settings.section.archive": "归档周期",
    "settings.section.category": "类别管理",
    "settings.section.display": "显示",
    "settings.section.folder": "记录位置",
    "settings.section.holiday": "节假日数据",
    "settings.section.storage": "任务",
    "settings.showCompleted.desc": "在月历中显示已完成的任务",
    "settings.showCompleted.name": "显示已完成任务",
    "settings.showHoliday.desc": "标注法定节假日和调休信息",
    "settings.showHoliday.name": "显示节假日",
    "settings.showLunar.desc": "在日期下方显示农历日期和节气",
    "settings.showLunar.name": "显示农历",
    "settings.tasksLimit.desc": "每个日期格子最多显示的任务数量；当天面板的任务列表超过这个数就默认收起，「查看全部」也按它出现",
    "settings.tasksLimit.name": "每日任务显示数量",
    "settings.view.desc": "打开月历时默认使用哪一档视图。顶栏切换视图后这里会跟着变成你最后用的那一档，下次打开就停在那儿。",
    "settings.view.name": "默认视图",
    "view.agenda.addOne": "添加",
    "view.agenda.clearFilterAria": "清除当前类别筛选",
    "view.agenda.emptyDay": "这天没安排",
    "view.agenda.emptyFiltered": "当前筛选下这天没有任务",
    "view.agenda.hasTaskDot": "这天有安排",
    "view.agenda.manageDay": "管理",
    "view.agenda.overdueDot": "这天有逾期未完成",
    "view.cell.category": "类别：{category}",
    "view.cell.duration": "{days}天",
    "view.cell.loadError": "任务加载失败，请查看控制台",
    "view.cell.timeDuration": "{time} · {days}天",
    "view.header.nextMonth": "下月",
    "view.header.nextThreeDay": "下三天",
    "view.header.nextWeek": "下一周",
    "view.header.pickView": "切换视图",
    "view.header.prevMonth": "上月",
    "view.header.prevThreeDay": "上三天",
    "view.header.prevWeek": "上一周",
    "view.header.thisWeek": "回到本周",
    "view.header.title": "月历任务",
    "view.header.titleTip": "点击快速切换日期",
    "view.header.today": "回到本月",
    "view.menu.title": "视图",
    "view.mode.agenda": "小月视图",
    "view.mode.bigWeek": "大周视图",
    "view.mode.desc.agenda": "整月铺满屏幕，任务在下方明细区",
    "view.mode.desc.bigWeek": "只看一周，任务写在格子里",
    "view.mode.desc.list": "整月铺满屏幕，任务写在格子里",
    "view.mode.desc.timeGrid": "三天按小时铺开，拖动排任务",
    "view.mode.desc.week": "只看一周，任务在下方明细区",
    "view.mode.list": "大月视图",
    "view.mode.timeGrid": "三天视图",
    "view.mode.week": "小周视图",
    "view.month.1": "1月",
    "view.month.10": "10月",
    "view.month.11": "11月",
    "view.month.12": "12月",
    "view.month.2": "2月",
    "view.month.3": "3月",
    "view.month.4": "4月",
    "view.month.5": "5月",
    "view.month.6": "6月",
    "view.month.7": "7月",
    "view.month.8": "8月",
    "view.month.9": "9月",
    "view.month.title": "{year}年 {monthName}",
    "view.week.load": "共 {n} 项 · 完成 {m}",
    "view.week.loadHiddenHint": "其中 {m} 项已完成，按当前设置未在格子中显示",
    "view.week.number": "第 {n} 周",
    "view.week.relative.next": "下周",
    "view.week.relative.prev": "上周",
    "view.week.relative.this": "本周",
    "view.week.title": "{a} – {b}",
    "view.timegrid.addTask": "新建任务",
    "view.timegrid.badTime": "时间段无效：结束不晚于开始",
    
    "view.timegrid.alldayLabel": "全天",
    "view.timegrid.alldayCollapse": "收起全天任务",
    "view.timegrid.alldayCount": "{n} 项",
    "view.timegrid.alldayExpand": "展开全天任务",
    "view.timegrid.today": "今天",
    "view.timegrid.updateFail": "时间没能写入，请重试",
    "view.weekday.fri": "五",
    "view.weekday.mon": "一",
    "view.weekday.sat": "六",
    "view.weekday.sun": "日",
    "view.weekday.thu": "四",
    "view.weekday.tue": "二",
    "view.weekday.wed": "三"
  },
  "zh-TW": {
    "cmd.open": "開啟月曆任務視圖",
    "cmd.refresh": "重新整理月曆任務視圖",
    "cmd.toggle": "迴圈切換月曆檢視（大月 / 小月 / 大週 / 小週 / 三天檢視）",
    "error.badDateConsole": "月曆任務：無法識別的日期任務行 ({path}:{line}): {text}",
    "error.builtinHoliday": "月曆任務：插件目錄下的 holidays.json 解析失敗，已改用隨包內建的節假日資料",
    "error.createFail": "建立任務失敗：",
    "error.delayRefresh": "延遲重新整理失敗：",
    "error.deleteFail": "刪除任務失敗：",
    "error.deleteOldFail": "刪除原任務行失敗：",
    "error.fileNotFound": "檔案不存在：{path}",
    "error.fileNotFound2": "檔案不存在：{path}",
    "error.folderCreate": "在資料夾「{folder}」建立任務檔案失敗：",
    "error.holidayApi": "節假日數據：{year} 年 API 呼叫失敗",
    "error.holidayApiEmpty": "節假日數據：{year} 年 API 傳回了 holiday 欄位但未解析出任何有效條目，回應結構可能已變化",
    "error.holidayApiFormat": "API 格式錯誤",
    "error.holidayCN": "月曆任務：holiday-cn 數據源取得 {year} 年失敗，嘗試 timor.tech",
    "error.holidayCNFormat": "holiday-cn 數據格式錯誤",
    "error.holidayTimeout1": "請求逾時（8s）：{year}年節假日數據",
    "error.holidayTimeout2": "請求逾時（8s）：{year}年 holiday-cn 數據",
    "error.holidaysDataFormat": "月曆任務：holidaysData 中 {year} 年的數據格式非法，已忽略",
    "error.holidaysDataKey": "月曆任務：holidaysData 中鍵「{year}」不是合法年份，已忽略",
    "error.holidaysJsonFormat": "月曆任務：holidays.json 中 {year} 年的數據格式非法，已忽略",
    "error.lineInvalid1": "行號已失效，該行不是任務：{line}",
    "error.lineInvalid2": "行號已失效，該行不是目標任務：{line}",
    "error.lineInvalidDel1": "行號已失效，該行不是任務，拒絕刪除：{line}",
    "error.lineInvalidDel2": "行號已失效，該行不是目標任務，拒絕刪除：{line}",
    "error.lineRange": "行號超出範圍：{line}",
    "error.loadTasks": "載入任務失敗：",
    "error.noteSaveFail": "備註儲存失敗：",
    "error.oversizedConsole": "月曆任務：跨天任務區間 {start} ~ {due} 超過 {limit} 天，僅掛載首尾兩日 ({path}:{line}): {content}",
    "error.parseFile": "解析檔案失敗：{path}",
    "error.postCreateRefresh": "建立後重新整理視圖失敗：",
    "error.rawLineNotFound": "按 rawLine 未找到任務行：{path}",
    "error.refreshHoliday": "重新整理節假日數據失敗：",
    "error.refreshView": "重新整理月曆檢視失敗：",
    "error.renderGrid": "重繪月曆網格失敗：",
    "error.settingsLoad": "設定載入失敗，使用預設值：",
    "error.settingsSave": "設定儲存失敗：",
    "error.toggleFail": "切換任務狀態失敗：",
    "file.autoCreated": "由「月曆任務」插件自動創建。",
    "holiday.workday": "班",
    "lunar.branch.1": "子",
    "lunar.branch.10": "酉",
    "lunar.branch.11": "戌",
    "lunar.branch.12": "亥",
    "lunar.branch.2": "丑",
    "lunar.branch.3": "寅",
    "lunar.branch.4": "卯",
    "lunar.branch.5": "辰",
    "lunar.branch.6": "巳",
    "lunar.branch.7": "午",
    "lunar.branch.8": "未",
    "lunar.branch.9": "申",
    "lunar.day.1": "初一",
    "lunar.day.10": "初十",
    "lunar.day.11": "十一",
    "lunar.day.12": "十二",
    "lunar.day.13": "十三",
    "lunar.day.14": "十四",
    "lunar.day.15": "十五",
    "lunar.day.16": "十六",
    "lunar.day.17": "十七",
    "lunar.day.18": "十八",
    "lunar.day.19": "十九",
    "lunar.day.2": "初二",
    "lunar.day.20": "二十",
    "lunar.day.21": "廿一",
    "lunar.day.22": "廿二",
    "lunar.day.23": "廿三",
    "lunar.day.24": "廿四",
    "lunar.day.25": "廿五",
    "lunar.day.26": "廿六",
    "lunar.day.27": "廿七",
    "lunar.day.28": "廿八",
    "lunar.day.29": "廿九",
    "lunar.day.3": "初三",
    "lunar.day.30": "三十",
    "lunar.day.4": "初四",
    "lunar.day.5": "初五",
    "lunar.day.6": "初六",
    "lunar.day.7": "初七",
    "lunar.day.8": "初八",
    "lunar.day.9": "初九",
    "lunar.leap": "閏{monthName}月",
    "lunar.month.1": "正",
    "lunar.month.10": "十",
    "lunar.month.11": "冬",
    "lunar.month.12": "臘",
    "lunar.month.2": "二",
    "lunar.month.3": "三",
    "lunar.month.4": "四",
    "lunar.month.5": "五",
    "lunar.month.6": "六",
    "lunar.month.7": "七",
    "lunar.month.8": "八",
    "lunar.month.9": "九",
    "lunar.monthSuffix": "{monthName}月",
    "lunar.rangeError": "年份超出支援範圍（1900-2100）",
    "lunar.stem.1": "甲",
    "lunar.stem.10": "癸",
    "lunar.stem.2": "乙",
    "lunar.stem.3": "丙",
    "lunar.stem.4": "丁",
    "lunar.stem.5": "戊",
    "lunar.stem.6": "己",
    "lunar.stem.7": "庚",
    "lunar.stem.8": "辛",
    "lunar.stem.9": "壬",
    "lunar.zodiac.1": "鼠",
    "lunar.zodiac.10": "雞",
    "lunar.zodiac.11": "狗",
    "lunar.zodiac.12": "豬",
    "lunar.zodiac.2": "牛",
    "lunar.zodiac.3": "虎",
    "lunar.zodiac.4": "兔",
    "lunar.zodiac.5": "龍",
    "lunar.zodiac.6": "蛇",
    "lunar.zodiac.7": "馬",
    "lunar.zodiac.8": "羊",
    "lunar.zodiac.9": "猴",
    "modal.create.add": "新增任務",
    "modal.create.allDay": "全天",
    "modal.create.cancel": "取消",
    "modal.create.catMore": "更多",
    "modal.create.category": "類別",
    "modal.create.categoryAria": "類別 {label}",
    "modal.create.collapse": "收起",
    "modal.create.dateLine": "{m}月{day}日 · {weekday}",
    "modal.create.delete": "刪除任務",
    "task.deletedToast": "已刪除",
    "task.undo": "撤銷",
    "task.undoFail": "撤銷失敗，請手動補回",
    "modal.create.deleteFail": "刪除失敗，該任務可能已被修改，將重新整理列表",
    "modal.create.displayDate": "{y}/{m}/{d}",
    "modal.create.edit": "編輯任務",
    "modal.create.empty": "任務內容不能為空（元數據標記已被自動剝離）",
    "modal.create.endBeforeStart": "結束日期不能早於開始日期",
    "modal.create.endBeforeStartTime": "結束時間須晚於開始時間",
    "modal.create.endNeedToggle": "先勾選跨天",
    "modal.create.existingCount": "該日已有 {n} 個任務",
    "modal.create.expand": "展開",
    "modal.create.fail": "建立任務失敗，請重試",
    "modal.create.fillBoth": "請同時填寫開始與結束時間",
    "modal.create.goto": "跳轉到文檔",
    "modal.create.high": "高",
    "modal.create.medium": "中",
    "modal.create.multiDay": "跨天任務",
    "modal.create.noDateMark": "該任務沒有日期標記，無法定位編輯",
    "modal.create.none": "普通",
    "modal.create.note": "備註",
    "modal.create.noteAdd": "＋新增備註",
    "modal.create.noteAria": "為這條任務寫備註",
    "modal.create.notePlaceholder": "輸入備註，可多行...",
    "modal.create.placeholder": "輸入任務內容…",
    "modal.create.pleaseSelect": "請選擇日期",
    "modal.create.priority": "優先級",
    "modal.create.save": "儲存",
    "modal.create.setTime": "+ 設定時間",
    "modal.create.time": "時間",
    "modal.create.timeInvalidKept": "任務裡的時間值 {time} 不是有效的時鐘時間，已原樣保留；如需修改請直接編輯筆記中該行",
    "modal.create.to": "至",
    "modal.create.toggleComplete": "切換完成狀態",
    "modal.create.toggleFail": "操作失敗，該任務可能已被修改，將重新整理列表",
    "modal.create.viewAll": "檢視全部 {n} 個任務 ▾",
    "modal.create.weekday.fri": "週五",
    "modal.create.weekday.mon": "週一",
    "modal.create.weekday.sat": "週六",
    "modal.create.weekday.sun": "週日",
    "modal.create.weekday.thu": "週四",
    "modal.create.weekday.tue": "週二",
    "modal.create.weekday.wed": "週三",
    "modal.date.confirm": "確定",
    "modal.date.currentYear": "目前年份：{year}",
    "modal.date.month": "月份",
    "modal.date.monthSuffix": "{m}月",
    "modal.date.title": "選擇日期",
    "modal.date.year": "年份",
    "modal.date.yearSuffix": "{y}年",
    "modal.filter.all": "全部",
    "modal.filter.selected": "已選 {n}",
    "modal.filter.title": "按類別篩選",
    "modal.filter.untagged": "無標籤",
    "notice.badDate": "月曆任務：發現 📅/🛫 後日期無法識別（含非法日期如 2026-02-30）的任務行，已忽略（詳情見主控台）",
    "notice.cantOpenView": "月曆任務：無法開啟視圖，請重啟 Obsidian 後重試",
    "notice.catExists": "類別「{name}」已存在",
    "notice.catInvalid": "類別名不合法：不能為空、不能含空格或 #、不能是純數字",
    "notice.createdRefreshFail": "任務已建立，重新整理失敗請手動切換月份",
    "notice.editSavedBut": "編輯已儲存，但原任務行未能自動刪除，請檢查是否重複",
    "notice.holidayPartial": "節假日數據已重新整理（{ok}/{total} 年成功）",
    "notice.holidayNoData": "節假日資料已更新；{years} 官方尚未公告，已略過",
    "notice.holidayRefreshFail": "重新整理節假日數據失敗，請檢查網路",
    "notice.holidayRefreshed": "節假日數據已重新整理！",
    "notice.opFail": "操作失敗，請重試",
    "notice.oversized": "月曆任務：跨天任務區間超過 {limit} 天，僅顯示開始與結束日期（詳情見主控台）",
    "notice.settingsLoadFail": "設定載入失敗，已回退預設值",
    "notice.settingsBackup": "設定讀取失敗，已回退預設值；原檔案已另存為 data.corrupt-時間戳.json，需要時可手動還原",
    "notice.settingsBackupFail": "無法備份損毀的設定檔，已取消儲存以保護原檔；請檢查外掛目錄的檔案權限與磁碟空間",
    "notice.settingsSaveFail": "設定儲存失敗，請檢查磁碟空間與檔案權限",
    "settings.archive.desc": "決定新任務寫入哪個檔案。切換後不影響已有檔案，歷史任務仍會全部顯示。",
    "settings.archive.month": "按月（{file}）",
    "settings.archive.year": "按年（{file}）",
    "settings.autoHoliday.desc": "啟動時預取今年前後三年的節假日數據（數據源：holiday-cn → timor.tech），不彈提示；瀏覽其他年份時也會按需取得缺失年份的數據",
    "settings.autoHoliday.name": "啟動時自動重新整理節假日",
    "settings.catAdd": "新增",
    "settings.catColor": "顏色 {name}",
    "settings.catColorNames": "藍,紫,綠,橙,紅,青,粉,灰",
    "settings.catDelete": "刪除",
    "settings.catDeleteAria": "刪除類別 {name}",
    "settings.catDown": "下移 {name}",
    "settings.catEmpty": "暫無已知類別，用下方輸入框新增",
    "settings.catKnown.desc": "維護建立彈窗與漏斗面板的順序和顏色。類別本身是任務行尾的 #標籤，在這裡增刪不會修改任何筆記。",
    "settings.catKnown.name": "已知類別",
    "settings.catPlaceholder": "新類別名稱，如：健身",
    "settings.catUp": "上移 {name}",
    "settings.defaultAllDay.desc": "新建任務時預設為全天任務（不帶具體時間）",
    "settings.defaultAllDay.name": "預設全天任務",
    "settings.firstDow.desc": "設定日曆每週的起始日",
    "settings.firstDow.name": "每週第一天",
    "settings.folder.dead": "{folder}（已失效）",
    "settings.folder.default": "預設（任務）",
    "settings.folder.desc": "選擇任務檔案的儲存位置。如果已有年度任務檔案，外掛會優先使用它。",
    "settings.hideStrike.desc": "開啟後已完成任務隱藏刪除線（同時隱藏過期任務的紅色豎線；完成態本身仍有回饋：手機端左緣灰豎條 + 變暗）",
    "settings.hideStrike.name": "已完成隱藏刪除線",
    // 语言选项名：三种语言里取值刻意相同（各自显示自己的写法），
    // 别"顺手"按当前语言翻译，否则英文界面下会出现 English -> 英文
    "settings.loading": "載入中…",
    "settings.refreshBtn": "重新整理",
    "settings.refreshHoliday.desc": "從 holiday-cn / timor.tech 數據源取得最新節假日數據",
    "settings.refreshHoliday.name": "重新整理節假日數據",
    "settings.section.archive": "歸檔週期",
    "settings.section.category": "類別管理",
    "settings.section.display": "顯示",
    "settings.section.folder": "記錄位置",
    "settings.section.holiday": "節假日數據",
    "settings.section.storage": "任務",
    "settings.showCompleted.desc": "在月曆中顯示已完成的任務",
    "settings.showCompleted.name": "顯示已完成任務",
    "settings.showHoliday.desc": "標註法定節假日和調休資訊",
    "settings.showHoliday.name": "顯示節假日",
    "settings.showLunar.desc": "在日期下方顯示農曆日期和節氣",
    "settings.showLunar.name": "顯示農曆",
    "settings.tasksLimit.desc": "每個日期格位最多顯示的任務數量；當天面板的任務清單超過這個數就預設收起，「查看全部」也依它出現",
    "settings.tasksLimit.name": "每日任務顯示數量",
    "settings.view.desc": "開啟月曆時預設使用哪一檔檢視。頂欄切換檢視後這裡會跟著變成你最後使用的那一檔，下次開啟就停在那裡。",
    "settings.view.name": "預設檢視",
    "view.agenda.addOne": "添加",
    "view.agenda.clearFilterAria": "清除目前類別篩選",
    "view.agenda.emptyDay": "這天沒安排",
    "view.agenda.emptyFiltered": "目前篩選下這天沒有任務",
    "view.agenda.hasTaskDot": "這天有安排",
    "view.agenda.manageDay": "管理",
    "view.agenda.overdueDot": "這天有逾期未完成",
    "view.cell.category": "類別：{category}",
    "view.cell.duration": "{days}天",
    "view.cell.loadError": "任務載入失敗，請查看主控台",
    "view.cell.timeDuration": "{time} · {days}天",
    "view.header.nextMonth": "下月",
    "view.header.nextThreeDay": "下三天",
    "view.header.nextWeek": "下一週",
    "view.header.pickView": "切換檢視",
    "view.header.prevMonth": "上月",
    "view.header.prevThreeDay": "上三天",
    "view.header.prevWeek": "上一週",
    "view.header.thisWeek": "回到本週",
    "view.header.title": "月曆任務",
    "view.header.titleTip": "點擊快速切換日期",
    "view.header.today": "回到本月",
    "view.menu.title": "檢視",
    "view.mode.agenda": "小月檢視",
    "view.mode.bigWeek": "大週檢視",
    "view.mode.desc.agenda": "整月鋪滿螢幕，任務在下方明細區",
    "view.mode.desc.bigWeek": "只看一週，任務寫在格子裡",
    "view.mode.desc.list": "整月鋪滿螢幕，任務寫在格子裡",
    "view.mode.desc.timeGrid": "三天按小時鋪開，拖動排任務",
    "view.mode.desc.week": "只看一週，任務在下方明細區",
    "view.mode.list": "大月檢視",
    "view.mode.timeGrid": "三天檢視",
    "view.mode.week": "小週檢視",
    "view.month.1": "1月",
    "view.month.10": "10月",
    "view.month.11": "11月",
    "view.month.12": "12月",
    "view.month.2": "2月",
    "view.month.3": "3月",
    "view.month.4": "4月",
    "view.month.5": "5月",
    "view.month.6": "6月",
    "view.month.7": "7月",
    "view.month.8": "8月",
    "view.month.9": "9月",
    "view.month.title": "{year}年 {monthName}",
    "view.week.load": "共 {n} 項 · 完成 {m}",
    "view.week.loadHiddenHint": "其中 {m} 項已完成，依目前設定未在格子中顯示",
    "view.week.number": "第 {n} 週",
    "view.week.relative.next": "下週",
    "view.week.relative.prev": "上週",
    "view.week.relative.this": "本週",
    "view.week.title": "{a} – {b}",
    "view.timegrid.addTask": "新建任務",
    "view.timegrid.badTime": "時間段無效：結束不晚於開始",
    
    "view.timegrid.alldayLabel": "全天",
    "view.timegrid.alldayCollapse": "收合全天任務",
    "view.timegrid.alldayCount": "{n} 項",
    "view.timegrid.alldayExpand": "展開全天任務",
    "view.timegrid.today": "今天",
    "view.timegrid.updateFail": "時間沒能寫入，請重試",
    "view.weekday.fri": "五",
    "view.weekday.mon": "一",
    "view.weekday.sat": "六",
    "view.weekday.sun": "日",
    "view.weekday.thu": "四",
    "view.weekday.tue": "二",
    "view.weekday.wed": "三"
  },
  "en": {
    "cmd.open": "Open Monthly Tasks View",
    "cmd.refresh": "Refresh Monthly Tasks View",
    "cmd.toggle": "Cycle monthly view (Month Cells / Month Agenda / Week Cells / Week Agenda / 3-Day Timeline)",
    "error.badDateConsole": "Monthly Tasks: Unrecognizable date task line ({path}:{line}): {text}",
    "error.builtinHoliday": "Monthly Tasks: Failed to parse holidays.json in the plugin folder; using the built-in holiday data instead.",
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
    "error.refreshView": "Refresh calendar view failed:",
    "error.renderGrid": "Render calendar grid failed:",
    "error.settingsLoad": "Settings load failed, using defaults:",
    "error.settingsSave": "Settings save failed:",
    "error.toggleFail": "Toggle task status failed:",
    "file.autoCreated": "Auto-created by the Monthly Tasks plugin.",
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
    "modal.create.dateLine": "{m}/{day} · {weekday}",
    "modal.create.delete": "Delete Task",
    "task.deletedToast": "Deleted",
    "task.undo": "Undo",
    "task.undoFail": "Undo failed; please re-add manually",
    "modal.create.deleteFail": "Delete failed, the task may have been modified; refreshing the list",
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
    "modal.create.placeholder": "Enter task content…",
    "modal.create.pleaseSelect": "Please select date",
    "modal.create.priority": "Priority",
    "modal.create.save": "Save",
    "modal.create.setTime": "+ Set Time",
    "modal.create.time": "Time",
    "modal.create.timeInvalidKept": "Time value {time} in this task is not a valid clock time, so it was kept as-is. Edit that line in the note to change it.",
    "modal.create.to": "to",
    "modal.create.toggleComplete": "Toggle completion status",
    "modal.create.toggleFail": "Operation failed, task may have been modified, refreshing list",
    "modal.create.viewAll": "View all {n} tasks ▾",
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
    "notice.badDate": "Monthly Tasks: Found task with unrecognizable 📅/🛫 date (including invalid dates like 2026-02-30), ignored (see console)",
    "notice.cantOpenView": "Monthly Tasks: Cannot open view, please restart Obsidian and try again",
    "notice.catExists": "Category \"{name}\" already exists",
    "notice.catInvalid": "Invalid category name: cannot be empty, cannot contain spaces or #, cannot be pure numbers",
    "notice.createdRefreshFail": "Task created, refresh failed, please switch month manually",
    "notice.editSavedBut": "Edit saved, but original task line could not be auto-deleted, please check for duplicates",
    "notice.holidayPartial": "Holiday data refreshed ({ok}/{total} years successful)",
    "notice.holidayNoData": "Holiday data updated; {years} not yet announced, skipped",
    "notice.holidayRefreshFail": "Refresh holiday data failed, please check network",
    "notice.holidayRefreshed": "Holiday data refreshed!",
    "notice.opFail": "Operation failed, please retry",
    "notice.oversized": "Monthly Tasks: Multi-day range exceeds {limit} days, showing start and end only (see console)",
    "notice.settingsLoadFail": "Settings load failed, reverted to defaults",
    "notice.settingsBackup": "Settings failed to load and reverted to defaults; the original file was preserved as data.corrupt-<timestamp>.json",
    "notice.settingsBackupFail": "The damaged settings file could not be backed up. Saving was cancelled to protect it; check plugin-folder permissions and disk space",
    "notice.settingsSaveFail": "Settings save failed, please check disk space and file permissions",
    "settings.archive.desc": "Determines which file new tasks are written to. Switching doesn't affect existing files, historical tasks will still all display.",
    "settings.archive.month": "By Month ({file})",
    "settings.archive.year": "By Year ({file})",
    "settings.autoHoliday.desc": "Prefetch holiday data for three years before and after this year on startup (data source: holiday-cn → timor.tech), runs silently with no popup; also fetch missing year data on demand when browsing other years",
    "settings.autoHoliday.name": "Auto-refresh Holidays on Startup",
    "settings.catAdd": "Add",
    "settings.catColor": "Color {name}",
    "settings.catColorNames": "Blue,Purple,Green,Amber,Red,Cyan,Pink,Gray",
    "settings.catDelete": "Delete",
    "settings.catDeleteAria": "Delete Category {name}",
    "settings.catDown": "Move Down {name}",
    "settings.catEmpty": "No known categories yet, add with input box below",
    "settings.catKnown.desc": "Maintain order and color for create modal and filter panel. Categories themselves are #tags at end of task lines, adding/deleting here won't modify any notes.",
    "settings.catKnown.name": "Known Categories",
    "settings.catPlaceholder": "New category name, e.g.: Fitness",
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
    "settings.loading": "Loading…",
    "settings.refreshBtn": "Refresh",
    "settings.refreshHoliday.desc": "Get latest holiday data from holiday-cn / timor.tech data source",
    "settings.refreshHoliday.name": "Refresh Holiday Data",
    "settings.section.archive": "Archive Period",
    "settings.section.category": "Category Management",
    "settings.section.display": "Display",
    "settings.section.folder": "Location",
    "settings.section.holiday": "Holiday Data",
    "settings.section.storage": "Tasks",
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
    "view.cell.timeDuration": "{time} · {days}d",
    "view.header.nextMonth": "Next Month",
    "view.header.nextThreeDay": "Next 3 days",
    "view.header.nextWeek": "Next week",
    "view.header.pickView": "Switch view",
    "view.header.prevMonth": "Prev Month",
    "view.header.prevThreeDay": "Previous 3 days",
    "view.header.prevWeek": "Prev week",
    "view.header.thisWeek": "This week",
    "view.header.title": "Monthly Tasks",
    "view.header.titleTip": "Click to jump to date",
    "view.header.today": "Today",
    "view.menu.title": "View",
    "view.mode.agenda": "Month · Agenda",
    "view.mode.bigWeek": "Week · Cells",
    "view.mode.desc.agenda": "Whole month, tasks in the list below",
    "view.mode.desc.bigWeek": "One week only, tasks written in the cells",
    "view.mode.desc.list": "Whole month, tasks written in the cells",
    "view.mode.desc.timeGrid": "Three days by hour, drag to schedule",
    "view.mode.desc.week": "One week only, tasks in the list below",
    "view.mode.list": "Month · Cells",
    "view.mode.timeGrid": "3-Day Timeline",
    "view.mode.week": "Week · Agenda",
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
    "view.week.load": "{n} items · {m} done",
    "view.week.loadHiddenHint": "{m} of them are done and hidden from the cells under the current setting",
    "view.week.number": "Week {n}",
    "view.week.relative.next": "Next week",
    "view.week.relative.prev": "Last week",
    "view.week.relative.this": "This week",
    "view.week.title": "{a} – {b}",
    "view.timegrid.addTask": "New task",
    "view.timegrid.badTime": "Invalid time range: end is not after start",
    
    "view.timegrid.alldayLabel": "all-day",
    "view.timegrid.alldayCollapse": "Hide all-day tasks",
    "view.timegrid.alldayCount": "{n} items",
    "view.timegrid.alldayExpand": "Show all-day tasks",
    "view.timegrid.today": "Today",
    "view.timegrid.updateFail": "Couldn't save the new time. Please try again.",
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
    } catch {
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
    activeDocument.documentElement.style.setProperty("--mt-badge-work", JSON.stringify(tr("holiday.workday")));
  } catch {
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
  const bodyOnly = norm.replace(/^\s*[-*] \[[ x]\]\s*/i, "");
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
  // 与 CreateTaskModal 提交侧（submitTask）的剥离保持同一口径：🟢 优先级、
  // ➕ 创建日期 / ✅ 完成日期（Tasks 插件格式）一并清理，避免外部格式粘贴后 emoji 混入
  // 任务显示文本。两侧字符集必须逐字对齐（审计 H3）：此前提交侧漏了 ✅/➕，用户标题
  // 只写「✅ 2026-01-01」时提交侧放行、这里却把内容剥空 → parseTaskLine 返回
  // null → 该行永久留在库里但不出现在任何视图中，也无法从界面编辑或删除。
  // 改任一侧的字符集时，务必同时改另一侧。
  // 1.7.11：⏰ 的剥离已收窄到「时间形状」（HH:MM 或 HH:MM~HH:MM）。原写法把 ⏰ 后面
  // 紧跟的任意非空白词一律吃掉，于是标题里合法的「⏰ 待定」「⏰ 会后」在每次编辑保存
  // 后被永久删除（编辑走重建行，预填的是已剥过的 content）。本文件 extractTimeInfo
  // 的注释早已写明只接受 HH:MM，两处接受域至此对齐。收窄只会让 content 更不容易被剥空，
  // 与上面「两侧字符集必须逐字对齐（审计 H3）」不冲突——那条防的是孤儿行，本改动方向更安全。
  const content = cleanedLine.replace(/^\s*[-*] \[[ x]\]\s*/i, "").replace(/📅\s*\d{4}-\d{1,2}-\d{1,2}/gu, "").replace(/⏳\s*\d{4}-\d{1,2}-\d{1,2}/gu, "").replace(/🛫\s*\d{4}-\d{1,2}-\d{1,2}/gu, "").replace(/➕\s*\d{4}-\d{1,2}-\d{1,2}/gu, "").replace(/✅\s*\d{4}-\d{1,2}-\d{1,2}/gu, "").replace(/⏰\s*\d{1,2}:\d{1,2}(?:\s*[~～]\s*\d{1,2}:\d{1,2})?/gu, "").replace(/🔴|🟡|🟢/gu, "").replace(/\s+/g, " ").trim();
  return { content, category };
}

/* 解析时被剥掉、但本插件不建模的元数据（Tasks 插件等外部格式）：
   编辑走整行重建，不带走它们就等于改一次标题丢一次字段（已复现）。
   只列 cleanTaskContent 剥离集合里的未建模项：🟢 低优先级、⏳ 计划、➕ 创建、✅ 完成；
   🔴🟡📅🛫⏰ 已建模，由 _createTaskImpl 自己写回，重复保留才会出两份。 */
function extractPreservedMarkers(rawLine) {
  const markers = [];
  const re = /(?:⏳|➕|✅)\s*\d{4}-\d{1,2}-\d{1,2}|🟢/gu;
  for (const m of String(rawLine || "").matchAll(re)) markers.push(m[0]);
  return markers.join(" ");
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
  const match = rawLine.match(/⏰\s*(\d{1,2}:\d{1,2}(?:\s*[~～]\s*\d{1,2}:\d{1,2})?)/u);
  if (!match) return void 0;
  const compact = match[1].replace(/～/g, "~").replace(/\s*~\s*/g, "~");
  return normalizeTimeStr(compact);
}

/**
 * 判断是否为任务行
 * 匹配格式：- [ ] 或 - [x]（列表符号支持 - 与 *，与 rawLine 同步/勾选改写正则对齐；勾选标记不区分大小写）
 * @param line - 文本行
 * @returns 是否为任务
 */
function isTaskLine(line) {
  return /^\s*[-*] \[[ x]\]\s*/i.test(line);
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
 * 备注写回只接受缓存坐标与原文同时命中。坐标失效后即使全文件只剩一条同文任务，
 * 也无法证明它就是原任务（原任务可能刚被外部改题），因此直接失败，不猜测身份。
 */
function findTaskLineIdx(lines, task) {
  const norm = (s) => s.replace(/\s+$/, "");
  const want = norm(task.rawLine == null ? "" : task.rawLine);
  const n = task.lineNumber;
  return n >= 0 && n < lines.length && isTaskLine(lines[n]) && norm(lines[n]) === want ? n : -1;
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
 * 列表符号与 isTaskLine、勾选切换里的 rawLine 同步、_toggleTaskImpl 的勾选改写三处同口径，
 * `-` 与 `*` 都认。此前只认 `-`：手输的 `* [x]` 在 parseTaskLine 的 completed 字段永远解析成未完成（日历上
 * 勾了也显示未勾），且再点一次时 _toggleTaskImpl 判为未完成、走 `\[ \]` 那条替换——
 * 行里已是 `[x]`，替换不中 → newLine===line → return false，界面无任何反馈地
 * 永久卡死（审计 H1）。一个字符集修掉两条症状。
 * @param line - 文本行
 * @returns 是否已完成
 */
function isTaskCompleted(line) {
  return /^\s*[-*] \[x\]\s*/i.test(line);
}

/* 跨天任务挂载天数上限：超过后仅挂载首尾两日。手写的超长区间（如 1900-2100）
   整段挂载会生成数万条 map 记录并逐条渲染进格子，把内存与渲染时间线性放大 */
const MULTI_DAY_MOUNT_LIMIT = 366;
/**
 * 已提示过的超长跨天区间。用集合而不是单个布尔：同一个区间反复渲染不重复弹窗，
 * 不同区间各提示一次。封顶 32 条只为止住极端手写文件的 Notice 刷屏，
 * 正常 vault 到不了；到顶后不再记录，但 Notice 仍照常弹（只是不再去重）。
 */
const oversizedNoticed = /* @__PURE__ */ new Set();

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
          const oversizedKey = `${task.startDate}~${task.dueDate}`;
          if (!oversizedNoticed.has(oversizedKey)) {
            if (oversizedNoticed.size < 32) oversizedNoticed.add(oversizedKey);
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
    return `${y}年${m}月`;
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
    // 先声明再赋值：IIFE 在第一个 await 之前若同步抛错，finally 里的 mine 还没初始化，
    // TDZ 错误会顶掉真实异常（空任务列表/前置步骤抛错时可复现）。hoist 后真错误能冒出来
    let mine;
    mine = (async () => {
      // 并发序号守卫：forceRefresh 允许另起在途解析后，先启动的（内容较旧的）
      // 解析可能更晚完成；写缓存前校验「自己仍是最后启动的那次」，旧快照不得覆盖新结果
      const mySeq = (this.parseSeq = (this.parseSeq || 0) + 1);
      try {
        // 1.7.11：每轮扫描复位。旧写法是模块级标志、一次会话只提示一次，之后所有
        // 「带日期标记但日期非法」的行都只剩 console——用户看不到数据被跳过的规模
        invalidDateNoticeShown = false;
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
          // 本快照已作废（缓存曾失效或有更新的解析启动）：优先跟随更新的在途解析，
          // 其次用已写入的新缓存，兜底另起解析——绝不能返回可能为 null 的 this.cache 了事
          return this.parsingPromise ?? this.cache ?? this.parseAllTasks(true);
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
        // 只清自己的引用：若已有更新解析在飞，不得把新引用错清为 null
        if (this.parsingPromise === mine) this.parsingPromise = null;
      }
    })();
    this.parsingPromise = mine;
    return mine;
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
      let fence = null;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (fence) {
          const close = new RegExp(`^\\s{0,3}${fence.char}{${fence.length},}[ \\t]*\\r?$`);
          if (close.test(line)) fence = null;
          continue;
        }
        const open = line.match(/^\s{0,3}(`{3,}|~{3,})/);
        if (open) {
          fence = { char: open[1][0], length: open[1].length };
          continue;
        }
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
      console.warn(tr("error.badDateConsole", { path: filePath, line: lineNumber + 1, text: line }));
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
  toggleTask(task) {
    // 直接返回队列 Promise：弹窗提交与勾选处理器等待同一个 Promise 时，
    // 先注册的勾选状态回写也先执行，不会被 async 额外包一层后颠倒顺序。
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
      const wrote = await this._mutateFile(file, (content) => {  // v1.7.11：改写见 _mutateFile
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
        newLine = line.replace(/([-*]) \[[xX]\]/, "$1 [ ]");
      } else {
        newLine = line.replace(/([-*]) \[ \]/, "$1 [x]");
      }
      // 若替换未生效（行内容不匹配），避免静默成功
      if (newLine === line) return false;
      lines[task.lineNumber] = newLine;
      return lines.join("\n");
      });
      if (!wrote) return false;
      this.invalidateCache();
      return true;
    } catch (error) {
      console.error(tr("error.toggleFail"), error);
      return false;
    }
  }
  /**
   * 删除指定任务（按行号删除）
   * @returns {Promise<{ok:true, delta:number}|false>}
   *   成功返回 { ok: true, delta }；失败返回 false。
   *   delta = 本次写入让「被删行以下」所有行产生的**净位移**（由实现按 lines.length
   *   前后差实测，不是猜的），调用方据此补偿自己手里那份任务快照的 lineNumber。
   *   审计 M4：位移有三种形态——纯任务行 -1；带备注块（> 降级 + 补一个空行）净 0；
   *   无备注且触发孤儿空行自愈 -2。旧实现让调用方一律按 -1 补偿，后两种必然错位，
   *   错位后下一次删除过不了 _deleteTaskImpl 的行号身份校验而静默 return false。
   *   返回对象而非 true 是刻意的：唯一调用方写的是 `if (ok)`，真值语义不变。
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
      let deltaOut = 0; // 回调内算出的真实位移，写成功后再交出去
      const wrote = await this._mutateFile(file, (content) => {  // v1.7.11
      const lines = content.split("\n");
      // 审计 M4：记录删除前的总行数，末尾用 lines.length 之差把**真实位移**返回给调用方。
      // 本函数只在 task.lineNumber 及其之后增删行，所以「之后的行数差」恒等于
      // 「被删行以下所有行的净位移」，不需要对三种形态分别做算术。
      const lineCountBefore = lines.length;
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
      deltaOut = lines.length - lineCountBefore; // 审计 M4：-1 / 0 / -2 三形态见 deleteTask 的 JSDoc
      return lines.join("\n");
      });
      if (!wrote) return false;
      this.invalidateCache();
      return { ok: true, delta: deltaOut };
    } catch (error) {
      console.error(tr("error.deleteFail"), error);
      return false;
    }
  }
  /**
   * 批次三：编辑「先建后删」的旧行删除入口。
   * 新行插入后旧行 lineNumber 常发生偏移（同文件新行可能排在旧行之前），
   * 用本次创建实际增加的行数补偿旧坐标，再同时核对任务类型与完整原文。
   * 坐标失效后不做同文搜索：唯一同文也不能证明身份。找不到返回 false。
   * 排 writeQueue 串行，与勾选/删除/创建互斥。
   */
  // 批次三：options.created 传入本次链路刚写入的新行坐标；无论它长什么样都不得删除
  // ——那正是用户刚保存的结果
  async deleteTaskByRawLine(filePath, rawLine, preferredLineNumber, options) {
    const run = () => this._deleteTaskByRawLineImpl(filePath, rawLine, preferredLineNumber, options);
    this.writeQueue = this.writeQueue.then(run, run);
    return this.writeQueue;
  }
  async _deleteTaskByRawLineImpl(filePath, rawLine, preferredLineNumber, options) {
    try {
      const norm = (s) => s.replace(/\s+$/, "");
      const want = norm(rawLine);
      const createdToken = options && options.created ? options.created : null;
      const createdInFile = !!(createdToken && createdToken.filePath === filePath);
      const isNewRow = (n) => !!(createdInFile && createdToken.index === n);
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof import_obsidian.TFile)) {
        console.error(tr("error.fileNotFound2", { path: filePath }));
        return false;
      }
      const wrote = await this._mutateFile(file, (content) => {  // v1.7.11
      const linesArr = content.split("\n");
      if (createdInFile && (createdToken.index < 0 || createdToken.index >= linesArr.length || norm(linesArr[createdToken.index]) !== norm(createdToken.text))) {
        console.error(tr("error.rawLineNotFound", { path: filePath }));
        return false;
      }
      const insertedBeforeOld = createdInFile && createdToken.index <= preferredLineNumber;
      const expectedLineNumber = preferredLineNumber + (insertedBeforeOld ? createdToken.lineDelta : 0);
      let idx = -1;
      if (expectedLineNumber >= 0 && expectedLineNumber < linesArr.length &&
          isTaskLine(linesArr[expectedLineNumber]) && norm(linesArr[expectedLineNumber]) === want &&
          !isNewRow(expectedLineNumber)) {
        idx = expectedLineNumber;
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
      return linesArr.join("\n");
      });
      if (!wrote) return false;
      this.invalidateCache();
      return true;
    } catch (error) {
      console.error(tr("error.deleteOldFail"), error);
      return false;
    }
  }
  /**
   * 以「落盘瞬间的磁盘内容」为准做一次性改写（2026-10-12，v1.7.11）。
   * 旧写法是 read → 同步字符串手术 → modify，两端之间隔着 await：这期间外部
   * （编辑器另一栏、Obsidian Sync、其它插件、脚本）对同一文件的改动，会被
   * 「我读到的旧全文＋我这一处改动」整体盖掉。writeQueue 只串行化插件自己的写，
   * 管不住外部——而弹窗里的「跳转」按钮正是把归档文件开进编辑器，这个并发场景
   * 是插件自己引导出来的。
   * vault.process 的回调拿到的就是写入前的最新内容，且同文件写互斥，是官方给的
   * 正解；老版本没有该 API 时退回原 read/modify 路径（不比修复前更糟）。
   * @param transform - (当前内容) => 新内容字符串；返回非字符串表示放弃本次写
   * @returns 是否真的写了
   */
  async _mutateFile(file, transform) {
    const vault = this.app.vault;
    if (typeof vault.process === "function") {
      let wrote = false;
      await vault.process(file, (data) => {
        const out = transform(data);
        if (typeof out !== "string") return data; // 放弃：原样返回即不产生写入
        wrote = true;
        return out;
      });
      return wrote;
    }
    const out = transform(await vault.read(file));
    if (typeof out !== "string") return false;
    await vault.modify(file, out);
    return true;
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
      const wrote = await this._mutateFile(file, (content) => {  // v1.7.11
      const lines = content.split("\n");
      const idx = findTaskLineIdx(lines, task);
      if (idx === -1) {
        // 定位不到就什么都不写：宁可保存失败让用户重试，也不能把备注挂到别的任务上
        console.error(tr("error.rawLineNotFound", { path: task.filePath }));
        return false;
      }
      writeNoteAfter(lines, idx, noteText, content.includes("\r\n"));
      return lines.join("\n");
      });
      if (!wrote) return false;
      this.invalidateCache();
      return true;
    } catch (error) {
      console.error(tr("error.noteSaveFail"), error);
      return false;
    }
  }
  /**
   * 三天视图拖拽/拉伸的落盘入口：只改行内 ⏰ 段，不重建任务行。
   * 重建行会换 createdAt、重排行号，还要连带备注搬一次——拖一下不值得；
   * 这里按 rawLine 精确定位，改不中就不写，绝不猜。
   * @param task - 需 filePath / rawLine / lineNumber
   * @param time - "HH:MM" 或 "HH:MM~HH:MM"；空串表示去掉时间标记
   */
  async updateTaskTime(task, time) {
    const run = () => this._updateTaskTimeImpl(task, time);
    this.writeQueue = this.writeQueue.then(run, run);
    return this.writeQueue;
  }
  async _updateTaskTimeImpl(task, time) {
    try {
      const file = this.app.vault.getAbstractFileByPath(task.filePath);
      if (!(file instanceof import_obsidian.TFile)) {
        console.error(tr("error.fileNotFound", { path: task.filePath }));
        return false;
      }
      const value = String(time || "").trim();
      if (value && !/^\d{1,2}:\d{2}(?:~\d{1,2}:\d{2})?$/.test(value)) return false;
      const wrote = await this._mutateFile(file, (content) => {
        const lines = content.split("\n");
        const idx = findTaskLineIdx(lines, task);
        if (idx === -1) {
          console.error(tr("error.rawLineNotFound", { path: task.filePath }));
          return false;
        }
        // CRLF 文件：先把行尾 \r 摘下来，处理完在写回时放回。
        // 行内清理用的 \s（timeRe 尾部、trimEnd、/\s+$/）都会把 \r 一起吃掉，
        // 那一行就混成裸 LF 了——旧链路有整文件级的换行保持，这两个新方法没有
        const rawLine = lines[idx];
        const cr = rawLine.endsWith("\r") ? "\r" : "";
        const line = cr ? rawLine.slice(0, -1) : rawLine;
        const timeRe = /⏰\s*\d{1,2}:\d{1,2}(?:\s*[~～]\s*\d{1,2}:\d{1,2})?\s*/u;
        let newLine;
        if (timeRe.test(line)) {
          newLine = value ? line.replace(timeRe, `⏰ ${value} `) : line.replace(timeRe, "");
        } else if (value) {
          // 写在新位置：📅 之前（与 _createTaskImpl 的标记顺序 内容→🛫→⏰→📅 一致）；
          // 没有 📅 就插在行尾标签串之前；都没有则补在行末
          if (/📅\s*\d{4}-\d{1,2}-\d{1,2}/u.test(line)) {
            newLine = line.replace(/(\s*)(📅\s*\d{4}-\d{1,2}-\d{1,2})/u, ` ⏰ ${value} $2`);
          } else {
            const tags = line.match(/(?:\s#[^\s#]+)+\s*$/u);
            newLine = tags
              ? line.slice(0, tags.index) + ` ⏰ ${value}` + line.slice(tags.index)
              : `${line.trimEnd()} ⏰ ${value}`;
          }
        } else {
          return false;
        }
        lines[idx] = newLine.replace(/\s+$/u, "") + cr;
        return lines.join("\n");
      });
      if (!wrote) return false;
      this.invalidateCache();
      return true;
    } catch (error) {
      console.error(tr("error.noteSaveFail"), error);
      return false;
    }
  }
  /**
   * 跨天拖拽的落盘入口：同一天只改时间走 updateTaskTime，换了日期就得连
   * 🛫 / 📅 一起改。仍然只动定位到的那一行，不重建任务行。
   * 单日任务的 🛫 与 📅 指向同一天，两个一起改；只写一个会把任务拉成两天。
   * @param task - 需 filePath / rawLine / lineNumber
   * @param dateKey - 新日期 YYYY-MM-DD
   * @param time - "HH:MM" 或 "HH:MM~HH:MM"
   */
  async updateTaskSchedule(task, dateKey, time) {
    const run = () => this._updateTaskScheduleImpl(task, dateKey, time);
    this.writeQueue = this.writeQueue.then(run, run);
    return this.writeQueue;
  }
  async _updateTaskScheduleImpl(task, dateKey, time) {
    try {
      const file = this.app.vault.getAbstractFileByPath(task.filePath);
      if (!(file instanceof import_obsidian.TFile)) {
        console.error(tr("error.fileNotFound", { path: task.filePath }));
        return false;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) return false;
      const value = String(time || "").trim();
      if (value && !/^\d{1,2}:\d{2}(?:~\d{1,2}:\d{2})?$/.test(value)) return false;
      const wrote = await this._mutateFile(file, (content) => {
        const lines = content.split("\n");
        const idx = findTaskLineIdx(lines, task);
        if (idx === -1) {
          console.error(tr("error.rawLineNotFound", { path: task.filePath }));
          return false;
        }
        const rawLine = lines[idx];
        const cr = rawLine.endsWith("\r") ? "\r" : "";
        let line = cr ? rawLine.slice(0, -1) : rawLine;
        let touched = false;
        // 只认开始日与截止日；✅ 完成日、⏳ 计划日不该跟着块走
        line = line.replace(/(🛫|📅)\s*\d{4}-\d{1,2}-\d{1,2}/gu, (m, mark) => {
          touched = true;
          return `${mark} ${dateKey}`;
        });
        if (!touched) return false;
        const timeRe = /⏰\s*\d{1,2}:\d{1,2}(?:\s*[~～]\s*\d{1,2}:\d{1,2})?\s*/u;
        if (timeRe.test(line)) {
          line = value ? line.replace(timeRe, `⏰ ${value} `) : line.replace(timeRe, "");
        } else if (value) {
          // 与 updateTaskTime 同一套插入阶梯：📅 之前 → 行尾标签串之前 → 行末。
          // 原先只有 📅 一级：只有 🛫 的任务拖到别天时时间被静默丢掉还返回 true
          if (/📅\s*\d{4}-\d{1,2}-\d{1,2}/u.test(line)) {
            line = line.replace(/(\s*)(📅\s*\d{4}-\d{1,2}-\d{1,2})/u, ` ⏰ ${value} $2`);
          } else {
            const tags = line.match(/(?:\s#[^\s#]+)+\s*$/u);
            line = tags
              ? line.slice(0, tags.index) + ` ⏰ ${value}` + line.slice(tags.index)
              : `${line.trimEnd()} ⏰ ${value}`;
          }
        }
        lines[idx] = line.replace(/\s+$/u, "") + cr;
        return lines.join("\n");
      });
      if (!wrote) return false;
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
  async createTask(filePath, content, dueDate, isAllDay, time, priority, startDate, category, completed, note, preserveFromRawLine) {
    // 串行化：避免与其他写操作并发导致后写覆盖先写丢失任务
    const run = () => this._createTaskImpl(filePath, content, dueDate, isAllDay, time, priority, startDate, category, completed, note, preserveFromRawLine);
    this.writeQueue = this.writeQueue.then(run, run);
    return this.writeQueue;
  }
  async _createTaskImpl(filePath, content, dueDate, isAllDay, time, priority, startDate, category, completed, note, preserveFromRawLine) {
    try {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof import_obsidian.TFile)) {
        console.error(tr("error.fileNotFound2", { path: filePath }));
        return false;
      }
      // 批次三：记录新行落点（0 基行号），供编辑「先建后删」排除刚写入的新行。
      // 必须声明在回调之外：它是回调里赋值、回调后消费的跨作用域值。
      // v1.7.11 补：taskLine 同理——写完之后还要把它交给 lastCreatedInfo，
      // 只提 createdIndex 不提 taskLine 会让那一行抛 ReferenceError，被外层 catch
      // 吞成 return false，表现为「文件已写入、界面却说创建失败」
      let createdIndex = -1;
      let createdLine = "";
      let createdLineDelta = 0;
      const wrote = await this._mutateFile(file, (fileContent) => {  // v1.7.11
      const originalLineCount = fileContent.split("\n").length;
      // 归一化入参日期（防外部调用传不补零格式），保证排序比较与月份标题匹配正确
      const normDate = (s) => /^\d{4}-\d{1,2}-\d{1,2}$/.test(s) ? normalizeDateStr(s) : s;
      dueDate = normDate(dueDate);
      startDate = startDate ? normDate(startDate) : startDate;
      // 任务格式：内容 + [优先级emoji] + 🛫 开始日期 + ⏰ 时间 + 📅 结束日期
      let priorityMarker = priority === 3 ? "\u{1F534} " : priority === 2 ? "\u{1F7E1} " : "";
      let dateMarker = startDate && startDate !== dueDate
        ? `\u{1F6EB} ${startDate} `
        : "";
      let timeMarker = time && !isAllDay ? `⏰ ${time} ` : "";
      // dueDate 缺失时不写 📅 标记（防御：当前调用链恒传有效日期，但本方法是公共入队入口）
      const dueMarker = dueDate ? `\u{1F4C5} ${dueDate}` : "";
      // 编辑=整行重建，而 cleanTaskContent 会把 🟢/⏳/➕/✅ 从正文里剥掉：
      // 不额外带走的话，改一次标题，Tasks 插件的计划/创建/完成日期就静默消失（已复现）。
      const preservedMarker = preserveFromRawLine ? extractPreservedMarkers(preserveFromRawLine) : "";
      const preservedSuffix = preservedMarker ? ` ${preservedMarker}` : "";
      // 标记顺序约定：内容 → 优先级emoji → 🛫 → ⏰ → 📅 → #标签（与解析层行尾取标签互为逆操作）
      const categoryMarker = category ? ` #${category}` : "";
      // 批次三：编辑=删除+重建，重建必须保留勾选态——已完成任务写 `- [x]`；
      // 新建链路 completed 为 undefined（falsy），行为与旧版逐字节一致
      let taskLine = createdLine = `- [${completed ? "x" : " "}] ${content} ${priorityMarker}${dateMarker}${timeMarker}${dueMarker}${preservedSuffix}${categoryMarker}`.trimEnd();
      // v1.6.0 批次三：编辑=删除+重建时备注必须跟着新行走（否则改一次日期备注就没了）。
      // 这里只把备注渲染成待写回的原文行数组，具体插入位置由各分支按 CRLF 补 \r。
      const noteBody = noteTextToLines(note);
      
      // 确定用于排序和插入的日期：跨天任务用开始日期，普通任务用截止日期
      const isMultiDay = startDate && startDate !== dueDate;
      const sortDate = isMultiDay ? startDate : dueDate;
      
      if (sortDate) {
        const [y, m] = sortDate.split("-");
        const monthSection = `## ${y}年${m}月`;
        // 查找月份section位置：兼容用户手动创建的无前导零月份标题（如 "## 2026年4月"），
        // 避免与插件生成的 "## 2026年04月" 重复创建同月 section。
        // 两处模式都必须锚定行尾（[ \t]*\r?$ 兼容 CRLF）：否则用户手写的日期级标题
        // "## 2026年1月1日 元旦计划会" 会被当成 1 月节，新任务被塞进那段纪要下面
        const sectionMatch = fileContent.match(new RegExp(`^## ${y}年0*${parseInt(m, 10)}月[ \\t]*\\r?$`, "m"));
        const sectionIdx = sectionMatch ? sectionMatch.index : -1;
        if (sectionIdx === -1) {
          // 月份section不存在，需要创建
          // 找到所有月份section的位置（锚定行首+行尾，避免误匹配 ### 、行中或日期级标题）
          const monthRegex = /^## (\d{4})年(\d{1,2})月[ \t]*\r?$/gm;
          const months = [];
          let match;
          while ((match = monthRegex.exec(fileContent)) !== null) {
            months.push({ year: parseInt(match[1], 10), month: parseInt(match[2], 10), pos: match.index });
          }
          const newYear = parseInt(y, 10);
          const newMonth = parseInt(m, 10);
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
          const sectionBodyStart = sectionIdx + sectionMatch[0].length;
          const afterSection = fileContent.slice(sectionBodyStart);
          // 从当前标题之后找边界，避免把当前标题自己当成下一月。
          const boundaryMatch = afterSection.match(/^(?:##[ \t]+.*|(?:-{3,}|\*{3,}|_{3,})[ \t]*)\r?$/m);
          const sectionEnd = boundaryMatch ? sectionBodyStart + boundaryMatch.index : fileContent.length;
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
      createdLineDelta = fileContent.split("\n").length - originalLineCount;
      return fileContent;
      });
      if (!wrote) return false;
      // 一次性交接给紧随其后的编辑删除步骤（调用方取走后经 options.created 显式传回）
      this.lastCreatedInfo = createdIndex >= 0 ? { filePath, index: createdIndex, text: createdLine, lineDelta: createdLineDelta } : null;
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
  async createTaskForDate(date, content, isAllDay = true, time, priority, endDate, customFolderPath, category, completed, note, preserveFromRawLine) {
    // 串行化整个流程（含年度任务文件创建）：并发创建同一文件时 vault.create 会竞态抛"已存在"，
    // 并入 writeQueue 后第二个请求必能在 findTaskFile 命中首个创建结果
    const run = () => this._createTaskForDateImpl(date, content, isAllDay, time, priority, endDate, customFolderPath, category, completed, note, preserveFromRawLine);
    this.writeQueue = this.writeQueue.then(run, run);
    return this.writeQueue;
  }
  async _createTaskForDateImpl(date, content, isAllDay, time, priority, endDate, customFolderPath, category, completed, note, preserveFromRawLine) {
    const dateStr = this.formatDate(date);
    const endDateStr = endDate ? this.formatDate(endDate) : dateStr;
    // 一律写入归档任务列表（年度或月度，由设置决定），跳过日记查找：保证任务统一归集
    // （日记中已有的任务仍会被 parseAllTasks 全库扫描正常显示）
    const defaultFile = await this.getOrCreateDefaultTaskFile(date, customFolderPath);
    if (defaultFile) {
      // 直接调用 _createTaskImpl 而非 createTask：本方法已在 writeQueue 链中执行，
      // 若再经 createTask 二次入队会形成 Q2 等待 Q1、Q1 等待 Q2 的死锁，
      // 导致任务永不写入文件、弹窗按钮永久禁用。
      return this._createTaskImpl(defaultFile, content, endDateStr, isAllDay, time, priority, dateStr, category, completed, note, preserveFromRawLine);
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
    const targetFileName = `${periodId}${period === "month" ? "" : "年"}任务列表.md`;

    // 1. 使用缓存查找已存在的任务文件（传入 customFolderPath 用于消歧）
    const existingPath = this.findTaskFile(periodId, customFolderPath);
    if (existingPath) {
      return existingPath;
    }
    
    // 2. 如果没找到，在指定位置或默认位置创建
    // 自定义文件夹可能已被删除或父路径是文件，导致 ensureFolderExists 抛错；
    // 失败时回退到默认「任务」文件夹，保证任务仍可创建。
    const candidates = customFolderPath ? [customFolderPath, `任务`] : [`任务`];
    for (const folderPath of candidates) {
      const filePath = `${folderPath}/${targetFileName}`;
      try {
        await this.ensureFolderExists(folderPath);
        // 行尾跟随库内已有年度任务文件（CRLF 库首文件即混行尾的源头）；无参照文件时用 LF
        const fileEol = await this.detectVaultEol(folderPath);
        const initialContent = `# ${targetFileName.slice(0, -3)}

> ${tr("file.autoCreated")}

`.replace(/\n/g, fileEol);
        await this.app.vault.create(filePath, initialContent);
        // 缓存新创建的文件路径（键含粒度，年度/月度互不覆盖）
        this.taskFileCache.set(`${period}|${periodId}`, filePath);
        return filePath;
      } catch (error) {
        console.error(tr("error.folderCreate", { folder: folderPath }), error);
        // 1.7.11：create 抛错最常见的原因是「文件其实已经存在」（Sync 刚建好、
        // vault 索引还没跟上）。旧写法把它当致命错误直接放弃 → 用户只看到「创建失败」，
        // 重试才好。先按目标路径回查一次，存在就直接用它。
        const existing = this.app.vault.getAbstractFileByPath(filePath);
        if (existing instanceof import_obsidian.TFile) {
          this.taskFileCache.set(`${period}|${periodId}`, existing.path);
          return existing.path;
        }
        if (folderPath === candidates[candidates.length - 1]) {
          return null;
        }
      }
    }
    return null;
  }
  /**
   * 审计 L1：推断「新建任务文件」该用哪种行尾。
   *
   * 原实现遍历 `this.taskFileCache`，但那个缓存被 invalidateCache() 在**每次**
   * 库事件后清空，plugin 的 onload 里也清一次——建档时机（首次写入某周期）
   * 通常紧跟在库扫描/文件变更之后，所以循环几乎总是空转，直接落到 `"\n"`。
   * 结果就是在 CRLF 库里造出 LF 文件，**正是原注释声称要防的「混行尾的源头」**。
   * 另外原循环里那句 `break` 是无条件的：第一个 TFile 样本就替全库定调，
   * 一个 LF 兄弟文件足以把整个 CRLF 库带偏。
   *
   * 现在改成直接扫库、计票取多数：
   * ① 优先取同族文件（文件名以「任务列表.md」结尾，即插件自己维护的年度/月度列表），
   *    它们才是「续写时要保持一致」的参照；
   * ② ①无样本时退到目标文件夹下的任意 .md（用户手工建的任务目录多半整体同风格）；
   * ③ 两级都无样本、或 CRLF/LF 平票 → 回退 LF（Obsidian 桌面端默认写 LF，
   *    回退到 LF 不会把已有 CRLF 文件改坏，因为后续写入用的是**各文件自己**的行尾）。
   * 读取上限 MAX_SAMPLES 个文件：建档是低频操作，但也不能为它扫遍超大库。
   *
   * @param {string} folderPath 即将建档的文件夹（用于第 ② 级取样）
   * @returns {Promise<string>} "\r\n" 或 "\n"
   */
  async detectVaultEol(folderPath) {
    const MAX_SAMPLES = 24;
    const tally = async (files) => {
      let crlf = 0;
      let lf = 0;
      for (const f of files) {
        if (crlf + lf >= MAX_SAMPLES) break;
        try {
          const text = await this.app.vault.cachedRead(f);
          // 只认「纯 CRLF / 纯 LF」两种明确票；空文件或单个 \r 结尾的不计票，
          // 免得一个空模板把票型带偏。
          if (text.includes("\r\n")) crlf++;
          else if (text.includes("\n")) lf++;
        } catch {
          // 读不了（已删除/无权限/非文本）就跳过这个样本，不影响其余
        }
      }
      return [crlf, lf];
    };
    let all = [];
    try {
      all = this.app.vault.getMarkdownFiles() || [];
    } catch {
      return "\n";
    }
    let [crlf, lf] = await tally(all.filter((f) => f.name.endsWith("任务列表.md")));
    if (crlf + lf === 0 && folderPath) {
      const norm = String(folderPath).replace(/\/+$/, "");
      [crlf, lf] = await tally(all.filter((f) => f.parent && f.parent.path === norm));
    }
    return crlf > lf ? "\r\n" : "\n";
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
    // 作废在途解析：序号+1 使「基于失效前快照」的在途结果被守卫拦截、不写缓存；
    // 清空在途引用，下次调用重新解析而非复用旧快照
    // （大库/移动端全库解析慢于 500ms 防抖窗口，此前失效后仍会短暂展示旧任务）
    this.parseSeq = (this.parseSeq || 0) + 1;
    this.parsingPromise = null;
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
    const targetFileName = `${periodId}${period === "month" ? "" : "年"}任务列表.md`;
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
    // 2b. 否则（或未在指定文件夹下找到）回退到同名文件命中。
    // 1.7.11：同名文件可能有好几个（模板副本、归档备份、旧目录残留），旧写法取
    // getMarkdownFiles() 顺序里的第一条——该顺序无保证，任务会被静默写进模板文件，
    // 用户配置的归集位置被绕过。改为按「像不像正主」择优：默认「任务」文件夹下的命中
    // 优先，其次路径最浅；落在配置文件夹之外时留一条开发日志便于事后追查。
    let fallback = null;
    let fallbackRank = Infinity;
    for (const file of files) {
      if (file.name !== targetFileName) continue;
      const rank = (file.path.startsWith("任务/") ? 0 : 1000) + file.path.split("/").length;
      if (rank < fallbackRank) {
        fallbackRank = rank;
        fallback = file;
      }
    }
    if (fallback) {
      if (normalizedCustom && !this.isPathInFolder(fallback.path, normalizedCustom)) {
        console.warn("[monthly-tasks] 任务文件回退命中位于所配置文件夹之外:", fallback.path);
      }
      this.taskFileCache.set(cacheKey, fallback.path);
      return fallback.path;
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
/** 三天视图标题：起点 + (count-1) 天，与周标题同一种紧凑写法 */
function getDayRangeTitle(startKey, count) {
  const s = dateFromStr(startKey);
  const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + count - 1);
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
  "1-1": "春节",
  "1-15": "元宵",
  "2-2": "龙抬头",
  "5-5": "端午",
  "7-7": "七夕",
  "7-15": "中元",
  "8-15": "中秋",
  "9-9": "重阳",
  "10-1": "寒衣",
  "10-15": "下元",
  "12-8": "腊八",
  "12-23": "小年"
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
  "元旦": "New Year's Day",
  "春节": "Spring Festival",
  "除夕": "New Year's Eve",
  "元宵": "Lantern Festival",
  "元宵节": "Lantern Festival",
  "龙抬头": "Dragon Raises Head",
  "清明": "Qingming Festival",
  "清明节": "Qingming Festival",
  "劳动节": "Labor Day",
  "五一劳动节": "Labor Day",
  "端午": "Dragon Boat Festival",
  "端午节": "Dragon Boat Festival",
  "七夕": "Qixi Festival",
  "中元": "Ghost Festival",
  "秋报": "Ghost Festival",
  "中秋": "Mid-Autumn Festival",
  "中秋节": "Mid-Autumn Festival",
  "重阳": "Double Ninth Festival",
  "重阳节": "Double Ninth Festival",
  "寒衣": "Winter Clothing Festival",
  "下元": "Lower Yuan Festival",
  "冬至": "Winter Solstice",
  "小年": "Little New Year",
  "南方小年": "Little New Year",
  "腊八": "Laba Festival",
  "国庆": "National Day",
  "国庆节": "National Day",
  "十一国庆节": "National Day",
  "女神节": "Goddess Festival",
  "妇女节": "Women's Day",
  "儿童节": "Children's Day",
  "教师节": "Teachers' Day",
  "建军节": "Army Day",
  "惜光节": "Light-sparing Festival",
  "爱琳节": "Ailin Festival",
  "回鹋节": "Hui Festival",
  "晓八节": "Xiao and Ba Festival",
  "环境日": "Environment Day",
  "周末": "Weekend",
  "假日": "Holiday",
  "节假日": "Public Holiday",
  "班": "Work",
  "休": "Rest",
  "调休": "Make-up Day"
};

/** 同上，zh-CN → zh-TW 的用词/字形差异（腊八→臘八、国庆→國慶、调休→調休…） */
var HOLIDAY_NAME_TW = {
  "国庆": "國慶",
  "国庆节": "國慶節",
  "十一国庆节": "十一國慶節",
  "劳动节": "勞動節",
  "五一劳动节": "五一勞動節",
  "腊八": "臘八",
  "龙抬头": "龍抬頭",
  "儿童节": "兒童節",
  "教师节": "教師節",
  "建军节": "建軍節",
  "女神节": "女神節",
  "妇女节": "婦女節",
  "回鹋节": "回鶓節",
  "晓八节": "曉八節",
  "元宵节": "元宵節",
  "端午节": "端午節",
  "中秋节": "中秋節",
  "重阳节": "重陽節",
  "清明节": "清明節",
  "节假日": "節假日",
  "周末": "週末",
  "调休": "調休",
  /* v1.7.5 补齐：API 与内置兜底数据会给出这些**基础名**（不带「节」字），
     原先 TW 表一条都没有，繁中界面直接露出简体。这里只收繁简不同形的四条，
     其余繁简同形（元旦/除夕/元宵/清明/端午/七夕/中元/中秋/寒衣/下元/小年/
     南方小年/假日/班/休）靠 translateHolidayName 回退原样输出，不入表。 */
  "春节": "春節",
  "秋报": "秋報",
  "重阳": "重陽",
  "爱琳节": "愛琳節",
  "惜光节": "惜光節",
  "环境日": "環境日"
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
  const table = I18N_LANG === "en" ? HOLIDAY_NAME_EN : HOLIDAY_NAME_TW;
  const direct = table[name];
  if (direct) return direct;
  // 审计 L2：合并名兜底。内置 holidays.json 把 2025-10-06 写作「国庆节/中秋节」，
  // 网络源还会给出「国庆节,中秋节」这类拼接名。两张译文表不可能穷举组合，
  // 而「国庆节/中秋节」**不是**繁简同形（不像元旦/除夕/班），原样回退＝繁体界面
  // 直接露出简体、英文界面露出中文。这里按分隔符拆开逐段查表再拼回去。
  // 任一段查不到就整体原样返回：沿用上面单名的既定策略，宁可不翻，也不要输出
  // 「國慶節/Mid-Autumn Festival」这种半截译文。分隔符统一用「/」拼回，
  // 与内置数据的写法一致（格子很窄，不再加空格）。
  const parts = name.split(/[/／,，、]/);
  if (parts.length < 2) return name;
  const out = [];
  for (const part of parts) {
    const key = part.trim();
    if (!key) return name;
    const hit = table[key];
    if (!hit) return name;
    out.push(hit);
  }
  return out.join("/");
}

function getTraditionalHoliday(lunarDate) {
  // 闰月不匹配传统节日：传统节日只对应正序月，闰五月初五不应误报为"端午"
  if (lunarDate.isLeap) return void 0;
  // 除夕：农历腊月最后一天（腊月可能是29天小月或30天大月）
  if (lunarDate.month === 12) {
    const daysInMonth = getLunarMonthDays(lunarDate.year, 12);
    if (lunarDate.day === daysInMonth) {
      return "除夕";
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
  } catch {
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
  } catch {
    return false;
  }
}

// 内置节假日兜底数据：下面的 BUILTIN_HOLIDAYS 块随 main.js 一起分发，是离线兜底的
// 唯一可靠来源。社区目录安装插件时只下载 main.js / manifest.json / styles.css 三份，
// 仓库里的 holidays.json 不会进用户的插件目录——只依赖那份外部文件，目录安装的用户
// 就完全没有内置数据，节假日全押在网络源上（timor.tech 已实测返回 403）。
// holidays.json 仍是可编辑的数据源：改它 → node scripts/sync-holidays.mjs → 一起提交；
// 用户也可以往插件目录另放一份 holidays.json，按年覆盖内置副本。
// 2007 年起的历史年份由网络数据源覆盖。

/* === BUILTIN_HOLIDAYS:BEGIN === */
/* 由 scripts/sync-holidays.mjs 从 holidays.json 生成，请勿手改本块。
   改数据请改 holidays.json 再跑同步脚本；CI 会拦住两者漂移。 */
var BUILTIN_HOLIDAYS = {
  "2022": [
    { "date": "2022-01-01", "name": "元旦", "type": "legal", "isOff": true },
    { "date": "2022-01-02", "name": "元旦", "type": "legal", "isOff": true },
    { "date": "2022-01-03", "name": "元旦", "type": "legal", "isOff": true },
    { "date": "2022-01-31", "name": "除夕", "type": "legal", "isOff": true },
    { "date": "2022-02-01", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2022-02-02", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2022-02-03", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2022-02-04", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2022-02-05", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2022-02-06", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2022-01-29", "name": "班", "type": "workday", "isOff": false },
    { "date": "2022-01-30", "name": "班", "type": "workday", "isOff": false },
    { "date": "2022-04-03", "name": "清明节", "type": "legal", "isOff": true },
    { "date": "2022-04-04", "name": "清明节", "type": "legal", "isOff": true },
    { "date": "2022-04-05", "name": "清明节", "type": "legal", "isOff": true },
    { "date": "2022-04-02", "name": "班", "type": "workday", "isOff": false },
    { "date": "2022-04-30", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2022-05-01", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2022-05-02", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2022-05-03", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2022-05-04", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2022-04-24", "name": "班", "type": "workday", "isOff": false },
    { "date": "2022-05-07", "name": "班", "type": "workday", "isOff": false },
    { "date": "2022-06-03", "name": "端午节", "type": "legal", "isOff": true },
    { "date": "2022-06-04", "name": "端午节", "type": "legal", "isOff": true },
    { "date": "2022-06-05", "name": "端午节", "type": "legal", "isOff": true },
    { "date": "2022-09-10", "name": "中秋节", "type": "legal", "isOff": true },
    { "date": "2022-09-11", "name": "中秋节", "type": "legal", "isOff": true },
    { "date": "2022-09-12", "name": "中秋节", "type": "legal", "isOff": true },
    { "date": "2022-10-01", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2022-10-02", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2022-10-03", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2022-10-04", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2022-10-05", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2022-10-06", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2022-10-07", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2022-10-08", "name": "班", "type": "workday", "isOff": false },
    { "date": "2022-10-09", "name": "班", "type": "workday", "isOff": false }
  ],
  "2023": [
    { "date": "2023-01-01", "name": "元旦", "type": "legal", "isOff": true },
    { "date": "2023-01-02", "name": "元旦", "type": "legal", "isOff": true },
    { "date": "2023-01-21", "name": "除夕", "type": "legal", "isOff": true },
    { "date": "2023-01-22", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2023-01-23", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2023-01-24", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2023-01-25", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2023-01-26", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2023-01-27", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2023-01-28", "name": "班", "type": "workday", "isOff": false },
    { "date": "2023-01-29", "name": "班", "type": "workday", "isOff": false },
    { "date": "2023-04-05", "name": "清明节", "type": "legal", "isOff": true },
    { "date": "2023-04-29", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2023-04-30", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2023-05-01", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2023-05-02", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2023-05-03", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2023-04-23", "name": "班", "type": "workday", "isOff": false },
    { "date": "2023-05-06", "name": "班", "type": "workday", "isOff": false },
    { "date": "2023-06-22", "name": "端午节", "type": "legal", "isOff": true },
    { "date": "2023-06-23", "name": "端午节", "type": "legal", "isOff": true },
    { "date": "2023-06-24", "name": "端午节", "type": "legal", "isOff": true },
    { "date": "2023-06-25", "name": "班", "type": "workday", "isOff": false },
    { "date": "2023-09-29", "name": "中秋节", "type": "legal", "isOff": true },
    { "date": "2023-09-30", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2023-10-01", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2023-10-02", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2023-10-03", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2023-10-04", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2023-10-05", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2023-10-06", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2023-10-07", "name": "班", "type": "workday", "isOff": false },
    { "date": "2023-10-08", "name": "班", "type": "workday", "isOff": false }
  ],
  "2024": [
    { "date": "2024-01-01", "name": "元旦", "type": "legal", "isOff": true },
    { "date": "2024-02-09", "name": "除夕", "type": "legal", "isOff": true },
    { "date": "2024-02-10", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2024-02-11", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2024-02-12", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2024-02-13", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2024-02-14", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2024-02-15", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2024-02-16", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2024-02-17", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2024-02-04", "name": "班", "type": "workday", "isOff": false },
    { "date": "2024-02-18", "name": "班", "type": "workday", "isOff": false },
    { "date": "2024-04-04", "name": "清明节", "type": "legal", "isOff": true },
    { "date": "2024-04-05", "name": "清明节", "type": "legal", "isOff": true },
    { "date": "2024-04-06", "name": "清明节", "type": "legal", "isOff": true },
    { "date": "2024-05-01", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2024-05-02", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2024-05-03", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2024-05-04", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2024-05-05", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2024-04-28", "name": "班", "type": "workday", "isOff": false },
    { "date": "2024-05-11", "name": "班", "type": "workday", "isOff": false },
    { "date": "2024-06-10", "name": "端午节", "type": "legal", "isOff": true },
    { "date": "2024-09-15", "name": "中秋节", "type": "legal", "isOff": true },
    { "date": "2024-09-16", "name": "中秋节", "type": "legal", "isOff": true },
    { "date": "2024-09-17", "name": "中秋节", "type": "legal", "isOff": true },
    { "date": "2024-09-14", "name": "班", "type": "workday", "isOff": false },
    { "date": "2024-10-01", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2024-10-02", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2024-10-03", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2024-10-04", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2024-10-05", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2024-10-06", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2024-10-07", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2024-09-29", "name": "班", "type": "workday", "isOff": false },
    { "date": "2024-10-12", "name": "班", "type": "workday", "isOff": false }
  ],
  "2025": [
    { "date": "2025-01-01", "name": "元旦", "type": "legal", "isOff": true },
    { "date": "2025-01-28", "name": "除夕", "type": "legal", "isOff": true },
    { "date": "2025-01-29", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2025-01-30", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2025-01-31", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2025-02-01", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2025-02-02", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2025-02-03", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2025-02-04", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2025-01-26", "name": "班", "type": "workday", "isOff": false },
    { "date": "2025-02-08", "name": "班", "type": "workday", "isOff": false },
    { "date": "2025-04-04", "name": "清明节", "type": "legal", "isOff": true },
    { "date": "2025-04-05", "name": "清明节", "type": "legal", "isOff": true },
    { "date": "2025-04-06", "name": "清明节", "type": "legal", "isOff": true },
    { "date": "2025-05-01", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2025-05-02", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2025-05-03", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2025-05-04", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2025-05-05", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2025-04-27", "name": "班", "type": "workday", "isOff": false },
    { "date": "2025-05-31", "name": "端午节", "type": "legal", "isOff": true },
    { "date": "2025-06-01", "name": "端午节", "type": "legal", "isOff": true },
    { "date": "2025-06-02", "name": "端午节", "type": "legal", "isOff": true },
    { "date": "2025-10-01", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2025-10-02", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2025-10-03", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2025-10-04", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2025-10-05", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2025-10-06", "name": "国庆节/中秋节", "type": "legal", "isOff": true },
    { "date": "2025-10-07", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2025-10-08", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2025-09-28", "name": "班", "type": "workday", "isOff": false },
    { "date": "2025-10-11", "name": "班", "type": "workday", "isOff": false }
  ],
  "2026": [
    { "date": "2026-01-01", "name": "元旦", "type": "legal", "isOff": true },
    { "date": "2026-01-02", "name": "元旦", "type": "legal", "isOff": true },
    { "date": "2026-01-03", "name": "元旦", "type": "legal", "isOff": true },
    { "date": "2026-01-04", "name": "班", "type": "workday", "isOff": false },
    { "date": "2026-02-15", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2026-02-16", "name": "除夕", "type": "legal", "isOff": true },
    { "date": "2026-02-17", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2026-02-18", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2026-02-19", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2026-02-20", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2026-02-21", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2026-02-22", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2026-02-23", "name": "春节", "type": "legal", "isOff": true },
    { "date": "2026-02-14", "name": "班", "type": "workday", "isOff": false },
    { "date": "2026-02-28", "name": "班", "type": "workday", "isOff": false },
    { "date": "2026-04-04", "name": "清明节", "type": "legal", "isOff": true },
    { "date": "2026-04-05", "name": "清明节", "type": "legal", "isOff": true },
    { "date": "2026-04-06", "name": "清明节", "type": "legal", "isOff": true },
    { "date": "2026-05-01", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2026-05-02", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2026-05-03", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2026-05-04", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2026-05-05", "name": "劳动节", "type": "legal", "isOff": true },
    { "date": "2026-05-09", "name": "班", "type": "workday", "isOff": false },
    { "date": "2026-06-19", "name": "端午节", "type": "legal", "isOff": true },
    { "date": "2026-06-20", "name": "端午节", "type": "legal", "isOff": true },
    { "date": "2026-06-21", "name": "端午节", "type": "legal", "isOff": true },
    { "date": "2026-09-25", "name": "中秋节", "type": "legal", "isOff": true },
    { "date": "2026-09-26", "name": "中秋节", "type": "legal", "isOff": true },
    { "date": "2026-09-27", "name": "中秋节", "type": "legal", "isOff": true },
    { "date": "2026-10-01", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2026-10-02", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2026-10-03", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2026-10-04", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2026-10-05", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2026-10-06", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2026-10-07", "name": "国庆节", "type": "legal", "isOff": true },
    { "date": "2026-09-20", "name": "班", "type": "workday", "isOff": false },
    { "date": "2026-10-10", "name": "班", "type": "workday", "isOff": false }
  ]
};
/* === BUILTIN_HOLIDAYS:END === */

function isUsableHolidayData(holidays, year) {
  if (!Array.isArray(holidays) || holidays.length === 0) return false;
  const valid = holidays.every((h) => h && typeof h.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(h.date) && isValidDateStr(h.date) && typeof h.name === "string" && h.name.trim().length > 0 && typeof h.isOff === "boolean" && (h.type === "legal" || h.type === "workday"));
  return valid && holidays.some((h) => h.date.startsWith(`${year}-`));
}

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
 * - 内置兜底：main.js 里的 BUILTIN_HOLIDAYS 块（2022-2026 官方数据，随包分发；插件目录另放的
 *   holidays.json 可按年覆盖它。官方未发布年份不写预测数据）
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
    // 1.7.11：正常应答但该年暂无数据的年份（官方尚未公告下一年安排）。与 failureCache
    // 的「请求失败」分开记，否则刷新提示会把正常状态报成故障
    this.emptyYears = /* @__PURE__ */ new Set();
    // 上次成功取到 holiday-cn 的镜像主机（v1.7.11）：下次直接走它，避免每次都并发探测
    this.cnHost = null;
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
        if (isUsableHolidayData(apiData, year)) {
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
    } catch {
      await new Promise((r) => window.setTimeout(r, 500));
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
        import_obsidian.requestUrl({ url }),
        new Promise((_, reject) => {
          timeoutId = window.setTimeout(() => reject(new Error(timeoutLabel)), timeoutMs);
        })
      ]);
      if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
      return res.json;
    } finally {
      window.clearTimeout(timeoutId);
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
    } else if (!isUsableHolidayData(holidays, year)) {
      throw new Error(tr("error.holidayApiFormat"));
    }
    return holidays.sort((a, b) => a.date.localeCompare(b.date));
  }
  /**
   * 按源顺序从网络获取某年节假日数据：holiday-cn（社区维护，2007 年至今）→ timor.tech。
   * 任一源成功即返回；全部失败返回 null（调用方按失败处理）。
   * 源链的意义：内置数据不再承担逐年维护义务，新年份由社区数据源自动覆盖
   */
  async fetchYearFromSources(year) {
    // responded：是否有源**正常应答**（哪怕该年数组为空）。用它把「网络/源故障」和
    // 「官方尚未公告该年安排」分开——后者是正常状态（如 2027 的 days 就是空数组），
    // 旧写法一律返回 null，刷新提示便把它计入失败并说「部分成功」，用户读到的是「坏了」。
    let responded = false;
    try {
      const cn = await this._fetchHolidayCN(year);
      responded = true;
      if (cn && cn.length > 0) {
        this.emptyYears.delete(year);
        return cn;
      }
    } catch (e) {
      console.warn(tr("error.holidayCN", { year: year }), e);
    }
    try {
      const timor = await this.fetchFromAPI(year);
      responded = true;
      if (timor && timor.length > 0) {
        this.emptyYears.delete(year);
        return timor;
      }
    } catch (e) {
      console.warn(tr("error.holidayApi", { year: year }), e);
    }
    if (responded) this.emptyYears.add(year);
    else this.emptyYears.delete(year);
    return null;
  }
  /**
   * holiday-cn 数据源（jsDelivr CDN）
   * 格式：{ year, papers, days: [{ name, date, isOffDay }] }，days 按公告条目给出，
   * 可能含跨年条目（如 2023.json 里的 2022-12-31 元旦）——按 date 归属，调用方按相邻年查找
   * 取 @master 引用：历史年份的社区修正（公告勘误）能同步进来
   */
  async _fetchHolidayCN(year) {
    // 1.7.11：同一份 holiday-cn 数据有多个镜像主机，而**主域名在部分网络下不可达**。
    // 2026-10-12 实测：cdn.jsdelivr.net / gcore.jsdelivr.net / raw.githubusercontent.com
    // 连接直接失败（几百毫秒内返回 000），fastly.jsdelivr.net 同一文件 200。旧写法只试
    // 一个主机，该域名被阻断时整条源链就只剩已被 Cloudflare 拦掉的 timor.tech，刷新必然
    // 失败——表现为「时好时坏」，因为可达性随网络路径变化。按顺序试，任一主机成功即返回。
    const hosts = [
      "https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/",
      "https://fastly.jsdelivr.net/gh/NateScarlet/holiday-cn@master/",
      "https://gcore.jsdelivr.net/gh/NateScarlet/holiday-cn@master/",
      "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/",
    ];
    // v1.7.11：不再串行试主机。静默丢包的网络下每个主机会各耗满超时（四个串行最坏
    // 24 秒/年），用户看到的就是「点刷新要等很久」。改成两步：
    //   快路径——上次成功的主机单独试一次（多数情况一发命中）；
    //   兜底——其余主机**并发竞速**，最快返回者胜出，最坏也只等一次超时。
    const TIMEOUT = 5e3;
    const label = () => tr("error.holidayTimeout2", { year: year });
    let json = null;
    if (this.cnHost) {
      try {
        json = await this._fetchJson(this.cnHost + year + ".json", TIMEOUT, label());
      } catch {
        this.cnHost = null; // 上次能通现在不通：丢掉快路径，走竞速
      }
    }
    if (json === null) {
      json = await new Promise((resolve, reject) => {
        const list = hosts.filter((h) => h !== this.cnHost);
        let pending = list.length;
        let settled = false;
        let lastErr = null;
        list.forEach((host) => {
          this._fetchJson(host + year + ".json", TIMEOUT, label()).then((r) => {
            if (settled) return;
            settled = true;
            this.cnHost = host; // 记住这次通的，下次走快路径
            resolve(r);
          }).catch((e) => {
            lastErr = e;
            if (--pending === 0 && !settled) {
              settled = true;
              reject(lastErr || new Error(tr("error.holidayCN", { year: year })));
            }
          });
        });
      });
    }
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
    if (holidays.length > 0 && !isUsableHolidayData(holidays, year)) {
      throw new Error(tr("error.holidayCNFormat"));
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
   v1.8.0：timeGrid=三天视图（三天 3 列 × 24 小时，定时任务画成可拖拽的时间块；
   模式键沿用 timeGrid，改名会让老 data.json 的 viewMode 失效）。
   数组顺序即菜单顺序与命令循环顺序：先按范围（月 → 周）分组，组内「大」在前，
   与用户口径「大月 / 小月 / 大周 / 小周」一致；三天视图挂在周组末尾。 */
var VIEW_MODES = ["list", "agenda", "bigWeek", "week", "timeGrid"];
/* 图标不再存 HTML 字符串：审核规则禁止写 innerHTML（no-unsanitized，属 error 级），
   而 setIcon() 与 createSvg() 都是 1.1.0 才有的 API，本插件声明 minAppVersion 0.15.0，
   不能直接用。于是改成「结构数据 + createElementNS」：spec = { size: 边长, stroke: 线宽,
   paths: [[标签名, 属性表], ...] }，由 setSvgIcon() 画成真实 SVG 节点。 */
var SVG_NS = "http://www.w3.org/2000/svg";
var WEEK_TOGGLE_ICON = {
  size: 18,
  stroke: 2,
  paths: [
    ["rect", { x: "3", y: "4", width: "18", height: "18", rx: "2", ry: "2" }],
    ["line", { x1: "16", y1: "2", x2: "16", y2: "6" }],
    ["line", { x1: "8", y1: "2", x2: "8", y2: "6" }],
    ["line", { x1: "3", y1: "10", x2: "21", y2: "10" }],
    ["line", { x1: "8", y1: "15", x2: "8", y2: "15.01" }],
    ["line", { x1: "12", y1: "15", x2: "12", y2: "15.01" }],
    ["line", { x1: "16", y1: "15", x2: "16", y2: "15.01" }]
  ]
};
var AGENDA_TOGGLE_ICONS = {
  agenda: {
    size: 18,
    stroke: 2,
    paths: [
      ["rect", { x: "3", y: "4", width: "18", height: "18", rx: "2", ry: "2" }],
      ["line", { x1: "16", y1: "2", x2: "16", y2: "6" }],
      ["line", { x1: "8", y1: "2", x2: "8", y2: "6" }],
      ["line", { x1: "3", y1: "10", x2: "21", y2: "10" }]
    ]
  },
  list: {
    size: 18,
    stroke: 2,
    paths: [
      ["line", { x1: "8", y1: "6", x2: "21", y2: "6" }],
      ["line", { x1: "8", y1: "12", x2: "21", y2: "12" }],
      ["line", { x1: "8", y1: "18", x2: "21", y2: "18" }],
      ["line", { x1: "3", y1: "6", x2: "3.01", y2: "6" }],
      ["line", { x1: "3", y1: "12", x2: "3.01", y2: "12" }],
      ["line", { x1: "3", y1: "18", x2: "3.01", y2: "18" }]
    ]
  },
  week: WEEK_TOGGLE_ICON,
  // 大周：日历外框 + 一行两列的分栏与内容点（与「小周」那张「一行三点」区分开）
  bigWeek: {
    size: 18,
    stroke: 2,
    paths: [
      ["rect", { x: "3", y: "4", width: "18", height: "18", rx: "2", ry: "2" }],
      ["line", { x1: "16", y1: "2", x2: "16", y2: "6" }],
      ["line", { x1: "8", y1: "2", x2: "8", y2: "6" }],
      ["line", { x1: "3", y1: "10", x2: "21", y2: "10" }],
      ["line", { x1: "12", y1: "10", x2: "12", y2: "22" }],
      ["line", { x1: "7", y1: "15", x2: "7", y2: "15.01" }],
      ["line", { x1: "17", y1: "15", x2: "17", y2: "15.01" }]
    ]
  },
  // 三天视图：钟面 + 时针，一眼区别于三种日历格
  timeGrid: {
    size: 18,
    stroke: 2,
    paths: [
      ["circle", { cx: "12", cy: "12", r: "9" }],
      ["polyline", { points: "12 7 12 12 15.5 14" }]
    ]
  }
};
/**
 * 把 spec 画成 SVG 并放进 el（替换原有内容）。
 * 文档取 el 自己的 ownerDocument：侧栏/弹窗开在副窗口（popout）里时，
 * 不能用主窗口的 document 建节点，否则图标会挂到另一个文档上去。
 */
function setSvgIcon(el, spec) {
  const doc = el.ownerDocument;
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(spec.size));
  svg.setAttribute("height", String(spec.size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", String(spec.stroke));
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  for (const [tag, attrs] of spec.paths) {
    const child = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) child.setAttribute(k, v);
    svg.appendChild(child);
  }
  el.empty();
  el.appendChild(svg);
}

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
 * 所以它是 2026 年的第 1 周，而不是 2025 年的第 53 周。
 *
 * 审计 L9：但「一年 53 周」确实会出现——原注释断言它不会，是错的。本函数的「年」
 * 是从 jan1WeekStart(Y) 到 jan1WeekStart(Y+1) 的**周起点区间**；当元旦落在周中、
 * 该周起点被推到上一年时，这个区间能长达 371 天＝整整 53 周。
 * 例（firstDayOfWeek=1，周一起）：jan1WeekStart(2023)=2022-12-26、
 * jan1WeekStart(2024)=2024-01-01，于是 2023-12-25 那一周算下来是第 53 周。
 * 暴力枚举 1999-2061 × fdow∈{0,1,6} 的全部周起点：三种起始日都会命中 53
 * （fdow=0 首见 2000-12-24，fdow=1 首见 2000-12-25，fdow=6 首见 1999-12-25），
 * **且从不超过 53**。所以这里的算术是对的、调用方不必防御更大的怪值，只是文案上
 * 别再把 53 说成不可能——右侧标着「第 53 周」是符合本口径的正确显示。
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
var AGENDA_ADD_ICON = {
  size: 14,
  stroke: 2.4,
  paths: [
    ["line", { x1: "12", y1: "5", x2: "12", y2: "19" }],
    ["line", { x1: "5", y1: "12", x2: "19", y2: "12" }]
  ]
};
// 明细区吸顶行「管理」按钮的列表图标（lucide list 路径子集）：
// 不用加号——加号只承诺"新建"，而这颗按钮打开的面板里既能改也能删也能跳转。
var AGENDA_MANAGE_ICON = {
  size: 14,
  stroke: 2.2,
  paths: [
    ["line", { x1: "8", y1: "6", x2: "21", y2: "6" }],
    ["line", { x1: "8", y1: "12", x2: "21", y2: "12" }],
    ["line", { x1: "8", y1: "18", x2: "21", y2: "18" }],
    ["line", { x1: "3", y1: "6", x2: "3.01", y2: "6" }],
    ["line", { x1: "3", y1: "12", x2: "3.01", y2: "12" }],
    ["line", { x1: "3", y1: "18", x2: "3.01", y2: "18" }]
  ]
};
// 头部导航左右箭头、类别漏斗，以及任务行上的编辑/跳转/删除（形状与原先的
// 内联 SVG 字符串逐点一致，只换了构建方式）
var ICON_CHEVRON_LEFT = { size: 20, stroke: 2, paths: [["polyline", { points: "15 18 9 12 15 6" }]] };
var ICON_CHEVRON_RIGHT = { size: 20, stroke: 2, paths: [["polyline", { points: "9 18 15 12 9 6" }]] };
var ICON_FUNNEL = { size: 20, stroke: 2, paths: [["polygon", { points: "22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" }]] };
var ICON_EDIT = { size: 13, stroke: 2, paths: [["path", { d: "M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" }]] };
var ICON_GOTO = {
  size: 13,
  stroke: 2,
  paths: [
    ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }],
    ["polyline", { points: "15 3 21 3 21 9" }],
    ["line", { x1: "10", y1: "14", x2: "21", y2: "3" }]
  ]
};
var ICON_DELETE = {
  size: 13,
  stroke: 2,
  paths: [
    ["polyline", { points: "3 6 5 6 21 6" }],
    ["path", { d: "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" }],
    ["path", { d: "M10 11v6" }],
    ["path", { d: "M14 11v6" }],
    ["path", { d: "M9 6V4h6v2" }]
  ]
};

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
var MonthlyView = class extends import_obsidian.ItemView {
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
    // 审计 L12：显式的「视图已关闭」标志。rootEl 只在上面这一处赋值、onClose 只做
    // .empty() 而**从不置 null**，所以 `if (!this.rootEl)` 挡不住关闭后的渲染；
    // renderRequestId 自增也只能作废**已在途**的渲染，关闭之后才启动的那一轮拿到新 id、
    // 后面没人超越它 → 令牌检查全部通过，整块网格被画进已分离的 DOM（白做功，还会顺带
    // 触发一次节假日按需补数）。这里给一个与 DOM 状态无关的布尔量，渲染入口统一看它。
    this.viewClosed = false;
    // 手机端格子量测（2026-10-10）：观察 rootEl 尺寸变化并复量。「切走再回」后
    // .view-content 的高度约束是异步生效的，渲染瞬间量到的行高之后会变，靠这里补刀；
    // gridEl 由 _mtWatchGridSize 在每轮复量时一并纳入观察——松布局阶段网格在 rootEl
    // 内部长高而 rootEl 自身高度不变，只盯 rootEl 会漏掉这轮变化（v1.7.8 两态不一致）
    if (typeof ResizeObserver !== "undefined") {
      this._mtTrimObserver = new ResizeObserver(() => this._mtMeasureMobileCells("obs"));
      this._mtTrimObserver.observe(this.rootEl);
    }
    // 视图形态与选中日：root class 决定样式作用域，selectedDate 决定明细区看哪天。
    // 两者都必须在首次 render 之前就位，否则第一帧会按条视图渲染再翻牌（闪一下）
    this.applyViewModeClass();
    this.convergeSelectedDate();
    // 周/三天视图可能是冷启动默认值，锚点必须在首帧前就位
    this.ensurePeriodAnchor();
    await this.render();
  }
  /**
   * 视图关闭
   */
  async onClose() {
    // 审计 L12：先立标志，再作废在途渲染——两者顺序很重要：下面的定时器/弹窗清理里
    // 任何一处间接触发渲染，都该立刻被 viewClosed 挡回去。
    this.viewClosed = true;
    this._tgClearDraft();
    // 递增 renderRequestId 使进行中的渲染 await 后判定失效（myRequestId !== this.renderRequestId），
    // 避免向已分离 DOM 继续添加节点
    this.renderRequestId = (this.renderRequestId || 0) + 1;
    // 清理 toggleTask 中可能挂起的延迟刷新定时器，避免向已分离 DOM 渲染
    if (this.pendingTimers && this.pendingTimers.size > 0) {
      for (const t of this.pendingTimers) window.clearTimeout(t);
      this.pendingTimers.clear();
    }
    // 手机端等高截断的尺寸观察器（onOpen 里建）：随视图一并拆掉，不留悬挂回调
    if (this._mtTrimObserver) {
      this._mtTrimObserver.disconnect();
      this._mtTrimObserver = null;
      this._mtObservedGrid = null;
    }
    // 延迟复裁的挂起帧/定时器（_mtScheduleRetrim 排的）：一并撤掉，不留迟到的重裁
    if (this._mtRetrimRaf != null) window.cancelAnimationFrame(this._mtRetrimRaf);
    if (this._mtRetrimTimer != null) window.clearTimeout(this._mtRetrimTimer);
    this._mtRetrimRaf = null;
    this._mtRetrimTimer = null;
    // 1.7.11：格子平移的惯性/合帧句柄（当前平移者）随视图一并撤掉，
    // 不留迟到的 rAF 往已分离节点上写 scrollTop
    if (this._mtPanStop) {
      this._mtPanStop();
      this._mtPanStop = null;
    }
    // 托管弹窗挂在框架层不随 rootEl 回收：视图关闭时一并收起，避免失联
    this.closeActivePopup();
    this.rootEl.empty();
  }
  /** 关闭本视图挂出的所有托管弹窗（日期跳转 / 类别筛选 / 视图菜单 / 新建-编辑任务）；
   * 两个面板改挂 Modal 后仍保留此入口：onClose、header 重建与回归测试统一从这里收起。
   * CreateTaskModal 必须在列（审计 M3）：它有同一套 activeInstances 登记（见其 onOpen 首句），
   * 插件 onunload 也确实关它，唯独视图 onClose 此前漏了。漏关的后果是
   * 「打开新建/编辑弹窗后直接关掉月历标签页」→ 弹窗留在屏幕上、背后没有日历；若其内联
   * 日期浮层开着，浮层装的 document 级 click 监听不会被摘（只有 onClose 摘），且提交
   * 仍会写库、随后 await refresh(true) 没有 isConnected 守卫，把整块网格重建进已分离的
   * rootEl 再丢弃。onClose 全程判空 + .has() 守卫，重复 close 无副作用，可放心加。 */
  closeActivePopup() {
    for (const cls of [DatePickerModal, CategoryFilterModal, ViewMenuModal, CreateTaskModal]) {
      if (cls.activeInstances) {
        for (const inst of Array.from(cls.activeInstances)) {
          try { inst.close(); } catch { /* 单个实例关闭失败不阻断其余实例的清理 */ }
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
        try { inst.close(); } catch { /* 单个实例关闭失败不阻断其余实例的清理 */ }
      }
      return;
    }
    for (const cls of [CategoryFilterModal, DatePickerModal]) {
      if (cls.activeInstances) {
        for (const inst of Array.from(cls.activeInstances)) {
          try { inst.close(); } catch { /* 单个实例关闭失败不阻断其余实例的清理 */ }
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
        try { inst.close(); } catch { /* 单个实例关闭失败不阻断其余实例的清理 */ }
      }
      return;
    }
    if (DatePickerModal.activeInstances) {
      for (const inst of Array.from(DatePickerModal.activeInstances)) {
        try { inst.close(); } catch { /* 单个实例关闭失败不阻断其余实例的清理 */ }
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
    // 审计 L5：本函数是同步的（被 render 尾部和各处状态翻转调用），没法 await；
    // 走 Safe 版把 reject 收敛掉。注意 _renderCalendarGridCore 的 renderRequestId
    // 自增在第一个 await 之前**同步**发生，所以调用方紧接着的令牌复检仍然有效
    // （L4 的失败分支就依赖这一点），换成 Safe 版不影响时序。
    this.renderCalendarGridSafe("updateFilterButton");
  }
  /**
   * 渲染整个视图
   */
  async render() {
    // 审计 L6 + L12：两道守卫，各挡一种「渲染时视图不该再画」的情形。
    // ① `!this.rootEl`：onOpen 之前就跑到（refresh 由 vault 事件/命令触发，视图对象
    //    可能刚被 getLeavesOfType 取到还没 onOpen 完）。紧邻的两个助手
    //    applyViewModeClass 和 applyViewToggleIcon 都自带这道判空，这里原先没有，
    //    却直接 .childElementCount 解引用。
    // ② `this.viewClosed`：onClose **之后**跑到。注意 rootEl 在 onClose 里只做
    //    .empty() 而从不置 null，所以判空挡不住这一档；靠的是 onOpen/onClose 维护的
    //    显式标志（详见 onClose 的审计 L12 注释）。
    // 两档的报错都不好查：render() 的调用方多数没 await，抛出去只以 unhandled
    // rejection 的形式在控制台留一行红字。
    if (!this.rootEl || this.viewClosed) return;
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
    return this.renderCalendarGridSafe("render");
  }
  /**
   * 渲染头部导航
   */
  renderHeader() {
    this.headerEl = this.rootEl.createDiv("monthly-header");
    const leftGroup = this.headerEl.createDiv("header-btn-group");
    const prevBtn = leftGroup.createDiv("nav-btn prev-btn");
    setSvgIcon(prevBtn, ICON_CHEVRON_LEFT);
    prevBtn.setAttribute("aria-label", this.isWeekFamily()
      ? tr("view.header.prevWeek")
      : this.isTimeGrid() ? tr("view.header.prevThreeDay") : tr("view.header.prevMonth"));
    prevBtn.addEventListener("click", () => this.navigatePeriod(-1));
    const titleEl = this.headerEl.createDiv("month-title");
    titleEl.textContent = this.headerTitleText();
    titleEl.addClass("clickable");
    titleEl.setAttribute("title", tr("view.header.titleTip"));
    titleEl.addEventListener("click", () => this.openDatePicker());
    const rightGroup = this.headerEl.createDiv("header-btn-group");
    const nextBtn = rightGroup.createDiv("nav-btn next-btn");
    setSvgIcon(nextBtn, ICON_CHEVRON_RIGHT);
    nextBtn.setAttribute("aria-label", this.isWeekFamily()
      ? tr("view.header.nextWeek")
      : this.isTimeGrid() ? tr("view.header.nextThreeDay") : tr("view.header.nextMonth"));
    nextBtn.addEventListener("click", () => this.navigatePeriod(1));
    const todayBtn = rightGroup.createDiv("today-btn");
    // 真机反馈回退：图标化并未省下标题区（.month-title flex:1 吃掉余量），四字文案
    // 可读性更好，恢复 v1.4.2 文本按钮
    // v1.7.0：周视图下同一颗按钮语义变成「回到本周」（四字，宽度不跳），文案分开；
    // 三天视图只跳回今天，不重置成某个固定的三天窗口，用「今天」两字
    const todayLabel = this.isWeekFamily()
      ? tr("view.header.thisWeek")
      : this.isTimeGrid() ? tr("view.timegrid.today") : tr("view.header.today");
    todayBtn.textContent = todayLabel;
    todayBtn.setAttribute("title", todayLabel);
    todayBtn.addEventListener("click", () => this.goToToday());
    // 漏斗筛选按钮（批次二⑤）：当前解析结果里出现 ≥1 个类别才渲染——纯无标签工作流
    // 永远看不到它；渲染与去留由 updateFilterButton 在每次网格渲染前统一收敛
    this.filterBtnEl = null;
    if (this.scanCategories().length > 0) {
      const funnelBtn = rightGroup.createDiv("nav-btn filter-btn");
      setSvgIcon(funnelBtn, ICON_FUNNEL);
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
  /** 顶栏标题文案：月视图=「2026年 10月」，周视图=「10/5 – 10/11」，三日=「10/25 – 10/27」 */
  headerTitleText() {
    if (this.isWeekFamily()) return getWeekTitle(this.weekAnchor());
    if (this.isTimeGrid()) return getDayRangeTitle(this.threeDayAnchor(), 3);
    return getMonthTitle(this.currentYear, this.currentMonth);
  }
  /** 左右箭头统一入口：月视图按月走，周视图按周走（±7 天），三天视图按 3 天走 */
  async navigatePeriod(direction) {
    if (this.isWeekFamily()) {
      await this.navigateWeek(direction);
    } else if (this.isTimeGrid()) {
      await this.navigateThreeDay(direction);
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
        try { inst.close(); } catch { /* 单个实例关闭失败不阻断其余实例的清理 */ }
      }
    }
    const modal = new DatePickerModal(this.app, this.currentYear, this.currentMonth, async (year, month) => {
      this.currentYear = year;
      this.currentMonth = month;
      this.convergeSelectedDate();
      this.ensurePeriodAnchor();
      const rendered = await this.renderCalendarGridSafe("openDatePicker");
      if (!rendered) throw new Error("calendar render failed");
    });
    modal.open();
  }
  /**
   * 刷新视图
   * @param force 是否强制重新渲染整个视图
   */
  async refresh(force = false) {
    if (force) this.taskParser.invalidateCache();
    const rendered = force ? await this.render() : await this.renderCalendarGridSafe("refresh");
    if (!rendered) throw new Error("calendar refresh failed");
  }
  /**
   * 渲染星期标题
   */
  renderWeekdayHeader() {
    // 审计 L6 + L12：与 render() 同因——末尾的 insertBefore/appendChild 要解引用 rootEl，
    // 而 rootEl 关闭后不置 null，故判空与 viewClosed 都得看。本方法被 render() 和
    // rebuildHeader() 两处调用，两个调用方各自也守了一遍；这里是同步方法、没有 await，
    // 单独看似乎多余，但列头是「半画状态」里最显眼的一块（网格没了、星期还在），
    // 在入口再收一次口径最省。
    if (!this.rootEl || this.viewClosed) return;
    // 大周视图没有列头：格子是 2 列（手机）/ 4 列（桌面）排布，列与星期不再
    // 一一对应，星期写在每格抬头（见 renderDayCell 的 bigWeek 分支）。
    // 三天视图自带「星期 + 日期」列头（要跟小时轴同宽对齐），也不用这条公共表头。
    if (this.isBigWeek() || this.isTimeGrid()) return;
    const weekdayEl = activeDocument.createElement("div");
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
   *
   * 审计 L14：拆成「本视图」与「弹窗」两趟，各自作用域明确。
   * 原实现三次 querySelectorAll 全打在 document 上，于是分屏开两个月历时，任一 leaf
   * 重画网格都会顺手把**另一个** leaf 和所有开着的弹窗重新上一遍样式。类名操作幂等，
   * 所以眼下看不出错——但那是运气：两个 leaf 的 settings 同源，哪天出现「每视图独立
   * 开关」就直接串味；而且重画是高频路径，每帧多扫两遍全文档并不便宜。
   * 弹窗那一趟**必须**保持全局扫描：CreateTaskModal 挂在 document.body 上、不在
   * this.rootEl 里（插件侧 _applyStrikeToViews 的原注释说的就是这件事）。
   * 但网格重画用不着它——弹窗建列表时自己就按当前开关 toggleClass 过（见
   * CreateTaskModal 里建 existing-task-item 的两处），唯一需要同步弹窗的时机是
   * 「开关在弹窗开着时被改动」，那走的是设置项那条路。
   * @param {{view?: boolean, modal?: boolean}} [opts] 省略＝两趟都做（设置项热切换语义）
   */
  _applyStrikeClasses(opts) {
    const strike = this.plugin.settings.showCompletedStrike;
    const apply = (els) => {
      for (const el of els) {
        if (strike) el.removeClass("completed-strike");
        else el.addClass("completed-strike");
      }
    };
    const wantView = !opts || opts.view !== false;
    const wantModal = !opts || opts.modal !== false;
    if (wantView && this.rootEl) {
      // 条视图的格子（.day-cell .task-item）与日程视图的明细行（.agenda-item）
      // 都在 rootEl 下：明细区也走同一条删除线开关（v1.6.0 批次二），
      // 已完成 = 变暗 + 按开关决定是否划线，与条视图口径一致
      apply(this.rootEl.querySelectorAll(".day-cell .task-item.completed, .agenda-item.completed, .tg-block.completed, .tg-allday-item.completed"));
    }
    if (wantModal) {
      // 「该日已有 N 个任务」列表，挂在 body 上的弹窗里，只能全局扫
      apply(activeDocument.querySelectorAll(".existing-task-item.completed"));
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
    if (this.isTimeGrid()) return this._synthDays(this.threeDayAnchor(), 3);
    if (!this.isWeekFamily()) return calendar.days;
    const start = this.weekAnchor();
    const at = calendar.days.findIndex((d) => formatDate(d.date) === start);
    // 锚点不在本月网格内（跨月周：如锚点 10/26 而当前显示 11 月）——
    // 按锚点自身造 7 天，字段与 generateMonthCalendar 完全同构
    if (at < 0) return this._synthDays(start, 7);
    return calendar.days.slice(at, at + 7);
  }
  /** 从起点键连续造 count 天，字段与 generateMonthCalendar 同构 */
  _synthDays(startKey, count) {
    const base = dateFromStr(startKey);
    const days = [];
    for (let i = 0; i < count; i++) {
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
  /**
   * header 序列的唯一重建入口（v1.7.0 从 updateFilterButton 里抽出）。
   * 视图切换也要走它：顶栏的箭头 aria-label、「回到本月/本周」文案、视图按钮图标
   * 都只在 renderHeader 里生成一次，只改 root class 会留下上一个视图的头部措辞。
   */
  rebuildHeader() {
    // 审计 L6 + L12：setViewMode 在调它之前有 `await this.plugin.saveSettings()`，视图
    // 若在这个空档被关掉，这一串 .empty()/createDiv 全打在已分离的 rootEl 上——不报错，
    // 但等于白建一套 DOM，还会把 gridEl 指向脱离文档的节点，后续渲染继续往里写。
    // 判空只挡「onOpen 之前」，关闭之后靠 viewClosed。提前返回后 gridEl 保持 null，
    // 下游 _renderCalendarGridCore 的 `if (!this.gridEl) return false;` 能安全接住。
    if (!this.rootEl || this.viewClosed) return;
    // 草稿条挂在 rootEl 里，empty() 会带走节点；document 上的丢弃监听要一起摘
    this._tgClearDraft();
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
    // 审计 L14：core 现在返回「这一轮到底画没画」。被判为陈旧而提前返回时，视图里的
    // .completed 节点全是上一轮留下的、类名本来就正确，再扫一遍纯属白做。
    const rendered = await this._renderCalendarGridCore();
    // v1.5.2 方案A：网格重绘后把当前删除线开关态补挂到 .completed 元素上。
    // modal:false——重画网格不改动删除线开关，弹窗那份 DOM 不归这一趟管
    if (rendered) this._applyStrikeClasses({ modal: false });
    // 手机端格子量测（常驻逻辑）：渐隐提示与「+N」都要按最终布局算
    if (rendered) {
      this._mtMeasureMobileCells("render");
      // 渲染后延迟复量，不依赖观察器报信（老 WebView 上信号靠不住）
      this._mtScheduleRetrim();
      // 选中圆标就地复量（见方法注释）：启动探针只能代表「那一刻」的字体
      this._calibrateSelectedBadge();
      this._watchBadgeFonts();
    }
    return true;
  }
  /**
   * 选中圆标就地校准。
   *
   * 启动时那次测量把探针挂在 body 上，量的是「那一刻」的样式。以下三种情况下
   * 探针与真身会不一致，圆心就会偏：
   *   1. 主题用 @font-face 加载自定义字体，插件 onload 时字体还没到（回退字体的
   *      度量被记了下来，字体到齐后数字换了字形，偏移量却还是旧的）；
   *   2. 主题把 `.day-number` 限定在容器内换字体/字号，body 上的探针吃不到；
   *   3. 视图开在弹出窗口里，变量写的是另一个文档的 documentElement。
   * 这里改成在选中日号**自己身上**量行盒与字形墨迹，算出的三个变量写到该元素上，
   * 局部覆盖 documentElement 的全局值。每次重绘都量一次，代价只有一次布局读取。
   */
  _calibrateSelectedBadge() {
    const el = this.rootEl && this.rootEl.querySelector(".day-cell.sel .day-number");
    if (!el || !el.isConnected) return;
    try {
      const doc = el.ownerDocument;
      // 用元素所在文档的 window 取计算样式：视图可能在弹出窗口里
      const cs = (doc.defaultView || window).getComputedStyle(el);
      const fontSize = parseFloat(cs.fontSize);
      if (!(fontSize > 0)) return;
      const family = cs.fontFamily || "sans-serif";
      // 基线探针必须挂在日号内部：行高、字体、字号全部与真身同源
      const bl = doc.createElement("span");
      bl.className = "mt-measure-block";
      el.appendChild(bl);
      const er = el.getBoundingClientRect();
      const br = bl.getBoundingClientRect();
      const baselineFromTop = br.bottom - er.top;
      const lineBoxH = er.height;
      bl.remove();
      // 视图在未激活页签里时布局为 0，量不出真值就跳过，别把 0 写进变量
      if (!(lineBoxH > 0) || !(baselineFromTop > 0)) return;
      const ctx = doc.createElement("canvas").getContext("2d");
      if (!ctx) return;
      ctx.font = `${cs.fontWeight || "700"} ${fontSize}px ${family}`;
      const m = ctx.measureText(el.textContent || "0");
      // 字形墨迹中心在基线上方的距离（px）
      const inkCenter = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
      // dy = 字形墨迹中心相对行盒中心的偏移（向上为正）
      const dyPx = lineBoxH / 2 - baselineFromTop + inkCenter;
      // 直接写入圆心的 top（em），CSS 侧不再做 50% ∓ dy 的减法：
      // 少一次带符号的自定义属性运算，老 WebView 上也不会因
      // `calc(50% - -0.0156em)` 这类双符号写法解析失败而退回 top:auto
      el.style.setProperty("--mt-badge-top", ((lineBoxH / 2 - dyPx) / fontSize).toFixed(4) + "em");
      el.style.setProperty("--mt-badge-ink", ((m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / fontSize).toFixed(4) + "em");
      el.style.setProperty("--mt-badge-w2", (ctx.measureText("00").width / fontSize).toFixed(4) + "em");
    } catch { /* 失败就沿用启动时写在 documentElement 的全局值 */ }
  }
  /**
   * 主题字体晚到：document.fonts.ready 在本次渲染触发的字体加载完成后兑现，
   * 届时再量一次，避免「加载时用回退字体量、之后一直偏着」。每个视图只挂一次。
   */
  _watchBadgeFonts() {
    if (this._badgeFontsHooked || !this.rootEl) return;
    const doc = this.rootEl.ownerDocument;
    if (!doc.fonts || !doc.fonts.ready) return;
    this._badgeFontsHooked = true;
    doc.fonts.ready.then(() => {
      if (this.viewClosed) return;
      this._calibrateSelectedBadge();
    }).catch(() => {});
  }
  /**
   * 审计 L5：不阻塞调用方地重画网格，并把 reject 收敛成一条 console.error。
   * renderCalendarGrid 是 async，而下列调用点都处在**同步**上下文里（事件监听、
   * setViewMode、节假日按需补数回调、筛选弹窗的行点击），根本没法 await；裸调一旦
   * 内部抛错就变成 unhandled rejection——除了控制台一行红字没有任何反馈，网格还可能
   * 停在半画状态。作者在 toggleTask 的延迟刷新里已经为同一件事包了 try/catch
   * （error.delayRefresh），这里给网格重绘补上等价的兜底，七处调用点统一走它。
   * @param {string} reason 只进日志，用于区分是哪条链路触发的重绘
   */
  renderCalendarGridSafe(reason) {
    // 1.7.11：把这条 Promise 返回出去。旧实现不返回，异步调用点没法 await 它，
    // 于是 7 处 `await this.renderCalendarGrid()` 仍走裸调用——一旦内部抛错，
    // 调用它的事件监听又是无人接收的 async 回调，结果就是 unhandled rejection
    // ＋头部已重建、网格停在半画状态。返回后 await 它既保住「画完再继续」的时序，
    // 又拿到同一份兜底日志。
    return this.renderCalendarGrid().then(() => true).catch((err) => {
      console.error(tr("error.renderGrid"), reason || "", err);
      return false;
    });
  }
  async _renderCalendarGridCore() {
    // 自增 requestId：快速切换月份时，旧请求完成后会因 requestId 不匹配而丢弃渲染结果
    this.renderRequestId = (this.renderRequestId || 0) + 1;
    const myRequestId = this.renderRequestId;
    // 审计 L12：令牌自增只能作废**已在途**的渲染。关闭之后才启动的那一轮拿到的是全新
    // id，后面再没人超越它，于是下面每一处 `myRequestId !== this.renderRequestId` 都会
    // 判定通过，整块网格被画进已分离的 rootEl（并顺带发起一次节假日按需补数）。
    // 这里用 onOpen/onClose 维护的显式标志把那道口子堵上；顺带判 rootEl，
    // 因为紧接着就要解引用 this.headerEl。
    // 返回值＝「这一轮到底画没画」，供 renderCalendarGrid 决定要不要再走删除线那趟
    // （审计 L14）。所有提前退出一律 false。
    if (this.viewClosed || !this.rootEl) return false;
    const titleEl = this.headerEl.querySelector(".month-title");
    if (titleEl) {
      titleEl.textContent = this.headerTitleText();
    }
    // 审计 M8：清空网格**推迟到 await 之后**（见下面 gridEl.empty() 处的同类注释）。
    // 旧实现在任何 await 之前就 gridEl.empty()，而 refresh(true) 会先 invalidateCache()，
    // 于是 parseAllTasks(false) 必走全量扫描（getMarkdownFiles + 逐文件读）：
    // 库里任何 md 一保存，500ms 防抖后整个网格先空白再重画，闪烁时长随库增大。
    // 推迟之后这段窗口里用户看到的仍是上一帧的网格（内容通常与即将画出的一致），
    // 代价是「标题已换月、格子还是上一个月」的短暂错位——只在换月**且**恰逢全量
    // 重扫时可见，比整块空白可接受。
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
        // 审计 L5：这里没有 return，外层 .catch 接不到它的 reject（那条 catch 只管
        // ensureYearData 的失败），裸调等于放任 unhandled rejection。
        this.renderCalendarGridSafe("holiday-year-ensured");
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
      if (myRequestId !== this.renderRequestId) return false;
      // 审计 L4：失败分支也要收敛漏斗。updateFilterButton 状态翻转时会 rebuildHeader()
      // 并同步起一轮新渲染（renderRequestId 在那一刻就自增了），所以它必须排在
      // 「画失败态」之前，画完再检一次令牌——否则错误提示会被写进已经摘掉的旧 gridEl。
      this.updateFilterButton();
      if (myRequestId !== this.renderRequestId) return false;
      if (!this.gridEl || !this.gridEl.isConnected) return false;
      this.gridEl.empty();
      const errEl = this.gridEl.createDiv("error-hint");
      errEl.textContent = tr("view.cell.loadError");
      // 审计 L4：明细区同步收敛成同一个失败态。此前这里直接 return，
      // 下方面板还列着上一轮的旧任务，与网格的「任务加载失败」自相矛盾，
      // 用户会以为那些任务仍然存在。
      if (this.isCompactCell())
        this.renderAgendaError();
      else
        this.removeAgendaDetail();
      // 审计 L14：错误态里没有任何 .completed 节点，删除线那趟没必要跑，返回 false
      return false;
    }
    if (myRequestId !== this.renderRequestId) return false;
    // 审计 M8：清空推迟到此处——令牌已确认自己是最新一轮、数据也已到手，
    // 从 empty() 到最后一格画完之间没有任何 await，用户看不到空白帧。
    if (!this.gridEl) return false;
    this.gridEl.empty();
    // 三天视图是一条独立的渲染路径：3 列 × 24 小时的网格没有「格子」，与下面
    // renderDayCell 的月/周格子语义都不同，提前分流，不去复用那套 DOM。
    if (this.isTimeGrid()) {
      this.renderTimeGrid(calendar, taskMap);
      this.removeAgendaDetail();
      this.updateFilterButton();
      return true;
    }
    // 大周视图要统计「这一周共几项、完成几项」：跨天任务在起止区间内每天都挂一次，
    // 所以按任务对象去重（同一个 task 引用只数一遍），口径与格子里铺出来的条数无关。
    // 审计 L3：这里**故意不按 showCompletedTasks 过滤**，而格子那一侧会过滤
    // （renderDayCell 里的 displayTasksList）。看着矛盾，实则三个数自洽：关掉
    // 「显示已完成任务」后被藏起来的恰好全是已完成项，于是
    //     n（本周总项）− m（已完成）== 格子里实际铺出的行数，
    // 用户能从汇总反推出「有几条被藏了」。反过来若改成只统计可见集合，同一周会写成
    // 「共 2 项 · 完成 0」——把 3 条已完成说成 0 条，从「口径需要解释」退化成直接谎报，
    // 更糟。所以缺的不是统计口径而是解释，补在 renderWeekSummaryCell 的 title 上。
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
    // 审计 L14：走到这里说明格子确实铺出来了，删除线开关态需要补挂一次
    return true;
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
        // 1.7.11：generic 元素上的 aria-label 多数读屏软件直接忽略；小月视图里
        // 「逾期/有任务」是唯一的提示，没有角色就等于对读屏用户不存在
        markEl.setAttribute("role", "img");
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
          // 审计 L5：监听器是同步回调，抛错没人接
          this.renderCalendarGridSafe("agenda-select-day");
        }
      });
      return;
    }
    const tasksEl = cellEl.createDiv("day-tasks");
    let displayTasksList = tasks;
    if (!this.plugin.settings.showCompletedTasks) {
      displayTasksList = tasks.filter((t) => !t.completed);
    }
    // 手机端格子量测（2026-10-10）：_mtMeasureMobileCells 需要本格总任务数/日期/完整列表
    // （补「+N」与点击看全部用）；DOM 随重绘整体重建，随元素存取即可
    tasksEl.dataset.mtTotal = String(displayTasksList.length);
    tasksEl.mtDayDate = day.date;
    tasksEl.mtTaskList = displayTasksList;
    // 1.7.9h：手机端格子内无滚动条滑动
    this._mtEnableMobilePan(tasksEl);
    const limit = this.plugin.settings.tasksPerDayLimit;
    // 审计 M13：改成**单一**总预算——一格最多画 limit 行，超出的全部计入 remainingCount。
    // 旧实现给跨天任务和单日任务各发一份 limit 配额（multiDayShown / singleDayShown
    // 两个独立计数器），于是一格实际最多画 2 × limit 行，而设置项对用户的承诺是
    // 「每个日期格子最多显示的任务数量」（settings.tasksLimit.desc，三种语言同一口径），
    // 日面板的折叠阈值（listLimit）与「查看全部」阈值（LIMIT）用的也都是单一预算——
    // 格子与面板互相矛盾。实测 limit=5、5 条单天 + 12 条跨天 → 旧版 9 行 + 「+7」。
    // 作者原意（跨天任务不挤占单日任务）在这里让位于「文案即契约」：跨天任务在起止
    // 区间内每天都挂一次，本就比单日任务更容易刷屏；而且格子越小越不会触发内滚条
    // （见 M14：滚动条会吃掉一个汉字的宽度）。displayTasksList 已按 time/lineNumber
    // 排好序，所以「取前 limit 条」是用户最容易预测的规则。
    let shownCount = 0;
    let remainingCount = 0;
    for (const task of displayTasksList) {
      if (shownCount < limit) {
        this.renderTaskItem(tasksEl, task, day.date);
        shownCount++;
      } else {
        remainingCount++;
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
   * 三天视图（v1.8.0）：3 列 × 24 小时。
   *
   * 布局：列头吸顶，小时网格自己滚；首次进入把「现在」放在可视区上方约
   * 三分之一处（窗口不含今天时停在 08:00），同一窗口内刷新保持原滚动位置。
   * 任务分流：定时、时间可解析且不跨天 → 时间块；其余（无时间、时间非法、
   * 跨天）→ 列头下方的吸顶全天条按日逐条列出，有才出现、限高内滚。
   */
  renderTimeGrid(calendar, taskMap) {
    const gridEl = this.gridEl;
    if (!gridEl) return;
    // 重画即作废上一轮草稿：草稿节点随 gridEl.empty() 一起没了，document 上的
    // 丢弃监听必须同步摘掉，否则下一轮会被一个看不见的草稿吞掉一次点击
    this._tgClearDraft();
    gridEl.addClass("time-grid");
    const days = this.visibleDays(calendar);
    const anchorKey = this.threeDayAnchor();
    const restoreScroll = this._tgLastAnchor === anchorKey ? this._tgLastScrollTop : null;
    this._tgLastAnchor = anchorKey;
    const catFilter = this.activeCategories;
    const dayTasks = days.map((day) => {
      const key = formatDate(day.date);
      let tasks = taskMap.taskMap.get(key) || [];
      if (catFilter && catFilter.size > 0) tasks = tasks.filter((t) => catFilter.has(t.category));
      if (!this.plugin.settings.showCompletedTasks) tasks = tasks.filter((t) => !t.completed);
      return { day, key, tasks };
    });
    // 草稿拖到别的列时，要按那一列取回自己的 day/tasks（弹窗与全天条都用它）
    this._tgDayTasks = dayTasks;

    const scrollEl = gridEl.createDiv("tg-scroll");
    const headEl = scrollEl.createDiv("tg-head");
    const headRow = headEl.createDiv("tg-head-row");
    headRow.createDiv("tg-gutter-head");
    const headCols = headRow.createDiv("tg-head-cols");
    for (const { day, tasks } of dayTasks) {
      const head = headCols.createDiv("tg-day-head");
      if (day.isToday) head.addClass("is-today");
      if (day.isWeekend) head.addClass("is-weekend");
      // 星期与日期并排：三列本来就不宽，两行堆叠只会把列头撑高
      head.createDiv("tg-head-weekday").textContent = weekdayFullNames()[day.date.getDay()];
      head.createDiv("tg-head-date").textContent = `${day.date.getMonth() + 1}/${day.date.getDate()}`;
      // 点日期 = 当天的任务入口（弹窗里带着当天已有任务列表），不额外占高度
      head.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openCreateTaskModal(day.date, tasks, null);
      });
    }
    // 全天任务默认收成一行「全天」＋每日条数：某天堆了七八条时不再把时间轴挤到看不见。
    // 点条带或左边的「全天」展开，展开后仍按日逐条列出（当天有几条列几条，不截成 +N），
    // 整条限高、内部可滚。展开状态只存在视图字段里，刷新/翻日期不丢，也不写进 data.json
    const allDayCols = dayTasks.map(({ day, tasks }) => ({
      day,
      tasks,
      items: tasks.filter((t) => this._tgIsAllDayTask(t))
    }));
    if (allDayCols.some((d) => d.items.length > 0)) {
      const band = headEl.createDiv("tg-allday-band");
      const toggle = band.createEl("button", { cls: "tg-allday-gutter tg-allday-toggle" });
      toggle.setAttribute("type", "button");
      toggle.createSpan({ cls: "tg-allday-toggle-label", text: tr("view.timegrid.alldayLabel") });
      toggle.createSpan({ cls: "tg-allday-chevron" });
      const applyAllDayExpanded = (expanded) => {
        this._tgAllDayExpanded = expanded;
        band.toggleClass("is-collapsed", !expanded);
        toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
        const tip = tr(expanded ? "view.timegrid.alldayCollapse" : "view.timegrid.alldayExpand");
        toggle.setAttribute("aria-label", tip);
        toggle.setAttribute("title", tip);
      };
      applyAllDayExpanded(this._tgAllDayExpanded === true);
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        applyAllDayExpanded(!this._tgAllDayExpanded);
      });
      // 收起时点条带任何位置都算「我要看」：展开，而不是误开当天的新建弹窗
      band.addEventListener("click", (e) => {
        if (this._tgAllDayExpanded) return;
        if (e.target.closest(".tg-allday-toggle")) return;
        applyAllDayExpanded(true);
      });
      const bandCols = band.createDiv("tg-allday-cols");
      for (const { day, tasks, items } of allDayCols) {
        const cell = bandCols.createDiv("tg-allday-cell");
        const counts = cell.createDiv("tg-allday-counts");
        if (items.length > 0) {
          const pill = counts.createDiv("tg-allday-count");
          pill.textContent = tr("view.timegrid.alldayCount", { n: items.length });
        }
        for (const task of items) {
          const row = cell.createDiv("tg-allday-item");
          this._tgPaintTaskColor(row, task);
          if (task.completed) {
            row.addClass("completed");
            row.toggleClass("completed-strike", !this.plugin.settings.showCompletedStrike);
          }
          row.createSpan({ cls: "tg-allday-title", text: task.content });
          row.setAttribute("title", task.category ? `${task.content} · #${task.category}` : task.content);
          row.addEventListener("click", (e) => {
            e.stopPropagation();
            this.openCreateTaskModal(this._tgTaskAnchor(task, day.date), tasks, task);
          });
        }
        // 展开后条带空白处也开当天的任务入口，和点日期同一个落点；
        // 收起时这一下交给条带自己的展开处理，别顺手弹出新建窗
        cell.addEventListener("click", (e) => {
          if (e.target.closest(".tg-allday-item")) return;
          if (!this._tgAllDayExpanded) return;
          this.openCreateTaskModal(day.date, tasks, null);
        });
      }
    }

    const canvasEl = scrollEl.createDiv("tg-canvas");
    const gutter = canvasEl.createDiv("tg-gutter");
    for (let h = 0; h < 24; h++) {
      const label = gutter.createDiv("tg-hour-label");
      label.style.top = `${(h / 24) * 100}%`;
      label.textContent = `${String(h).padStart(2, "0")}:00`;
    }
    const daysEl = canvasEl.createDiv("tg-days");
    dayTasks.forEach(({ day, key, tasks }) => {
      const col = daysEl.createDiv("tg-day-col");
      col.dataset.date = key;
      if (day.isToday) col.addClass("is-today");
      if (day.isWeekend) col.addClass("is-weekend");
      if (day.isToday) {
        const now = new Date();
        const nowEl = col.createDiv("tg-now");
        nowEl.style.top = `${((now.getHours() * 60 + now.getMinutes()) / 1440) * 100}%`;
      }
      const timed = [];
      for (const task of tasks) {
        if (!task.time || this._tgIsMultiDayTask(task)) continue;
        const range = this._tgParseRange(task.time);
        if (range) timed.push({ task, ...range });
      }
      this._tgLayoutOverlaps(timed);
      for (const item of timed) this._tgRenderBlock(col, item, day, tasks);
      col.addEventListener("click", (e) => {
        if (e.target.closest(".tg-block")) return;
        const rect = col.getBoundingClientRect();
        if (rect.height <= 0) return;
        const minutes = Math.max(0, Math.min(1439, ((e.clientY - rect.top) / rect.height) * 1440));
        // 起点最多 23:30：再往下点（23:31+）不该退回到 23:00 开始，给个 30 分钟的口子
        let start = Math.min(23 * 60 + 30, Math.floor(minutes / 30) * 30);
        const end = Math.min(start + 60, 23 * 60 + 59);
        // 先出草稿条，不写盘；点下一格会把它挪过去，点别处直接丢弃
        this._tgCreateDraft(col, day, tasks, start, end);
      });
    });

    // 列头留在滚动容器里吸顶，宽度天然与小时网格一致；
    // 只有首帧要按窗口决定停在哪一小时，之后刷新沿用用户当前的滚动位置
    window.requestAnimationFrame(() => {
      // 以滚动容器自己是否还在文档里为准：同一帧内若又画了一轮，旧容器的
      // scrollTop 写回去只会覆盖新一轮的首屏定位
      if (!scrollEl.isConnected) return;
      const hourPx = canvasEl.getBoundingClientRect().height / 24;
      if (restoreScroll != null) {
        scrollEl.scrollTop = restoreScroll;
      } else if (dayTasks.some(({ day }) => day.isToday)) {
        const now = new Date();
        const nowPx = ((now.getHours() * 60 + now.getMinutes()) / 1440) * hourPx * 24;
        const viewH = Math.max(0, scrollEl.clientHeight - headEl.offsetHeight);
        // 「现在」压在顶边等于一屏只看得见往后，往前提约三分之一屏，前面的时段也留得住。
        // 列头（含全天条）是吸顶的：canvas 在视口里的起点已经是 headH，
        // 这里只按「列头以下的可视高度」倒推滚动量，否则全天条一高，
        // 「现在」会被推进列头底下
        scrollEl.scrollTop = Math.max(0, nowPx - viewH * 0.35);
      } else {
        // 同理：让 08:00 落在列头下沿 8px 处，而不是再往下藏一个列头的高度
        scrollEl.scrollTop = Math.max(0, 8 * hourPx - 8);
      }
      this._tgLastScrollTop = scrollEl.scrollTop;
    });
    scrollEl.addEventListener("scroll", () => {
      this._tgLastScrollTop = scrollEl.scrollTop;
    });
  }
  /** 清掉草稿条与 document 上的丢弃监听（重画、切视图、关视图都要走） */
  _tgClearDraft() {
    if (this._tgDraftDismiss) {
      // 与安装时同一个文档：视图在弹出窗口里时 activeDocument 可能已经切走，
      // 那样这里摘的是另一个文档上的监听，原监听就泄漏了
      const doc = (this._tgDraftEl && this._tgDraftEl.ownerDocument) || activeDocument;
      doc.removeEventListener("click", this._tgDraftDismiss, true);
      this._tgDraftDismiss = null;
    }
    if (this._tgDraftEl) {
      this._tgDraftEl.remove();
      this._tgDraftEl = null;
    }
  }
  /**
   * 空白格草稿条：只在 DOM 里放一根临时块，不写文件。
   * 上/下边框拖动改起止（15 分钟吸附），条体拖动整体平移；条内 ＋ 才把
   * 当前区间交给创建弹窗。点别处由 document 的 capture 监听丢弃。
   */
  _tgCreateDraft(col, day, tasks, start, end) {
    this._tgClearDraft();
    const el = col.createDiv("tg-block tg-draft");
    this._tgDraftEl = el;
    let curStart = start;
    let curEnd = end;
    // 草稿也能横向拖到别的日子：拖过去之后 ＋ 开的是那一日的弹窗
    let curDay = day;
    let curTasks = tasks;
    el.createDiv("tg-block-time tg-draft-time");
    const add = el.createEl("button", {
      cls: "tg-draft-add",
      attr: { type: "button", "aria-label": tr("view.timegrid.addTask"), title: tr("view.timegrid.addTask") }
    });
    setSvgIcon(add, AGENDA_ADD_ICON);
    el.createDiv("tg-resize tg-resize-top").setAttribute("aria-hidden", "true");
    el.createDiv("tg-resize tg-resize-bottom").setAttribute("aria-hidden", "true");
    const paint = () => {
      el.style.top = `${(curStart / 1440) * 100}%`;
      el.style.height = `${((curEnd - curStart) / 1440) * 100}%`;
      el.toggleClass("is-short", curEnd - curStart < 45);
      el.querySelector(".tg-draft-time").textContent =
        `${this._tgFmtMinutes(curStart)}–${this._tgFmtMinutes(curEnd)}`;
    };
    const snap = (m) => Math.round(m / 15) * 15;
    const hourPx = () => {
      const canvas = el.closest(".tg-canvas");
      const h = canvas ? canvas.getBoundingClientRect().height : 0;
      return h > 0 ? h / 24 : 52;
    };
    let mode = "move";
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let baseStart = curStart;
    let baseEnd = curEnd;
    let active = false;
    let colSpans = [];
    const pickCol = (x) => {
      for (const s of colSpans) if (x >= s.left && x < s.right) return s;
      return null;
    };
    const cleanup = () => {
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      el.removeClass("is-dragging");
      if (pointerId != null) {
        try { el.releasePointerCapture(pointerId); } catch { /* 元素已从文档分离时释放指针捕获会抛，忽略即可 */ }
        pointerId = null;
      }
      active = false;
    };
    const onMove = (ev) => {
      if (pointerId != null && ev.pointerId != null && ev.pointerId !== pointerId) return;
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) <= 2) return;
        active = true;
        el.addClass("is-dragging");
      }
      const delta = snap(((ev.clientY - startY) / hourPx()) * 60);
      if (mode === "start") {
        curStart = Math.max(0, Math.min(baseEnd - 15, baseStart + delta));
        curEnd = baseEnd;
      } else if (mode === "end") {
        curStart = baseStart;
        curEnd = Math.max(baseStart + 15, Math.min(1439, baseEnd + delta));
      } else {
        const span = baseEnd - baseStart;
        curStart = Math.max(0, Math.min(1439 - span, baseStart + delta));
        curEnd = curStart + span;
        const hit = pickCol(ev.clientX);
        if (hit && hit.col !== el.parentElement) {
          hit.col.appendChild(el);
          const target = (this._tgDayTasks || []).find((d) => d.key === hit.col.dataset.date);
          if (target) {
            curDay = target.day;
            curTasks = target.tasks;
          }
        }
      }
      paint();
      ev.preventDefault();
      ev.stopPropagation();
    };
    const onUp = (ev) => {
      if (pointerId != null && ev && ev.pointerId != null && ev.pointerId !== pointerId) return;
      cleanup();
    };
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button != null && ev.button !== 0) return;
      // ＋ 是唯一出口：按在它上面不进入拖拽，交给 click
      if (ev.target.closest(".tg-draft-add")) return;
      mode = ev.target.closest(".tg-resize-top") ? "start"
        : ev.target.closest(".tg-resize-bottom") ? "end" : "move";
      pointerId = ev.pointerId;
      startX = ev.clientX;
      startY = ev.clientY;
      baseStart = curStart;
      baseEnd = curEnd;
      active = false;
      const wrap = el.parentElement && el.parentElement.parentElement;
      colSpans = wrap ? Array.from(wrap.children).map((c) => {
        const r = c.getBoundingClientRect();
        return { col: c, left: r.left, right: r.right };
      }) : [];
      try { el.setPointerCapture(pointerId); } catch { /* 部分 WebView 不支持指针捕获，退化为普通拖动 */ }
      el.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      ev.preventDefault();
    });
    add.addEventListener("click", (e) => {
      e.stopPropagation();
      const time = `${this._tgFmtMinutes(curStart)}~${this._tgFmtMinutes(curEnd)}`;
      this._tgClearDraft();
      this.openCreateTaskModal(curDay.date, curTasks, null, { time });
    });
    paint();
    // 建草稿的这一下点击还会继续冒泡到列上；监听器挪到下一帧再挂，
    // 免得刚建出来的草稿被自己这一下丢掉
    window.requestAnimationFrame(() => {
      if (this._tgDraftEl !== el) return;
      this._tgDraftDismiss = (e) => {
        if (!this._tgDraftEl) return;
        if (e.target && e.target.closest && e.target.closest(".tg-draft")) return;
        this._tgClearDraft();
      };
      el.ownerDocument.addEventListener("click", this._tgDraftDismiss, true);
    });
  }
  /** 编辑弹窗的锚点：跨天任务用开始日，单日任务用截止日 */
  _tgTaskAnchor(task, fallbackDate) {
    const s = task.startDate || task.dueDate;
    return s ? dateFromStr(s) : fallbackDate;
  }
  _tgIsMultiDayTask(task) {
    return !!(task.startDate && task.dueDate && task.startDate !== task.dueDate);
  }
  _tgIsAllDayTask(task) {
    // 时间写坏（手改出 25:99 之类）时 _tgParseRange 返回 null，时间块与全天条
    // 都会跳过它——整条任务在三天视图里凭空消失。归到全天条至少看得见、点得开
    return !task.time || !this._tgParseRange(task.time) || this._tgIsMultiDayTask(task);
  }
  /** 「09:00」/「09:00~11:30」→ 分钟区间；单时间点按 1 小时画（不写回结束时间） */
  _tgParseRange(time) {
    // 手改文件可能写全角「～」（updateTaskTime 的匹配式两种都认），这里一并拆开
    const parts = String(time || "").split(/[~～]/);
    const toMin = (s) => {
      const m = /^(\d{1,2}):(\d{1,2})$/.exec(String(s).trim());
      if (!m) return null;
      const h = Number(m[1]);
      const min = Number(m[2]);
      return h >= 0 && h <= 23 && min >= 0 && min <= 59 ? h * 60 + min : null;
    };
    const start = toMin(parts[0]);
    if (start == null) return null;
    let end = parts[1] ? toMin(parts[1]) : null;
    const single = end == null;
    if (single) end = Math.min(start + 60, 1439);
    // 结束不晚于开始（手滑/跨午夜写反）：防崩压成 15 分钟示意，并打 invalid 标记——
    // 渲染时给红色虚线描边与提示，而不是让人对着一条莫名其妙的细条猜
    const invalid = end <= start;
    if (invalid) end = Math.min(start + 15, 1439);
    return { start, end, single, invalid };
  }
  /**
   * 重叠任务分道：按开始时间切簇，簇内贪心放进最早空出来的道。
   * 每簇统一用「簇内最大道数」算宽度，同簇的块左右边界才对得齐。
   */
  _tgLayoutOverlaps(items) {
    const sorted = items.slice().sort((a, b) => a.start - b.start || b.end - a.end);
    const clusters = [];
    let cur = null;
    for (const item of sorted) {
      if (!cur || item.start >= cur.end) {
        cur = { items: [], end: item.end };
        clusters.push(cur);
      }
      cur.items.push(item);
      if (item.end > cur.end) cur.end = item.end;
    }
    for (const cluster of clusters) {
      const laneEnds = [];
      for (const item of cluster.items) {
        let lane = 0;
        while (lane < laneEnds.length && laneEnds[lane] > item.start) lane++;
        if (lane === laneEnds.length) laneEnds.push(item.end);
        else laneEnds[lane] = item.end;
        item.lane = lane;
      }
      for (const item of cluster.items) item.lanes = laneEnds.length;
    }
  }
  _tgFmtMinutes(m) {
    const mm = Math.max(0, Math.min(1439, Math.round(m)));
    return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
  }
  _tgPaintTaskColor(el, task) {
    // 无类别不套默认蓝：默认蓝恰好就是「生活」的色，看着像被误分了类。
    // 交给 CSS 的中性灰，和草稿条的虚线蓝也能区分开
    if (!task.category) {
      el.addClass("is-uncategorized");
      return;
    }
    const color = resolveCategoryColor(task.category, this.plugin.settings.categories);
    el.style.setProperty("--tg-color", color);
    el.style.setProperty("--tg-tint", hexToRgba(color, 0.14));
    el.style.setProperty("--tg-tint-dark", hexToRgba(color, 0.26));
  }
  _tgRenderBlock(col, item, day, dayTasks) {
    const task = item.task;
    const el = col.createDiv("tg-block");
    this._tgPaintTaskColor(el, task);
    if (task.completed) {
      el.addClass("completed");
      el.toggleClass("completed-strike", !this.plugin.settings.showCompletedStrike);
    }
    // 45 分钟以下的块放不下「时间 + 标题」两行：让出时间行只留标题，
    // 位置本身已经说明了时间（小时线 + 半小时虚线）
    if (item.end - item.start < 45) el.addClass("is-short");
    el.style.top = `${(item.start / 1440) * 100}%`;
    el.style.height = `${((item.end - item.start) / 1440) * 100}%`;
    const lanes = item.lanes || 1;
    el.style.left = `calc(${(item.lane / lanes) * 100}% + 2px)`;
    el.style.width = `calc(${100 / lanes}% - 4px)`;
    el.createDiv("tg-block-time").textContent = item.single
      ? this._tgFmtMinutes(item.start)
      : `${this._tgFmtMinutes(item.start)}–${this._tgFmtMinutes(item.end)}`;
    el.createDiv("tg-block-title").textContent = task.content;
    el.setAttribute("title", task.category ? `${task.content} · #${task.category}` : task.content);
    if (item.invalid) {
      el.addClass("is-badtime");
      el.setAttribute("title", `${el.getAttribute("title")} — ${tr("view.timegrid.badTime")}`);
    }
    // 上下两条边框都能拉：补上原来缺的顶边，时间可以往前延
    el.createDiv("tg-resize tg-resize-top").setAttribute("aria-hidden", "true");
    el.createDiv("tg-resize tg-resize-bottom").setAttribute("aria-hidden", "true");
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      if (el._tgSuppressClick) {
        el._tgSuppressClick = false;
        return;
      }
      this.openCreateTaskModal(this._tgTaskAnchor(task, day.date), dayTasks, task);
    });
    this._tgAttachBlockDrag(el, item, task);
  }
  /**
   * 时间块拖拽：块体上下移动、上/下边把手拉改起止，15 分钟吸附。
   * 触屏 220ms 长按才进入拖拽——手指一落就抢事件会跟纵向滚动打架；
   * 长按前位移超过 8px 视为滚动，直接放弃本次拖拽。鼠标移动超过 3px 才进入。
   * 松手后只改行内 ⏰ 段（updateTaskTime），不重建任务行、不动行号。
   */
  _tgAttachBlockDrag(el, item, task) {
    let mode = null;
    let active = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    const baseStart = item.start;
    const baseEnd = item.end;
    let previewStart = baseStart;
    let previewEnd = baseEnd;
    let longPress = null;
    // 横向换天：按下时把三列的左右边界记下来，拖动中按 clientX 判断指针落在哪一列，
    // 落在别的列就把块整个搬过去（各列等高，top/height 的百分比原样有效）
    let originCol = null;
    let colSpans = [];
    const pickCol = (x) => {
      for (const s of colSpans) if (x >= s.left && x < s.right) return s;
      return null;
    };
    const snap = (m) => Math.round(m / 15) * 15;
    const hourPx = () => {
      const canvas = el.closest(".tg-canvas");
      const h = canvas ? canvas.getBoundingClientRect().height : 0;
      return h > 0 ? h / 24 : 52;
    };
    const paint = () => {
      el.style.top = `${(previewStart / 1440) * 100}%`;
      el.style.height = `${((previewEnd - previewStart) / 1440) * 100}%`;
      el.toggleClass("is-short", previewEnd - previewStart < 45);
      const t = el.querySelector(".tg-block-time");
      if (t) {
        t.textContent = item.single && mode === "move"
          ? this._tgFmtMinutes(previewStart)
          : `${this._tgFmtMinutes(previewStart)}–${this._tgFmtMinutes(previewEnd)}`;
      }
    };
    const cancelLongPress = () => {
      if (longPress != null) {
        window.clearTimeout(longPress);
        longPress = null;
      }
    };
    const onTouchMove = (ev) => {
      if (active) ev.preventDefault();
    };
    const activate = () => {
      if (active) return;
      active = true;
      el.addClass("is-dragging");
      // 长按期间手机可能判定成纵向滚动；进入拖拽后先关掉本元素的 touch-action
      // （见 styles.css 的 .tg-block.is-dragging），
      // 再用非 passive 的 document touchmove 兜底（后者对已开始的滚动才拦得住）
      // 用元素自己所在文档：视图开在弹出窗口时，activeDocument 可能指的是主窗口，
      // 装到主窗口上的监听在清理阶段就摘不掉了
      el.ownerDocument.addEventListener("touchmove", onTouchMove, { passive: false });
    };
    const cleanup = () => {
      cancelLongPress();
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      el.ownerDocument.removeEventListener("touchmove", onTouchMove);
      el.removeClass("is-dragging");
      el.style.touchAction = "";
      if (pointerId != null) {
        try { el.releasePointerCapture(pointerId); } catch { /* 元素已从文档分离时释放指针捕获会抛，忽略即可 */ }
        pointerId = null;
      }
      active = false;
    };
    const onMove = (ev) => {
      if (pointerId != null && ev.pointerId != null && ev.pointerId !== pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!active) {
        const dist = Math.hypot(dx, dy);
        if (ev.pointerType === "touch") {
          // 上下两条边自己 touch-action:none，滚动不会从这儿开始 —— 不用等长按，
          // 压上去就能跟手；整块移动里横向为主的手势同样不会触发纵向滚动，跨天也直接跟手
          const edge = mode !== "move";
          const horizontal = Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy);
          if (!edge && !horizontal) {
            // 竖向整块移动会和滚动抢手势：只等长按；浏览器先接管成滚动时会发 pointercancel
            if (dist > 8) cancelLongPress();
            return;
          }
          if (dist <= 2) return;
          cancelLongPress();
        } else if (dist <= 3) {
          // 鼠标不按下即拖：动过 3px 才算拖拽，单纯点一下不该闪一下拖拽态
          return;
        }
        activate();
      }
      const delta = snap((dy / hourPx()) * 60);
      if (mode === "move") {
        const hit = pickCol(ev.clientX);
        if (hit && hit.col !== el.parentElement) hit.col.appendChild(el);
      }
      if (mode === "resizeStart") {
        previewStart = Math.max(0, Math.min(baseEnd - 15, baseStart + delta));
        previewEnd = baseEnd;
      } else if (mode === "resizeEnd") {
        previewStart = baseStart;
        previewEnd = Math.max(baseStart + 15, Math.min(1439, baseEnd + delta));
      } else {
        const span = baseEnd - baseStart;
        previewStart = Math.max(0, Math.min(1439 - span, baseStart + delta));
        previewEnd = previewStart + span;
      }
      paint();
      ev.preventDefault();
      ev.stopPropagation();
    };
    const onCancel = (ev) => {
      if (pointerId != null && ev && ev.pointerId != null && ev.pointerId !== pointerId) return;
      cleanup();
      if (originCol && el.parentElement !== originCol) originCol.appendChild(el);
      previewStart = baseStart;
      previewEnd = baseEnd;
      paint();
    };
    const onUp = async (ev) => {
      // 多点触控时别让第二根手指的抬起结束第一根手指的拖拽
      if (pointerId != null && ev && ev.pointerId != null && ev.pointerId !== pointerId) return;
      const wasActive = active;
      cleanup();
      if (!wasActive) return;
      const targetCol = el.parentElement;
      const newDateKey = targetCol && targetCol.dataset ? targetCol.dataset.date : "";
      const dayChanged = !!newDateKey && !!originCol
        && originCol.dataset && newDateKey !== originCol.dataset.date;
      if (!dayChanged && previewStart === baseStart && previewEnd === baseEnd) return;
      el._tgSuppressClick = true;
      // 拉过任意一条边就写区间：只有「整体平移 + 原本只有一个时间点」才维持单点写法
      const newTime = mode === "move" && item.single
        ? this._tgFmtMinutes(previewStart)
        : `${this._tgFmtMinutes(previewStart)}~${this._tgFmtMinutes(previewEnd)}`;
      try {
        if (dayChanged) {
          const ok = await this.taskParser.updateTaskSchedule(task, newDateKey, newTime);
          if (!ok) throw new Error("updateTaskSchedule returned false");
          // 🛫 与 📅 在单日任务里是同一天，内存里一起改，避免刷新前的下一帧又画回旧日子
          if (task.dueDate) task.dueDate = newDateKey;
          if (task.startDate) task.startDate = newDateKey;
        } else {
          const ok = await this.taskParser.updateTaskTime(task, newTime);
          if (!ok) throw new Error("updateTaskTime returned false");
        }
        task.time = newTime;
        await this.refresh(true);
      } catch (err) {
        console.error(err);
        // 拖拽失败没有 refresh，元素还留在屏幕上：把点按拦截解掉，把块送回原来那一列，
        // 否则用户下一次点这块任务会被这次失败吞掉一次，块也会停在一个没写进文件的日期上
        el._tgSuppressClick = false;
        if (originCol && el.parentElement !== originCol) originCol.appendChild(el);
        previewStart = baseStart;
        previewEnd = baseEnd;
        paint();
        new import_obsidian.Notice(tr("view.timegrid.updateFail"), 4e3);
      }
    };
    el.addEventListener("pointerdown", (ev) => {
      if (ev.button != null && ev.button !== 0) return;
      mode = ev.target.closest(".tg-resize-top") ? "resizeStart"
        : ev.target.closest(".tg-resize-bottom") ? "resizeEnd" : "move";
      pointerId = ev.pointerId;
      startX = ev.clientX;
      startY = ev.clientY;
      previewStart = baseStart;
      previewEnd = baseEnd;
      originCol = el.parentElement;
      const wrap = originCol && originCol.parentElement;
      colSpans = wrap ? Array.from(wrap.children).map((c) => {
        const r = c.getBoundingClientRect();
        return { col: c, left: r.left, right: r.right };
      }) : [];
      try { el.setPointerCapture(pointerId); } catch { /* 部分 WebView 不支持指针捕获，退化为普通拖动 */ }
      el.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      if (ev.pointerType === "touch" && mode === "move") {
        longPress = window.setTimeout(() => {
          longPress = null;
          activate();
        }, 220);
      }
      // 鼠标/触控笔不在这里激活：等指针真的移动 3px 再由 onMove 进入拖拽
    });
    el.addEventListener("dblclick", (e) => e.stopPropagation());
  }
  /**
   * 手机端等高截断的网格观察（2026-10-10，v1.7.8）：ResizeObserver 只盯 rootEl 不够——
   * 「切走再回」的松布局阶段里，网格在 rootEl 内部长高（行高从约 90px 恢复到 311/321px），
   * rootEl 自身高度不变，观察器不触发，截断结果就停留在按矮盒子算出的「2+1」上（10/9
   * 首开 3 条、切回 2+1 的差异源）。这里把 gridEl 一并纳入观察：行高恢复等分的瞬间
   * 即触发重裁。gridEl 在挂载/换语言/切视图形态时会重建，重建后必有网格重绘 → 重裁 →
   * 回到这里重新观察，换新时先退订旧的；observe 已观察的元素是规范 no-op，不会重复挂。
   */
  _mtWatchGridSize() {
    try {
      if (this.viewClosed || !this._mtTrimObserver || !this.gridEl) return;
      if (this._mtObservedGrid && this._mtObservedGrid !== this.gridEl) {
        this._mtTrimObserver.unobserve(this._mtObservedGrid);
      }
      this._mtTrimObserver.observe(this.gridEl);
      this._mtObservedGrid = this.gridEl;
    } catch (err) {
      console.error("[monthly-tasks] grid observer failed:", err);
    }
  }
  /**
   * 取/建本格末尾的「+N」节点（2026-10-11，v1.7.11）：原先是量测循环里的闭包
   * ensureChip，拆成读/写两趟后闭包里的 chip 已跨趟，故提成方法按元素取。
   * 点击行为与渲染期建的「+N」一致：开该日任务弹窗，不冒泡触发建任务。
   */
  _mtEnsureMoreChip(tasksEl) {
    const chip = tasksEl.createDiv("more-tasks");
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openCreateTaskModal(tasksEl.mtDayDate, tasksEl.mtTaskList || []);
    });
    return chip;
  }
  /**
   * 手机端格子量测（2026-10-10，v1.7.9k；前身是「等高截断」）：只量不裁。
   * 用户实测后选定的口径是「装不下的靠滑动看，不要按高度藏进 +N」，所以本方法不再
   * 隐藏任何条目：超出可视区的任务留在 .day-tasks 里，由 _mtEnableMobilePan 手动平移
   * （overflow:hidden 不生成滚动条——这台老 WebView 只要出条就必占 5px 内容宽，
   * 「一行 4 字变 3 字」的根因）。本方法负责三件事：
   *   ①量出任务盒高与末条位置（clipped），供「+N」与渐隐提示（.mt-pan-hint，挂在
   *     .day-cell 上）使用；
   *   ②「+N」只在**条数余量**（total > items.length，即设置里「每格最多 N 条」截掉的
   *     那几条）大于 0 时出现——那是用户对设置的显式契约，不由本方法擅自取消；
   *   ③「+N」待在列表末尾原位（v1.7.9k 起不再做任何绝对定位，见下方注释）。
   * 桌面端（>480px）直接返回，并摘掉手机端留下的提示类。
   * 触发：网格重绘后（renderCalendarGrid 尾部）＋ 尺寸变化（ResizeObserver 观察 rootEl
   * 与 gridEl）＋ 渲染后延迟复量（_mtScheduleRetrim）。pass 标明本轮由谁发起
   * （render/raf/timer/obs），只进失败日志。
   */
  _mtMeasureMobileCells(pass) {
    try {
      if (this.viewClosed || !this.gridEl || !this.gridEl.isConnected) return;
      if (!window.matchMedia || !window.matchMedia("(max-width: 480px)").matches) {
        // 1.7.9h：宽屏不截断，也要把手机端留下的渐隐类摘掉（窄→宽切换会残留遮罩）
        for (const c of Array.from(this.gridEl.querySelectorAll(".mt-pan-hint"))) {
          c.classList.remove("mt-pan-hint");
          c.classList.remove("mt-pan-scrolled");
        }
        // 1.7.11：宽屏也不留「当前平移者」，窄→宽切换后旧惯性不该继续跑
        if (this._mtPanStop) {
          this._mtPanStop();
          this._mtPanStop = null;
        }
        return;
      }
      // 网格长高（松布局→等分恢复）时 rootEl 不动，先把 gridEl 纳入观察再量
      this._mtWatchGridSize();
      // 1.7.11：两趟走——第一趟只读几何、第二趟集中写类名与文本。旧写法每格「读→写→读」
      // 交替，42 格一轮就是几十次强制同步重排，而本方法还被未节流的 ResizeObserver 驱动
      // （分栏拖拽期间每帧一轮），在老 WebView 上足以拖慢手势。
      const reads = [];
      for (const tasksEl of Array.from(this.gridEl.querySelectorAll(".day-tasks"))) {
        const items = [];
        let chip = null;
        for (const child of Array.from(tasksEl.children)) {
          if (child.classList.contains("task-item")) {
            // 上一版按高度截断的遗留兜底：那时会 display:none，现在不再隐藏任何东西
            if (child.style.display === "none") child.style.display = "";
            items.push(child);
          } else if (child.classList.contains("more-tasks")) {
            chip = child;
          }
        }
        if (items.length === 0) continue;
        const box = tasksEl.getBoundingClientRect();
        if (box.height <= 0) continue; // 视图隐藏/尚未布局
        const total = parseInt(tasksEl.dataset.mtTotal || "", 10) || items.length;
        // 1.7.11：「还有内容在可视区外」改用与滚动位置无关的量。旧判据是
        // 「末条视口底 − 盒顶 > allow」，随滚动变化：用户滑到中途时若赶上复量轮
        // （1.2 秒定时器或观察器），提示类被单向摘掉，滑回顶部也不回来——
        // mt-pan-scrolled 只压制「已滚动」那一半，两个类一旦错位提示就永久消失。
        // scrollHeight − clientHeight 不受滚动影响，且天然把「+N」自身算进内容高度，
        // 顺带堵死「+N 被挤出可视区却判为不溢出、既不提示也永远点不到」的死角。
        const clipped = tasksEl.scrollHeight - tasksEl.clientHeight > 1;
        reads.push({ tasksEl, chip, remainingByLimit: total - items.length, clipped });
      }
      // 1.7.11：媒体查询按**宽度**下 overflow:hidden，而平移手势要求设备有触摸能力。
      // 桌面窄侧栏/分栏（<480px 且无触摸屏）里两者不重合：格子既没有滚动条也没有手势，
      // 被裁的任务根本够不着，此时再压一条「这里还能滑」的渐隐就是撒谎。
      const pannable = "ontouchstart" in window;
      for (const r of reads) {
        // 提示类挂在滚动容器自身（.day-tasks）：mask-image 只该压淡任务区底部，
        // 压在 .day-cell 上会连整格投影、调休斜纹和最需要看清的末行文字一起遮掉
        r.tasksEl.classList.toggle("mt-pan-hint", r.clipped && pannable);
        if (r.remainingByLimit > 0) {
          const chip = r.chip || this._mtEnsureMoreChip(r.tasksEl);
          if (chip.hasClass("is-hidden")) chip.removeClass("is-hidden");
          chip.textContent = `+${r.remainingByLimit}`;
        } else if (r.chip) {
          // 条数余量为 0：渲染期不会建「+N」，能走到这里的只会是本方法上一轮建的，藏掉
          r.chip.addClass("is-hidden");
        }
      }
    } catch (err) {
      console.error("[monthly-tasks] mobile cell measure failed:", pass, err);
    }
  }
  /**
   * 手机端格子内无滚动条滑动（2026-10-10，v1.7.9h 起，v1.7.9j 重写流畅度）：
   * 老 WebView 走原生 overflow 滚动必占 5px 内容宽（「一行 4 字变 3 字」的根因），
   * 故 .day-tasks 保持 overflow:hidden，由触摸手动改 scrollTop——hidden 元素脚本
   * 可滚、且结构上永不生成滚动条。
   * 流畅度三条（v1.7.9j，用户实测「不太流畅」后定位）：
   *   ①几何只量一次：scrollHeight/clientHeight 每 move 都读会强制同步重排，
   *     与紧随的 scrollTop 写入形成读写交替掉帧，故起手存进 m，过程只读 scrollTop；
   *   ②写入合帧：touchmove 比渲染帧更密，只更新目标值 want，真正写 scrollTop
   *     交给 requestAnimationFrame，一帧最多一次；preventDefault 必须留在 touchmove
   *     的同步路径里（事件对象到 rAF 回调时已不可取消，那时调等于没调）；
   *   ③惯性：原生滚动有惯性而脚本滚动没有，手指一停就死、观感发涩，故按最近一次
   *     位移算速度，抬手后以每帧 ×0.94 衰减，撞边界即停（不做回弹）。
   * 手势边界：只在真溢出时接管；横向分量大于纵向即放行（左右滑换月等框架手势不受影响）；
   * 越出 [0, max] 不硬拖（交还外层，避免与页面滚动互抢）；平移超 6px 后落点的 click
   * 在 capture 阶段一次性拦掉，免得拖完误开新建弹窗或误勾任务。
   */
  _mtEnableMobilePan(el) {
    if (!("ontouchstart" in window) || !window.matchMedia) return;
    if (el._mtPan) return; // 幂等：DOM 随重绘重建，正常不会重复挂，防万一
    // 1.7.11：挂载处不再判 480px。监听只在渲染时挂一次，而手机横竖屏旋转、分栏拖拽
    // 都会跨 480px 边界（全仓没有 onResize，跨过去不会有第二次挂载机会）：宽→窄时
    // .day-tasks 的 overflow:hidden 已生效、原生滚动条被结构消除，却没有平移监听，
    // 被裁任务彻底不可达；窄→宽时旧监听又与原生内滚互抢。改为常驻挂载，
    // 媒体条件挪进 touchstart 逐次判定，来回穿越都正确。
    const m = { sy: 0, sx: 0, top0: 0, max: 0, want: 0, armed: false, panning: false };
    let raf = null;
    let momentum = null;
    let expireTimer = null;
    let lastY = 0;
    let lastT = 0;
    let v = 0; // px/ms，正=手指上滑（内容往下滚）
    const hint = () => {
      // 渐隐提示的两个类都挂在滚动容器自身（.day-tasks）上，见 styles.css 手机块
      el.classList.toggle("mt-pan-scrolled", el.scrollTop > 0);
    };
    const stopAll = () => {
      if (raf != null) { window.cancelAnimationFrame(raf); raf = null; }
      if (momentum != null) { window.cancelAnimationFrame(momentum); momentum = null; }
      if (expireTimer != null) { window.clearTimeout(expireTimer); expireTimer = null; }
      m.armed = false;
      m.panning = false;
    };
    const commit = () => {
      // 落账已排队但未写出的位移。旧实现在 touchend 里直接撤掉 rAF，末段位移被丢弃，
      // 抬手瞬间内容回跳约一帧
      if (raf != null) { window.cancelAnimationFrame(raf); raf = null; }
      if (!m.armed) return;
      const target = Math.max(0, Math.min(m.max, m.want));
      if (el.scrollTop !== target) el.scrollTop = target;
      hint();
    };
    el.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) { stopAll(); return; } // 第二指落下：整段作废，不留半截状态
      if (!window.matchMedia("(max-width: 480px)").matches) return; // 宽屏交还给原生内滚
      stopAll();
      // 惯性/合帧句柄是闭包私有的：在 A 格甩出惯性后立刻按 B 格，只停得下 B 的，
      // A 会在用户看不见的地方继续滑。用视图上的「当前平移者」互相顶掉。
      if (this._mtPanStop && this._mtPanStop !== stopAll) this._mtPanStop();
      this._mtPanStop = stopAll;
      m.max = el.scrollHeight - el.clientHeight;
      if (m.max <= 1) return; // 本格无溢出：不接管，armed 保持 false（见 touchmove 守卫）
      const t = e.touches[0];
      m.armed = true;
      m.sy = t.clientY;
      m.sx = t.clientX;
      m.top0 = el.scrollTop;
      m.want = m.top0;
      v = 0;
      lastY = t.clientY;
      lastT = t.timeStamp || Date.now();
      el._mtPanMoved = false; // 起手先清：上一轮若没派发 click，别让它吞掉这一次正常点击
      hint();
    }, { passive: true });
    el.addEventListener("touchmove", (e) => {
      // 关键守卫：未接管的序列绝不 preventDefault。旧代码缺这一条，而 touchstart 的
      // 「无溢出早退」发生在 m.sy 赋值之前，于是 m.sy 还是初值 0，dy = 0 - clientY
      // ≈ -500 必然越过阈值 → 空格子也把容器滚动掐死（矮视口/大周视图下方内容不可达）
      if (!m.armed) return;
      const t = e.touches[0];
      const dy = m.sy - t.clientY;
      const dx = m.sx - t.clientX;
      if (!m.panning) {
        if (Math.abs(dy) < 4) return;
        if (Math.abs(dx) > Math.abs(dy)) { m.armed = false; return; } // 横向：本序列彻底交还
      }
      const nextWant = m.top0 + dy;
      if (nextWant < 0 || nextWant > m.max) {
        if (m.panning) {
          m.want = Math.max(0, Math.min(m.max, nextWant));
          commit();
        }
        stopAll();
        if (this._mtPanStop === stopAll) this._mtPanStop = null;
        return;
      }
      m.panning = true;
      const now = t.timeStamp || Date.now();
      const dt = now - lastT;
      if (dt > 0) v = (lastY - t.clientY) / dt;
      lastY = t.clientY;
      lastT = now;
      m.want = nextWant;
      if (Math.abs(dy) > 6) el._mtPanMoved = true; // 交给 capture click 监听判定误触
      if (raf == null) raf = window.requestAnimationFrame(commit); // 合帧写入：一帧最多一次
      e.preventDefault(); // 必须在同步路径：事件到 rAF 回调时已不可取消
    }, { passive: false });
    const end = () => {
      if (!m.armed) return;
      commit();
      if (m.panning && Math.abs(v) > 0.05) {
        let prev = Date.now();
        const step = () => {
          const now = Date.now();
          const dt = Math.min(48, now - prev) || 16; // 后台回来会有大间隔，夹住免得瞬移
          prev = now;
          v *= Math.pow(0.94, dt / 16); // 每帧衰减 6%
          const next = el.scrollTop + v * dt;
          if (next <= 0 || next >= m.max || Math.abs(v) < 0.02) {
            el.scrollTop = Math.max(0, Math.min(m.max, next));
            hint();
            momentum = null;
            return; // 撞边界即停，不做回弹
          }
          el.scrollTop = next;
          hint();
          momentum = window.requestAnimationFrame(step);
        };
        momentum = window.requestAnimationFrame(step);
      }
      m.panning = false;
      m.armed = false;
      if (this._mtPanStop === stopAll) this._mtPanStop = null;
      // click 在 touchend 之后派发。这台老 WebView 上该间隔可以超过 100ms（长按后抬手、
      // 双击缩放判定窗口），旧值 100ms 会先过期、导致滑完格子仍误开新建弹窗；放宽到
      // 300ms，并在下一次起手/停止时清掉，不留悬空定时器
      if (el._mtPanMoved) {
        if (expireTimer != null) window.clearTimeout(expireTimer);
        expireTimer = window.setTimeout(() => { el._mtPanMoved = false; expireTimer = null; }, 300);
      }
    };
    el.addEventListener("touchend", end, { passive: true });
    el.addEventListener("touchcancel", end, { passive: true });
    el.addEventListener("click", (e) => {
      if (!el._mtPanMoved) return;
      el._mtPanMoved = false;
      e.stopPropagation();
      e.preventDefault();
    }, true);
  }
  /**
   * 渲染后延迟复量（2026-10-10，v1.7.9；v1.7.9i 起「复裁」变「复量」）：这台老
   * WebView 上 ResizeObserver 的信号靠不住，故每次网格重绘后在下一帧、再下一帧与约
   * 1.2 秒后各量一次，让渐隐提示与「+N」跟着最终布局走（截断已取消，复量不再改显示）。
   * 观察器保留，继续负责旋转/分栏等活跃 resize；本方法专收「渲染瞬间度量过早」。
   */
  _mtScheduleRetrim() {
    try {
      if (this.viewClosed) return;
      if (this._mtRetrimRaf != null) window.cancelAnimationFrame(this._mtRetrimRaf);
      if (this._mtRetrimTimer != null) window.clearTimeout(this._mtRetrimTimer);
      this._mtRetrimRaf = null;
      this._mtRetrimTimer = null;
      const tick = (p) => {
        this._mtRetrimRaf = null;
        this._mtRetrimTimer = null;
        if (!this.viewClosed) this._mtMeasureMobileCells(p);
      };
      if (typeof requestAnimationFrame === "function") {
        this._mtRetrimRaf = window.requestAnimationFrame(() => {
          this._mtRetrimRaf = window.requestAnimationFrame(() => tick("raf"));
        });
      }
      this._mtRetrimTimer = window.setTimeout(() => tick("timer"), 1200);
    } catch (err) {
      console.error("[monthly-tasks] retrim schedule failed:", err);
    }
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
    // 审计 L3：关掉「显示已完成任务」时，格子里看不到那 m 条，汇总却仍按全周统计
    // （口径与理由见 _renderCalendarGridCore 里 weekTaskSet 那段注释）。这里补一句
    // title 把差值解释清楚——不占布局、不长这一格的高度（大周格子的高度是要省着用的），
    // 且只在「确实藏了东西」（done > 0）时才挂，避免无谓的悬停文本。
    if (!this.plugin.settings.showCompletedTasks && done > 0) {
      loadEl.setAttribute("title", tr("view.week.loadHiddenHint", { m: done }));
    }
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
   * @returns {Promise<boolean>} 是否成功。调用方（日程视图复选框、弹窗任务列表）
   * 拿这个值回滚勾选态；日历格子的点击链路忽略返回值，行为不变。
   * 返回 true 的三种情形都意味着「不需要调用方回滚」：
   *   ① 写入成功且已排延迟刷新；② 写入成功但视图已分离（跳过刷新，磁盘上是对的）；
   *   ③ 同一任务已有切换在途——那次刷新的结果才是真相，此时回滚只会闪一下。
   */
  async toggleTask(task) {
    // 并发防护：同一任务在切换过程中（读-改-写）再次点击会导致竞态，
    // 用文件路径+行号作为键，期间重复点击直接忽略。
    const taskKey = `${task.filePath}:${task.lineNumber}`;
    if (this.togglingTasks && this.togglingTasks.has(taskKey)) return true;
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
        if (!this.rootEl || !this.rootEl.isConnected) return true;
        // 跟踪定时器 ID 供 onClose 清理，避免视图关闭后仍向已分离 DOM 渲染
        if (!this.pendingTimers) this.pendingTimers = /* @__PURE__ */ new Set();
        const timerId = window.setTimeout(async () => {
          if (this.pendingTimers) this.pendingTimers.delete(timerId);
          // try/catch 防止 refresh 抛错变成未处理 Promise rejection 污染控制台
          try {
            await this.refresh();
          } catch (e) {
            console.error(tr("error.delayRefresh"), e);
          }
        }, 200);
        this.pendingTimers.add(timerId);
        return true;
      } else {
        new import_obsidian.Notice(tr("notice.opFail"));
        return false;
      }
    } finally {
      this.togglingTasks.delete(taskKey);
    }
  }
  /**
   * 打开创建任务弹窗
   */
  openCreateTaskModal(date, existingTasks = [], editTask = null, prefill = null) {
    const modal = new CreateTaskModal(this.app, date, async (content, isAllDay, time, priority, endDate, category, editOld, noteText) => {
      // 弹窗列表里的「勾选完成」是异步入队的，写完文件才回写 editOld.completed/rawLine。
      // 不等它落定就提交，会拿旧 completed 重建新行，把刚勾的完成盖回未完成（已复现）。
      // 等队列即可：勾选处理器注册在前，它的状态回写先于本次继续执行。
      // 上一轮异常已由原入口报告；不能让它卡住之后的每一次提交，本次操作仍按自身结果反馈。
      await this.taskParser.writeQueue.catch(() => {});
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
            new import_obsidian.Notice(tr("notice.createdRefreshFail"), 3e3);
          }
          return;
        }
      }
      const success = await this.taskParser.createTaskForDate(modal.date, content, isAllDay, time, priority, endDate, customFolderPath, category, editOld ? editOld.completed : void 0, noteText || void 0, editOld ? editOld.rawLine : void 0);
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
          if (!removed) new import_obsidian.Notice(tr("notice.editSavedBut"), 5e3);
        }
        // 任务出现在日历中即反馈，不再弹成功提示；refresh 失败仍有单独提示
        // refresh 失败不应让用户误以为任务创建失败（任务已写入文件），
        // 单独捕获并提示，避免抛错进入 .catch 导致用户重试产生重复任务
        try {
          await this.refresh(true);
        } catch (refreshErr) {
          console.error(tr("error.postCreateRefresh"), refreshErr);
          new import_obsidian.Notice(tr("notice.createdRefreshFail"), 3e3);
        }
      } else {
        // 抛错让 CreateTaskModal 的 .catch 分支接管：保留弹窗、回滚 submitted/disabled 状态，允许用户重试
        throw new Error("createTaskForDate returned false");
      }
    }, this.plugin, existingTasks, editTask, prefill);
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
    // 周/三天视图：月都换了，锚点没有留在旧周期里的道理（convergeSelectedDate 已把
    // 选中日拉进新月，这里据它重算锚点，标题与网格自然对齐）
    this.ensurePeriodAnchor();
    await this.renderCalendarGridSafe("navigateMonth"); // 1.7.11：兜底统一走 safe 包装
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
    // 三天视图：窗口起点=今天，今天永远在第一列
    else if (this.isTimeGrid()) this.threeDayStart = formatDate(new Date());
    await this.renderCalendarGridSafe("goToToday"); // 1.7.11：兜底统一走 safe 包装
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
   * 三天视图（v1.8.0）：三天 × 24 小时的网格，定时任务画成可拖动的块。
   * 故意沿用 timeGrid 这个模式键：改名会让老 data.json 里的 viewMode 失效。
   */
  isTimeGrid() {
    return this.plugin.settings.viewMode === "timeGrid";
  }
  /**
   * 「按周过」的判定：顶栏标题=周区间、箭头按周翻页、锚点维护、visibleDays
   * 只取 7 天——小周与大周这些行为完全一致，故共用一个谓词，避免每处写两遍。
   * 注意：格子里画不画圆点、要不要明细区是 isCompactCell() 的事，两者正交。
   * 三天视图不在此列：它按 3 天翻页、锚点起点就是选中日，与周起点无关。
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
    setSvgIcon(el, AGENDA_TOGGLE_ICONS[mode] || AGENDA_TOGGLE_ICONS.list);
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
    // 1.7.11：早退判据从「全局设置」改成「本视图已应用的模式」。分屏开两个月历时，
    // 设置页遍历 leaves 逐个调本方法：第一个 leaf 已把 settings.viewMode 写成目标值，
    // 第二个 leaf 一看「已经等于目标值」就直接返回，既不 rebuildHeader 也不重绘，
    // 那块面板永远停在旧视图——而这里的注释宣称它是视图模式的唯一写入口。
    if (this.appliedViewMode === mode && this.plugin.settings.viewMode === mode) return;
    this.plugin.settings.viewMode = mode;
    await this.plugin.saveSettings();
    // 进紧凑格子类视图时若从未选中过日子，先把选中日收敛到当前月内（否则明细区空白）
    if (this.isCompactCell() && !this.selectedDate) this.convergeSelectedDate();
    // 进周/三天视图：锚点若无或不属当前月，收到当前月（切出去不动锚点，回来还在原位）
    this.ensurePeriodAnchor();
    this.closeActivePopup();
    this.rebuildHeader();
    this.applyViewModeClass();
    this.applyViewToggleIcon();
    await this.renderCalendarGridSafe("setViewMode"); // 1.7.11：兜底统一走 safe 包装
  }
  /** root class 的唯一写入口：header 重建、语言切换重绘后都要靠它恢复视图形态 */
  applyViewModeClass() {
    if (!this.rootEl) return;
    // 1.7.11：顺手记下「本视图当前真正应用的模式」。本方法是 root class 的唯一写入口，
    // 所有路径（onOpen 重建、语言切换、setViewMode）都经过这里，故 setViewMode 的早退
    // 判据可以放心用它，不必担心与 DOM 实际状态脱节
    this.appliedViewMode = this.plugin.settings.viewMode;
    this.rootEl.toggleClass("view-agenda", this.isCompactCell());
    this.rootEl.toggleClass("view-week", this.isWeek());
    this.rootEl.toggleClass("view-bigweek", this.isBigWeek());
    this.rootEl.toggleClass("view-timegrid", this.isTimeGrid());
    if (this.gridEl) this.gridEl.toggleClass("time-grid", this.isTimeGrid());
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
  /** 三日锚点（YYYY-MM-DD，视图内存态）：窗口的第一天 */
  threeDayAnchor() {
    return this.threeDayStart || this.selectedDate || formatDate(new Date());
  }
  /**
   * 进三天视图：窗口从选中日开始。currentYear/Month 跟着窗口走——
   * 否则从 10 月切进来、窗口跨到 11 月时，日期选择器还停在 10 月。
   */
  ensureThreeDayAnchor() {
    if (!this.selectedDate) this.convergeSelectedDate();
    this.threeDayStart = this.selectedDate;
    const d = dateFromStr(this.threeDayStart);
    this.currentYear = d.getFullYear();
    this.currentMonth = d.getMonth();
  }
  /** 周期锚点的统一维护：周视图收周起点，三天视图收窗口起点，其余不碰 */
  ensurePeriodAnchor() {
    if (this.isWeekFamily()) this.ensureWeekAnchor();
    else if (this.isTimeGrid()) this.ensureThreeDayAnchor();
  }
  /**
   * 三日翻页：起点 ±3 天，currentYear/Month 跟到起点所在月。
   * 选中日同步到新起点：再切回小周/小月时，明细区落在眼前这一屏上。
   */
  async navigateThreeDay(direction) {
    const cur = dateFromStr(this.threeDayAnchor());
    let next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + direction * 3);
    const min = new Date(1900, 0, 1);
    const max = new Date(2100, 11, 31);
    if (next < min) next = min;
    else if (next > max) next = max;
    this.threeDayStart = formatDate(next);
    this.selectedDate = this.threeDayStart;
    this.currentYear = next.getFullYear();
    this.currentMonth = next.getMonth();
    await this.renderCalendarGridSafe("navigateThreeDay"); // 1.7.11：兜底统一走 safe 包装
  }
  /**
   * 按周导航：锚点 ±7 天，再把 currentYear/Month 跟到锚点所在月——
   * 否则跨月周（10/26–11/1）走下一周时网格列语义、日期选择器仍停在旧月。
   */
  async navigateWeek(direction) {
    const cur = dateFromStr(this.weekAnchor());
    let next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + direction * 7);
    const min = new Date(1900, 0, 1);
    const max = new Date(2100, 11, 31);
    if (next < min) next = min;
    else if (next > max) next = max;
    this.selectedDate = formatDate(next);
    this.weekStart = weekStartFrom(next, this.plugin.settings.firstDayOfWeek);
    this.currentYear = next.getFullYear();
    this.currentMonth = next.getMonth();
    await this.renderCalendarGridSafe("navigateWeek"); // 1.7.11：兜底统一走 safe 包装
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
      titleRow.createSpan({ text: ` · ${translateHolidayName(holidayInfo.name)}` });
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
          // 审计 L5：同步事件回调里裸调 async 重绘，抛错即成 unhandled rejection
          this.renderCalendarGridSafe("agenda-clear-filter");
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
    setSvgIcon(addBtn, hasTasks ? AGENDA_MANAGE_ICON : AGENDA_ADD_ICON);
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
      setSvgIcon(emptyAdd, AGENDA_ADD_ICON);
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
        // 兑现上一行注释承诺的「失败回滚」：toggleTask 现在把成败返回出来，失败时
        // 把勾选态退回 task.completed 这个真实值。此前只 await 不看结果，DOM 就停在
        // 用户点出来的那一侧，要等 200ms 后的 refresh 才纠正；refresh 抛错或视图已
        // 断开（_renderCalendarGridCore 里 await 之后的 isConnected 分支）时，
        // 勾选框会一直与文件相反（审计 M6）。
        // Notice 不在这里弹：toggleTask 的失败分支已经弹过 notice.opFail，再弹是双份。
        const ok = await this.toggleTask(task);
        if (!ok && checkEl.isConnected) checkEl.checked = task.completed;
      } finally {
        if (checkEl.isConnected) checkEl.disabled = false;
      }
    });
    // 点整行 = 直接编辑这一条（勾选圈只负责勾选，点它不触发整行动作）。
    // 真机反馈：点任务与点「管理」出来的是同一个新建态，想编辑还要再找铅笔——
    // "点击一步，却走了两步"。现在行点击带着 editTask 进面板，「管理」仍是新建态
    itemEl.addEventListener("click", (e) => {
      if (e.target === checkEl) return;
      // 基准日期一律用**任务锚点**（startDate||dueDate），不用被点的那一天。
      // 跨天任务被 groupTasksByDate 虚拟挂载到区间内每一天，用 dayDate 建弹窗会让
      // onOpen 全程锚在被点的那天：什么都不改直接保存 → rowSame 必然失败 →
      // 走 createTaskForDate(modal.date) 重建 → 🛫 被平移、createdAt 被替换；
      // 纯改备注也走同一条路径。跨度超过 MULTI_DAY_MOUNT_LIMIT 时点到期日那行
      // 还会得到 start==due，dateMarker 被丢、任务塌缩成单天（审计 H2）。
      // 与弹窗内铅笔按钮（switchToTask 一侧）同一口径；无锚点才退回 dayDate。
      const anchorStr = task.startDate || task.dueDate;
      this.openCreateTaskModal(anchorStr ? dateFromStr(String(anchorStr)) : dayDate, allTasks, task);
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
  /**
   * 明细区的失败态（审计 L4）：任务加载失败时，明细区不能继续列上一轮的旧任务，
   * 也不能退化成「这天没安排」（那是另一种谎报）。与网格共用 .error-hint 样式和
   * 同一句 view.cell.loadError 文案，两处口径一致。
   * rootEl / isConnected 双守卫：调用点在渲染失败分支里，此时视图可能已被分离。
   */
  renderAgendaError() {
    if (!this.detailEl || !this.detailEl.isConnected) {
      if (!this.rootEl || !this.rootEl.isConnected) return;
      this.detailEl = this.rootEl.createDiv("agenda-detail");
    }
    this.detailEl.empty();
    const errEl = this.detailEl.createDiv("error-hint");
    errEl.textContent = tr("view.cell.loadError");
  }
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
var DatePickerModal = class extends import_obsidian.Modal {
  constructor(app, currentYear, currentMonth, onSubmit) {
    super(app);
    this.year = currentYear;
    this.month = currentMonth;
    this.onSubmit = onSubmit;
    const now = new Date();
    this.currentYear = now.getFullYear();
    this.currentMonth = now.getMonth();
  }
  
  onOpen() {
    // 登记活动实例：onunload 时关闭仍打开的弹窗，避免卸载后残留可交互但已失联的 DOM
    if (!DatePickerModal.activeInstances) DatePickerModal.activeInstances = /* @__PURE__ */ new Set();
    DatePickerModal.activeInstances.add(this);
    const { contentEl, modalEl } = this;
    
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
    window.requestAnimationFrame(sweepChrome);
    window.setTimeout(sweepChrome, 100);
    // 弹窗自身外观（底色/内边距/圆角/宽度/阴影）全在 styles.css 的
    // .modal.date-picker-modal 里；原先按亮暗两套内联配色写在 JS 里，
    // 既过不了审核（禁静态行内样式），也跟主题色脱钩
    contentEl.empty();
    
    // 颜色不再在 JS 里按亮暗分支写死：styles.css 用 --dp-* 变量承接，
    // 暗色值在 .theme-dark .modal.date-picker-modal 里换一套

    // 标题
    const titleEl = contentEl.createDiv("modal-title");
    titleEl.textContent = tr("modal.date.title");
    
    // 年份区域
    const yearSection = contentEl.createDiv("picker-section");
    
    yearSection.createEl("div", { text: tr("modal.date.year"), cls: "dp-label" });
    
    const yearInputWrapper = yearSection.createDiv("year-input-wrapper");
    
    const yearDecBtn = yearInputWrapper.createEl("button", { text: "−", cls: "year-step-btn" });
    
    const yearInput = yearInputWrapper.createEl("input", {
      cls: "year-input",
      attr: {
        type: "number",
        value: String(this.year),
        min: "1900",
        max: "2100"
      }
    });
    
    const yearIncBtn = yearInputWrapper.createEl("button", { text: "+", cls: "year-step-btn" });
    
    yearSection.createEl("div", {
      text: tr("modal.date.currentYear", { year: this.currentYear }),
      cls: "dp-hint"
    });
    
    // 悬停效果改由 CSS 的 :hover 负责（见 .year-step-btn:hover），不再监听鼠标事件
    
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
      let val = parseInt(yearInput.value, 10);
      if (isNaN(val)) val = this.currentYear;
      val = Math.max(1900, Math.min(2100, val));
      this.year = val;
      yearInput.value = String(val);
      refreshMonthStyles();
    });
    
    // 月份区域
    const monthSection = contentEl.createDiv("picker-section");
    
    monthSection.createEl("div", { text: tr("modal.date.month"), cls: "dp-label" });
    
    const monthGrid = monthSection.createDiv("month-grid");
    
    const monthLabels = monthNames();
    
    // 月份按钮着色集中在这里：绿色=当前选中，蓝色=今天所在月（仅当年）。
    // 年份 +/- 、输入变化、点击选中后都调用它整体重绘，
    // 否则旧高亮会残留在已切换走的年份视图上。
    // 只切状态类，配色全在 styles.css（.month-btn.is-selected / .is-current）
    const refreshMonthStyles = () => {
      monthGrid.querySelectorAll("button").forEach((btn, idx) => {
        btn.toggleClass("is-current", this.year === this.currentYear && idx === this.currentMonth);
        btn.toggleClass("is-selected", idx === this.month);
      });
    };

    for (let m = 0; m < 12; m++) {
      const monthBtn = monthGrid.createEl("button", { text: monthLabels[m], cls: "month-btn" });
      monthBtn.addEventListener("click", () => {
        this.month = m;
        refreshMonthStyles();
      });
    }
    refreshMonthStyles();
    
    // 按钮组
    const btnGroup = contentEl.createDiv("modal-buttons");
    
    const cancelBtn = btnGroup.createEl("button", { text: tr("modal.create.cancel"), cls: "btn-cancel" });
    
    cancelBtn.addEventListener("click", () => this.close());
    
    const confirmBtn = btnGroup.createEl("button", { text: tr("modal.date.confirm"), cls: "btn-confirm" });
    
    confirmBtn.addEventListener("click", async () => {
      // 防止双击导致 onSubmit 触发两次（close 异步前仍可接收点击）
      if (confirmBtn.disabled) return;
      confirmBtn.disabled = true;
      // onSubmit（openDatePicker 传入的那个回调）是 async 的，内含
      // await renderCalendarGrid()。此前这里既不 await 也不 catch：任何 reject 都变成
      // 未处理的 Promise 拒绝，而 currentYear/currentMonth 已经被改掉、选择器已经被
      // 关掉 → 留下陈旧或半画的网格，用户零反馈（审计 M10）。改成与 CreateTaskModal
      // 提交路径同口径：先跑完回调再关弹窗；失败给 Notice 并恢复按钮可点，让用户能
      // 重试而不是对着坏网格干瞪眼。
      try {
        await this.onSubmit(this.year, this.month);
      } catch (e) {
        console.error("[monthly-tasks] DatePickerModal onSubmit failed", e);
        new import_obsidian.Notice(tr("notice.opFail"), 3e3);
        confirmBtn.disabled = false;
        return;
      }
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
  } catch {
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
    if (anim && anim.startTime === null) {
      // 时间线是按文档算的：动画元素在弹出窗口里时，得对它自己那个文档校时
      const target = anim.effect && anim.effect.target;
      const doc = (target && target.ownerDocument) || activeDocument;
      anim.startTime = doc.timeline.currentTime;
    }
  } catch { /* 旧 WebView 没有 Web Animations 时间线，跳过校正 */ }
  return anim;
}

function watchPopupPosition(owner, reposition) {
  unwatchPopupPosition(owner);
  owner._popupRepositionHandler = reposition;
  window.addEventListener("resize", reposition);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", reposition);
    window.visualViewport.addEventListener("scroll", reposition);
  }
}

function unwatchPopupPosition(owner) {
  const reposition = owner._popupRepositionHandler;
  if (!reposition) return;
  window.removeEventListener("resize", reposition);
  if (window.visualViewport) {
    window.visualViewport.removeEventListener("resize", reposition);
    window.visualViewport.removeEventListener("scroll", reposition);
  }
  owner._popupRepositionHandler = null;
}

function closeInlineDatePicker(owner) {
  unwatchPopupPosition(owner);
  // 浮层挂在弹窗所在文档的 body 上，摘监听/找浮层也必须回同一个文档：
  // 弹窗可能开着弹窗（Obsidian 的弹出窗口），此时 activeDocument 未必是它
  const doc = (owner.modalEl && owner.modalEl.ownerDocument) || activeDocument;
  if (owner.datePickerCloseHandler) {
    doc.removeEventListener("click", owner.datePickerCloseHandler);
    owner.datePickerCloseHandler = null;
  }
  const popup = doc.body.querySelector(":scope > .date-picker-popup");
  if (popup) popup.remove();
  // 恢复弹窗输入框的软键盘能力与聚焦高亮（浮层打开时禁用过）
  try {
    if (owner.modalEl) owner.modalEl.querySelectorAll('[inputmode="none"]').forEach((el) => {
      el.removeAttribute("inputmode");
      el.classList.remove("mt-no-focus-fx");
    });
  } catch { /* 弹窗已卸载，恢复软键盘能力无从谈起 */ }
}

var CategoryFilterModal = class extends import_obsidian.Modal {
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
    window.requestAnimationFrame(sweepChrome);
    window.setTimeout(sweepChrome, 100);
    // v1.5.3 流畅性：先量尺寸再定位。旧序是「定位→画行→rAF 再修正」，
    // 面板会先跳到一个偏小的位置再撑开，观感上是一次突兀的位移。
    // 现在按行数预估尺寸，同帧完成定位，行渲染不再改变盒尺寸位置。
    this.renderRows();
    this.positionAt(modalEl, true);
    watchPopupPosition(this, () => this.positionAt(modalEl));

    // v1.5.3：进/出场动画改用 Web Animations API（el.animate），而不是「加类 + CSS 过渡」。
    // 实测后者在本弹窗上不可靠：同一 JS 任务里改类再读计算样式，浏览器把两个状态
    // 当作首帧样式直接结算，过渡不触发（getAnimations() 为空、opacity 从 1 直接跳到 0）。
    // WAAPI 是显式时间线，动画一定跑，且能被 getAnimations() 验证，也便于减少动效时跳过。
    this._enterAnim = this.playEnter(modalEl);
    // 手机端：Obsidian 底部弹层的滑入动画可能是 CSS transition 也可能是 WAAPI，
    // styles.css 的 animation/transition 禁用管不到 WAAPI，这里再把 modal 与
    // 容器上非本人创建的动画全部 cancel（覆盖 CSS 动画/transition/WAAPI 三种来源）
    if (import_obsidian.Platform.isPhone) {
      const sweep = () => {
        try {
          [this.containerEl, modalEl].forEach((el) => {
            if (!el) return;
            el.getAnimations().forEach((a) => {
              if (a !== this._enterAnim) {
                try { a.cancel(); } catch { /* 动画已结束或已被取消，再 cancel 会抛 */ }
              }
            });
          });
        } catch { /* 容器已卸载，扫不到动画属正常路径 */ }
      };
      window.requestAnimationFrame(sweep);
      window.setTimeout(sweep, 80);
      window.setTimeout(sweep, 260);
    }
  }
  /** 锚定到漏斗按钮正下方；越界翻到上方 / 收进屏内 */
  positionAt(modalEl, prefill = false) {
    // 定位基线（position/top/left/width/min-width）在 styles.css 的
    // .modal.category-filter-modal 里；这里只补随锚点变化的动态值
    // 预估尺寸（首帧定位前）：宽度=内容 min-width 180 + 内边距，高度=标题+行高×行数
    if (prefill) {
      const rows = (this.view.scanCategories().length || 0) + 2;
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
      // 手机端 Obsidian 的底部弹层规则带 !important，内联 top/left 打不赢，
      // 位置经变量交给 styles.css 的 is-phone 覆盖规则
      modalEl.style.setProperty("--vm-left", `${left}px`);
      modalEl.style.setProperty("--vm-top", `${top}px`);

      modalEl.classList.toggle("cf-flip-up", flipped);
      // 定位完成后解除预估高度，避免面板比内容高一块
      modalEl.style.minHeight = "";
    };
    render();
    window.requestAnimationFrame(render);
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
        checkEl.textContent = "✓";
      row.addEventListener("click", (e) => {
        e.stopPropagation();
        onPick();
      });
    };
    mkRow(tr("modal.filter.all"), active.size === 0, null, () => {
      V.setCategoryFilter(/* @__PURE__ */ new Set());
      // 审计 L5：改走 Safe 版——弹窗行回调是同步的，且 this.close() 紧随其后，
      // 重绘的 reject 在这里没有任何接收者
      V.renderCalendarGridSafe("filter-modal-all");
      // 「全部」= 终结性重置，点完即关
      this.close();
    });
    if (hasUntagged) {
      mkRow(tr("modal.filter.untagged"), active.has(""), null, () => {
        const next = new Set(active);
        if (next.has("")) next.delete("");
        else next.add("");
        V.setCategoryFilter(next);
        V.renderCalendarGridSafe("filter-modal-untagged");
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
        V.renderCalendarGridSafe("filter-modal-category");
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
      return null;
    try {
      return CF_KICK(modalEl.animate([
        { opacity: 0, transform: "translateY(-6px) scale(0.96)" },
        { opacity: 1, transform: "none" },
      ], { duration: 160, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" }));
    } catch {
      return null;
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
    } catch { /* 出场动画不被支持时直接跳过，由定时器负责卸载 */ }
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
    // 一律走带 try/catch 的 CF_MOTION_OFF()（审计 M12）。此前这里是裸 matchMedia，
    // 而上面两行已经把自己从 activeInstances 摘掉、closing 置了 true：一旦它抛错，
    // super.close() 永不执行 → 每次重试都在 closing 上直接返回 → 四处清理又都看不见
    // 这个实例 → 遮罩永久卡死，除了重载插件无解。ViewMenuModal.close() 用的
    // 就是安全版助手，这个不一致本身就是破绽。外面再包一层 try/catch 兜住 playLeave
    // 等意外：动画怎么失败都不要紧，卸载必须发生。
    try {
      if (container && container.isConnected && !CF_MOTION_OFF()) {
        // 面板淡出微缩 + 遮罩淡出并行；两者都播完（或最迟 LEAVE_MS 超时兜底）才真正卸载
        this.playLeave(this.modalEl, container);
        window.setTimeout(() => {
          try { super.close(); } catch { /* 父类已自行清理过就跳过，不能让异常冒到定时器 */ }
        }, 160);
        return;
      }
    } catch (e) {
      console.error("[monthly-tasks] CategoryFilterModal.close leave animation failed", e);
    }
    super.close();
  }
  onClose() {
    unwatchPopupPosition(this);
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
var ViewMenuModal = class extends import_obsidian.Modal {
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
    window.requestAnimationFrame(sweepChrome);
    window.setTimeout(sweepChrome, 100);
    this.renderRows();
    this.positionAt(modalEl, true);
    watchPopupPosition(this, () => this.positionAt(modalEl));
    this._enterAnim = this.playEnter(modalEl);
    // 手机端：Obsidian 底部弹层的滑入动画可能是 CSS transition 也可能是 WAAPI，
    // styles.css 的 animation/transition 禁用管不到 WAAPI，这里再把 modal 与
    // 容器上非本人创建的动画全部 cancel（覆盖 CSS 动画/transition/WAAPI 三种来源）
    if (import_obsidian.Platform.isPhone) {
      const sweep = () => {
        try {
          [this.containerEl, modalEl].forEach((el) => {
            if (!el) return;
            el.getAnimations().forEach((a) => {
              if (a !== this._enterAnim) {
                try { a.cancel(); } catch { /* 动画已结束或已被取消，再 cancel 会抛 */ }
              }
            });
          });
        } catch { /* 容器已卸载，扫不到动画属正常路径 */ }
      };
      window.requestAnimationFrame(sweep);
      window.setTimeout(sweep, 80);
      window.setTimeout(sweep, 260);
    }
  }
  positionAt(modalEl, prefill = false) {
    // 定位基线在 styles.css 的 .modal.category-filter-modal 里（视图菜单沿用同一套外壳）
    if (prefill) {
      // 预估尺寸只为压掉首帧跳动：行数 = 视图数 + 标题
      const rows = VIEW_MODES.length + 1;
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
      // 手机端 Obsidian 的底部弹层规则带 !important，内联 top/left 打不赢，
      // 位置经变量交给 styles.css 的 is-phone 覆盖规则
      modalEl.style.setProperty("--vm-left", `${left}px`);
      modalEl.style.setProperty("--vm-top", `${top}px`);
      modalEl.classList.toggle("cf-flip-up", flipped);
      modalEl.style.minHeight = "";
    };
    render();
    window.requestAnimationFrame(render);
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
      setSvgIcon(iconEl, AGENDA_TOGGLE_ICONS[mode] || AGENDA_TOGGLE_ICONS.list);
      const textBox = row.createDiv("vm-text");
      textBox.createDiv("vm-name").textContent = viewModeLabel(mode);
      textBox.createDiv("vm-desc").textContent = tr("view.mode.desc." + mode);
      const checkEl = row.createDiv("category-check");
      if (on)
        checkEl.textContent = "✓";
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
      return null;
    try {
      return CF_KICK(modalEl.animate([
        { opacity: 0, transform: "translateY(-6px) scale(0.96)" },
        { opacity: 1, transform: "none" },
      ], { duration: 160, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" }));
    } catch {
      return null;
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
    } catch { /* 出场动画不被支持时直接跳过，由定时器负责卸载 */ }
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
      window.setTimeout(() => {
        try { super.close(); } catch { /* 父类已自行清理过就跳过，不能让异常冒到定时器 */ }
      }, 160);
    } else {
      super.close();
    }
  }
  onClose() {
    unwatchPopupPosition(this);
    this.contentEl.empty();
    if (ViewMenuModal.activeInstances && ViewMenuModal.activeInstances.has(this)) {
      ViewMenuModal.activeInstances.delete(this);
    }
  }
};

var CreateTaskModal = class extends import_obsidian.Modal {
  constructor(app, date, onSubmit, plugin, existingTasks = [], editTask = null, prefill = null) {
    super(app);
    this.app = app;
    this.date = date;
    // 日期选择器的全局 click 关闭处理器，需在 close() 中清理避免泄漏
    this.datePickerCloseHandler = null;
    this.onSubmit = onSubmit;
    this.plugin = plugin;
    this.existingTasks = existingTasks;
    // 三天视图草稿条带进来的预填时间（HH:MM~HH:MM）。
    // 只在创建态生效；编辑态一律以任务自身的时间为准
    this.prefillTime = prefill && typeof prefill.time === "string" ? prefill.time : "";
    // 批次三：编辑目标任务（null=创建态）。同弹窗类内分支，不新增第二个弹窗类；
    // 预填全部在 onOpen 构建期完成（打开方式=以任务锚点日期重建本弹窗）
    this.editingTask = editTask;
    // 删除操作串行化链：避免并发删除时基于旧行号操作导致删错行
    this.deleteChain = Promise.resolve();
  }
  onOpen() {
    // 登记到静态活动实例表——必须是 onOpen 的第一条语句（审计 M11）。
    // 本方法约 370 行，此前登记写在最后一句，而另外三个弹窗都在第一句登记。
    // 中间任何一处抛错（getHolidayInfo / setIcon / resolveCategoryColor）都会留下一个
    // 开着、可交互、但对全部四处清理（closeActivePopup、setViewMode、语言切换、onunload）
    // 都不可见的弹窗，除了重载插件无法关闭。switchToTask 会重跑 onOpen，activeInstances
    // 是 Set，重复 add 无副作用。
    if (!CreateTaskModal.activeInstances) CreateTaskModal.activeInstances = /* @__PURE__ */ new Set();
    CreateTaskModal.activeInstances.add(this);
    // 继承 Obsidian Modal：移动端系统返回键、ESC、点击遮罩关闭均由框架自动处理
    // 保存当前焦点元素，便于关闭后恢复焦点（无障碍/键盘导航）。
    // 只在拿到「真实触发元素」时登记（审计 L8）：switchToTask 先 modalEl.empty()
    // 移除当前聚焦的铅笔按钮、再重跑 onOpen，此刻 activeElement 已退回 document.body；
    // 若照旧无条件覆盖，onClose 就会把键盘用户丢回文档开头。已登记过则保持不变。
    if (!this.previouslyFocused) {
      const ae = activeDocument.activeElement;
      if (ae && ae !== activeDocument.body) this.previouslyFocused = ae;
    }
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
    window.requestAnimationFrame(killCloseBtns);
    window.setTimeout(killCloseBtns, 100);
    window.setTimeout(killCloseBtns, 500);
    // 框架在移动端会给 .modal 预留内边距，弹窗内容自带留白，归零以复用原设计的间距
    // （归零在 styles.css 的 .modal.create-task-modal 里，不再写内联样式）
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
      dateMainEl.createSpan({ text: ` · ${translateHolidayName(holidayInfo.name)}` });
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
      import_obsidian.setIcon(toggleEl, "chevron-down");
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
                new import_obsidian.Notice(tr("modal.create.toggleFail"));
                window.setTimeout(() => renderTasks(), 200);
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
          taskEl.createEl("span", { cls: "task-text", text: task.content });
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
          setSvgIcon(editBtn, ICON_EDIT);
          editBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const anchorStr = task.startDate || task.dueDate;
            if (!anchorStr) {
              new import_obsidian.Notice(tr("modal.create.noDateMark"), 3e3);
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
          setSvgIcon(gotoBtn, ICON_GOTO);
          gotoBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const file = this.app.vault.getAbstractFileByPath(task.filePath);
            if (file) {
              const leaf = this.app.workspace.getLeaf(false);
              await leaf.openFile(file);
              // openFile 返回时编辑器可能尚未就绪，短暂重试，避免静默跳过定位
              let tries = 10;
              const focusTimer = window.setInterval(() => {
                const view = leaf.view;
                // containerEl 不在文档里 = 这个 leaf 已被分离或切走，
                // 再 setCursor / scrollIntoView 操作的是废弃 view
                if (view && view.editor && view.containerEl?.isConnected) {
                  window.clearInterval(focusTimer);
                  view.editor.setCursor({ line: task.lineNumber, ch: 0 });
                  view.editor.scrollIntoView({ from: { line: task.lineNumber, ch: 0 }, to: { line: task.lineNumber, ch: 0 } }, true);
                } else if (--tries <= 0) {
                  window.clearInterval(focusTimer);
                }
              }, 100);
            }
            this.close();
          });
          // 删除按钮
          const deleteBtn = actionsEl.createEl("button", { cls: "task-action-btn task-delete-btn", attr: { title: tr("modal.create.delete") } });
          setSvgIcon(deleteBtn, ICON_DELETE);
          deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (deleteBtn.disabled) return;
            deleteBtn.disabled = true;
            // 串行化删除：确保前一次删除写入文件完成后再处理下一次，
            // 否则并发删除会基于旧文件内容/旧行号操作，可能删错行。
            this.deleteChain = this.deleteChain.then(async () => {
              const deletedLineNumber = task.lineNumber;
              const deletedFilePath = task.filePath;
              // 审计 M4：成功时是 { ok:true, delta }，失败仍是 false（`if` 真值语义不变）。
              // delta 是本次写入的真实净位移，不再由调用方猜 -1。
              const res = await this.plugin.taskParser.deleteTask(task);
              if (res) {
                taskEl.addClass("task-deleting");
                await new Promise((r) => window.setTimeout(r, 200));
                const idx = this.existingTasks.indexOf(task);
                if (idx > -1) this.existingTasks.splice(idx, 1);
                // 修复：删除后同文件中行号大于被删行的任务，行号按真实位移补偿，
                // 否则后续删除/跳转会按失效的 lineNumber 操作（跳转光标偏行、
                // 下一次删除过不了身份校验而静默失败）。
                // delta 取值：纯任务行 -1；带备注块（> 降级 + 补空行）净 0；孤儿空行自愈 -2。
                const delta = typeof res.delta === "number" ? res.delta : -1;
                if (delta !== 0) {
                  for (const t of this.existingTasks) {
                    if (t.filePath === deletedFilePath && t.lineNumber > deletedLineNumber) {
                      t.lineNumber += delta;
                    }
                  }
                }
                const titleEl2 = titleRow.querySelector(".existing-tasks-title");
                if (titleEl2) titleEl2.textContent = tr("modal.create.existingCount", { n: this.existingTasks.length });
                renderTasks();
                this.plugin.showDeleteUndo(task);
              } else {
                // 审计 M5：删除失败不能一声不响。旧实现只把按钮恢复可点，用户看到的
                // 就是「点了删除、什么都没发生、也没提示」。与勾选失败（toggleFail）
                // 同一套口径：提示 + 200ms 后重画列表——这条任务没被 splice 掉，重画即还原。
                // isConnected 守卫：弹窗可能已经关掉，别再往分离的 DOM 里画。
                new import_obsidian.Notice(tr("modal.create.deleteFail"), 3e3);
                deleteBtn.disabled = false;
                if (this.modalEl && this.modalEl.isConnected) {
                  window.setTimeout(() => {
                    if (this.modalEl && this.modalEl.isConnected) renderTasks();
                  }, 200);
                }
              }
            }).catch((err) => {
              console.error(tr("error.deleteFail"), err);
              // 审计 M5：抛错路径同样要给用户可见反馈（此前只 console.error）
              new import_obsidian.Notice(tr("modal.create.deleteFail"), 3e3);
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
      // 先清掉内联高度，让 styles.css 的 .note-textarea { height: auto } 生效，
      // 量到的 scrollHeight 才是真实内容高度；再写回像素值
      noteText.style.height = "";
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
    // 自绘时间值的刷新回调（手机端用；桌面端原生输入自己显示，回调只是空转）
    let syncStartTime = null;
    let syncEndTime = null;
    // 三天视图里拉草稿带进来的时间：此时用户选的是一个具体时段，不该再按
    // 「默认全天」把时间区收起来（否则点 09:00 得到一条全天任务）
    const prefillTime = !this.editingTask && /^\d{1,2}:\d{2}(?:~\d{1,2}:\d{2})?$/.test(this.prefillTime || "")
      ? this.prefillTime.split("~").map((s) => {
          const [h, m] = s.split(":");
          return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
        }).join("~")
      : "";
    const prefillParts = prefillTime ? prefillTime.split("~") : [];
    let isAllDay = this.editingTask ? !this.editingTask.time : (prefillTime ? false : this.plugin.settings.defaultAllDayTask);
    let allDayCheckbox = null;
    // setTimeOpen 定义在时间区渲染块内，但编辑态同步块也要调它——提到函数级声明
    let setTimeOpen = null;
    // 真机反馈修正：编辑全天任务不再弹出时间区（v1.5.0 的「编辑态恒渲染」过头了）。
    // v1.5.2 起全天态已经改为「折叠」——setTimeOpen() 把时间标签与两个 input 整组
    // display:none，屏幕上只剩一行「全天」勾选 ＋ 右侧「+ 设置时间」按钮，手机上不会
    // 再跳出置灰的时间选择器。
    //   审计 M7（v1.7.6）曾把本条件改成恒渲染 true，好让「+ 设置时间」按钮和全天
    //   开关在「默认全天」下也出现。2026-10-10 作者裁定回退：新建弹窗长度优先——
    //   默认全天时整段时间区（含那行折叠的勾选）就不该出现，弹窗太长占地方；编辑态
    //   只在任务本身带时间时渲染。想建/改定时任务，先到设置里关掉「默认全天」。
    //   M7 指出的入口缺失属作者认可的取舍，后续审计勿再把这里改成恒渲染。
    // v1.8.0 唯一例外：三天视图的草稿条已明确指定了时间（prefillTime），
    // 那就要把时间区摊开、按钮上显示这段时间。
    const renderTimeSection = !!prefillTime || !this.plugin.settings.defaultAllDayTask || this.editingTask && this.editingTask.time;
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
      // 手机端的时间框：原生 <input type=time> 的宽度和拾取器箭头位置由系统 WebView
      // 决定，插件只改外框宽度压不进去（真机实测箭头仍被顶到框的最右边）。所以值的
      // 文字和箭头改由插件画，原生输入透明地铺满整个框、只负责点开系统选择器；
      // 桌面端 .time-field 是 display:contents，原生输入与以前完全一样
      const fmtTimeValue = (v) => {
        if (!v) return "--:--";
        const [h, m] = String(v).split(":");
        const t = new Date();
        t.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
        return t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      };
      const makeTimeField = (wrapper, initial) => {
        const field = wrapper.createDiv("time-field");
        const input = field.createEl("input", { type: "time", cls: "time-native-input" });
        input.value = initial;
        const valueEl = field.createSpan({ cls: "time-field-value" });
        field.createSpan({ cls: "time-field-chevron" });
        const sync = () => {
          valueEl.textContent = fmtTimeValue(input.value);
        };
        sync();
        input.addEventListener("input", sync);
        input.addEventListener("change", sync);
        return { input, sync };
      };
      const startField = makeTimeField(timeWrapper, prefillParts[0] || `${defaultStartHourStr}:00`);
      startTimeEl = startField.input;
      syncStartTime = startField.sync;
      timeWrapper.createEl("span", { cls: "time-separator", text: tr("modal.create.to") });
      const endField = makeTimeField(timeWrapper, prefillParts[1] || `${defaultEndHourStr}:${defaultEndMinuteStr}`);
      endTimeEl = endField.input;
      syncEndTime = endField.sync;
      const allDayToggle = timeContainer.createDiv("all-day-toggle");
      allDayCheckbox = allDayToggle.createEl("input", { attr: { type: "checkbox", "aria-label": tr("modal.create.allDay") } });
      allDayToggle.createEl("span", { text: tr("modal.create.allDay") });
      // 整行就是开关：行做成了药丸按钮的样子，只有小方框可点会像坏了。
      // 点框本体交给浏览器切换（change 监听自会同步），点「+ 设置时间」不抢
      allDayToggle.addEventListener("click", (e) => {
        if (e.target === allDayCheckbox || allDayCheckbox.contains(e.target)) return;
        if (e.target.closest(".time-show-btn")) return;
        allDayCheckbox.checked = !allDayCheckbox.checked;
        allDayCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
      });
      // 「+ 设置时间」：全天态下唯一的加时间入口，坐在勾选行右侧；
      // 时间框组默认折叠（display:none = 不进布局，手机上不再"跳出时间选择器"）
      const showTimeBtn = allDayToggle.createEl("button", { cls: "time-show-btn", type: "button", text: tr("modal.create.setTime") });
      showTimeBtn.style.display = isAllDay ? "" : "none";
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
    // M9 用：每轮 onOpen 先清空，避免 switchToTask 复用实例时留着上一条任务的原值
    this.timePrefillLost = "";
    if (this.editingTask && startTimeEl && endTimeEl) {
      // 批次三：编辑态时间区整体同步——有时间按 ~ 拆回填（extractTime 已归一化
      // HH:MM）；无时间（isAllDay=true）也要把勾选/禁用对齐，否则「默认非全天」
      // 设置下编辑全天任务会出现复选框未勾但提交按全天的观感不一致
      const tp0 = this.editingTask.time ? String(this.editingTask.time).split("~") : [];
      startTimeEl.value = tp0[0] || startTimeEl.value;
      if (syncStartTime) syncStartTime();
      // 单时间点任务没有 tp0[1]：extractTime 接受裸 HH:MM，所以 task.time === "09:00"
      // 是文件里的合法形态。此前这里写 `|| endTimeEl.value`，于是结束框沿用「按当前
      // 时刻算出的 defaultStartHour+4」默认值（见上面 renderTimeSection 里算默认时间
      // 那几行），保存时凭空写出 ⏰ 09:00~13:00 这个用户从没选过的时间段；更糟的是
      // 在约 05:00 之前编辑时默认结束时间 ≤ 开始时间，提交侧的 e<=s 校验反过来
      // **拒绝保存**并报「结束时间早于开始时间」——哪怕用户只改了备注（审计 M1）。
      // 改成清空，让界面显示真实状态；提交侧对「原本就是单时间点」的任务放行只填
      // 开始时间，原样写回 ⏰ 09:00（见 submitTask 的 origSinglePoint 分支）。
      endTimeEl.value = tp0[1] || "";
      if (syncEndTime) syncEndTime();
      // 审计 M9：`<input type=time>` 会做值净化——赋 "25:99" 得到 ""（extractTime 归一化时
      // 只查数字形状、不查时钟范围，所以手改文件能造出这种值）。原任务带 ⏰ 而两个
      // 框都空 ⇒ 值被净化掉了，照旧提交会让 ⏰ 标记连同时间一起消失且无任何提示。
      // 记下原值，提交侧原样写回并弹 Notice（只改备注也不会再丢时间）。
      // 只有一侧被净化时不进这里：提交侧的半填校验会拦住，同样不是静默。
      if (this.editingTask.time && !startTimeEl.value && !endTimeEl.value) {
        this.timePrefillLost = String(this.editingTask.time);
      }
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
    // 同全天行：整行可点，框本体与行内日期触发器除外
    multiDayToggle.addEventListener("click", (e) => {
      if (e.target === multiDayCheckbox || multiDayCheckbox.contains(e.target)) return;
      if (e.target.closest(".end-date-trigger")) return;
      multiDayCheckbox.checked = !multiDayCheckbox.checked;
      multiDayCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
    });
    // 自定义日期选择器触发按钮
    // v1.6.2 真机反馈：结束日期原先勾上「跨天任务」才长出来，第一眼像"没居中"、
    // 甚至以为没有这个控件。改成常驻——未勾选时置灰不可点，勾上即点亮，
    // 位置从头到尾不动（占位文案也换成提示该先做什么）
    const endDateTrigger = endDateWrapper.createEl("div", {
      cls: "end-date-trigger is-disabled",
      text: tr("modal.create.endNeedToggle"),
      // 审计 L7：原先只有 tabindex/aria-disabled，没有 role——读屏软件报「通用 div」，
      // 而勾上跨天后 tabindex 又变成 0 进了 Tab 序，Enter/Space 按下却毫无反应。
      // 补 role=button，并在下面配一个 keydown 让它真的能被键盘激活。
      attr: { role: "button", "aria-disabled": "true", tabindex: "-1" }
    });
    let pickerYear = this.date.getFullYear();
    let pickerMonth = this.date.getMonth();
    // 审计 L10：内联结束日期选择器的年份上下界。原来 ◀▶ 翻月没有任何钳制，
    // 连点约 175 次就能翻到 2200 年并写出 `📅 2200-03-05`；而主日历的
    // navigateMonth 把可翻范围钳在 1900-2100，于是这条任务在界面上
    // 再也点不到，成了只有手改文件才能删的幽灵。农历数据本身也只覆盖 1900-2100
    // （solarToLunar 越界直接抛错），越界还会连带农历列空白。口径与 DatePickerModal
    // 的年份钳制一致。
    const PICKER_MIN_YEAR = 1900;
    const PICKER_MAX_YEAR = 2100;
    /** 把 pickerYear/pickerMonth 整体钳回合法区间：只钳年份会把月份留在越界侧 */
    const clampPicker = () => {
      if (pickerYear < PICKER_MIN_YEAR) { pickerYear = PICKER_MIN_YEAR; pickerMonth = 0; }
      else if (pickerYear > PICKER_MAX_YEAR) { pickerYear = PICKER_MAX_YEAR; pickerMonth = 11; }
    };
    // 初值也过一道：this.date 正常来自日历格子（本就在界内），但编辑一条**此前**
    // 越界写入的任务时锚点可能带进来，先收敛掉比事后在网格里画出空月份稳妥。
    clampPicker();
    const formatDisplayDate = (y, m, d) => {
      return tr("modal.create.displayDate", { y: y, m: m + 1, d: d });
    };
    // 批次三：编辑跨天任务 → 勾上跨天、展开触发器、预填结束日期。
    // 开始日期不单独进表单（本期只做结束日期一侧，3.3⑥）：this.date 已是
    // 打开弹窗时传入的任务锚点，结束日期校验基准 this.date 天然正确
    //
    // 审计 L11：手改文件能造出 📅 早于 🛫 的任务。选择器一侧（updateGrid 里 cell
    // 点击的 endBeforeStart 校验）拒绝挑这种日期，预填这一侧原来却照单全收，于是
    // 「打开→只改个备注→保存」会把这个非法区间原样写回去，永远修不掉；而非法区间
    // 在库里是有实害的：跨天展开得到 0 天，任务只在开始日出现一次，界面上看不出
    // 还挂着个结束日。
    // 处理成「不按跨天加载」＋一条 Notice 明确告知，不静默丢——用户重新勾上跨天、
    // 用选择器挑一个不早于开始日的日期即可恢复。dateFromStr 对畸形串会给 Invalid
    // Date，比较恒为 false，所以这里额外用 isNaN 显式判过再下结论。
    let editRangeInverted = false;
    if (this.editingTask && this.editingTask.startDate && this.editingTask.dueDate) {
      const sDate = dateFromStr(String(this.editingTask.startDate));
      const dDate = dateFromStr(String(this.editingTask.dueDate));
      editRangeInverted = !isNaN(sDate.getTime()) && !isNaN(dDate.getTime()) && dDate < sDate;
    }
    if (editRangeInverted) {
      new import_obsidian.Notice(tr("modal.create.endBeforeStart"), 4e3);
    }
    if (!editRangeInverted && this.editingTask && this.editingTask.startDate && this.editingTask.dueDate && this.editingTask.startDate !== this.editingTask.dueDate) {
      isMultiDay = true;
      endDate = dateFromStr(this.editingTask.dueDate);
      multiDayCheckbox.checked = true;
      endDateTrigger.removeClass("is-disabled");
      endDateTrigger.removeAttribute("aria-disabled");
      endDateTrigger.setAttribute("tabindex", "0");
      const eArr = this.editingTask.dueDate.split("-").map(Number);
      endDateTrigger.textContent = formatDisplayDate(eArr[0], eArr[1] - 1, eArr[2]);
      // 审计 L16：原先这里还写了一个 data-value=YYYY-MM-DD，但全文（含 styles.css）
      // 没有任何地方读它——提交侧走的是闭包变量 endDate，样式侧也没有 [data-value]
      // 选择器。属被砍掉的功能残留，删掉以免后来者以为它是权威值源而去读它。
    }
    // 更新日期网格（年月切换时调用，不重建弹出层）
    const updateGrid = (popup) => {
      const existingGrid = popup.querySelector(".date-picker-grid");
      if (existingGrid) existingGrid.remove();
      const grid = popup.createDiv("date-picker-grid");
      // 起始空格按设置「每周第一天」偏移，与主月历及上方星期标题保持一致
      const fdow = this.plugin.settings.firstDayOfWeek || 0;
      const firstDay = (new Date(pickerYear, pickerMonth, 1).getDay() - fdow + 7) % 7;
      const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
      for (let i = 0; i < firstDay; i++) grid.createDiv("picker-cell picker-empty");
      for (let d = 1; d <= daysInMonth; d++) {
        const cell = grid.createDiv("picker-cell");
        cell.textContent = String(d);
        const cellKey = `${pickerYear}-${pickerMonth}-${d}`;
        if (cellKey === todayStr) cell.addClass("picker-cell-today");
        // 允许选择任意日期（包括过去的日期）
        cell.addEventListener("click", () => {
          const newEndDate = new Date(pickerYear, pickerMonth, d);
          // 校验结束日期不早于开始日期（this.date 为开始日期；onOpen 里的 this 就是本弹窗）
          if (newEndDate < new Date(this.date.getFullYear(), this.date.getMonth(), this.date.getDate())) {
            new import_obsidian.Notice(tr("modal.create.endBeforeStart"), 3e3);
            return;
          }
          endDate = newEndDate;
          endDateTrigger.textContent = formatDisplayDate(pickerYear, pickerMonth, d);
          // 审计 L16：这里原先还会 setAttribute("data-value", `${pickerYear}-${m}-${dd}`)
          // （连带两个只为它存在的 m/dd 局部变量），全文无人读取，一并删掉。
          closeInlineDatePicker(this);
        });
      }
    };
    const syncSelects = (popup) => {
      const yearSelect = popup.querySelector(".picker-select-year");
      const monthSelect = popup.querySelector(".picker-select-month");
      if (yearSelect) {
        // ◀▶ 翻月跨年后，年份选项（仅在弹层构建时生成 pickerYear±1）不含新年份，
        // 需重建选项，否则下拉停留在旧年份、与网格显示不一致
        const years = Array.from(yearSelect.options).map((o) => parseInt(o.value, 10));
        if (!years.includes(pickerYear)) {
          yearSelect.replaceChildren();
          // 审计 L10：选项也按 1900-2100 截断，免得下拉里出现 1899/2101 这类
          // 选上去立刻被钳回、看着像"选了没反应"的年份
          for (let y = Math.max(PICKER_MIN_YEAR, pickerYear - 1); y <= Math.min(PICKER_MAX_YEAR, pickerYear + 1); y++) {
            const opt = endDateTrigger.ownerDocument.createElement("option");
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
    };
    const buildPopup = () => {
      // 挂到 document.body：modal 带 transform 会成为 fixed 后代的包含块，
      // 挂在 modal 内时「居中」相对 modal 而非视口，且会被 modal 的 overflow:hidden 裁掉。
      // 必须用弹窗自己所在的文档（弹出窗口场景下 activeDocument 可能是主窗口）
      const doc = endDateTrigger.ownerDocument;
      const popup = doc.body.createDiv("date-picker-popup");
      // 显示由 styles.css 的 .date-picker-popup { display: block } 负责
      // 手机端：浮层存续期间禁止弹窗输入框唤起软键盘（inputmode=none 保留焦点
      // 能力但不弹键盘），并加 mt-no-focus-fx 摘掉聚焦高亮（焦点被系统焦点管理
      // 拉回时不再亮框）；关闭浮层时统一恢复
      [inputEl, noteText].forEach((el) => { if (el) { el.setAttribute("inputmode", "none"); el.addClass("mt-no-focus-fx"); } });
      const reposition = () => {
        if (!popup.isConnected) return;
        const rect = endDateTrigger.getBoundingClientRect();
        const w = popup.offsetWidth || 320;
        const h = popup.offsetHeight || 340;
        // 手机端屏幕窄：触发器（结束日期按钮）本身偏右，锚它左缘会把整个浮层
        // 顶到右半边；改为相对屏幕水平居中。桌面端保持锚定触发器，不换上下文。
        let left = import_obsidian.Platform.isPhone
          ? Math.max(8, (window.innerWidth - w) / 2)
          : Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - w - 8));
        let top = rect.bottom + 6;
        if (top + h > window.innerHeight - 8) {
          top = Math.max(8, rect.top - h - 6);
        }
        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
      };
      reposition();
      watchPopupPosition(this, reposition);
      // 手机端：翻月/改年月的原生 select 系统选择器关闭后，焦点会被 Obsidian
      // 焦点管理拉回弹窗的任务输入框，软键盘跟着弹出；交互后主动摘掉输入焦点
      const killSoftKb = () => {
        try {
          const ae = activeDocument.activeElement;
          if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) ae.blur();
        } catch { /* 原焦点元素可能已随弹窗卸载，聚焦恢复失败可忽略 */ }
      };
      // 年月导航
      const navRow = popup.createDiv("date-picker-nav");
      const prevBtn = navRow.createEl("button", { cls: "picker-nav-btn", text: "◀" });
      const yearSelect = navRow.createEl("select", { cls: "picker-select picker-select-year" });
      const monthSelect = navRow.createEl("select", { cls: "picker-select picker-select-month" });
      const nextBtn = navRow.createEl("button", { cls: "picker-nav-btn", text: "▶" });
      for (let y = Math.max(PICKER_MIN_YEAR, pickerYear - 1); y <= Math.min(PICKER_MAX_YEAR, pickerYear + 1); y++) {
        const opt = yearSelect.createEl("option", { value: String(y), text: tr("modal.date.yearSuffix", { y: y }) });
        if (y === pickerYear) opt.selected = true;
      }
      for (let m = 0; m < 12; m++) {
        const opt = monthSelect.createEl("option", { value: String(m), text: tr("modal.date.monthSuffix", { m: m + 1 }) });
        if (m === pickerMonth) opt.selected = true;
      }
      // 审计 L10：三个入口统一在改完 pickerYear/pickerMonth 之后过一道 clampPicker()。
      // 年份下拉本来只会给出 pickerYear±1，钳制加在选项生成处就够；◀▶ 才是能一路
      // 翻出界的那个（每次翻月都重建 ±1 选项，等于没有边界）。
      prevBtn.addEventListener("click", () => {
        pickerMonth--;
        if (pickerMonth < 0) { pickerMonth = 11; pickerYear--; }
        clampPicker();
        syncSelects(popup);
        updateGrid(popup);
        killSoftKb(); window.setTimeout(killSoftKb, 80);
      });
      nextBtn.addEventListener("click", () => {
        pickerMonth++;
        if (pickerMonth > 11) { pickerMonth = 0; pickerYear++; }
        clampPicker();
        syncSelects(popup);
        updateGrid(popup);
        killSoftKb(); window.setTimeout(killSoftKb, 80);
      });
      yearSelect.addEventListener("change", () => {
        pickerYear = parseInt(yearSelect.value, 10);
        clampPicker();
        // 钳制若真发生了，下拉框显示的还是刚选的越界年份，必须回写一次才与网格一致
        syncSelects(popup);
        updateGrid(popup);
        killSoftKb(); window.setTimeout(killSoftKb, 80);
      });
      monthSelect.addEventListener("change", () => { pickerMonth = parseInt(monthSelect.value, 10); updateGrid(popup); killSoftKb(); window.setTimeout(killSoftKb, 80); });
      // 星期标题（跟随设置「每周第一天」轮转，与主月历一致）
      const weekRow = popup.createDiv("date-picker-week");
      const fdowHeader = this.plugin.settings.firstDayOfWeek || 0;
      const weekLabels = weekdayNames();
      weekLabels.slice(fdowHeader).concat(weekLabels.slice(0, fdowHeader)).forEach(d => {
        weekRow.createDiv("picker-week-day").textContent = d;
      });
      // 日期网格（首次渲染）
      updateGrid(popup);
      // 内容构建完毕后宽度才稳定，重算一次定位（手机端居中依赖准确宽度）
      reposition();
      // 点击外部关闭（popup 已挂 document.body，需显式排除 popup 与触发按钮自身）
      // 审计 L13：原来是 `this.datePickerCloseHandler = (e) => {...}` 再
      // `setTimeout(() => document.addEventListener("click", this.datePickerCloseHandler), 0)`。
      // 若弹层在这同一个 tick 内被关掉（onClose 会摘监听并把该字段置 null），定时器
      // 摘掉的是一个从未装上的监听，随后 addEventListener("click", null) 按规范是
      // 空操作——不泄漏，但纯粹是靠那次 null 读取侥幸活下来的。改成闭包持有
      // closeHandler，并在真正装上之前复检两件事：① 它仍是当前生效的那个 handler
      // （没有被新弹层取代），② 弹层还在文档里。任一不成立就不装。
      const closeHandler = (e) => {
        if (!popup.contains(e.target) && !endDateTrigger.contains(e.target)) {
          closeInlineDatePicker(this);
        }
      };
      this.datePickerCloseHandler = closeHandler;
      window.setTimeout(() => {
        if (this.datePickerCloseHandler !== closeHandler) return;
        if (!popup.isConnected) return;
        popup.ownerDocument.addEventListener("click", closeHandler);
      }, 0);
      return popup;
    };
    const renderDatePicker = () => {
      const existing = endDateTrigger.ownerDocument.body.querySelector(":scope > .date-picker-popup");
      if (existing) {
        closeInlineDatePicker(this);
        return;
      }
      buildPopup();
    };
    endDateTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      // 置灰态被点到：抖一下勾选框，别让人以为按钮坏了
      if (!isMultiDay) {
        multiDayToggle.addClass("hint-shake");
        window.setTimeout(() => multiDayToggle.removeClass("hint-shake"), 450);
        return;
      }
      renderDatePicker();
    });
    // 审计 L7：role=button 就得能被键盘激活。Enter/Space 直接转成一次 .click()，
    // 与鼠标走**同一条**逻辑（含置灰态抖勾选框的反馈），避免两处行为漂移。
    // preventDefault 是必需的：空格默认会滚动弹层，Enter 在某些容器里会触发提交。
    // 老式 IE/Edge 把空格报成 "Spacebar"，一并收下。
    endDateTrigger.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
      e.preventDefault();
      e.stopPropagation();
      endDateTrigger.click();
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
        closeInlineDatePicker(this);
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
          w.removeClass("selected");
          w.querySelector(".priority-btn")?.removeClass("selected");
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
        toggle.textContent = open ? tr("modal.create.collapse") + " ⌃" : tr("modal.create.catMore") + " " + hidden.length + " ⌄";
        toggle.toggleClass("is-open", open);
      };
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        open = !open;
        apply();
      });
      apply();
    };
    window.requestAnimationFrame(foldCategoryGroup);
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
      // 同时剥离用户输入中的任务元数据 emoji 标记（📅🛫⏰⏳🔴🟡🟢✅➕ 及紧随的日期/时间），
      // 避免与插件自动拼接的元数据冲突，导致解析时拿到用户输入的错误日期/优先级。
      // 字符集必须与解析侧 cleanTaskContent 逐字对齐（审计 H3）：解析侧还剥
      // ✅ 完成日期 / ➕ 创建日期（Tasks 插件格式），提交侧此前漏了这两个。后果最重的
      // 形态是标题只输入「✅ 2026-01-01」——下面 modal.create.empty 那道校验看的是剥离后的 content，
      // 而 ✅ 不在剥离集里，content 非空 → 校验放行 → 写成
      // `- [ ] ✅ 2026-01-01 📅 2026-04-21` → 再解析时 ✅ 与 📅 一起被剥光，
      // parseTaskLine 因 content 为空返回 null：这一行永久留在库里，却不出现在
      // 任何格子/列表/筛选中，也无法从界面编辑或删除（孤儿行）。较轻的形态是
      // 「开会 ✅ 2026-01-01」显示成「开会」，下次编辑预填「开会」，一保存就把完成日期销毁。
      // 补齐后 content 变空 → 那道校验正常弹「内容不能为空」，用户当场看到反馈。
      const rawContent = inputEl.value.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ");
      const content = rawContent
        // 剥离"emoji + 日期/时间"组合（含范围），字符类含优先级 emoji 以覆盖"🔴 2026-04-21"场景
        // 添加 /u 标志：emoji 为代理对字符，不加 /u 会被当作两个独立的代理项，可能误匹配其他字符
        .replace(/[📅🛫⏰⏳🔴🟡🟢✅➕]\s*\d{4}-\d{1,2}-\d{1,2}(?:\s*~\s*\d{4}-\d{1,2}-\d{1,2})?/gu, "")
        .replace(/[📅🛫⏰⏳🔴🟡🟢✅➕]\s*\d{1,2}:\d{1,2}(?:\s*[~～]\s*\d{1,2}:\d{1,2})?/gu, "")
        // 兜底剥离孤立的元数据 emoji（无后续日期/时间的"📅 复盘"），避免与插件自动拼接的元数据冲突
        .replace(/[📅🛫⏰⏳🔴🟡🟢✅➕]/gu, "")
        .replace(/\s+/g, " ")
        .trim();
      // v1.6.0 手机端反馈版：备注区就在标题下方，编辑态清空标题、只动备注是
      // 合法意图（边改标题边补两句备注）。识别出来沿用原标题提交；其余空内容照旧提示
      const noteOnly = !!this.editingTask && !content && noteText != null && noteText.value !== (this.editingTask.note || "");
      if (!content && !noteOnly) {
        new import_obsidian.Notice(tr("modal.create.empty"), 3e3);
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
            new import_obsidian.Notice(tr("modal.create.endBeforeStartTime"), 3e3);
            return;
          }
          // 校验只填了开始或结束时间（半填），避免写入 "⏰ ~12:00" / "⏰ 09:00~" 破坏解析与排序。
          // 例外（审计 M1）：原任务的时间本就是「单时间点」（⏰ 09:00，extractTime 允许
          // 裸 HH:MM）——预填时结束框被我们主动清空，此时的 s-only 是原样状态而非半填，
          // 必须放行并写回裸 HH:MM，否则用户只想改条备注也会被这条校验拦下。
          const origTimeStr = this.editingTask && this.editingTask.time ? String(this.editingTask.time) : "";
          const origSinglePoint = /^\d{1,2}:\d{1,2}$/.test(origTimeStr);
          if ((s && !e) || (!s && e)) {
            if (s && !e && origSinglePoint) {
              time = s;
            } else {
              new import_obsidian.Notice(tr("modal.create.fillBoth"), 3e3);
              return;
            }
          } else if (s && e) {
            // 两者都填 → 时间段。都为空视为不填时间，避免写入 "⏰ ~" 脏数据
            time = `${s}~${e}`;
          } else if (this.timePrefillLost) {
            // 审计 M9：两框皆空但原任务带 ⏰，说明值被 <input type=time> 净化掉了
            // （extractTime 只查数字形状、不查时钟范围，手改文件能造出 ⏰ 25:99）。
            // 原样写回并提示，而不是静默把时间标记一起删掉。
            time = this.timePrefillLost;
            new import_obsidian.Notice(tr("modal.create.timeInvalidKept", { time: this.timePrefillLost }), 6e3);
          }
        }
        submitTask.submitted = true;
        confirmBtn.disabled = true;
        // await onSubmit：确保 createTaskForDate 完成后再关闭弹窗，失败时回滚状态允许重试
        // 记住本次类别（内存态，下次打开弹窗预选）；提交链路把 category 交给视图回调
        this.plugin.lastCategory = selectedCategory;
        // 审计 L15：onSubmit 的**同步**抛错此前会绕过下面的 .catch（.catch 只接得住
        // Promise 链上的拒绝），而 submitted/disabled 已经置上了 → 确认按钮永久死掉、
        // 只能重开弹窗。标志仍放在调用之前（这样同步重入也会被 submitted 挡住），
        // 但用 try/catch 兜住同步异常并就地回滚，与 .catch 分支同一套善后。
        let submitPromise;
        try {
          submitPromise = Promise.resolve(this.onSubmit(noteOnly ? this.editingTask.content : content, isAllDay, time, selectedPriority, endDate, selectedCategory, this.editingTask, noteText ? noteText.value : ""));
        } catch (err) {
          console.error(tr("error.createFail"), err);
          new import_obsidian.Notice(tr("modal.create.fail"), 3e3);
          submitTask.submitted = false;
          confirmBtn.disabled = false;
          return;
        }
        submitPromise.then(() => {
          this.close();
        }).catch((err) => {
          console.error(tr("error.createFail"), err);
          new import_obsidian.Notice(tr("modal.create.fail"), 3e3);
          submitTask.submitted = false;
          confirmBtn.disabled = false;
        });
      }
    };
    // 仅桌面端自动聚焦输入框：移动端聚焦会立即拉起输入法，遮挡弹窗且不易收起；
    // 移动端由用户点击输入框时再唤起键盘
    if (!import_obsidian.Platform.isMobile) {
      window.setTimeout(() => {
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
    // activeInstances 的登记已上移到 onOpen 首句（审计 M11），此处不再重复
  }

  /**
   * 就地切换编辑目标（列表里点另一条的铅笔），复用同一个弹窗实例重建主体。
   * 先摘掉日期浮层与它挂在 document 上的 click 监听，再换 date / editingTask，
   * 最后 modalEl.empty() + 重跑 onOpen。onOpen 的构建全程是往 modalEl 里
   * createDiv，框架装饰的移除按精确类名匹配且都有判空，二次调用既不会重复
   * 挂载也不会误删内容节点（activeInstances 是 Set，重复 add 无副作用）。
   */
  switchToTask(task, anchorStr) {
    closeInlineDatePicker(this);
    this.editingTask = task;
    // anchorStr 为空 = 退回新建态，日期保持当前（不跳走）
    if (anchorStr) this.date = dateFromStr(anchorStr);
    this.modalEl.empty();
    this.onOpen();
  }

  onClose() {
    closeInlineDatePicker(this);
    // modalEl 由 Modal 基类负责移除
    // 从静态活动实例表中摘除
    if (CreateTaskModal.activeInstances && CreateTaskModal.activeInstances.has(this)) {
      CreateTaskModal.activeInstances.delete(this);
    }
    // 恢复打开前的焦点元素
    if (this.previouslyFocused && typeof this.previouslyFocused.focus === "function") {
      try {
        this.previouslyFocused.focus();
      } catch { /* 原焦点元素已不在文档里，跳过聚焦恢复 */ }
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
/** #3b82f6 → rgba(59,130,246,α)：时间块的浅底色按类别色现算，深色模式用更高的 α */
function hexToRgba(hex, alpha) {
  const raw = String(hex || "").replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return `rgba(59, 130, 246, ${alpha})`;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
var DEFAULT_SETTINGS = {
  // 视图模式："list"（大月：格子里铺任务行）| "agenda"（小月：格子只出一枚圆点，
  // 文字在下方明细区）| "bigWeek"（大周：一周 8 格，左上「本周」块 + 7 个铺任务的
  // 日子格）| "week"（小周：上半屏只留所在那一行的周格子）| "timeGrid"（三天视图：
  // 三天 × 24 小时，定时任务画成可拖拽的块）。
  // v1.6.0 新增、v1.7.0 扩到三值、v1.7.1 扩到四值、v1.8.0 扩到五值；老 data.json 缺
  // 该键时由 Object.assign({}, DEFAULT_SETTINGS, loadedData) 取此默认值，不需额外兜底。
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
    { name: "生活", color: "#3b82f6" },
    { name: "学习", color: "#8b5cf6" }
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
var MonthlyTasksPlugin = class extends import_obsidian.Plugin {
  /**
   * 插件加载
   */
  /** 删除后的 6 秒撤销窗口：原文与备注还在内存里，点「撤销」按原标记写回。
   *  复用加固过的 createTask（preserveFromRawLine 保住 createdAt/优先级等低频标记，
   *  按排序位插回正确的月份节）；写盘后经 vault modify 事件自动刷新视图。 */
  showDeleteUndo(task) {
    const old = activeDocument.querySelector(".mt-undo-toast");
    if (old) old.remove();
    if (this._undoToastTimer) { window.clearTimeout(this._undoToastTimer); this._undoToastTimer = null; }
    const toast = activeDocument.body.createDiv({ cls: "mt-undo-toast" });
    toast.createSpan({ cls: "mt-undo-toast-text", text: tr("task.deletedToast") });
    const btn = toast.createEl("button", { cls: "mt-undo-toast-btn", attr: { type: "button" } });
    btn.textContent = tr("task.undo");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const ok = await this.taskParser.createTask(
        task.filePath, task.content, task.dueDate, !task.time, task.time,
        task.priority || 0, task.startDate || null, task.category || "", !!task.completed,
        task.note || "", task.rawLine
      );
      toast.remove();
      if (this._undoToastTimer) { window.clearTimeout(this._undoToastTimer); this._undoToastTimer = null; }
      if (!ok) new import_obsidian.Notice(tr("task.undoFail"));
    });
    this._undoToastTimer = window.setTimeout(() => { toast.remove(); this._undoToastTimer = null; }, 6000);
  }

  async onload() {
    // 选中圆标的字形偏移校准：不同字体里数字字形在行盒中的垂直位置不同，
    // 写死的 em 补偿只在特定字体下成立。这里用 canvas measureText 实测当前
    // 字体里数字墨迹中心的位置，写入 --mt-badge-top（圆心 top，em），
    // styles.css 的选中圆 ::before 直接取用。这只是启动时的兜底值；
    // 每次画完网格还会在选中日号本身上复量一次（见视图的 _calibrateSelectedBadge）。
    // 测量失败时 styles.css 按行盒中心兜底，不影响功能。
    try {
      const probe = activeDocument.createElement("span");
      probe.className = "day-number mt-measure-probe";
      probe.textContent = "0";
      activeDocument.body.appendChild(probe);
      const cs = (activeDocument.defaultView || activeWindow).getComputedStyle(probe);
      const fontSize = parseFloat(cs.fontSize);
      const family = cs.fontFamily;
      // 基线探针：空 inline-block 的底边正好坐在文本基线上。Chromium 的 CSS
      // 行盒度量与 canvas fontBoundingBoxAscent 用的是两套字体度量，基线
      // 位置必须在真实 DOM 里量，不能靠 canvas。
      const bl = activeDocument.createElement("span");
      bl.className = "mt-measure-block";
      probe.appendChild(bl);
      const pr = probe.getBoundingClientRect();
      const br = bl.getBoundingClientRect();
      const baselineFromTop = br.bottom - pr.top;
      const lineBoxH = pr.height;
      probe.remove();
      const ctx = activeDocument.createElement("canvas").getContext("2d");
      if (ctx) {
        ctx.font = `700 ${fontSize}px ${family}`;
        const m = ctx.measureText("0");
        // 字形墨迹中心在基线上方的距离（px）
        const inkCenter = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
        // dy = 字形墨迹中心相对行盒中心的偏移（向上为正）
        const dyPx = lineBoxH / 2 - baselineFromTop + inkCenter;
        // 圆心 top 直接写成 em，CSS 侧不做 50% ∓ dy 的带符号运算（见就地校准方法的注释）
        activeDocument.documentElement.style.setProperty("--mt-badge-top", ((lineBoxH / 2 - dyPx) / fontSize).toFixed(4) + "em");
        // 字形墨迹高度（em）：选中圆直径以此为基准，让圆紧贴数字
        const ink = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / fontSize;
        activeDocument.documentElement.style.setProperty("--mt-badge-ink", ink.toFixed(4) + "em");
        // 双位数字形宽度（em）：选中圆直径取它与墨迹高度的较大者，
        // 否则圆按字高取直径时「10」–「31」这些双位数会露到圆外
        const w2 = ctx.measureText("00").width / fontSize;
        activeDocument.documentElement.style.setProperty("--mt-badge-w2", w2.toFixed(4) + "em");
      }
    } catch { /* 兜底值在 styles.css */ }

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
        const years = [currentYear - 1, currentYear, currentYear + 1];
        const results = await Promise.all(years.map((y) => this.holidayManager.updateFromNetwork(y)));
        // 卸载后中止：不再访问 this.settings / this.saveSettings
        if (this.unloaded) return;
        const anySuccess = results.some((r) => r === true);
        if (anySuccess) {
          // 仅更新本次请求的三年，保留其他年份已有数据，避免 data.json 持续膨胀。
          // 审计 M2：必须逐年判 results[i] === true 才写该年。_requestYear 只在
          // cache.set(year, apiData) 之后才返回 true，所以「true ⇒ cache 里是本次抓到的网络数据」。
          // 旧实现无差别遍历三年读 cache：某年网络失败时，cache 里躺着的是
          // loadBuiltinHolidays() 灌进去的内置 holidays.json 数据，照样被固化进 data.json；
          // 此后 loadSettings 先用 holidaysData 填 cache、loadBuiltinHolidays() 只在
          // !cache.has(y) 时补，于是将来版本修正过的内置数据被这条脏数据永久遮蔽。
          const newHolidaysData = { ...this.settings.holidaysData };
          for (let i = 0; i < years.length; i++) {
            if (results[i] !== true) continue;
            const holidays = this.holidayManager.cache.get(years[i]);
            if (holidays) {
              newHolidaysData[years[i]] = holidays;
            }
          }
          this.settings.holidaysData = newHolidaysData;
          await this.saveSettings();
        } else {
          // 2026-10-13：自动刷新（启动预取）全链路静默——失败只留控制台日志，不再弹提示。
          // 需要反馈的场景走设置页「刷新节假日数据」按钮：那是用户主动点的，才该有提示
          console.warn("monthly-tasks: holiday auto-refresh failed (silent by design)", years.join(","));
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
      if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(() => {
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
        if (file instanceof import_obsidian.TFile && file.extension === "md" && this.isPossibleTaskFile(file)) {
          debouncedRefresh();
        }
      })
    );
    // 监听文件创建；文件夹（TFolder）创建不触发整库刷新，但也要清设置面板的
    // 文件夹列表缓存——否则新建文件夹后「任务文件夹」下拉要等 TTL 到期才能看到
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof import_obsidian.TFile && file.extension === "md" && this.isPossibleTaskFile(file)) {
          debouncedRefresh();
        } else if (file instanceof import_obsidian.TFolder && this.settingTab) {
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
        if (!(file instanceof import_obsidian.TFile) || file.extension !== "md") return;
        if (this.isPossibleTaskFile(file)) {
          debouncedRefresh();
        }
      })
    );
  }
  /**
   * 插件卸载
   * - 清理防抖定时器，避免卸载后定时器仍触发操作已销毁的视图
   * - 这里**故意不调用** detachLeavesOfType：用户主动禁用插件时，宿主自己会拆掉该插件
   *   注册的视图叶子（registerView 的清理逻辑带 _userDisabled 判断）；而更新/重载这条
   *   路径宿主是刻意保留叶子的，好让「侧栏里拖到哪」这个位置活下来。我们再拆一次，
   *   就变成每次更新都把用户的月历面板拽回默认位置。
   */
  onunload() {
    // 标记卸载，中止后台 IIFE（节假日自动刷新）
    this.unloaded = true;
    if (this.refreshTimer) {
      window.clearTimeout(this.refreshTimer);
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
        } catch { /* 单个实例关闭失败不阻断其余实例的清理 */ }
      }
    }
    // 真机反馈回退：类别筛选面板同样挂 Modal，卸载时关闭仍打开的实例
    if (CategoryFilterModal.activeInstances && CategoryFilterModal.activeInstances.size > 0) {
      const cfInstances = Array.from(CategoryFilterModal.activeInstances);
      CategoryFilterModal.activeInstances.clear();
      for (const inst of cfInstances) {
        try {
          inst.close();
        } catch { /* 单个实例关闭失败不阻断其余实例的清理 */ }
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
        } catch { /* 单个实例关闭失败不阻断其余实例的清理 */ }
      }
    }
    // 视图菜单弹窗与其他三类弹窗一致，卸载时关闭仍打开的实例
    if (ViewMenuModal.activeInstances && ViewMenuModal.activeInstances.size > 0) {
      const vmInstances = Array.from(ViewMenuModal.activeInstances);
      ViewMenuModal.activeInstances.clear();
      for (const inst of vmInstances) {
        try {
          inst.close();
        } catch { /* 单个实例关闭失败不阻断其余实例的清理 */ }
      }
    }
    // 兜底清理：弹窗现宿主于 Obsidian Modal 容器内，卸载时残留实例已由上方 close() 回收，
    // 这里再扫一遍全文档防止异常路径漏网
    activeDocument.querySelectorAll(".create-task-modal").forEach((el) => {
      const container = el.closest(".modal-container");
      if (container) container.remove();
      else el.remove();
    });
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
    taskFolders.push("任务");
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
    } catch { /* 日记插件未启用或配置不可读，按默认目录规则继续 */ }
    const base = file.basename || "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(base)) return true;
    if (/^\d{4}年任务列表$/.test(base)) return true;
    if (/^\d{4}年\d{2}月任务列表$/.test(base)) return true;
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
      new import_obsidian.Notice(tr("notice.settingsLoadFail"), 5e3);
      loadedData = {};
      // 1.7.11：读失败 ≠ 没有数据。旧写法把 {} 当成真实状态继续跑，之后任何一次
      // saveSettings（哪怕只是点一下顶栏切视图）都会把默认值整份写回盘，
      // customTaskFolder／categories／holidaysData 静默丢失且无从恢复。
      // 立标志，让下一次保存先把原文件另存一份（见 _preserveUnreadableDataFile）
      this.settingsLoadFailed = true;
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
    // tasksPerDayLimit < 1 会让所有任务进入 +N 列表而格子无内容。
    // 1.7.11：校验区间与 UI 对齐——下拉只提供 3–10，旧校验只拒 <1，于是手编 data.json
    // 能存进 1/2/11/9999：setValue(String(...)) 选不中任何 option，下拉回显空白（用户
    // 看不出当前值到底是多少），9999 还会一路直通渲染循环。非整数同样回退；
    // 默认值改从 DEFAULT_SETTINGS 取，不再硬编码 5（改默认时不会分叉）。
    {
      const allowed = [3, 4, 5, 6, 7, 8, 9, 10];
      const n = this.settings.tasksPerDayLimit;
      if (typeof n !== "number" || !Number.isInteger(n) || !allowed.includes(n)) {
        const d = DEFAULT_SETTINGS.tasksPerDayLimit;
        this.settings.tasksPerDayLimit = allowed.includes(d) ? d : 5;
      }
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
      // 1.7.11：再拒一层点目录（.obsidian/.trash/.git）——手编 data.json 把落点指到
      // 配置目录或回收站，会把任务文件写进不该去的地方；路径段以 . 开头即视为非法
      const hasDotSegment = normalized.split("/").some((seg) => seg.startsWith("."));
      this.settings.customTaskFolder = normalized && !normalized.includes("\\") && !normalized.startsWith("/") && !hasDotSegment ? normalized : "";
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
        if (!this.holidayManager.cache.has(parseInt(year, 10))) {
          this.holidayManager.cache.set(parseInt(year, 10), holidays);
        }
      }
    }
    await this.loadBuiltinHolidays();
  }
  /**
   * 灌入内置节假日兜底数据（2022-2026 官方数据）。
   * 主来源是随 main.js 分发的 BUILTIN_HOLIDAYS 块：社区目录安装只下载
   * main.js / manifest.json / styles.css，插件目录里不会有 holidays.json，
   * 只读外部文件会让目录安装的用户整段失去离线兜底。
   * 插件目录里若另放了 holidays.json，按年覆盖内置副本（自行更新数据的入口）；
   * 该文件不存在是正常路径，不告警；存在却解析不动才告警。
   * 官方未发布年份不写预测数据，新年份由网络源（holiday-cn / timor.tech）覆盖。
   */
  async loadBuiltinHolidays() {
    let data = BUILTIN_HOLIDAYS;
    let raw = null;
    try {
      raw = await this.app.vault.adapter.read(`${this.manifest.dir}/holidays.json`);
    } catch {
      // 目录安装时这份文件根本不存在，属正常路径；不告警也不阻塞启动
    }
    if (raw !== null) {
      try {
        data = { ...BUILTIN_HOLIDAYS, ...JSON.parse(raw) };
      } catch (e) {
        console.warn(tr("error.builtinHoliday"), e);
      }
    }
    for (const [year, holidays] of Object.entries(data)) {
      const y = parseInt(year, 10);
      if (!Array.isArray(holidays) || !holidays.every((h) => h && typeof h.date === "string" && typeof h.name === "string" && typeof h.isOff === "boolean" && (h.type === "legal" || h.type === "workday"))) {
        console.warn(tr("error.holidaysJsonFormat", { year: year }));
        continue;
      }
      if (!this.holidayManager.cache.has(y)) {
        this.holidayManager.cache.set(y, holidays);
      }
    }
  }
  /**
   * 保存设置
   */
  async saveSettings() {
    // 1.7.11：串行化。多处 onChange 与节假日预取 IIFE 会并发调用本方法，每次都全量
    // 序列化同一份 settings，落盘顺序无保证——表现为「改过的设置重启后回滚」。
    // 排成一条链即可，链上不 re-throw（见 _saveSettingsNow），故不会断链。
    this._saveChain = (this._saveChain || Promise.resolve()).then(() => this._saveSettingsNow());
    return this._saveChain;
  }
  async _saveSettingsNow() {
    // 磁盘满/权限问题/文件被占用时 saveData 可能抛错，捕获后提示用户。
    // 不 re-throw：调用方（9 个 onChange + 1 个 IIFE）未 try/catch，re-throw 会变成 unhandled rejection 污染控制台。
    // Notice 已足够告知用户持久化失败，调用方继续执行 refreshView 基于内存新值渲染（可接受，下次重启会回滚）。
    try {
      if (this.settingsLoadFailed) {
        // 备份成功才清标志、才允许覆盖：备份读不出来时中止本次保存，
        // 标志留着，下次保存还会再试——绝不在没有副本的情况下盖掉唯一那份设置。
        const preserved = await this._preserveUnreadableDataFile();
        if (!preserved) {
          new import_obsidian.Notice(tr("notice.settingsBackupFail"), 8e3);
          return;
        }
        this.settingsLoadFailed = false;
      }
      await this.saveData(this.settings);
    } catch (e) {
      console.error(tr("error.settingsSave"), e);
      new import_obsidian.Notice(tr("notice.settingsSaveFail"), 5e3);
    }
  }
  /**
   * 把读不动的 data.json 原样留档（2026-10-12，v1.7.11）：loadData 抛错时内存里是纯
   * 默认值，任何一次保存都会整份覆盖真实设置——其中 customTaskFolder 归零后新任务会
   * 写去默认「任务」文件夹，用户看到的是「我的任务不见了」。覆盖之前先复制一份带
   * 时间戳的副本并明确告知，把不可逆变成可恢复。
   */
  async _preserveUnreadableDataFile() {
    // Plugin 上没有 this.adapter（旧写法因此必抛、备份从未生效），必须走 vault.adapter；
    // 路径也要带插件目录——saveData 写的是 manifest.dir 下的 data.json，不是库根那份。
    const adapter = this.app.vault.adapter;
    // 兜底路径不能写死 .obsidian：用户可能改过配置目录名（官方规则 hardcoded-config-path）
    const dir = this.manifest.dir || `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
    const dataPath = `${dir}/data.json`;
    try {
      const raw = await adapter.read(dataPath);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await adapter.write(`${dir}/data.corrupt-${stamp}.json`, raw);
      new import_obsidian.Notice(tr("notice.settingsBackup"), 8e3);
      return true;
    } catch (e) {
      // 文件确实不存在时没有什么可留的，放行（新建设置）；
      // 存在却读/写不动时返回 false，由调用方中止覆盖。
      try {
        if (!(await adapter.exists(dataPath))) return true;
      } catch {
        // exists 也失败：按"不能确认"处理，不放行
      }
      console.error(tr("error.settingsLoad"), e);
      return false;
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
      new import_obsidian.Notice(tr("notice.cantOpenView"), 3e3);
    }
  }
  /**
   * v1.5.2 方案A：删除线开关热切换入口——对每个已加载视图做类名级更新，
   * 不做 refreshView 全量重绘（改前切一次开关要重建整个网格，手机端肉眼可见闪一下）
   */
  _applyStrikeToViews() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MONTHLY);
    let modalDone = false;
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view && typeof view._applyStrikeClasses === "function") {
        // 审计 L14：每个视图只扫自己 rootEl 下那份 DOM，不再互相串；
        // 弹窗（CreateTaskModal 挂在 document.body 上，不在任何 rootEl 里）那一趟
        // 是全局的，交给第一个视图做一次即可——类名操作幂等，做 N 次只是白扫 N 遍 body。
        view._applyStrikeClasses({ modal: !modalDone });
        modalDone = true;
      }
    }
    // 一个视图都没开时不需要兜底：弹窗只能从格子里点出来，而视图 onClose 会连带关掉
    // 本视图挂出的所有弹窗（审计 M3），所以「无视图却有弹窗」这一档不存在。
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
        // 审计 L6：try/catch 包在**循环体内**，两处收益——
        // ① 多开月历时（Obsidian 支持同一视图在左右窗格各开一个），第一个 leaf
        //    刷新失败不会连带跳过其余 leaf，用户看到的是"某一格没更新"而不是"全都没更新"；
        // ② 本方法有十余处调用方（设置项切换、vault 事件、命令）都**没有 await**，
        //    抛出去就是 unhandled rejection。在这里收敛掉，等价于给所有调用点兜底。
        try {
          await view.refresh(true);
        } catch (e) {
          console.error(tr("error.refreshView"), e);
        }
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
// 官方原生分区：Obsidian 1.11+ 用 SettingGroup（组标题 + 组内分隔线都由宿主画），
// 返回"该往哪儿 append 设置行"的容器。旧版本没有 SettingGroup 时回退成
// Setting.setHeading() 标题行，行仍直接落在页面上，形状一致、不自己写 CSS。
// 四个插件共用同一段写法，改一处即可对齐。
function settingsSection(containerEl, title) {
  const Group = import_obsidian.SettingGroup;
  if (typeof Group === "function") {
    const group = new Group(containerEl);
    group.setHeading(title);
    return group.listEl;
  }
  const heading = new import_obsidian.Setting(containerEl).setName(title);
  if (typeof heading.setHeading === "function") heading.setHeading();
  return containerEl;
}

var MonthlyTasksSettingTab = class extends import_obsidian.PluginSettingTab {
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

    // ---------- 显示 ----------
    const displayEl = settingsSection(containerEl, tr("settings.section.display"));
    // v1.7.2：界面语言不再出现在设置页——插件文案直接跟随 Obsidian 的界面语言。
    // 少一个选项，也少一类「选了中文但 Obsidian 是英文」的错位；
    // setLanguage() 仍保留在插件实例上，供测试与将来需要时复用。
    // 默认视图（v1.7.0）：顶栏菜单与命令都走 MonthlyView.setViewMode()，那里会回写
    // settings.viewMode，所以这里显示的就是你最后用的那一档（原注释说「不回写」，与代码相反）
    new import_obsidian.Setting(displayEl).setName(tr("settings.view.name")).setDesc(tr("settings.view.desc")).addDropdown((dropdown) => {
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
    new import_obsidian.Setting(displayEl).setName(tr("settings.showCompleted.name")).setDesc(tr("settings.showCompleted.desc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.showCompletedTasks).onChange(async (value) => {
      this.plugin.settings.showCompletedTasks = value;
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    new import_obsidian.Setting(displayEl).setName(tr("settings.hideStrike.name")).setDesc(tr("settings.hideStrike.desc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.showCompletedStrike).onChange(async (value) => {
      this.plugin.settings.showCompletedStrike = value;
      await this.plugin.saveSettings();
      this.plugin._applyStrikeToViews();
    }));
    new import_obsidian.Setting(displayEl).setName(tr("settings.showLunar.name")).setDesc(tr("settings.showLunar.desc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.showLunar).onChange(async (value) => {
      this.plugin.settings.showLunar = value;
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    new import_obsidian.Setting(displayEl).setName(tr("settings.showHoliday.name")).setDesc(tr("settings.showHoliday.desc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.showHoliday).onChange(async (value) => {
      this.plugin.settings.showHoliday = value;
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    new import_obsidian.Setting(displayEl).setName(tr("settings.firstDow.name")).setDesc(tr("settings.firstDow.desc")).addDropdown((dropdown) => dropdown.addOption("0", tr("modal.create.weekday.sun")).addOption("1", tr("modal.create.weekday.mon")).addOption("6", tr("modal.create.weekday.sat")).setValue(String(this.plugin.settings.firstDayOfWeek)).onChange(async (value) => {
      this.plugin.settings.firstDayOfWeek = parseInt(value, 10);
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    new import_obsidian.Setting(displayEl).setName(tr("settings.tasksLimit.name")).setDesc(tr("settings.tasksLimit.desc")).addDropdown((dropdown) => dropdown.addOption("3", "3").addOption("4", "4").addOption("5", "5").addOption("6", "6").addOption("7", "7").addOption("8", "8").addOption("9", "9").addOption("10", "10").setValue(String(this.plugin.settings.tasksPerDayLimit)).onChange(async (value) => {
      this.plugin.settings.tasksPerDayLimit = parseInt(value, 10);
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));

    // ---------- 任务 ----------
    // 原来这一档叫「任务与存储」，里面却只有三个显示/创建默认值；而真正的存储两项
    //（归档周期、任务文件夹）落在下面「类别管理」标题底下——中间没有任何新标题，
    // 打开设置会以为改类别顺带改了归档。现在存储两项归位到这一档，档名随之改成「任务」
    const taskEl = settingsSection(containerEl, tr("settings.section.storage"));
    new import_obsidian.Setting(taskEl).setName(tr("settings.defaultAllDay.name")).setDesc(tr("settings.defaultAllDay.desc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.defaultAllDayTask).onChange(async (value) => {
      this.plugin.settings.defaultAllDayTask = value;
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    // 示例文件名跟着当天走，且复用 getPeriodId()——插件真正写盘用的就是它，
    // 另算一份或写死「2026年10月」都会跟实际文件名对不上
    const egNow = new Date();
    const egYear = `${getPeriodId(egNow, "year")}年任务列表.md`;
    const egMonth = `${getPeriodId(egNow, "month")}任务列表.md`;
    // 任务归档周期：决定新任务写入哪个文件；切换不影响已有文件
    new import_obsidian.Setting(taskEl).setName(tr("settings.section.archive")).setDesc(tr("settings.archive.desc")).addDropdown((dropdown) => dropdown.addOption("year", tr("settings.archive.year", { file: egYear })).addOption("month", tr("settings.archive.month", { file: egMonth })).setValue(this.plugin.settings.taskFilePeriod).onChange(async (value) => {
      this.plugin.settings.taskFilePeriod = value === "month" ? "month" : "year";
      await this.plugin.saveSettings();
      // 粒度切换后必须清路径缓存，否则新任务会写回旧粒度的文件
      this.plugin.taskParser.taskFileCache.clear();
      this.plugin.taskParser.invalidateCache();
      this.plugin.refreshView();
    }));
    // 自定义任务文件夹设置
    const folderOptions = this.getFolderOptions();
    new import_obsidian.Setting(taskEl).setName(tr("settings.section.folder")).setDesc(tr("settings.folder.desc")).addDropdown((dropdown) => {
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

    // ---------- 类别管理 ----------
    // 类别管理（批次二⑦）：只维护「已知类别列表 + 顺序 + 颜色」。
    // 类别真身是任务行尾的 #tag：这里增删改都不碰任何笔记；删掉某类别只是取消它的排序与配色，
    // 笔记里残留的标签仍会被解析、仍出现在筛选面板（自动补到列表尾部）
    const catEl = settingsSection(containerEl, tr("settings.section.category"));
    new import_obsidian.Setting(catEl).setName(tr("settings.catKnown.name")).setDesc(tr("settings.catKnown.desc"));
    const categoryListEl = catEl.createDiv("mt-category-list");
    const renderCategoryList = () => {
      categoryListEl.empty();
      const cats = this.plugin.settings.categories;
      if (cats.length === 0) {
        // setting-item 类：内边距/分隔线交给宿主，裸 div 在手机端会顶到卡片边
        categoryListEl.createDiv("setting-item mt-category-empty").textContent = tr("settings.catEmpty");
      }
      cats.forEach((cat, index) => {
        const row = categoryListEl.createDiv("setting-item mt-category-row");
        const dot = row.createDiv("mt-category-dot");
        dot.style.setProperty("--mt-cat-color", cat.color);
        row.createDiv("mt-category-name").textContent = `#${cat.name}`;
        // 颜色只从固定色板轮换选择，不开放自由取色（控制复杂度，并保证暗色模式可辨）
        // dropdown 类必须带：手机端 Obsidian 把原生 select 箭头隐掉，只给 .dropdown
        // 补绘小箭头（真机截图里「按年」「笔记/任务」有箭头、裸 select 没有）
        const colorSel = row.createEl("select", { cls: "dropdown mt-category-color", attr: { "aria-label": tr("settings.catColor", { name: cat.name }) } });
        // 选项文字直接用颜色名（2026-11-07 真机反馈：「色号 1」既没信息量又占宽，
        // 手机端把类别行挤成两行）。名字与 CATEGORY_PALETTE 按序一一对应，
        // 三语各给一条逗号分隔串；万一某语缺项回退成序号
        const colorNames = tr("settings.catColorNames").split(",");
        CATEGORY_PALETTE.forEach((c, ci) => {
          const opt = colorSel.createEl("option", { value: c });
          opt.textContent = colorNames[ci] || String(ci + 1);
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
        // 三个操作按钮收进一组：桌面端仍与圆点/名称/色板同一行、间距不变；
        // 手机端整行放不下时整组随 flex-wrap 换到第二行（CSS 见窄屏规则）
        const actions = row.createDiv("mt-category-actions");
        const upBtn = actions.createEl("button", { cls: "mt-category-btn", text: "↑", attr: { "aria-label": tr("settings.catUp", { name: cat.name }) } });
        upBtn.disabled = index === 0;
        upBtn.addEventListener("click", async () => {
          const arr = this.plugin.settings.categories;
          const tmp = arr[index - 1];
          arr[index - 1] = arr[index];
          arr[index] = tmp;
          await this.plugin.saveSettings();
          renderCategoryList();
        });
        const downBtn = actions.createEl("button", { cls: "mt-category-btn", text: "↓", attr: { "aria-label": tr("settings.catDown", { name: cat.name }) } });
        downBtn.disabled = index === cats.length - 1;
        downBtn.addEventListener("click", async () => {
          const arr = this.plugin.settings.categories;
          const tmp2 = arr[index + 1];
          arr[index + 1] = arr[index];
          arr[index] = tmp2;
          await this.plugin.saveSettings();
          renderCategoryList();
        });
        const delBtn = actions.createEl("button", { cls: "mt-category-btn mt-category-del", text: tr("settings.catDelete"), attr: { "aria-label": tr("settings.catDeleteAria", { name: cat.name }) } });
        delBtn.addEventListener("click", async () => {
          this.plugin.settings.categories.splice(index, 1);
          await this.plugin.saveSettings();
          this.plugin.refreshView();
          renderCategoryList();
        });
      });
      const addRow = categoryListEl.createDiv("setting-item mt-category-row mt-category-add");
      const nameInput = addRow.createEl("input", { cls: "mt-category-input", attr: { type: "text", placeholder: tr("settings.catPlaceholder") } });
      const addBtn = addRow.createEl("button", { cls: "mt-category-btn mt-category-addbtn", text: tr("settings.catAdd") });
      const doAdd = async () => {
        const raw = nameInput.value.trim();
        // 与 Obsidian 标签规则一致：非空、不含空格、非纯数字、不含 #；重名明确拒绝而非静默吞掉
        if (!raw || /\s/.test(raw) || /^\d+$/.test(raw) || raw.includes("#")) {
          new import_obsidian.Notice(tr("notice.catInvalid"), 4e3);
          return;
        }
        if (this.plugin.settings.categories.some((c) => c.name === raw)) {
          new import_obsidian.Notice(tr("notice.catExists", { name: raw }), 3e3);
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

    // ---------- 节假日数据 ----------
    const holidayEl = settingsSection(containerEl, tr("settings.section.holiday"));
    new import_obsidian.Setting(holidayEl).setName(tr("settings.autoHoliday.name")).setDesc(tr("settings.autoHoliday.desc")).addToggle((toggle) => toggle.setValue(this.plugin.settings.autoUpdateHolidays).onChange(async (value) => {
      this.plugin.settings.autoUpdateHolidays = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(holidayEl).setName(tr("settings.refreshHoliday.name")).setDesc(tr("settings.refreshHoliday.desc")).addButton((button) => {
      button.setButtonText(tr("settings.refreshBtn"));
      button.buttonEl.addEventListener("click", async () => {
        const currentYear = new Date().getFullYear();
        const years = [currentYear - 1, currentYear, currentYear + 1];
        button.setDisabled(true);
        button.setButtonText(tr("settings.loading"));
        try {
          // updateFromNetwork 内部 try/catch 吞掉异常返回 false，需检查返回值判断真实成败
          const results = await Promise.all(years.map((y) => this.plugin.holidayManager.updateFromNetwork(y)));
          if (results.some((r) => r === true)) {
            // 至少一年成功才合并保存：仅更新本次请求的三年，保留其他年份已有数据，避免 data.json 持续膨胀。
            // 审计 M2（与 onload 的自动预取同一缺陷、同一修法）：逐年判 results[i] === true 才写该年，
            // 否则失败年份 cache 里的内置 holidays.json 数据会被固化进 data.json，
            // 并因 loadSettings「先持久化后内置」的填充顺序永久遮蔽将来修正过的内置数据。
            const newHolidaysData = { ...this.plugin.settings.holidaysData };
            for (let i = 0; i < years.length; i++) {
              if (results[i] !== true) continue;
              const holidays = this.plugin.holidayManager.cache.get(years[i]);
              if (holidays) {
                newHolidaysData[years[i]] = holidays;
              }
            }
            this.plugin.settings.holidaysData = newHolidaysData;
            await this.plugin.saveSettings();
            this.plugin.refreshView();
            const failedCount = results.filter((r) => r !== true).length;
            // 1.7.11：刷新一次取「今年及前后各一年」，而下一年的安排通常还没公告
            // （holiday-cn 该年返回空数组）。这类年份从 emptyYears 里认，不再计入失败
            const hm = this.plugin.holidayManager;
            const noData = years.filter((y, i) => results[i] !== true && hm.emptyYears.has(y));
            const failed = years.filter((y, i) => results[i] !== true && !hm.emptyYears.has(y));
            if (failed.length === 0 && noData.length > 0) {
              new import_obsidian.Notice(tr("notice.holidayNoData", { years: noData.join("、") }), 4e3);
            } else if (failedCount > 0) {
              new import_obsidian.Notice(tr("notice.holidayPartial", { ok: results.length - failedCount, total: results.length }), 3e3);
            } else {
              new import_obsidian.Notice(tr("notice.holidayRefreshed"), 3e3);
            }
          } else {
            // 三年全部「有源应答但无数据」也不是故障（例如刚跨到还没有公告的年份）
            const hm = this.plugin.holidayManager;
            const noData = years.filter((y) => hm.emptyYears.has(y));
            if (noData.length === years.length) {
              new import_obsidian.Notice(tr("notice.holidayNoData", { years: noData.join("、") }), 4e3);
            } else {
              new import_obsidian.Notice(tr("notice.holidayRefreshFail"), 5e3);
            }
          }
        } catch (e) {
          console.warn(tr("error.refreshHoliday"), e);
          new import_obsidian.Notice(tr("notice.holidayRefreshFail"), 5e3);
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
