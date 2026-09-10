/*
 * ============================================================
 * 月历任务插件 (Monthly Tasks Plugin)
 * ============================================================
 *
 * 插件功能：滴答清单风格的月视图任务管理，支持农历、节假日和调休显示
 * 版本：1.4.0
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
 *    - 包含：generateTaskId, parsePriority, cleanTaskContent
 *    - 提取日期：extractDueDate, extractStartDate
 *    - 任务判断：isTaskLine, isTaskCompleted, isMultiDayTask
 *    - 工具函数：groupTasksByDate, getMultiDayDuration, isOverdue
 *
 * 2. TaskParser
 *    - 解析Obsidian库中的任务
 *    - 缓存管理：parseAllTasks, invalidateCache
 *    - 文件操作：createTask, createTaskForDate, getOrCreateDefaultTaskFile
 *    - 任务搜索：findDailyNotePath
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
 * 7. DatePickerModal
 *    - 日期选择器弹窗
 *    - onOpen 内完成月份导航与日期网格渲染，选择后回调 onSubmit
 *
 * 8. CreateTaskModal
 *    - 创建任务弹窗
 *    - 表单字段：任务内容、日期、时间、优先级
 *    - 提交处理：onSubmit
 *
 * 9. MonthlyTasksPlugin
 *    - 插件主类
 *    - 生命周期：onload, onunload
 *    - 设置管理：loadSettings, saveSettings
 *
 * 10. MonthlyTasksSettingTab
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
 * 清理任务内容，移除所有元数据标记
 * 保留任务的核心文本内容；日期兼容补零与不补零两种写法
 */
function cleanTaskContent(rawLine) {
  // 与 CreateTaskModal 提交侧的剥离保持一致：🟢 优先级、➕ 创建日期 / ✅ 完成日期
  // （Tasks 插件格式）一并清理，避免外部格式粘贴后 emoji 混入任务显示文本
  return rawLine.replace(/^\s*- \[[ x]\]\s*/i, "").replace(/📅\s*\d{4}-\d{1,2}-\d{1,2}/gu, "").replace(/⏳\s*\d{4}-\d{1,2}-\d{1,2}/gu, "").replace(/🛫\s*\d{4}-\d{1,2}-\d{1,2}/gu, "").replace(/➕\s*\d{4}-\d{1,2}-\d{1,2}/gu, "").replace(/✅\s*\d{4}-\d{1,2}-\d{1,2}/gu, "").replace(/⏰\s*[^\s📅🛫🔴🟡✅🟢➕]+(?:\s*~\s*[^\s📅🛫🔴🟡✅🟢➕]+)?/gu, "").replace(/🔴|🟡|🟢/gu, "").trim();
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
    // renderTaskItem 依据 task.startDate/dueDate 计算 dayIndex 并加 multi-day-start/end 类。
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
            new import_obsidian.Notice(`月历任务：跨天任务区间超过 ${MULTI_DAY_MOUNT_LIMIT} 天，仅显示开始与结束日期（详情见控制台）`);
          }
          console.warn(`月历任务：跨天任务区间 ${task.startDate} ~ ${task.dueDate} 超过 ${MULTI_DAY_MOUNT_LIMIT} 天，仅挂载首尾两日 (${task.filePath}:${task.lineNumber + 1}): ${task.content}`);
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
 * - findDailyNotePath()：查找日记文件路径
 * - getOrCreateDefaultTaskFile()：获取或创建年度任务列表文件
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
  constructor(app) {
    this.cache = null;
    this.lastParseTime = 0;
    this.CACHE_DURATION = 5e3;
    this.app = app;
    // 任务文件路径缓存：{ year: filePath }
    this.taskFileCache = /* @__PURE__ */ new Map();
    // 写操作串行化队列：避免 createTask/toggleTask/deleteTask 并发读写导致后写覆盖先写丢失任务
    this.writeQueue = Promise.resolve();
  }
  /**
   * 解析所有文件中的任务
   * @param forceRefresh 是否强制刷新缓存
   */
  async parseAllTasks(forceRefresh = false) {
    if (!forceRefresh && this.cache && Date.now() - this.lastParseTime < this.CACHE_DURATION) {
      return this.cache;
    }
    const tasks = [];
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      // 单文件错误隔离：单个文件解析失败（如已被删除、内容异常）不应导致整个任务列表为空
      try {
        const fileTasks = await this.parseFile(file);
        tasks.push(...fileTasks);
      } catch (e) {
        console.error(`\u89E3\u6790\u6587\u4EF6\u5931\u8D25: ${file.path}`, e);
      }
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
        if (task) tasks.push(task);
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
    const content = cleanTaskContent(line);
    // 含 📅/🛫 但日期无法解析（含形状合法但值非法，如 2026-02-30）：
    // 不静默丢弃，首次给出提示，其余仅记日志
    const badDue = !dueDate && line.includes("📅");
    const badStart = !startDate && line.includes("🛫");
    if (badDue || badStart) {
      if (!invalidDateNoticeShown) {
        invalidDateNoticeShown = true;
        new import_obsidian.Notice("月历任务：发现 📅/🛫 后日期无法识别（含非法日期如 2026-02-30）的任务行，已忽略（详情见控制台）");
      }
      console.warn(`月历任务：无法识别的日期任务行 (${filePath}:${lineNumber + 1}): ${line}`);
    }
    if (!content)
      return null;
    return {
      id: generateTaskId(filePath, lineNumber),
      content,
      rawLine: line,
      filePath,
      lineNumber,
      completed: isTaskCompleted(line),
      startDate,
      dueDate,
      time,
      priority: parsePriority(line),
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
        console.error(`\u6587\u4EF6\u4E0D\u5B58\u5728: ${task.filePath}`);
        return false;
      }
      const content = await this.app.vault.read(file);
      const lines = content.split("\n");
      if (task.lineNumber >= lines.length) {
        console.error(`\u884C\u53F7\u8D85\u51FA\u8303\u56F4: ${task.lineNumber}`);
        return false;
      }
      const line = lines[task.lineNumber];
      // 行号失效校验：若该行已不是任务行（文件被改），拒绝操作避免误改正文
      if (!isTaskLine(line)) {
        console.error(`\u884C\u53F7\u5DF2\u5931\u6548\uFF0C\u8BE5\u884C\u4E0D\u662F\u4EFB\u52A1\uFF1A${task.lineNumber}`);
        return false;
      }
      // 任务身份校验：若该行内容与任务原始行不一致（行号偏移指向了其他任务），拒绝操作
      // 比较时去除尾部空白，避免 Obsidian "Trim trailing whitespace on save" 等自动格式化导致误判
      if (task.rawLine && task.rawLine.replace(/\s+$/, "") !== line.replace(/\s+$/, "")) {
        console.error(`\u884C\u53F7\u5DF2\u5931\u6548\uFF0C\u8BE5\u884C\u4E0D\u662F\u76EE\u6807\u4EFB\u52A1\uFF1A${task.lineNumber}`);
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
      console.error("\u5207\u6362\u4EFB\u52A1\u72B6\u6001\u5931\u8D25:", error);
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
        console.error(`\u6587\u4EF6\u4E0D\u5B58\u5728: ${task.filePath}`);
        return false;
      }
      const content = await this.app.vault.read(file);
      const lines = content.split("\n");
      if (task.lineNumber >= lines.length) {
        console.error(`\u884C\u53F7\u8D85\u51FA\u8303\u56F4: ${task.lineNumber}`);
        return false;
      }
      // 删除该行，同时移除可能产生的多余空行
      // 行号失效校验：若该行已不是任务行（文件被改），拒绝操作避免误删正文
      const lineToDelete = lines[task.lineNumber];
      if (!isTaskLine(lineToDelete)) {
        console.error(`\u884C\u53F7\u5DF2\u5931\u6548\uFF0C\u8BE5\u884C\u4E0D\u662F\u4EFB\u52A1\uFF0C\u62D2\u7EDD\u5220\u9664\uFF1A${task.lineNumber}`);
        return false;
      }
      // 任务身份校验：若该行内容与任务原始行不一致（行号偏移指向了其他任务），拒绝删除
      // 比较时去除尾部空白，避免 Obsidian 自动格式化导致误判
      if (task.rawLine && task.rawLine.replace(/\s+$/, "") !== lineToDelete.replace(/\s+$/, "")) {
        console.error(`\u884C\u53F7\u5DF2\u5931\u6548\uFF0C\u8BE5\u884C\u4E0D\u662F\u76EE\u6807\u4EFB\u52A1\uFF0C\u62D2\u7EDD\u5220\u9664\uFF1A${task.lineNumber}`);
        return false;
      }
      lines.splice(task.lineNumber, 1);
      await this.app.vault.modify(file, lines.join("\n"));
      this.invalidateCache();
      return true;
    } catch (error) {
      console.error("\u5220\u9664\u4EFB\u52A1\u5931\u8D25:", error);
      return false;
    }
  }
  /**
   * 在指定文件中创建新任务
   */
  async createTask(filePath, content, dueDate, isAllDay, time, priority, startDate) {
    // 串行化：避免与其他写操作并发导致后写覆盖先写丢失任务
    const run = () => this._createTaskImpl(filePath, content, dueDate, isAllDay, time, priority, startDate);
    this.writeQueue = this.writeQueue.then(run, run);
    return this.writeQueue;
  }
  async _createTaskImpl(filePath, content, dueDate, isAllDay, time, priority, startDate) {
    try {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof import_obsidian.TFile)) {
        console.error(`\u6587\u4EF6\u4E0D\u5B58\u5728: ${filePath}`);
        return false;
      }
      let fileContent = await this.app.vault.read(file);
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
      let taskLine = `- [ ] ${content} ${priorityMarker}${dateMarker}${timeMarker}\u{1F4C5} ${dueDate}`;
      
      // 确定用于排序和插入的日期：跨天任务用开始日期，普通任务用截止日期
      const isMultiDay = startDate && startDate !== dueDate;
      const sortDate = isMultiDay ? startDate : dueDate;
      
      if (sortDate) {
        const [y, m] = sortDate.split("-");
        const monthSection = `## ${y}\u5E74${m}\u6708`;
        // 查找月份section位置：兼容用户手动创建的无前导零月份标题（如 "## 2026年4月"），
        // 避免与插件生成的 "## 2026年04月" 重复创建同月 section
        const sectionMatch = fileContent.match(new RegExp(`^## ${y}\u5E740*${parseInt(m)}\u6708`, "m"));
        const sectionIdx = sectionMatch ? sectionMatch.index : -1;
        if (sectionIdx === -1) {
          // 月份section不存在，需要创建
          // 找到所有月份section的位置（锚定行首，避免误匹配 ### 或行中）
          const monthRegex = /^## (\d{4})\u5E74(\d{1,2})\u6708/gm;
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
          // 不再自带---前缀，避免产生连续两个分隔符；此时若插入点在文件中部，
          // 新section尾部补---供下一月份使用，否则后续追加的任务会被算进下月section
          const before = fileContent.slice(0, insertPos);
          const sepBefore = /(?:^|\n)---[ \t]*$/.test(before.replace(/(?:[ \t]*\r?\n)+$/, ""));
          const leadBlank = /(?:^|\n)[ \t]*\r?\n$/.test(before) ? "" : eol;
          const newSection = sepBefore
            ? `${leadBlank}${monthSection}${eol}${eol}${taskLine}${eol}${eol}${insertPos < fileContent.length ? `---${eol}${eol}` : ""}`
            : `${leadBlank}---${eol}${eol}${monthSection}${eol}${eol}${taskLine}${eol}${eol}`;
          fileContent = fileContent.slice(0, insertPos) + newSection + fileContent.slice(insertPos);
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
          const blankLine = useCRLF ? "\r" : "";
          // 插入片段：前后按需补空行，保持「任务之间空一行、--- 前空一行」的文件约定；
          // 相邻已是空行时不再补，连续插入不会累积空行
          const parts = [taskLineWithEol];
          if (insertIdx >= lines.length) {
            // 段末插入：越过尾部既有空行（原为 --- 前的分隔行），
            // 使既有空行落在新任务之后而非被顶到前面
            while (insertIdx > 0 && lines[insertIdx - 1].trim() === "") insertIdx--;
          }
          if (insertIdx > 0 && lines[insertIdx - 1].trim() !== "") {
            parts.unshift(blankLine);
          }
          if (insertIdx < lines.length && lines[insertIdx].trim() !== "") {
            parts.push(blankLine);
          }
          lines.splice(insertIdx, 0, ...parts);
          fileContent = fileContent.slice(0, sectionIdx) + lines.join("\n") + fileContent.slice(sectionEnd);
        }
      } else {
        const eol = fileContent.includes("\r\n") ? "\r\n" : "\n";
        fileContent = fileContent + eol + taskLine + eol;
      }
      await this.app.vault.modify(file, fileContent);
      this.invalidateCache();
      return true;
    } catch (error) {
      console.error("\u521B\u5EFA\u4EFB\u52A1\u5931\u8D25:", error);
      return false;
    }
  }
  /**
   * 在指定日期创建任务（自动选择或创建按年月归类的文件）
   */
  async createTaskForDate(date, content, isAllDay = true, time, priority, endDate, customFolderPath) {
    // 串行化整个流程（含年度任务文件创建）：并发创建同一文件时 vault.create 会竞态抛"已存在"，
    // 并入 writeQueue 后第二个请求必能在 findTaskFile 命中首个创建结果
    const run = () => this._createTaskForDateImpl(date, content, isAllDay, time, priority, endDate, customFolderPath);
    this.writeQueue = this.writeQueue.then(run, run);
    return this.writeQueue;
  }
  async _createTaskForDateImpl(date, content, isAllDay, time, priority, endDate, customFolderPath) {
    const dateStr = this.formatDate(date);
    const endDateStr = endDate ? this.formatDate(endDate) : dateStr;
    // 一律写入年度任务列表，跳过日记查找：保证任务统一归集到 任务/YYYY年任务列表.md
    // （日记中已有的任务仍会被 parseAllTasks 全库扫描正常显示）
    const defaultFile = await this.getOrCreateDefaultTaskFile(date, customFolderPath);
    if (defaultFile) {
      // 直接调用 _createTaskImpl 而非 createTask：本方法已在 writeQueue 链中执行，
      // 若再经 createTask 二次入队会形成 Q2 等待 Q1、Q1 等待 Q2 的死锁，
      // 导致任务永不写入文件、弹窗按钮永久禁用。
      return this._createTaskImpl(defaultFile, content, endDateStr, isAllDay, time, priority, dateStr);
    }
    return false;
  }
  /**
   * 查找日记文件路径
   */
  findDailyNotePath(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const formats = [
      `${yyyy}-${mm}-${dd}.md`,
      `${yyyy}/${mm}/${dd}.md`,
      `\u65E5\u8BB0/${yyyy}-${mm}-${dd}.md`,
      `Daily/${yyyy}-${mm}-${dd}.md`
    ];
    // 优先读取 Obsidian 内置「日记」插件配置，按用户实际的格式与文件夹构造路径
    try {
      const dailyNotesPlugin = this.app.internalPlugins && this.app.internalPlugins.getPluginById && this.app.internalPlugins.getPluginById("daily-notes");
      const inst = dailyNotesPlugin && dailyNotesPlugin.instance;
      if (inst && inst.options && inst.options.enabled !== false) {
        const opts = inst.options;
        const folder = (opts.folder || "").replace(/\/+$/, "");
        const fmt = opts.format || "YYYY-MM-DD";
        const tokenized = fmt.replace(/YYYY/g, String(yyyy)).replace(/MM/g, mm).replace(/DD/g, dd);
        const candidate = folder ? `${folder}/${tokenized}.md` : `${tokenized}.md`;
        formats.unshift(candidate);
      }
    } catch (e) {
      // 读取配置失败时回退到默认格式列表，不影响主流程
    }
    for (const format of formats) {
      const file = this.app.vault.getAbstractFileByPath(format);
      if (file instanceof import_obsidian.TFile) {
        return format;
      }
    }
    return null;
  }
  /**
   * 获取或创建默认任务文件（统一存储在年度任务列表）
   * 优先在整个库中查找已存在的年度任务文件，支持文件被移动后的场景
   * @param date - 日期对象
   * @param customFolderPath - 自定义任务文件夹路径（可选）
   */
  async getOrCreateDefaultTaskFile(date, customFolderPath) {
    const now = date || new Date();
    const year = String(now.getFullYear());
    const targetFileName = `${year}\u5E74\u4EFB\u52A1\u5217\u8868.md`;

    // 1. 使用缓存查找已存在的年度任务文件（传入 customFolderPath 用于消歧）
    const existingPath = this.findTaskFile(year, customFolderPath);
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
        const initialContent = `# ${year}\u5E74\u4EFB\u52A1\u5217\u8868

> \u7531\u300C\u6708\u5386\u4EFB\u52A1\u300D\u63D2\u4EF6\u81EA\u52A8\u521B\u5EFA\u3002

`;
        await this.app.vault.create(filePath, initialContent);
        // 缓存新创建的文件路径
        this.taskFileCache.set(year, filePath);
        return filePath;
      } catch (error) {
        console.error(`\u5728\u6587\u4EF6\u5939\u300C${folderPath}\u300D\u521B\u5EFA\u4EFB\u52A1\u6587\u4EF6\u5931\u8D25:`, error);
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
   * 查找年度任务文件（使用缓存）
   * 优先返回位于 customFolderPath 下的文件，避免在多同名文件场景下选错。
   * @param year - 年份
   * @param customFolderPath - 自定义任务文件夹路径（可选）
   * @returns 文件路径或 null
   */
  findTaskFile(year, customFolderPath) {
    const yearStr = String(year);
    const targetFileName = `${yearStr}年任务列表.md`;
    const normalizedCustom = customFolderPath ? customFolderPath.replace(/\/+$/, "") : "";

    // 1. 检查缓存
    if (this.taskFileCache.has(yearStr)) {
      const cachedPath = this.taskFileCache.get(yearStr);
      const file = this.app.vault.getAbstractFileByPath(cachedPath);
      if (file instanceof import_obsidian.TFile) {
        // 若指定了 customFolderPath，需校验缓存命中位于该文件夹下；
        // 若不一致则忽略缓存，继续走全库搜索流程。
        if (!normalizedCustom || this.isPathInFolder(cachedPath, normalizedCustom)) {
          return cachedPath;
        }
      }
      // 缓存的文件不存在或不在指定文件夹下，清除缓存
      this.taskFileCache.delete(yearStr);
    }

    // 2. 在整个库中搜索
    const files = this.app.vault.getMarkdownFiles();
    // 2a. 若指定了 customFolderPath，优先返回位于该文件夹下的同名文件
    if (normalizedCustom) {
      for (const file of files) {
        if (file.name === targetFileName && this.isPathInFolder(file.path, normalizedCustom)) {
          this.taskFileCache.set(yearStr, file.path);
          return file.path;
        }
      }
    }
    // 2b. 否则（或未在指定文件夹下找到）回退到第一条同名文件命中
    for (const file of files) {
      if (file.name === targetFileName) {
        this.taskFileCache.set(yearStr, file.path);
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
var WEEKDAY_NAMES = ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"];

/** 月份名称数组（1月到12月）*/
var MONTH_NAMES = [
  "1\u6708", "2\u6708", "3\u6708", "4\u6708", "5\u6708", "6\u6708",
  "7\u6708", "8\u6708", "9\u6708", "10\u6708", "11\u6708", "12\u6708"
];

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
  return `${year}\u5E74 ${MONTH_NAMES[month]}`;
}

var LUNAR_MONTH_NAMES = [
  "\u6B63",
  "\u4E8C",
  "\u4E09",
  "\u56DB",
  "\u4E94",
  "\u516D",
  "\u4E03",
  "\u516B",
  "\u4E5D",
  "\u5341",
  "\u51AC",
  "\u814A"
];
var LUNAR_DAY_NAMES = [
  "\u521D\u4E00",
  "\u521D\u4E8C",
  "\u521D\u4E09",
  "\u521D\u56DB",
  "\u521D\u4E94",
  "\u521D\u516D",
  "\u521D\u4E03",
  "\u521D\u516B",
  "\u521D\u4E5D",
  "\u521D\u5341",
  "\u5341\u4E00",
  "\u5341\u4E8C",
  "\u5341\u4E09",
  "\u5341\u56DB",
  "\u5341\u4E94",
  "\u5341\u516D",
  "\u5341\u4E03",
  "\u5341\u516B",
  "\u5341\u4E5D",
  "\u4E8C\u5341",
  "\u5EFF\u4E00",
  "\u5EFF\u4E8C",
  "\u5EFF\u4E09",
  "\u5EFF\u56DB",
  "\u5EFF\u4E94",
  "\u5EFF\u516D",
  "\u5EFF\u4E03",
  "\u5EFF\u516B",
  "\u5EFF\u4E5D",
  "\u4E09\u5341"
];
var TIAN_GAN = ["\u7532", "\u4E59", "\u4E19", "\u4E01", "\u620A", "\u5DF1", "\u5E9A", "\u8F9B", "\u58EC", "\u7678"];
var DI_ZHI = ["\u5B50", "\u4E11", "\u5BC5", "\u536F", "\u8FB0", "\u5DF3", "\u5348", "\u672A", "\u7533", "\u9149", "\u620C", "\u4EA5"];
var ZODIAC_ANIMALS = ["\u9F20", "\u725B", "\u864E", "\u5154", "\u9F99", "\u86C7", "\u9A6C", "\u7F8A", "\u7334", "\u9E21", "\u72D7", "\u732A"];
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
    throw new Error("\u5E74\u4EFD\u8D85\u51FA\u652F\u6301\u8303\u56F4\uFF081900-2100\uFF09");
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
  const ganZhiYear = TIAN_GAN[ganIndex] + DI_ZHI[zhiIndex];
  const zodiac = ZODIAC_ANIMALS[zhiIndex];
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
    const monthName = LUNAR_MONTH_NAMES[lunarDate.month - 1];
    return lunarDate.isLeap ? `\u95F0${monthName}\u6708` : `${monthName}\u6708`;
  }
  return LUNAR_DAY_NAMES[lunarDate.day - 1];
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
        text: holiday,
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
 * - ensureYearData(year)：按需取数并缓存（builtin 来源允许一次网络升级）
 * - updateFromNetwork(year)：启动/手动刷新入口
 * ============================================================
 */
var HolidayManager = class {
  constructor() {
    this.cache = /* @__PURE__ */ new Map();
    // 缓存来源：year -> "builtin"（内置静态数据或上次会话存的 holidaysData）| "api"（本会话网络取回）。
    // builtin 来源允许一次网络升级，否则 loadSettings 把 2022-2026 灌入 cache 后，
    // 「API 数据优先于内置」只在真正刷新过一次后才成立（F5）
    this.cacheSources = /* @__PURE__ */ new Map();
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
  async ensureYearData(year, allowUpgrade = true) {
    // 已有本会话网络取回的数据直接返回；builtin 数据仅在 allowUpgrade（启动预取/手动刷新）时
    // 重新获取——浏览触发的按需获取不升级内置年份，避免「默认不联网」变成每次浏览都请求
    if (this.cache.has(year) && (this.cacheSources.get(year) !== "builtin" || !allowUpgrade)) return false;
    // 失败缓存未过期则跳过，避免网络故障时每月导航都重发 8s 请求
    const failedAt = this.failureCache.get(year);
    if (failedAt && Date.now() - failedAt < this.FAILURE_TTL) return false;
    // 复用进行中的 Promise，避免并发重复请求
    const existing = this.fetchingYears.get(year);
    if (existing) return existing;
    const p = (async () => {
      try {
        const apiData = await this.fetchYearFromSources(year);
        if (apiData && apiData.length > 0) {
          this.cache.set(year, apiData);
          this.cacheSources.set(year, "api");
          this.failureCache.delete(year);
          return true;
        } else {
          // API 返回空：记为失败，TTL 后允许重试
          this.failureCache.set(year, Date.now());
        }
      } catch (e) {
        console.warn(`节假日数据：${year} 年 API 调用失败`, e);
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
  async _doFetchOnce(year) {
    const url = `https://timor.tech/api/holiday/year/${year}`;
    // 加 8 秒超时控制，避免 timor.tech 不可达时长时间挂起，
    // 同时确保 fetchingYears 锁能尽快释放，不影响后续获取。
    // 超时覆盖整个 fetch + response.json() 流程，防止响应体停滞时永久挂起。
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8e3);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (json.code !== 0 || !json.holiday) throw new Error("API格式错误");
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
        console.warn(`节假日数据：${year} 年 API 返回了 holiday 字段但未解析出任何有效条目，响应结构可能已变化`, json);
      }
      return holidays.sort((a, b) => a.date.localeCompare(b.date));
    } catch (e) {
      if (e.name === "AbortError") throw new Error(`请求超时（8s）：${year}年节假日数据`);
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
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
      console.warn(`月历任务：holiday-cn 数据源获取 ${year} 年失败，尝试 timor.tech`, e);
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8e3);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (!json || !Array.isArray(json.days)) throw new Error("holiday-cn 数据格式错误");
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
    } catch (e) {
      if (e.name === "AbortError") throw new Error(`请求超时（8s）：${year}年 holiday-cn 数据`);
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
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
   * 更新节假日数据（从网络）
   * 实际使用时可以调用外部API获取最新数据
   */
  async updateFromNetwork(year) {
    try {
      const apiData = await this.fetchYearFromSources(year);
      if (apiData && apiData.length > 0) {
        this.cache.set(year, apiData);
        this.cacheSources.set(year, "api");
        // 成功后清除失败缓存，保持 cache/failureCache 状态一致
        this.failureCache.delete(year);
        return true;
      }
    } catch (e) {
      console.warn(`\u8282\u5047\u65E5\u6570\u636E\uFF1A${year}\u5E74 API\u8C03\u7528\u5931\u8D25`, e);
    }
    return false;
  }
};

var VIEW_TYPE_MONTHLY = "monthly-tasks-view";

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
    return "\u6708\u5386\u4EFB\u52A1";
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
    // 使用自有字段 rootEl，而非覆写 ItemView 基类的 containerEl（视图根元素，含视图头部）：
    // 框架后续经 view.containerEl 操作视图时必须拿到正确元素
    this.rootEl = this.contentEl.createDiv("monthly-tasks-container");
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
    this.rootEl.empty();
  }
  /**
   * 渲染整个视图
   */
  async render() {
    if (this.rootEl.childElementCount === 0) {
      this.renderHeader();
      this.renderWeekdayHeader();
      this.gridEl = this.rootEl.createDiv("calendar-grid");
      this.lastFirstDayOfWeek = this.plugin.settings.firstDayOfWeek;
    } else if (this.lastFirstDayOfWeek !== this.plugin.settings.firstDayOfWeek) {
      // firstDayOfWeek 变更后重建星期表头，避免与网格列错位
      const oldHeader = this.rootEl.querySelector(".weekday-header");
      if (oldHeader) oldHeader.remove();
      this.renderWeekdayHeader();
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
    prevBtn.setAttribute("aria-label", "\u4E0A\u6708");
    prevBtn.addEventListener("click", () => this.navigateMonth(-1));
    const titleEl = this.headerEl.createDiv("month-title");
    titleEl.textContent = getMonthTitle(this.currentYear, this.currentMonth);
    titleEl.addClass("clickable");
    titleEl.setAttribute("title", "\u70B9\u51FB\u5FEB\u901F\u5207\u6362\u65E5\u671F");
    titleEl.addEventListener("click", () => this.openDatePicker());
    const rightGroup = this.headerEl.createDiv("header-btn-group");
    const nextBtn = rightGroup.createDiv("nav-btn next-btn");
    nextBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    nextBtn.setAttribute("aria-label", "\u4E0B\u6708");
    nextBtn.addEventListener("click", () => this.navigateMonth(1));
    const todayBtn = rightGroup.createDiv("today-btn");
    todayBtn.textContent = "\u56DE\u5230\u672C\u6708";
    todayBtn.addEventListener("click", () => this.goToToday());
    const closeBtn = rightGroup.createDiv("nav-btn close-btn");
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    closeBtn.setAttribute("aria-label", "\u5173\u95ED");
    closeBtn.addEventListener("click", () => this.closeView());
  }
  /**
   * 打开日期选择器
   */
  openDatePicker() {
    const modal = new DatePickerModal(this.app, this.currentYear, this.currentMonth, async (year, month) => {
      this.currentYear = year;
      this.currentMonth = month;
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
    const weekdayEl = document.createElement("div");
    weekdayEl.className = "weekday-header";
    const firstDayOfWeek = this.plugin.settings.firstDayOfWeek;
    for (let i = 0; i < 7; i++) {
      const dayEl = weekdayEl.createDiv("weekday-cell");
      const dayIndex = (firstDayOfWeek + i) % 7;
      dayEl.textContent = WEEKDAY_NAMES[dayIndex];
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
  async renderCalendarGrid() {
    // 自增 requestId：快速切换月份时，旧请求完成后会因 requestId 不匹配而丢弃渲染结果
    this.renderRequestId = (this.renderRequestId || 0) + 1;
    const myRequestId = this.renderRequestId;
    const titleEl = this.headerEl.querySelector(".month-title");
    if (titleEl) {
      titleEl.textContent = getMonthTitle(this.currentYear, this.currentMonth);
    }
    this.gridEl.empty();
    const calendar = generateMonthCalendar(this.currentYear, this.currentMonth, this.plugin.settings.firstDayOfWeek);
    // 42 天网格可能跨年（如查看 12 月时下月溢出日期属次年），对所有涉及的年份都按需 ensure，
    // 避免溢出日期无节假日标注
    const yearsToEnsure = /* @__PURE__ */ new Set([this.currentYear]);
    for (const day of calendar.days) {
      yearsToEnsure.add(day.date.getFullYear());
    }
    // 按需获取不阻塞渲染：网格先按现有缓存画出来（浏览到的年份若无缓存数据，
    // 如 2022 年以前、2027 年以后，从数据源拉取该年），取回后若视图仍在本月
    // 仅补刷一次网格。已有内置/缓存数据的年份不发起请求（allowUpgrade=false），
    // 保持「默认不联网」的浏览体验；ensureYearData 返回是否实际取回新数据，
    // 缓存已就绪/获取失败时均为 false，不会触发补刷（无重入循环）
    const ensured = Promise.all(Array.from(yearsToEnsure).map((y) => this.plugin.holidayManager.ensureYearData(y, false)));
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
      console.error("\u52A0\u8F7D\u4EFB\u52A1\u5931\u8D25:", e);
      if (myRequestId !== this.renderRequestId) return;
      this.gridEl.empty();
      const errEl = this.gridEl.createDiv("error-hint");
      errEl.textContent = "\u4EFB\u52A1\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u67E5\u770B\u63A7\u5236\u53F0";
      return;
    }
    if (myRequestId !== this.renderRequestId) return;
    for (const day of calendar.days) {
      const dateStr = formatDate(day.date);
      const tasks = taskMap.taskMap.get(dateStr) || [];
      this.renderDayCell(day, tasks);
    }
  }
  /**
   * 渲染日期格子
   */
  renderDayCell(day, tasks) {
    const cellEl = this.gridEl.createDiv("day-cell");
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
      holidayNameEl.textContent = holidayInfo.name;
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
  renderTaskItem(container, task, dayDate) {
    const taskEl = container.createDiv("task-item");
    if (task.completed && !this.plugin.settings.showCompletedStrike) {
      taskEl.addClass("completed");
    }
    if (task.dueDate && isOverdue(task.dueDate) && !task.completed) {
      taskEl.addClass("overdue");
    }
    taskEl.addClass(`priority-bg-${task.priority}`);
    const multiDay = isMultiDayTask(task);
    const duration = multiDay ? getMultiDayDuration(task) : 1;
    if (multiDay) {
      taskEl.addClass("multi-day-task");
      if (dayDate && task.startDate) {
        const [sy, sm, sd] = task.startDate.split("-").map(Number);
        const start = new Date(sy, sm - 1, sd);
        // DST 切换日 diffTime 可能不是 24 小时整数倍，使用 Math.round 与 getMultiDayDuration 保持一致
        const dayIndex = Math.round((dayDate.getTime() - start.getTime()) / (1e3 * 60 * 60 * 24));
        if (dayIndex === 0) {
          taskEl.addClass("multi-day-start");
        }
        if (formatDate(dayDate) === task.dueDate) {
          taskEl.addClass("multi-day-end");
        }
      }
    }
    const contentEl = taskEl.createDiv("task-content");
    let displayText = task.content;
    if (multiDay) {
      displayText = `${task.content} (${duration}\u5929)`;
    }
    if (task.time) {
      const startTime = task.time.split("~")[0];
      const timeEl = taskEl.createDiv("task-time");
      timeEl.textContent = startTime;
      contentEl.textContent = displayText;
    } else {
      contentEl.textContent = displayText;
    }
    contentEl.setAttribute("title", task.content);
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
            console.error("\u5EF6\u8FDF\u5237\u65B0\u5931\u8D25:", e);
          }
        }, 200);
        this.pendingTimers.add(timerId);
      } else {
        new import_obsidian2.Notice("\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5");
      }
    } finally {
      this.togglingTasks.delete(taskKey);
    }
  }
  /**
   * 打开创建任务弹窗
   */
  openCreateTaskModal(date, existingTasks = []) {
    const modal = new CreateTaskModal(this.app, date, async (content, isAllDay, time, priority, endDate) => {
      const customFolderPath = this.plugin.settings.customTaskFolder || void 0;
      const success = await this.taskParser.createTaskForDate(date, content, isAllDay, time, priority, endDate, customFolderPath);
      if (success) {
        // 任务出现在日历中即反馈，不再弹成功提示；refresh 失败仍有单独提示
        // refresh 失败不应让用户误以为任务创建失败（任务已写入文件），
        // 单独捕获并提示，避免抛错进入 .catch 导致用户重试产生重复任务
        try {
          await this.refresh(true);
        } catch (refreshErr) {
          console.error("\u521B\u5EFA\u540E\u5237\u65B0\u89C6\u56FE\u5931\u8D25:", refreshErr);
          new import_obsidian2.Notice("\u4EFB\u52A1\u5DF2\u521B\u5EFA\uFF0C\u5237\u65B0\u5931\u8D25\u8BF7\u624B\u52A8\u5207\u6362\u6708\u4EFD", 3e3);
        }
      } else {
        // 抛错让 CreateTaskModal 的 .catch 分支接管：保留弹窗、回滚 submitted/disabled 状态，允许用户重试
        throw new Error("createTaskForDate returned false");
      }
    }, this.plugin, existingTasks);
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
    await this.renderCalendarGrid();
  }
  /**
   * 回到今天
   */
  async goToToday() {
    const { year, month } = getCurrentYearMonth();
    this.currentYear = year;
    this.currentMonth = month;
    await this.renderCalendarGrid();
  }
  /**
   * 关闭视图
   */
  async closeView() {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_MONTHLY)[0];
    if (leaf) {
      await leaf.detach();
    }
  }
};

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
    titleEl.textContent = "\u9009\u62E9\u65E5\u671F";
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
    
    const yearLabel = yearSection.createEl("div", { text: "\u5E74\u4EFD" });
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
      text: `\u5F53\u524D\u5E74\u4EFD: ${this.currentYear}`
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
    });
    yearIncBtn.addEventListener("click", () => {
      this.year = Math.min(2100, this.year + 1);
      yearInput.value = String(this.year);
    });
    yearInput.addEventListener("change", () => {
      let val = parseInt(yearInput.value);
      if (isNaN(val)) val = this.currentYear;
      val = Math.max(1900, Math.min(2100, val));
      this.year = val;
      yearInput.value = String(val);
    });
    
    // 月份区域
    const monthSection = contentEl.createDiv("picker-section");
    monthSection.style.marginBottom = "28px";
    
    const monthLabel = monthSection.createEl("div", { text: "\u6708\u4EFD" });
    monthLabel.style.fontSize = "13px";
    monthLabel.style.fontWeight = "600";
    monthLabel.style.color = colors.textMuted;
    monthLabel.style.textAlign = "center";
    monthLabel.style.marginBottom = "16px";
    
    const monthGrid = monthSection.createDiv("month-grid");
    monthGrid.style.display = "grid";
    monthGrid.style.gridTemplateColumns = "repeat(4, 1fr)";
    monthGrid.style.gap = "12px";
    
    const monthNames = ["1\u6708", "2\u6708", "3\u6708", "4\u6708", "5\u6708", "6\u6708", "7\u6708", "8\u6708", "9\u6708", "10\u6708", "11\u6708", "12\u6708"];
    
    for (let m = 0; m < 12; m++) {
      const monthBtn = monthGrid.createEl("button", { text: monthNames[m] });
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
      
      if (this.year === this.currentYear && m === this.currentMonth) {
        // 当前月份（须同年同月）- 蓝色
        monthBtn.style.color = "white";
        monthBtn.style.background = "linear-gradient(135deg, #3b82f6, #2563eb)";
        monthBtn.style.borderColor = "#60a5fa";
        monthBtn.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.2), 0 4px 12px rgba(59, 130, 246, 0.35)";
        monthBtn.style.transform = "scale(1.05)";
      } else if (m === this.month) {
        // 选中月份 - 绿色
        monthBtn.style.color = "white";
        monthBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
        monthBtn.style.borderColor = "#34d399";
        monthBtn.style.boxShadow = "0 0 0 3px rgba(16, 185, 129, 0.2), 0 4px 12px rgba(16, 185, 129, 0.35)";
        monthBtn.style.transform = "scale(1.05)";
      } else {
        // 普通月份
        monthBtn.style.color = colors.text;
        monthBtn.style.background = colors.wrapperBg;
      }
      
      monthBtn.addEventListener("mouseenter", () => {
        if (m !== this.currentMonth && m !== this.month) {
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
        // 重置所有按钮
        monthGrid.querySelectorAll("button").forEach((btn, idx) => {
          btn.style.color = colors.text;
          btn.style.background = colors.wrapperBg;
          btn.style.borderColor = "transparent";
          btn.style.boxShadow = "none";
          btn.style.transform = "none";
          // 如果是当前月份（须同年），恢复蓝色
          if (this.year === this.currentYear && idx === this.currentMonth) {
            btn.style.color = "white";
            btn.style.background = "linear-gradient(135deg, #3b82f6, #2563eb)";
            btn.style.borderColor = "#60a5fa";
            btn.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.2), 0 4px 12px rgba(59, 130, 246, 0.35)";
            btn.style.transform = "scale(1.05)";
          }
        });
        
        // 设置选中样式 - 绿色
        monthBtn.style.color = "white";
        monthBtn.style.background = "linear-gradient(135deg, #10b981, #059669)";
        monthBtn.style.borderColor = "#34d399";
        monthBtn.style.boxShadow = "0 0 0 3px rgba(16, 185, 129, 0.2), 0 4px 12px rgba(16, 185, 129, 0.35)";
        monthBtn.style.transform = "scale(1.05)";
        this.month = m;
      });
    }
    
    // 按钮组
    const btnGroup = contentEl.createDiv("modal-buttons");
    btnGroup.style.display = "flex";
    btnGroup.style.gap = "16px";
    btnGroup.style.justifyContent = "center";
    btnGroup.style.marginTop = "8px";
    
    const cancelBtn = btnGroup.createEl("button", { text: "\u53D6\u6D88" });
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
    
    const confirmBtn = btnGroup.createEl("button", { text: "\u786E\u5B9A" });
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
var CreateTaskModal = class extends import_obsidian3.Modal {
  constructor(app, date, onSubmit, plugin, existingTasks = []) {
    super(app);
    this.app = app;
    this.date = date;
    // 日期选择器的全局 click 关闭处理器，需在 close() 中清理避免泄漏
    this.datePickerCloseHandler = null;
    this.onSubmit = onSubmit;
    this.plugin = plugin;
    this.existingTasks = existingTasks;
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
      // （真机调试确认：X 类名不含 "close"，按结构精确移除，与 DatePickerModal 的 sweepChrome 同口径；
      //  不用类名正则启发式扫描，避免未来弹窗内容新增含 close/header 字样的类名被误删）
      this.containerEl.querySelectorAll(".modal-header-button, .modal-header, .modal-title, .modal-content, .modal-close-button").forEach((el) => el.remove());
    };
    killCloseBtns();
    requestAnimationFrame(killCloseBtns);
    setTimeout(killCloseBtns, 100);
    setTimeout(killCloseBtns, 500);
    // 框架在移动端会给 .modal 预留内边距，弹窗内容自带留白，归零以复用原设计的间距
    this.modalEl.style.padding = "0";
    const dateInfoEl = this.modalEl.createDiv("modal-date-info");
    const weekday = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"][this.date.getDay()];
    const holidayInfo = this.plugin.holidayManager.getHolidayInfo(this.date);
    // 用 createEl + textContent 构建子节点，避免 holidayInfo.name（来自第三方 API / 用户可编辑数据）造成 XSS
    const dateMainEl = dateInfoEl.createDiv("date-main");
    dateMainEl.textContent = `${this.date.getMonth() + 1}\u6708${this.date.getDate()}\u65E5 \xB7 ${weekday}`;
    if (holidayInfo) {
      dateMainEl.createSpan({ text: ` \xB7 ${holidayInfo.name}` });
    }
    if (this.existingTasks.length > 0) {
      const existingTasksEl = this.modalEl.createDiv("modal-existing-tasks");
      const titleRow = existingTasksEl.createDiv("existing-tasks-title-row");
      titleRow.createEl("div", { cls: "existing-tasks-title", text: `\u8BE5\u65E5\u5DF2\u6709 ${this.existingTasks.length} \u4E2A\u4EFB\u52A1` });
      const tasksListEl = existingTasksEl.createDiv("existing-tasks-list");
      const LIMIT = 5;
      let showAll = false;
      const renderTasks = () => {
        tasksListEl.empty();
        const toShow = showAll ? this.existingTasks : this.existingTasks.slice(0, LIMIT);
        toShow.forEach((task) => {
          const taskEl = tasksListEl.createDiv("existing-task-item");
          if (task.completed && !this.plugin.settings.showCompletedStrike) taskEl.addClass("completed");
          if (task.priority > 0) taskEl.addClass(`priority-${task.priority}`);
          // 勾选框
          const checkboxEl = taskEl.createEl("input", { cls: "task-check-icon", attr: { type: "checkbox", "aria-label": "\u5207\u6362\u5B8C\u6210\u72B6\u6001" } });
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
                new import_obsidian3.Notice("\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BE5\u4EFB\u52A1\u53EF\u80FD\u5DF2\u88AB\u4FEE\u6539\uFF0C\u5C06\u5237\u65B0\u5217\u8868");
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
              if (task.completed && !this.plugin.settings.showCompletedStrike) taskEl.addClass("completed");
              else taskEl.removeClass("completed");
            } finally {
              checkboxEl.disabled = false;
            }
          });
          // 任务文字
          const textEl = taskEl.createEl("span", { cls: "task-text", text: task.content });
          // 操作按钮区域
          const actionsEl = taskEl.createDiv("task-item-actions");
          // 跳转按钮
          const gotoBtn = actionsEl.createEl("button", { cls: "task-action-btn task-goto-btn", attr: { title: "\u8DF3\u8F6C\u5230\u6587\u6863" } });
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
          const deleteBtn = actionsEl.createEl("button", { cls: "task-action-btn task-delete-btn", attr: { title: "\u5220\u9664\u4EFB\u52A1" } });
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
                if (titleEl2) titleEl2.textContent = `\u8BE5\u65E5\u5DF2\u6709 ${this.existingTasks.length} \u4E2A\u4EFB\u52A1`;
                renderTasks();
              } else {
                deleteBtn.disabled = false;
              }
            }).catch((err) => {
              console.error("\u5220\u9664\u4EFB\u52A1\u5931\u8D25:", err);
              deleteBtn.disabled = false;
            });
          });
        });
        // 展开/收起
        if (this.existingTasks.length > LIMIT) {
          const moreEl = tasksListEl.createDiv("existing-tasks-more");
          moreEl.textContent = showAll ? `\u6536\u8D77` : `\u67E5\u770B\u5168\u90E8 ${this.existingTasks.length} \u4E2A\u4EFB\u52A1 \u25BE`;
          moreEl.addEventListener("click", () => {
            showAll = !showAll;
            renderTasks();
          });
        }
      };
      renderTasks();
    }

    const inputWrapper = this.modalEl.createDiv("task-input-wrapper");
    const inputEl = inputWrapper.createEl("input", {
      cls: "task-input",
      attr: {
        type: "text",
        placeholder: "\u8F93\u5165\u4EFB\u52A1\u5185\u5BB9..."
      }
    });
    let startTimeEl = null;
    let endTimeEl = null;
    let isAllDay = this.plugin.settings.defaultAllDayTask;
    if (!this.plugin.settings.defaultAllDayTask) {
      // 计算默认时间：系统时间取整到下一小时（跨 24 点回绕），结束时间+4小时
      // 结束时间跨午夜时截断到 23:59，避免生成 "22:00~02:00" 被结束时间校验拒绝
      const now = new Date();
      const defaultStartHour = (now.getMinutes() > 0 ? now.getHours() + 1 : now.getHours()) % 24;
      const startPlus4 = defaultStartHour + 4;
      const defaultEndHour = startPlus4 > 23 ? 23 : startPlus4;
      const defaultEndMinute = startPlus4 > 23 ? 59 : 0;
      const defaultStartHourStr = String(defaultStartHour).padStart(2, "0");
      const defaultEndHourStr = String(defaultEndHour).padStart(2, "0");
      const defaultEndMinuteStr = String(defaultEndMinute).padStart(2, "0");
      const timeContainer = this.modalEl.createDiv("modal-time-container");
      timeContainer.createEl("span", { cls: "time-label", text: "\u65F6\u95F4" });
      const timeWrapper = timeContainer.createDiv("time-input-wrapper");
      // 原生时间输入框
      startTimeEl = timeWrapper.createEl("input", { type: "time", cls: "time-native-input" });
      const defaultStartTime = `${defaultStartHourStr}:00`;
      startTimeEl.value = defaultStartTime;
      timeWrapper.createEl("span", { cls: "time-separator", text: "\u81F3" });
      endTimeEl = timeWrapper.createEl("input", { type: "time", cls: "time-native-input" });
      const defaultEndTime = `${defaultEndHourStr}:${defaultEndMinuteStr}`;
      endTimeEl.value = defaultEndTime;
      const allDayToggle = timeContainer.createDiv("all-day-toggle");
      const allDayCheckbox = allDayToggle.createEl("input", { attr: { type: "checkbox", "aria-label": "\u5168\u5929" } });
      allDayToggle.createEl("span", { text: "\u5168\u5929" });
      allDayCheckbox.addEventListener("change", (e) => {
        isAllDay = e.target.checked;
        startTimeEl.disabled = isAllDay;
        endTimeEl.disabled = isAllDay;
        startTimeEl.style.opacity = isAllDay ? "0.4" : "1";
        endTimeEl.style.opacity = isAllDay ? "0.4" : "1";
      });
    }
    const endDateContainer = this.modalEl.createDiv("modal-end-date");
    endDateContainer.createEl("span", { cls: "end-date-label", text: "\u7ED3\u675F\u65E5\u671F" });
    const endDateWrapper = endDateContainer.createDiv("end-date-wrapper");
    let endDate = void 0;
    let isMultiDay = false;
    const multiDayToggle = endDateWrapper.createDiv("multi-day-toggle");
    const multiDayCheckbox = multiDayToggle.createEl("input", { attr: { type: "checkbox", "aria-label": "\u8DE8\u5929\u4EFB\u52A1" } });
    multiDayToggle.createEl("span", { text: "\u8DE8\u5929\u4EFB\u52A1" });
    // 自定义日期选择器触发按钮
    const endDateTrigger = endDateWrapper.createEl("div", { cls: "end-date-trigger", text: "\u8BF7\u9009\u62E9\u65E5\u671F" });
    endDateTrigger.style.display = "none";
    let pickerYear = this.date.getFullYear();
    let pickerMonth = this.date.getMonth();
    function formatDisplayDate(y, m, d) {
      return `${y}\u5E74${m + 1}\u6708${d}\u65E5`;
    }
    // 更新日期网格（年月切换时调用，不重建弹出层）
    function updateGrid(popup) {
      const existingGrid = popup.querySelector(".date-picker-grid");
      if (existingGrid) existingGrid.remove();
      const grid = popup.createDiv("date-picker-grid");
      const firstDay = new Date(pickerYear, pickerMonth, 1).getDay();
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
            new import_obsidian3.Notice("\u7ED3\u675F\u65E5\u671F\u4E0D\u80FD\u65E9\u4E8E\u5F00\u59CB\u65E5\u671F", 3e3);
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
            opt.text = `${y}\u5E74`;
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
        const opt = yearSelect.createEl("option", { value: String(y), text: `${y}\u5E74` });
        if (y === pickerYear) opt.selected = true;
      }
      for (let m = 0; m < 12; m++) {
        const opt = monthSelect.createEl("option", { value: String(m), text: `${m + 1}\u6708` });
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
      // 星期标题
      const weekRow = popup.createDiv("date-picker-week");
      ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"].forEach(d => {
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
    endDateTrigger.addEventListener("click", (e) => { e.stopPropagation(); renderDatePicker(); });
    multiDayCheckbox.addEventListener("change", (e) => {
      isMultiDay = e.target.checked;
      endDateTrigger.style.display = isMultiDay ? "flex" : "none";
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
    priorityContainer.createEl("span", { cls: "priority-label", text: "\u4F18\u5148\u7EA7" });
    const priorityGroup = priorityContainer.createDiv("priority-group");
    const priorities = [
      { value: 3, class: "priority-high", label: "\u9AD8" },
      { value: 2, class: "priority-medium", label: "\u4E2D" },
      { value: 0, class: "priority-none", label: "\u666E\u901A" }
    ];
    let selectedPriority = 0;
    const priorityWrappers = [];
    priorities.forEach((p, index) => {
      const wrapper = priorityGroup.createDiv("priority-btn-wrapper");
      if (p.value === 0)
        wrapper.addClass("selected");
      const btn = wrapper.createEl("button", {
        cls: `priority-btn ${p.class} ${p.value === 0 ? "selected" : ""}`,
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
    const btnGroup = this.modalEl.createDiv("modal-buttons");
    const cancelBtn = btnGroup.createEl("button", {
      cls: "btn-cancel",
      text: "\u53D6\u6D88"
    });
    cancelBtn.addEventListener("click", () => this.close());
    const confirmBtn = btnGroup.createEl("button", {
      cls: "btn-confirm",
      text: "\u6DFB\u52A0\u4EFB\u52A1"
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
      if (!content) {
        // 剥离后内容为空（如用户只输入了 emoji 标记），提示用户而非静默返回
        new import_obsidian3.Notice("\u4EFB\u52A1\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A\uFF08\u5143\u6570\u636E\u6807\u8BB0\u5DF2\u88AB\u81EA\u52A8\u5265\u79BB\uFF09", 3e3);
        inputEl.focus();
        return;
      }
      if (content) {
        let time = void 0;
        if (!isAllDay && startTimeEl && endTimeEl) {
          const s = startTimeEl.value;
          const e = endTimeEl.value;
          // 校验结束时间晚于开始时间（字符串比较适用于 HH:MM 格式）
          if (s && e && e <= s) {
            new import_obsidian3.Notice("\u7ED3\u675F\u65F6\u95F4\u987B\u665A\u4E8E\u5F00\u59CB\u65F6\u95F4", 3e3);
            return;
          }
          // 校验只填了开始或结束时间（半填），避免写入 "⏰ ~12:00" / "⏰ 09:00~" 破坏解析与排序
          if ((s && !e) || (!s && e)) {
            new import_obsidian3.Notice("\u8BF7\u540C\u65F6\u586B\u5199\u5F00\u59CB\u4E0E\u7ED3\u675F\u65F6\u95F4", 3e3);
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
        Promise.resolve(this.onSubmit(content, isAllDay, time, selectedPriority, endDate)).then(() => {
          this.close();
        }).catch((err) => {
          console.error("\u521B\u5EFA\u4EFB\u52A1\u5931\u8D25:", err);
          new import_obsidian3.Notice("\u521B\u5EFA\u4EFB\u52A1\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5", 3e3);
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
  /**
   * 格式化日期为 YYYY-MM-DD 格式（用于日期输入框）
   * @param date - 日期对象
   * @returns YYYY-MM-DD 格式的日期字符串
   */
  formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
};


/**
 * 默认设置配置
 * @property {boolean} showCompletedTasks - 是否显示已完成任务
 * @property {boolean} showCompletedStrike - 是否隐藏已完成任务的删除线（true=隐藏，对应设置项「已完成隐藏删除线」；为 false 时才加 .completed 删除线样式）
 * @property {boolean} defaultAllDayTask - 新建任务默认是否为全天任务
 * @property {number} firstDayOfWeek - 每周第一天（0=周日，1=周一）
 * @property {boolean} showLunar - 是否显示农历
 * @property {boolean} showHoliday - 是否显示节假日标注
 * @property {number} tasksPerDayLimit - 每日显示任务数量上限
 * @property {string} customTaskFolder - 自定义任务文件夹路径（为空则使用默认"任务"）
 * @property {boolean} autoUpdateHolidays - 启用时是否自动刷新节假日数据（数据源：holiday-cn → timor.tech；默认关闭，涉及第三方请求）
 * @property {Object} holidaysData - 节假日数据缓存（按年份存储）
 */
var DEFAULT_SETTINGS = {
  showCompletedTasks: true,
  showCompletedStrike: true,
  defaultAllDayTask: true,
  firstDayOfWeek: 0,
  showLunar: true,
  showHoliday: true,
  tasksPerDayLimit: 5,
  customTaskFolder: "",
  autoUpdateHolidays: false,
  holidaysData: {}
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
          new import_obsidian3.Notice("\u8282\u5047\u65E5\u6570\u636E\u81EA\u52A8\u5237\u65B0\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u6216\u5728\u8BBE\u7F6E\u4E2D\u624B\u52A8\u5237\u65B0", 5e3);
        }
      })();
    }
    this.taskParser = new TaskParser(this.app);
    this.registerView(
      VIEW_TYPE_MONTHLY,
      (leaf) => new MonthlyView(leaf, this.taskParser, this)
    );
    this.addRibbonIcon("calendar", "\u6708\u5386\u4EFB\u52A1", () => {
      this.activateView();
    });
    this.addCommand({
      id: "open-monthly-view",
      name: "\u6253\u5F00\u6708\u5386\u4EFB\u52A1\u89C6\u56FE",
      callback: () => this.activateView()
    });
    this.addCommand({
      id: "refresh-monthly-view",
      name: "\u5237\u65B0\u6708\u5386\u4EFB\u52A1\u89C6\u56FE",
      callback: () => this.refreshView()
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
    // 监听文件创建
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof import_obsidian3.TFile && file.extension === "md" && this.isPossibleTaskFile(file)) {
          debouncedRefresh();
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
    // 同样清理仍打开的 DatePickerModal（月份导航弹窗）：其 onClose 只清空 contentEl，
    // 不关闭的话卸载后会短暂残留一个可交互但已失联的日期弹窗
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
   * 3. 文件名形如 YYYY-MM-DD.md 或包含 YYYY年任务列表.md
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
    return false;
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
      console.error("设置加载失败，使用默认设置:", e);
      new import_obsidian3.Notice("\u8BBE\u7F6E\u52A0\u8F7D\u5931\u8D25\uFF0C\u5DF2\u56DE\u9000\u9ED8\u8BA4\u8BBE\u7F6E", 5e3);
      loadedData = {};
    }
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
    // 校验设置字段：用户手动编辑 data.json 可能写入越界值/错误类型，导致渲染异常
    for (const key of ["showCompletedTasks", "showCompletedStrike", "defaultAllDayTask", "showLunar", "showHoliday", "autoUpdateHolidays"]) {
      if (typeof this.settings[key] !== "boolean") {
        this.settings[key] = DEFAULT_SETTINGS[key];
      }
    }
    // tasksPerDayLimit < 1 会让所有任务进入 +N 列表而格子无内容
    if (typeof this.settings.tasksPerDayLimit !== "number" || this.settings.tasksPerDayLimit < 1) {
      this.settings.tasksPerDayLimit = 5;
    }
    // firstDayOfWeek 仅接受 0(日)/1(一)/6(六)，其余值会导致星期行与网格错位
    if (![0, 1, 6].includes(this.settings.firstDayOfWeek)) {
      this.settings.firstDayOfWeek = 0;
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
        const holidays = this.settings.holidaysData[year];
        if (!Array.isArray(holidays) || !holidays.every((h) => h && typeof h.date === "string")) {
          delete this.settings.holidaysData[year];
          console.warn(`月历任务：holidaysData 中 ${year} 年的数据格式非法，已忽略`);
        }
      }
    }
    if (this.settings.holidaysData) {
      for (const [year, holidays] of Object.entries(this.settings.holidaysData)) {
        if (!this.holidayManager.cache.has(parseInt(year))) {
          this.holidayManager.cache.set(parseInt(year), holidays);
          // 存量数据可能是旧会话保存的过期 API 数据，标为 builtin 允许本会话升级一次
          this.holidayManager.cacheSources.set(parseInt(year), "builtin");
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
          console.warn(`月历任务：holidays.json 中 ${year} 年的数据格式非法，已忽略`);
          continue;
        }
        if (!this.holidayManager.cache.has(y)) {
          this.holidayManager.cache.set(y, holidays);
          this.holidayManager.cacheSources.set(y, "builtin");
        }
      }
    } catch (e) {
      console.warn("月历任务：内置节假日数据读取失败（holidays.json 缺失或损坏），对应年份将依赖网络数据源", e);
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
      console.error("设置保存失败:", e);
      new import_obsidian3.Notice("设置保存失败，请检查磁盘空间与文件权限", 5e3);
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
      new import_obsidian3.Notice("\u6708\u5386\u4EFB\u52A1\uFF1A\u65E0\u6CD5\u6253\u5F00\u89C6\u56FE\uFF0C\u8BF7\u91CD\u542F Obsidian \u540E\u91CD\u8BD5", 3e3);
    }
  }
  /**
   * 刷新视图
   */
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
    // 使用提示（新用户引导）：核心交互不读 README 也能在设置页看到；附带版本标记便于排查文件同步
    const tips = containerEl.createDiv("mt-settings-tips");
    tips.createEl("h3", { text: "使用提示" });
    const tipList = tips.createEl("ul");
    for (const tip of [
      "点击日期格子添加任务；点击格子里的任务切换完成 / 未完成",
      "点击顶部月份标题可快速跳转年月，「回到本月」一键返回今天",
      "任务保存在「任务/YYYY年任务列表.md」，可直接手动编辑，月历自动同步",
      "编辑弹窗可通过取消按钮、ESC、点击遮罩或移动端系统返回键关闭",
    ]) {
      tipList.createEl("li", { text: tip });
    }
    // 显示设置
    containerEl.createEl("h3", { text: "显示" });
    new import_obsidian3.Setting(containerEl).setName("显示已完成任务").setDesc("在月历中显示已完成的任务").addToggle((toggle) => toggle.setValue(this.plugin.settings.showCompletedTasks).onChange(async (value) => {
      this.plugin.settings.showCompletedTasks = value;
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    new import_obsidian3.Setting(containerEl).setName("已完成隐藏删除线").setDesc("打开后已完成任务将隐藏删除线").addToggle((toggle) => toggle.setValue(this.plugin.settings.showCompletedStrike).onChange(async (value) => {
      this.plugin.settings.showCompletedStrike = value;
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    new import_obsidian3.Setting(containerEl).setName("显示农历").setDesc("在日期下方显示农历日期和节气").addToggle((toggle) => toggle.setValue(this.plugin.settings.showLunar).onChange(async (value) => {
      this.plugin.settings.showLunar = value;
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    new import_obsidian3.Setting(containerEl).setName("显示节假日").setDesc("标注法定节假日和调休信息").addToggle((toggle) => toggle.setValue(this.plugin.settings.showHoliday).onChange(async (value) => {
      this.plugin.settings.showHoliday = value;
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    // 任务与存储设置
    containerEl.createEl("h3", { text: "任务与存储" });
    new import_obsidian3.Setting(containerEl).setName("默认全天任务").setDesc("新建任务时默认为全天任务（不带具体时间）").addToggle((toggle) => toggle.setValue(this.plugin.settings.defaultAllDayTask).onChange(async (value) => {
      this.plugin.settings.defaultAllDayTask = value;
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    new import_obsidian3.Setting(containerEl).setName("每周第一天").setDesc("设置日历每周的起始日").addDropdown((dropdown) => dropdown.addOption("0", "周日").addOption("1", "周一").addOption("6", "周六").setValue(String(this.plugin.settings.firstDayOfWeek)).onChange(async (value) => {
      this.plugin.settings.firstDayOfWeek = parseInt(value);
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    new import_obsidian3.Setting(containerEl).setName("每日任务显示数量").setDesc("每个日期格子最多显示的任务数量").addDropdown((dropdown) => dropdown.addOption("3", "3").addOption("4", "4").addOption("5", "5").addOption("6", "6").addOption("7", "7").addOption("8", "8").addOption("9", "9").addOption("10", "10").setValue(String(this.plugin.settings.tasksPerDayLimit)).onChange(async (value) => {
      this.plugin.settings.tasksPerDayLimit = parseInt(value);
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    // 自定义任务文件夹设置
    const folderOptions = this.getFolderOptions();
    new import_obsidian3.Setting(containerEl).setName("任务文件夹").setDesc("选择任务文件的存储位置。如果已有年度任务文件，插件会优先使用它。").addDropdown((dropdown) => {
      dropdown.addOption("", "默认（任务）");
      for (const [path, name] of Object.entries(folderOptions)) {
        dropdown.addOption(path, name);
      }
      dropdown.setValue(this.plugin.settings.customTaskFolder);
      dropdown.onChange(async (value) => {
        this.plugin.settings.customTaskFolder = value;
        await this.plugin.saveSettings();
        // 清除缓存，以便下次创建任务时重新查找
        this.plugin.taskParser.invalidateCache();
      });
    });
    // 节假日数据设置
    containerEl.createEl("h3", { text: "节假日数据" });
    new import_obsidian3.Setting(containerEl).setName("启动时自动刷新节假日").setDesc("启动时预取今年前后三年的节假日数据（数据源：holiday-cn → timor.tech）；浏览其他年份时也会按需获取缺失年份的数据").addToggle((toggle) => toggle.setValue(this.plugin.settings.autoUpdateHolidays).onChange(async (value) => {
      this.plugin.settings.autoUpdateHolidays = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian3.Setting(containerEl).setName("刷新节假日数据").setDesc("从 holiday-cn / timor.tech 数据源获取最新节假日数据").addButton((button) => {
      button.setButtonText("刷新");
      button.buttonEl.addEventListener("click", async () => {
        const currentYear = new Date().getFullYear();
        button.setDisabled(true);
        button.setButtonText("加载中...");
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
              new import_obsidian3.Notice(`节假日数据已刷新（${results.length - failedCount}/${results.length} 年成功）`, 3e3);
            } else {
              new import_obsidian3.Notice("节假日数据已刷新！", 3e3);
            }
          } else {
            new import_obsidian3.Notice("刷新节假日数据失败，请检查网络", 5e3);
          }
        } catch (e) {
          console.warn("刷新节假日数据失败:", e);
          new import_obsidian3.Notice("刷新节假日数据失败，请检查网络", 5e3);
        } finally {
          button.setDisabled(false);
          button.setButtonText("刷新");
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
