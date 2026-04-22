/*
 * ============================================================
 * 月历任务插件 (Monthly Tasks Plugin)
 * ============================================================
 *
 * 插件功能：滴答清单风格的月视图任务管理，支持农历、节假日和调休显示
 * 版本：1.2.4
 * 作者：duany
 * 许可证：MIT
 *
 * 功能特性：
 *   ✨ 月视图日历展示 - 6周网格布局，清晰展示每月任务
 *   🌙 农历显示 - 支持中国传统农历日期
 *   🎉 节假日标注 - 自动识别法定节假日和调休日
 *   📝 任务管理 - 快速创建、完成、删除任务
 *   🎨 多优先级 - 高/中/普通三个优先级
 *   📅 跨天任务 - 支持多日任务横条展示
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
 *    - 缓存管理：getAllTasks, invalidateCache
 *    - 文件操作：createTask, createTaskForDate, getOrCreateDefaultTaskFile
 *    - 任务搜索：findDailyNotePath
 *
 * 3. Calendar
 *    - 生成月历网格数据（6周42天）
 *    - 工具函数：getDaysInMonth, getFirstDayOfMonth, generateCalendarGrid
 *    - 日期工具：isSameDay, isToday, isWeekend
 *
 * 4. LunarCalendar
 *    - 农历转换（内置1900-2100年数据）
 *    - 工具函数：convertToLunar, getLunarMonthName, getLunarDayName
 *
 * 5. HolidayManager
 *    - 节假日管理（内置2022-2027数据 + API混合方案）
 *    - 工具函数：isHoliday, isWeekend, getHolidayType
 *    - API获取：fetchHolidays（使用 timor.tech API）
 *
 * 6. MonthlyView
 *    - 月历视图渲染
 *    - 视图管理：onOpen, onClose, refreshView
 *    - 交互处理：openCreateTaskModal, openDatePicker
 *    - 渲染函数：renderCalendar, renderDayCell, renderTaskItem
 *
 * 7. DatePickerModal
 *    - 日期选择器弹窗
 *    - 月份导航：prevMonth, nextMonth, goToToday
 *    - 渲染：renderCalendar, renderDayCell, selectDate
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

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MonthlyTasksPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/TaskParser.ts
var import_obsidian = require("obsidian");

// src/TaskModel.ts
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

/**
 * 清理任务内容，移除所有元数据标记
 * 保留任务的核心文本内容
 * @param rawLine - 原始任务行
 * @returns 清理后的纯文本内容
 */
function cleanTaskContent(rawLine) {
  return rawLine.replace(/^\s*- \[[ x]\]\s*/i, "").replace(/📅\s*\d{4}-\d{2}-\d{2}/g, "").replace(/⏳\s*\d{4}-\d{2}-\d{2}/g, "").replace(/🛫\s*\d{4}-\d{2}-\d{2}/g, "").replace(/⏰[^\n📅🛫]*/g, "").replace(/🔴|🟡/g, "").trim();
}

/**
 * 提取截止日期（📅标记）
 * @param rawLine - 原始任务行
 * @returns 日期字符串 YYYY-MM-DD 或 undefined
 */
function extractDueDate(rawLine) {
  const match = rawLine.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : void 0;
}

/**
 * 提取开始日期（🛫标记）- 用于跨天任务
 * @param rawLine - 原始任务行
 * @returns 日期字符串 YYYY-MM-DD 或 undefined
 */
function extractStartDate(rawLine) {
  const match = rawLine.match(/🛫\s*(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : void 0;
}

/**
 * 提取时间信息（⏰标记）
 * @param rawLine - 原始任务行
 * @returns 时间字符串或 undefined
 */
function extractTime(rawLine) {
  const match = rawLine.match(/⏰\s*([^\s📅🛫]+)/);
  return match ? match[1].trim() : void 0;
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

/**
 * 将任务列表按日期分组
 * @param tasks - 任务数组
 * @returns Map<日期, 任务数组>
 */
function groupTasksByDate(tasks) {
  const map = /* @__PURE__ */ new Map();
  for (const task of tasks) {
    if (!task.dueDate)
      continue;
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
function isMultiDayTask(task) {
  return !!task.startDate && task.startDate !== task.dueDate;
}
function getMultiDayDuration(task) {
  if (!isMultiDayTask(task))
    return 1;
  const start = new Date(task.startDate);
  const end = new Date(task.dueDate);
  const diffTime = end.getTime() - start.getTime();
  return Math.ceil(diffTime / (1e3 * 60 * 60 * 24)) + 1;
}
function isOverdue(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(dateStr);
  checkDate.setHours(0, 0, 0, 0);
  return checkDate < today;
}

/**
 * ============================================================
 * TaskParser - 任务解析器
 * ============================================================
 * 负责解析Obsidian库中的任务，管理缓存，提供创建任务功能
 * 
 * 主要功能：
 * - getAllTasks()：获取所有任务（带5秒缓存）
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
// src/TaskParser.ts
var TaskParser = class {
  // 5秒缓存
  constructor(app) {
    this.cache = null;
    this.lastParseTime = 0;
    this.CACHE_DURATION = 5e3;
    this.app = app;
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
      const fileTasks = await this.parseFile(file);
      tasks.push(...fileTasks);
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
    if (!cache || !cache.listItems) {
      return tasks;
    }
    const content = await this.app.vault.cachedRead(file);
    const lines = content.split("\n");
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
    const time = extractTime(line);
    const content = cleanTaskContent(line);
    if (!content)
      return null;
    return {
      id: generateTaskId(filePath, lineNumber),
      content,
      rawLine: line,
      filePath,
      lineNumber,
      completed: isTaskCompleted(line),
      startDate: extractStartDate(line),
      dueDate,
      time,
      priority: parsePriority(line),
      createdAt: Date.now()
    };
  }
  /**
   * 获取指定日期的任务
   */
  async getTasksByDate(dateStr, forceRefresh = false) {
    const result = await this.parseAllTasks(forceRefresh);
    return result.taskMap.get(dateStr) || [];
  }
  /**
   * 获取指定日期范围的任务
   */
  async getTasksByDateRange(startDate, endDate) {
    const result = await this.parseAllTasks();
    const filteredMap = /* @__PURE__ */ new Map();
    for (const [dateStr, tasks] of result.taskMap) {
      if (dateStr >= startDate && dateStr <= endDate) {
        filteredMap.set(dateStr, tasks);
      }
    }
    return filteredMap;
  }
  /**
   * 切换任务完成状态
   */
  async toggleTask(task) {
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
      let newLine;
      if (isTaskCompleted(line)) {
        newLine = line.replace(/- \[[xX]\]/, "- [ ]");
      } else {
        newLine = line.replace(/- \[ \]/, "- [x]");
      }
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
    try {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!(file instanceof import_obsidian.TFile)) {
        console.error(`\u6587\u4EF6\u4E0D\u5B58\u5728: ${filePath}`);
        return false;
      }
      let fileContent = await this.app.vault.read(file);
      // 任务格式：内容 + [优先级emoji] + 🛫 开始日期 + ⏰ 时间 + 📅 结束日期
      let priorityMarker = priority === 3 ? "\u{1F534} " : priority === 2 ? "\u{1F7E1} " : "";
      let dateMarker = startDate && startDate !== dueDate
        ? `\u{1F6EB} ${startDate} `
        : "";
      let timeMarker = time && !isAllDay ? `\u23F0 ${time} ` : "";
      let taskLine = `- [ ] ${content} ${priorityMarker}${dateMarker}${timeMarker}\u{1F4C5} ${dueDate}`;
      if (dueDate) {
        const [y, m] = dueDate.split("-");
        const monthSection = `## ${y}\u5E74${m}\u6708`;
        // 查找月份section位置
        const sectionIdx = fileContent.indexOf(monthSection);
        if (sectionIdx === -1) {
          // 月份section不存在，需要创建
          // 找到所有月份section的位置
          const monthRegex = /## (\d{4})\u5E74(\d{1,2})\u6708/g;
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
          // 在该位置前插入新月份section（不留空行）
          const newSection = `\n---\n\n${monthSection}\n\n${taskLine}\n`;
          fileContent = fileContent.slice(0, insertPos) + newSection + fileContent.slice(insertPos);
        } else {
          // 月份section已存在，按日期时间排序插入
          const afterSection = fileContent.slice(sectionIdx);
          const nextSep = afterSection.indexOf("\n---\n");
          const sectionEnd = nextSep > 0 ? sectionIdx + nextSep : fileContent.length;
          const sectionContent = fileContent.slice(sectionIdx, sectionEnd);
          const newTime = time && !isAllDay ? time.split("~")[0] : null;
          // 在section内找到第一个日期大于新日期的行，在其前面插入
          const lines = sectionContent.split("\n");
          let insertIdx = lines.length;
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line.startsWith("- [")) continue;
            const dueMatch = line.match(/📅\s*(\S+)/);
            if (!dueMatch) continue;
            const due = dueMatch[1];
            if (due > dueDate) {
              insertIdx = i;
              break;
            }
            if (due === dueDate) {
              const timeMatch = line.match(/⏰\s*(\S+)/);
              const taskTime = timeMatch ? timeMatch[1].split("~")[0] : null;
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
          lines.splice(insertIdx, 0, taskLine);
          fileContent = fileContent.slice(0, sectionIdx) + lines.join("\n") + fileContent.slice(sectionEnd);
        }
      } else {
        fileContent = fileContent + "\n" + taskLine + "\n";
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
  async createTaskForDate(date, content, isAllDay = true, time, priority, endDate) {
    const dateStr = this.formatDate(date);
    const endDateStr = endDate ? this.formatDate(endDate) : dateStr;
    const dailyNotePath = this.findDailyNotePath(date);
    if (dailyNotePath) {
      return this.createTask(dailyNotePath, content, endDateStr, isAllDay, time, priority, dateStr);
    }
    const defaultFile = await this.getOrCreateDefaultTaskFile(date);
    if (defaultFile) {
      return this.createTask(defaultFile, content, endDateStr, isAllDay, time, priority, dateStr);
    }
    return false;
  }
  /**
   * 查找日记文件路径
   */
  findDailyNotePath(date) {
    const formats = [
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}.md`,
      `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}.md`,
      `\u65E5\u8BB0/${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}.md`,
      `Daily/${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}.md`
    ];
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
   */
  async getOrCreateDefaultTaskFile(date) {
    const now = date || new Date();
    const year = String(now.getFullYear());
    const folderPath = `\u4EFB\u52A1`;
    const filePath = `${folderPath}/${year}\u5E74\u4EFB\u52A1\u5217\u8868.md`;
    let file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof import_obsidian.TFile) {
      return filePath;
    }
    try {
      await this.ensureFolderExists(folderPath);
      const initialContent = `# ${year}\u5E74\u4EFB\u52A1\u5217\u8868

> \u7531\u300C\u6708\u5386\u4EFB\u52A1\u300D\u63D2\u4EF6\u81EA\u52A8\u521B\u5EFA\u3002

`;
      await this.app.vault.create(filePath, initialContent);
      return filePath;
    } catch (error) {
      console.error("\u521B\u5EFA\u9ED8\u8BA4\u4EFB\u52A1\u6587\u4EF6\u5931\u8D25:", error);
      return null;
    }
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
  /**
   * 获取所有有任务的日期列表
   */
  async getDatesWithTasks() {
    const result = await this.parseAllTasks();
    return Array.from(result.taskMap.keys());
  }
  /**
   * 搜索任务
   */
  async searchTasks(keyword) {
    const result = await this.parseAllTasks();
    return result.tasks.filter(
      (task) => task.content.toLowerCase().includes(keyword.toLowerCase())
    );
  }
  /**
   * 获取任务统计
   */
  async getTaskStats() {
    const result = await this.parseAllTasks();
    const today = new Date().toISOString().split("T")[0];
    let completed = 0;
    let pending = 0;
    let overdue = 0;
    for (const task of result.tasks) {
      if (task.completed) {
        completed++;
      } else {
        pending++;
        if (task.dueDate && task.dueDate < today) {
          overdue++;
        }
      }
    }
    return {
      total: result.tasks.length,
      completed,
      pending,
      overdue
    };
  }
};

// src/MonthlyView.ts
var import_obsidian2 = require("obsidian");

// src/Calendar.ts
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

  // 补齐到42天（6周）
  const remainingDays = 42 - days.length;
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

// src/LunarCalendar.ts
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
  "12-23": "\u5C0F\u5E74",
  "12-30": "\u9664\u5915"
};
var LUNAR_INFO = [
  19416,
  19168,
  42352,
  21717,
  53856,
  55632,
  91476,
  22176,
  39632,
  21970,
  19168,
  42422,
  42192,
  53840,
  119381,
  46400,
  54944,
  44450,
  38320,
  84343,
  18800,
  42160,
  46261,
  27216,
  27968,
  109396,
  11104,
  38256,
  21234,
  18800,
  25958,
  54432,
  59984,
  28309,
  23248,
  11104,
  100067,
  37600,
  116951,
  51536,
  54432,
  120998,
  46416,
  22176,
  107956,
  9680,
  37584,
  53938,
  43344,
  46423,
  27808,
  46416,
  86869,
  19872,
  42448,
  83315,
  21200,
  43432,
  59728,
  27296,
  44710,
  43856,
  19296,
  43748,
  42352,
  21088,
  62051,
  55632,
  23383,
  22176,
  38608,
  19925,
  19152,
  42192,
  54484,
  53840,
  54616,
  46400,
  46496,
  103846,
  38320,
  18864,
  43380,
  42160,
  45690,
  27216,
  27968,
  44870,
  43872,
  38256,
  19189,
  18800,
  25776,
  29859,
  59984,
  27480,
  21952,
  43872,
  38613,
  37600,
  51552,
  55636,
  54432,
  55888,
  30034,
  22176,
  43959,
  9680,
  37584,
  51893,
  43344,
  46240,
  47780,
  44368,
  21977,
  19360,
  42416,
  86390,
  21168,
  43312,
  31060,
  27296,
  44368,
  23378,
  19296,
  42726,
  42208,
  53856,
  60005,
  54576,
  23200,
  30371,
  38608,
  19415,
  19152,
  42192,
  118966,
  53840,
  54560,
  56645,
  46496,
  22224,
  21938,
  18864,
  42359,
  42160,
  43600,
  111189,
  27936,
  44448,
  84835,
  37744,
  18936,
  18800,
  25776,
  92326,
  59984,
  27424,
  108228,
  43744,
  41696,
  53987,
  51552,
  54615,
  54432,
  55888,
  23893,
  22176,
  42704,
  21972,
  21200,
  43448,
  43344,
  46240,
  46758,
  44368,
  21920,
  43940,
  42416,
  21168,
  45683,
  26928,
  29495,
  27296,
  44368,
  84821,
  19296,
  42352,
  21732,
  53600,
  59752,
  54560,
  55968,
  92838,
  22224,
  19168,
  43476,
  41680,
  53584,
  62034,
  54560
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
  return LUNAR_INFO[year - 1900] & 65536 >> month ? 30 : 29;
}
function solarToLunar(date) {
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  let day = date.getDate();
  if (year < 1900 || year > 2100) {
    throw new Error("\u5E74\u4EFD\u8D85\u51FA\u652F\u6301\u8303\u56F4\uFF081900-2100\uFF09");
  }
  let offset = Math.floor((date.getTime() - new Date(1900, 0, 31).getTime()) / 864e5);
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
  while (true) {
    let daysInMonth = getLunarMonthDays(lunarYear, lunarMonth);
    if (leapMonth === lunarMonth && !isLeap) {
      if (offset >= daysInMonth) {
        offset -= daysInMonth;
        lunarMonth++;
      } else {
        isLeap = true;
        break;
      }
    } else {
      if (offset >= daysInMonth) {
        offset -= daysInMonth;
        lunarMonth++;
      } else {
        break;
      }
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
  if (lunarDate.day === 1) {
    const monthName = LUNAR_MONTH_NAMES[lunarDate.month - 1];
    return lunarDate.isLeap ? `\u95F0${monthName}\u6708` : `${monthName}\u6708`;
  }
  return LUNAR_DAY_NAMES[lunarDate.day - 1];
}
function getTraditionalHoliday(lunarDate) {
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

// src/HolidayManager.ts
var BUILTIN_HOLIDAYS = {
  2022: [
    // 元旦
    { date: "2022-01-01", name: "\u5143\u65E6", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-01-02", name: "\u5143\u65E6", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-01-03", name: "\u5143\u65E6", type: "legal" /* LEGAL */, isOff: true },
    // 春节
    { date: "2022-01-31", name: "\u9664\u5915", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-02-01", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-02-02", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-02-03", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-02-04", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-02-05", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-02-06", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 春节调休上班
    { date: "2022-01-29", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    { date: "2022-01-30", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    // 清明节
    { date: "2022-04-03", name: "\u6E05\u660E\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-04-04", name: "\u6E05\u660E\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-04-05", name: "\u6E05\u660E\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 清明节调休上班
    { date: "2022-04-02", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    // 劳动节
    { date: "2022-04-30", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-05-01", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-05-02", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-05-03", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-05-04", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 劳动节调休上班
    { date: "2022-04-24", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    { date: "2022-05-07", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    // 端午节
    { date: "2022-06-03", name: "\u7AEF\u5348\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-06-04", name: "\u7AEF\u5348\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-06-05", name: "\u7AEF\u5348\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 中秋节
    { date: "2022-09-10", name: "\u4E2D\u79CB\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-09-11", name: "\u4E2D\u79CB\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-09-12", name: "\u4E2D\u79CB\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 国庆节
    { date: "2022-10-01", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-10-02", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-10-03", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-10-04", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-10-05", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-10-06", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2022-10-07", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 国庆节调休上班
    { date: "2022-10-08", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    { date: "2022-10-09", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false }
  ],
  2023: [
    // 元旦
    { date: "2023-01-01", name: "\u5143\u65E6", type: "legal" /* LEGAL */, isOff: true },
    { date: "2023-01-02", name: "\u5143\u65E6", type: "legal" /* LEGAL */, isOff: true },
    // 元旦调休上班
    { date: "2022-12-31", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    // 春节
    { date: "2023-01-21", name: "\u9664\u5915", type: "legal" /* LEGAL */, isOff: true },
    { date: "2023-01-22", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2023-01-23", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2023-01-24", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2023-01-25", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2023-01-26", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2023-01-27", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 春节调休上班
    { date: "2023-01-28", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    { date: "2023-01-29", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    // 清明节
    { date: "2023-04-05", name: "\u6E05\u660E\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 劳动节
    { date: "2023-04-29", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2023-04-30", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2023-05-01", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2023-05-02", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2023-05-03", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 劳动节调休上班
    { date: "2023-04-23", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    { date: "2023-05-06", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    // 端午节
    { date: "2023-06-22", name: "\u7AEF\u5348\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2023-06-23", name: "\u7AEF\u5348\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2023-06-24", name: "\u7AEF\u5348\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 端午节调休上班
    { date: "2023-06-25", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    // 中秋节、国庆节（2023年重合）
    { date: "2023-09-29", name: "\u4E2D\u79CB\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2023-09-30", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2023-10-01", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2023-10-02", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2023-10-03", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2023-10-04", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2023-10-05", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2023-10-06", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 国庆调休上班
    { date: "2023-10-07", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    { date: "2023-10-08", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false }
  ],
  2024: [
    // 元旦
    { date: "2024-01-01", name: "\u5143\u65E6", type: "legal" /* LEGAL */, isOff: true },
    // 春节
    { date: "2024-02-09", name: "\u9664\u5915", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-02-10", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-02-11", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-02-12", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-02-13", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-02-14", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-02-15", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-02-16", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-02-17", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 春节调休上班
    { date: "2024-02-04", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    { date: "2024-02-18", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    // 清明节
    { date: "2024-04-04", name: "\u6E05\u660E\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-04-05", name: "\u6E05\u660E\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-04-06", name: "\u6E05\u660E\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 劳动节
    { date: "2024-05-01", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-05-02", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-05-03", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-05-04", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-05-05", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 劳动节调休上班
    { date: "2024-04-28", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    { date: "2024-05-11", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    // 端午节
    { date: "2024-06-10", name: "\u7AEF\u5348\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 中秋节
    { date: "2024-09-15", name: "\u4E2D\u79CB\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-09-16", name: "\u4E2D\u79CB\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-09-17", name: "\u4E2D\u79CB\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 中秋节调休上班
    { date: "2024-09-14", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    // 国庆节
    { date: "2024-10-01", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-10-02", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-10-03", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-10-04", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-10-05", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-10-06", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2024-10-07", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 国庆节调休上班
    { date: "2024-09-29", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    { date: "2024-10-12", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false }
  ],
  2025: [
    // 元旦
    { date: "2025-01-01", name: "\u5143\u65E6", type: "legal" /* LEGAL */, isOff: true },
    // 春节
    { date: "2025-01-28", name: "\u9664\u5915", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-01-29", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-01-30", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-01-31", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-02-01", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-02-02", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-02-03", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-02-04", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 春节调休上班
    { date: "2025-01-26", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    { date: "2025-02-08", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    // 清明节
    { date: "2025-04-04", name: "\u6E05\u660E\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-04-05", name: "\u6E05\u660E\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-04-06", name: "\u6E05\u660E\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 劳动节
    { date: "2025-05-01", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-05-02", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-05-03", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-05-04", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-05-05", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 劳动节调休上班
    { date: "2025-04-27", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    // 端午节
    { date: "2025-05-31", name: "\u7AEF\u5348\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-06-01", name: "\u7AEF\u5348\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-06-02", name: "\u7AEF\u5348\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 国庆节、中秋节（2025年重合）
    { date: "2025-10-01", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-10-02", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-10-03", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-10-04", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-10-05", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-10-06", name: "\u56FD\u5E86\u8282/\u4E2D\u79CB\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-10-07", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2025-10-08", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 国庆调休上班
    { date: "2025-09-28", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    { date: "2025-10-11", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false }
  ],
  2026: [
    // 元旦
    { date: "2026-01-01", name: "\u5143\u65E6", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-01-02", name: "\u5143\u65E6", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-01-03", name: "\u5143\u65E6", type: "legal" /* LEGAL */, isOff: true },
    // 元旦调休上班
    { date: "2026-01-04", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    // 春节
    { date: "2026-02-17", name: "\u9664\u5915", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-02-18", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-02-19", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-02-20", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-02-21", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-02-22", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-02-23", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-02-24", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 春节调休上班
    { date: "2026-02-15", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    { date: "2026-02-28", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    // 清明节
    { date: "2026-04-04", name: "\u6E05\u660E\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-04-05", name: "\u6E05\u660E\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-04-06", name: "\u6E05\u660E\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 劳动节
    { date: "2026-05-01", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-05-02", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-05-03", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-05-04", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-05-05", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 劳动节调休上班
    { date: "2026-04-26", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    { date: "2026-05-09", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    // 端午节
    { date: "2026-06-19", name: "\u7AEF\u5348\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-06-20", name: "\u7AEF\u5348\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-06-21", name: "\u7AEF\u5348\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 中秋节
    { date: "2026-09-25", name: "\u4E2D\u79CB\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-09-26", name: "\u4E2D\u79CB\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-09-27", name: "\u4E2D\u79CB\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 国庆节
    { date: "2026-10-01", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-10-02", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-10-03", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-10-04", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-10-05", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-10-06", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-10-07", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2026-10-08", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 国庆调休上班
    { date: "2026-09-20", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    { date: "2026-10-10", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false }
  ],
  2027: [
    // 元旦
    { date: "2027-01-01", name: "\u5143\u65E6", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-01-02", name: "\u5143\u65E6", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-01-03", name: "\u5143\u65E6", type: "legal" /* LEGAL */, isOff: true },
    // 元旦调休上班
    { date: "2026-12-31", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    { date: "2027-01-09", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    // 春节
    { date: "2027-02-06", name: "\u9664\u5915", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-02-07", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-02-08", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-02-09", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-02-10", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-02-11", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-02-12", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-02-13", name: "\u6625\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 春节调休上班
    { date: "2027-02-05", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    { date: "2027-02-20", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    // 清明节
    { date: "2027-04-03", name: "\u6E05\u660E\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-04-04", name: "\u6E05\u660E\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-04-05", name: "\u6E05\u660E\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 劳动节
    { date: "2027-05-01", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-05-02", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-05-03", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-05-04", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-05-05", name: "\u52B3\u52A8\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 劳动节调休上班
    { date: "2027-04-25", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    { date: "2027-05-08", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    // 端午节
    { date: "2027-06-09", name: "\u7AEF\u5348\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-06-10", name: "\u7AEF\u5348\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-06-11", name: "\u7AEF\u5348\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 中秋节
    { date: "2027-09-15", name: "\u4E2D\u79CB\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-09-16", name: "\u4E2D\u79CB\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-09-17", name: "\u4E2D\u79CB\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 中秋节调休上班
    { date: "2027-09-12", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    { date: "2027-09-26", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    // 国庆节
    { date: "2027-10-01", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-10-02", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-10-03", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-10-04", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-10-05", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-10-06", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-10-07", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    { date: "2027-10-08", name: "\u56FD\u5E86\u8282", type: "legal" /* LEGAL */, isOff: true },
    // 国庆调休上班
    { date: "2027-09-19", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false },
    { date: "2027-10-09", name: "\u73ED", type: "workday" /* WORKDAY */, isOff: false }
  ]
};

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
 * 数据来源：
 * - 内置数据：2022-2027年节假日数据（静态）
 * - API补充：timor.tech API（动态获取）
 * 
 * 主要功能：
 * - getHolidayType(date)：获取指定日期的节假日类型
 * - isHoliday(date)：判断是否为休息日
 * - isWeekend(date)：判断是否为周末
 * - fetchHolidays(year)：从API获取节假日数据
 * - getHolidayName(date)：获取节假日名称
 * ============================================================
 */
var HolidayManager = class {
  constructor() {
    this.cache = /* @__PURE__ */ new Map();
    this.fetchingYears = /* @__PURE__ */ new Map();
  }
  async ensureYearData(year) {
    if (this.cache.has(year)) return;
    if (this.fetchingYears.has(year)) {
      return new Promise((resolve) => {
        const check = () => {
          if (!this.fetchingYears.has(year)) resolve();
          else setTimeout(check, 50);
        };
        check();
      });
    }
    this.fetchingYears.set(year, true);
    try {
      const apiData = await this.fetchFromAPI(year);
      if (apiData && apiData.length > 0) this.cache.set(year, apiData);
    } catch (e) {
      console.warn(`节假日数据：${year} 年 API 调用失败`, e);
    } finally {
      this.fetchingYears.delete(year);
    }
  }
  async fetchFromAPI(year) {
    const url = `https://timor.tech/api/holiday/year/${year}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    if (json.code !== 0 || !json.holiday) throw new Error("API格式错误");
    const holidays = [];
    for (const [key, info] of Object.entries(json.holiday)) {
      if (key.length === 5 && info.date) {
        if (info.holiday === true) {
          holidays.push({ date: info.date, name: info.name || key, type: "legal" /* LEGAL */, isOff: true });
        } else if (info.holiday === false) {
          holidays.push({ date: info.date, name: "班", type: "workday" /* WORKDAY */, isOff: false });
        }
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
    const holidays = this.cache.get(year) || [];
    return holidays.find((h) => h.date === dateStr);
  }
  /**
   * 获取指定年份的所有节假日
   */
  getYearHolidays(year) {
    return this.cache.get(year) || [];
  }
  /**
   * 判断是否为节假日（法定节假日）
   */
  isHoliday(date) {
    const info = this.getHolidayInfo(date);
    return (info == null ? void 0 : info.type) === "legal" /* LEGAL */ && info.isOff;
  }
  /**
   * 判断是否为调休上班日
   */
  isWorkday(date) {
    const info = this.getHolidayInfo(date);
    return (info == null ? void 0 : info.type) === "workday" /* WORKDAY */;
  }
  /**
   * 判断是否为周末
   */
  isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
  }
  /**
   * 获取日期类型
   */
  getDateType(date) {
    const info = this.getHolidayInfo(date);
    if (info) {
      return info.type;
    }
    if (this.isWeekend(date)) {
      return "weekend" /* WEEKEND */;
    }
    return "normal" /* NORMAL */;
  }
  /**
   * 获取日期显示名称
   */
  getDateName(date) {
    const info = this.getHolidayInfo(date);
    return info == null ? void 0 : info.name;
  }
  /**
   * 判断是否需要显示"休"或"班"
   */
  getDateBadge(date) {
    const info = this.getHolidayInfo(date);
    if (!info)
      return void 0;
    if (info.type === "legal" /* LEGAL */ && info.isOff) {
      return { text: "\u4F11", type: "off" };
    }
    if (info.type === "workday" /* WORKDAY */) {
      return { text: "\u73ED", type: "work" };
    }
    return void 0;
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
    console.log(`\u8282\u5047\u65E5\u6570\u636E\uFF1A\u4F7F\u7528\u5185\u7F6E\u6570\u636E ${year}\u5E74`);
    return true;
  }
  /**
   * 获取指定月份的节假日
   */
  getMonthHolidays(year, month) {
    const holidays = this.getYearHolidays(year);
    return holidays.filter((h) => {
      const date = new Date(h.date);
      return date.getMonth() + 1 === month;
    });
  }
};
var holidayManager = new HolidayManager();

// src/MonthlyView.ts
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
 * - 日历网格：6行7列 = 42天
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
    this.containerEl = this.contentEl.createDiv("monthly-tasks-container");
    await this.render();
  }
  /**
   * 视图关闭
   */
  async onClose() {
    this.containerEl.empty();
  }
  /**
   * 渲染整个视图
   */
  async render() {
    if (this.containerEl.childElementCount === 0) {
      this.renderHeader();
      this.renderWeekdayHeader();
      this.gridEl = this.containerEl.createDiv("calendar-grid");
    }
    await this.renderCalendarGrid();
  }
  /**
   * 渲染头部导航
   */
  renderHeader() {
    this.headerEl = this.containerEl.createDiv("monthly-header");
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
    const weekdayEl = this.containerEl.createDiv("weekday-header");
    const firstDayOfWeek = this.plugin.settings.firstDayOfWeek;
    for (let i = 0; i < 7; i++) {
      const dayEl = weekdayEl.createDiv("weekday-cell");
      const dayIndex = (firstDayOfWeek + i) % 7;
      dayEl.textContent = WEEKDAY_NAMES[dayIndex];
      if (dayIndex === 0 || dayIndex === 6) {
        dayEl.addClass("weekend");
      }
    }
  }
  /**
   * 渲染月历网格
   */
  async renderCalendarGrid() {
    await holidayManager.ensureYearData(this.currentYear);
    const titleEl = this.headerEl.querySelector(".month-title");
    if (titleEl) {
      titleEl.textContent = getMonthTitle(this.currentYear, this.currentMonth);
    }
    this.gridEl.empty();
    const calendar = generateMonthCalendar(this.currentYear, this.currentMonth, this.plugin.settings.firstDayOfWeek);
    const taskMap = await this.taskParser.parseAllTasks(true);
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
    const holidayInfo = this.plugin.settings.showHoliday ? holidayManager.getHolidayInfo(day.date) : null;
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
    const displayTasks = displayTasksList.slice(0, limit);
    const remainingCount = displayTasksList.length - displayTasks.length;
    for (const task of displayTasks) {
      this.renderTaskItem(tasksEl, task, day.date);
    }
    if (remainingCount > 0) {
      const moreEl = tasksEl.createDiv("more-tasks");
      moreEl.textContent = `+${remainingCount}`;
    }
    if (tasks.length === 0) {
      const emptyEl = tasksEl.createDiv("empty-hint");
      emptyEl.textContent = "+";
    }
    cellEl.addEventListener("click", (e) => {
      if (e.target.closest(".task-item")) {
        return;
      }
      this.openCreateTaskModal(day.date, tasks);
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
    if (multiDay) {
      taskEl.addClass("multi-day-task");
      const duration = getMultiDayDuration(task);
      taskEl.setAttribute("data-duration", String(duration));
      if (dayDate && task.startDate) {
        const start = new Date(task.startDate);
        const dayIndex = Math.floor((dayDate.getTime() - start.getTime()) / (1e3 * 60 * 60 * 24));
        taskEl.setAttribute("data-day-index", String(dayIndex));
        if (dayIndex === 0) {
          taskEl.addClass("multi-day-start");
        }
        if (dayDate.toISOString().split("T")[0] === task.dueDate) {
          taskEl.addClass("multi-day-end");
        }
      }
    }
    const contentEl = taskEl.createDiv("task-content");
    let displayText = task.content;
    if (multiDay) {
      const duration = getMultiDayDuration(task);
      displayText = `${task.content} (${duration}\u5929})`;
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
    const success = await this.taskParser.toggleTask(task);
    if (success) {
      new import_obsidian2.Notice(task.completed ? "\u4EFB\u52A1\u5DF2\u6807\u8BB0\u4E3A\u672A\u5B8C\u6210" : "\u4EFB\u52A1\u5DF2\u5B8C\u6210");
      setTimeout(async () => {
        await this.refresh();
      }, 200);
    } else {
      new import_obsidian2.Notice("\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5");
    }
  }
  /**
   * 打开创建任务弹窗
   */
  openCreateTaskModal(date, existingTasks = []) {
    const modal = new CreateTaskModal(this.app, date, async (content, isAllDay, time, priority, endDate) => {
      const success = await this.taskParser.createTaskForDate(date, content, isAllDay, time, priority, endDate);
      if (success) {
        new import_obsidian2.Notice("\u4EFB\u52A1\u5DF2\u521B\u5EFA");
        await this.refresh(true);
      } else {
        new import_obsidian2.Notice("\u521B\u5EFA\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5");
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
 * 功能：
 * - prevMonth()：上一月
 * - nextMonth()：下一月
 * - goToToday()：跳转到今天
 * - selectDate(year, month, day)：选择具体日期
 * - renderCalendar()：渲染日历网格
 * - renderDayCell()：渲染日期单元格
 * 
 * 样式类：
 * - date-picker-modal：弹窗容器
 * - dp-nav：导航栏
 * - dp-grid：日历网格
 * - dp-day：日期单元格
 * - dp-day.disabled：禁用日期
 * ============================================================
 */
var DatePickerModal = class {
  constructor(app, currentYear, currentMonth, onSubmit) {
    this.app = app;
    this.year = currentYear;
    this.month = currentMonth;
    this.onSubmit = onSubmit;
    const now = new Date();
    this.currentYear = now.getFullYear();
    this.currentMonth = now.getMonth();
  }
  open() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    document.body.appendChild(overlay);
    this.modalEl = document.createElement("div");
    this.modalEl.className = "date-picker-modal";
    const titleEl = this.modalEl.createDiv("modal-title");
    titleEl.textContent = "\u9009\u62E9\u65E5\u671F";
    const yearSection = this.modalEl.createDiv("picker-section");
    yearSection.createEl("div", { cls: "section-label", text: "\u5E74\u4EFD" });
    const yearInputWrapper = yearSection.createDiv("year-input-wrapper");
    const yearDecBtn = yearInputWrapper.createEl("button", {
      cls: "year-nav-btn",
      text: "\u2212"
    });
    const yearInput = yearInputWrapper.createEl("input", {
      cls: "year-input",
      attr: {
        type: "number",
        value: String(this.year),
        min: "1900",
        max: "2100"
      }
    });
    const yearIncBtn = yearInputWrapper.createEl("button", {
      cls: "year-nav-btn",
      text: "+"
    });
    const currentYearHint = yearSection.createEl("div", {
      cls: "current-year-hint",
      text: `\u5F53\u524D\u5E74\u4EFD: ${this.currentYear}`
    });
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
      if (isNaN(val))
        val = this.currentYear;
      val = Math.max(1900, Math.min(2100, val));
      this.year = val;
      yearInput.value = String(val);
    });
    const monthSection = this.modalEl.createDiv("picker-section");
    monthSection.createEl("div", { cls: "section-label", text: "\u6708\u4EFD" });
    const monthGrid = monthSection.createDiv("month-grid");
    const monthNames = ["1\u6708", "2\u6708", "3\u6708", "4\u6708", "5\u6708", "6\u6708", "7\u6708", "8\u6708", "9\u6708", "10\u6708", "11\u6708", "12\u6708"];
    for (let m = 0; m < 12; m++) {
      const monthBtn = monthGrid.createEl("button", {
        cls: `month-btn ${m === this.month ? "selected" : ""} ${m === this.currentMonth ? "current" : ""}`,
        text: monthNames[m]
      });
      monthBtn.addEventListener("click", () => {
        monthGrid.querySelectorAll(".month-btn").forEach((btn) => btn.removeClass("selected"));
        monthBtn.addClass("selected");
        this.month = m;
      });
    }
    const btnGroup = this.modalEl.createDiv("modal-buttons");
    const cancelBtn = btnGroup.createEl("button", {
      cls: "btn-cancel",
      text: "\u53D6\u6D88"
    });
    cancelBtn.addEventListener("click", () => this.close(overlay));
    const confirmBtn = btnGroup.createEl("button", {
      cls: "btn-confirm",
      text: "\u786E\u5B9A"
    });
    confirmBtn.addEventListener("click", () => {
      this.onSubmit(this.year, this.month);
      this.close(overlay);
    });
    document.body.appendChild(this.modalEl);
    overlay.addEventListener("click", () => this.close(overlay));
  }
  close(overlay) {
    overlay.remove();
    this.modalEl.remove();
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
var CreateTaskModal = class {
  constructor(app, date, onSubmit, plugin, existingTasks = []) {
    this.app = app;
    this.date = date;
    this.onSubmit = onSubmit;
    this.plugin = plugin;
    this.existingTasks = existingTasks;
  }
  open() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    document.body.appendChild(overlay);
    this.modalEl = document.createElement("div");
    this.modalEl.className = "create-task-modal";
    const dateInfoEl = this.modalEl.createDiv("modal-date-info");
    const weekday = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"][this.date.getDay()];
    const holidayInfo = holidayManager.getHolidayInfo(this.date);
    const holidayText = holidayInfo ? ` \xB7 ${holidayInfo.name}` : "";
    dateInfoEl.innerHTML = `
			<div class="date-main">${this.date.getMonth() + 1}\u6708${this.date.getDate()}\u65E5 \xB7 ${weekday}${holidayText}</div>
		`;
    if (this.existingTasks.length > 0) {
      const existingTasksEl = this.modalEl.createDiv("modal-existing-tasks");
      const titleRow = existingTasksEl.createDiv("existing-tasks-title-row");
      titleRow.createEl("div", { cls: "existing-tasks-title", text: `\u4ECA\u65E5\u5DF2\u6709 ${this.existingTasks.length} \u4E2A\u4EFB\u52A1` });
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
          const checkboxEl = taskEl.createEl("input", { cls: "task-check-icon", attr: { type: "checkbox" } });
          if (task.completed) checkboxEl.checked = true;
          checkboxEl.addEventListener("change", async () => {
            await this.plugin.taskParser.toggleTask(task);
            task.completed = !task.completed;
            if (task.completed && !this.plugin.settings.showCompletedStrike) taskEl.addClass("completed");
            else taskEl.removeClass("completed");
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
              const view = leaf.view;
              if (view && view.editor) {
                view.editor.setCursor({ line: task.lineNumber, ch: 0 });
                view.editor.scrollIntoView({ from: { line: task.lineNumber, ch: 0 }, to: { line: task.lineNumber, ch: 0 } }, true);
              }
            }
            this.close(overlay);
          });
          // 删除按钮
          const deleteBtn = actionsEl.createEl("button", { cls: "task-action-btn task-delete-btn", attr: { title: "\u5220\u9664\u4EFB\u52A1" } });
          deleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>`;
          deleteBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            deleteBtn.disabled = true;
            const ok = await this.plugin.taskParser.deleteTask(task);
            if (ok) {
              taskEl.addClass("task-deleting");
              setTimeout(() => {
                const idx = this.existingTasks.indexOf(task);
                if (idx > -1) this.existingTasks.splice(idx, 1);
                titleRow.querySelector(".existing-tasks-title").textContent = `\u4ECA\u65E5\u5DF2\u6709 ${this.existingTasks.length} \u4E2A\u4EFB\u52A1`;
                renderTasks();
              }, 200);
            } else {
              deleteBtn.disabled = false;
            }
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
      // 计算默认时间：系统时间取整到下一小时，结束时间+4小时
      const now = new Date();
      const defaultStartHour = now.getMinutes() > 0 ? now.getHours() + 1 : now.getHours();
      const defaultEndHour = (defaultStartHour + 4) % 24;
      const defaultStartHourStr = String(defaultStartHour).padStart(2, "0");
      const defaultEndHourStr = String(defaultEndHour).padStart(2, "0");
      const timeContainer = this.modalEl.createDiv("modal-time-container");
      timeContainer.createEl("span", { cls: "time-label", text: "\u65F6\u95F4" });
      const timeWrapper = timeContainer.createDiv("time-input-wrapper");
      // 原生时间输入框
      startTimeEl = timeWrapper.createEl("input", { type: "time", cls: "time-native-input" });
      const defaultStartTime = `${defaultStartHourStr}:00`;
      startTimeEl.value = defaultStartTime;
      timeWrapper.createEl("span", { cls: "time-separator", text: "\u81F3" });
      endTimeEl = timeWrapper.createEl("input", { type: "time", cls: "time-native-input" });
      const defaultEndTime = `${defaultEndHourStr}:00`;
      endTimeEl.value = defaultEndTime;
      const allDayToggle = timeContainer.createDiv("all-day-toggle");
      const allDayCheckbox = allDayToggle.createEl("input", { attr: { type: "checkbox" } });
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
    const multiDayCheckbox = multiDayToggle.createEl("input", { attr: { type: "checkbox" } });
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
        const isPast = cellDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());
        if (isPast) cell.addClass("picker-cell-disabled");
        const cellKey = `${pickerYear}-${pickerMonth}-${d}`;
        if (cellKey === todayStr) cell.addClass("picker-cell-today");
        if (!isPast) {
          cell.addEventListener("click", () => {
            endDate = new Date(pickerYear, pickerMonth, d);
            const m = String(pickerMonth + 1).padStart(2, "0");
            const dd = String(d).padStart(2, "0");
            endDateTrigger.textContent = formatDisplayDate(pickerYear, pickerMonth, d);
            endDateTrigger.setAttribute("data-value", `${pickerYear}-${m}-${dd}`);
            popup.remove();
            closeHandler = null;
          });
        }
      }
    }
    function syncSelects(popup) {
      const yearSelect = popup.querySelector(".picker-select-year");
      const monthSelect = popup.querySelector(".picker-select-month");
      if (yearSelect) {
        Array.from(yearSelect.options).forEach(o => { o.selected = o.value === String(pickerYear); });
      }
      if (monthSelect) {
        Array.from(monthSelect.options).forEach(o => { o.selected = o.value === String(pickerMonth); });
      }
    }
    let closeHandler = null;
    function buildPopup() {
      const popup = endDateWrapper.createDiv("date-picker-popup");
      popup.style.display = "block";
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
      // 点击外部关闭
      closeHandler = (e) => {
        if (!endDateWrapper.contains(e.target)) {
          popup.remove();
          closeHandler = null;
          document.removeEventListener("click", closeHandler);
        }
      };
      setTimeout(() => document.addEventListener("click", closeHandler), 0);
      return popup;
    }
    function renderDatePicker() {
      const existing = endDateWrapper.querySelector(".date-picker-popup");
      if (existing) { existing.remove(); closeHandler = null; return; }
      buildPopup();
    }
    endDateTrigger.addEventListener("click", (e) => { e.stopPropagation(); renderDatePicker(); });
    multiDayCheckbox.addEventListener("change", (e) => {
      isMultiDay = e.target.checked;
      endDateTrigger.style.display = isMultiDay ? "flex" : "none";
      if (!isMultiDay) {
        endDate = void 0;
        const popup = endDateWrapper.querySelector(".date-picker-popup");
        if (popup) popup.remove();
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
        cls: `priority-btn ${p.class} ${p.value === 0 ? "selected" : ""}`
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
    cancelBtn.addEventListener("click", () => this.close(overlay));
    const confirmBtn = btnGroup.createEl("button", {
      cls: "btn-confirm",
      text: "\u6DFB\u52A0\u4EFB\u52A1"
    });
    const submitTask = () => {
      const content = inputEl.value.trim();
      if (content) {
        let time = void 0;
        if (!isAllDay && startTimeEl && endTimeEl) {
          const s = startTimeEl.value;
          const e = endTimeEl.value;
          time = `${s}~${e}`;
        }
        this.onSubmit(content, isAllDay, time, selectedPriority, endDate);
        this.close(overlay);
      }
    };
    setTimeout(() => {
      inputEl.focus();
    }, 100);
    confirmBtn.addEventListener("click", submitTask);
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        submitTask();
      } else if (e.key === "Escape") {
        this.close(overlay);
      }
    });
    document.body.appendChild(this.modalEl);
    overlay.addEventListener("click", () => this.close(overlay));
  }
  close(overlay) {
    overlay.remove();
    this.modalEl.remove();
  }
  formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
};

// src/main.ts
var DEFAULT_SETTINGS = {
  showCompletedTasks: true,
  showCompletedStrike: true,
  defaultAllDayTask: true,
  firstDayOfWeek: 0,
  showLunar: true,
  showHoliday: true,
  tasksPerDayLimit: 5,
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
    await this.loadSettings();
    // 启用插件时默认刷新节假日数据（异步执行，不阻塞）
    (async () => {
      const currentYear = new Date().getFullYear();
      await Promise.all([
        holidayManager.updateFromNetwork(currentYear - 1),
        holidayManager.updateFromNetwork(currentYear),
        holidayManager.updateFromNetwork(currentYear + 1)
      ]);
      this.settings.holidaysData = {};
      for (const [year, holidays] of holidayManager.cache.entries()) {
        this.settings.holidaysData[year] = holidays;
      }
      await this.saveSettings();
    })();
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
    this.addSettingTab(new MonthlyTasksSettingTab(this.app, this));
    // 合并 vault 事件监听器，使用防抖优化性能
    let refreshTimer = null;
    const debouncedRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        this.taskParser.invalidateCache();
        this.refreshView();
      }, 500);
    };
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof import_obsidian3.TFile && file.extension === "md") {
          debouncedRefresh();
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof import_obsidian3.TFile && file.extension === "md") {
          debouncedRefresh();
        }
      })
    );
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
  }
  /**
   * 加载设置
   */
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (this.settings.holidaysData) {
      for (const [year, holidays] of Object.entries(this.settings.holidaysData)) {
        if (!holidayManager.cache.has(parseInt(year))) {
          holidayManager.cache.set(parseInt(year), holidays);
        }
      }
    }
  }
  /**
   * 保存设置
   */
  async saveSettings() {
    await this.saveData(this.settings);
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
    const leaf = workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_MONTHLY });
      workspace.revealLeaf(leaf);
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
 * 提供插件配置选项的UI界面
 * 
 * 设置项：
 * 
 * 显示设置：
 * - 每月第一天：周日/周一（firstDayOfWeek）
 * - 日期格式：YYYY.MM或YYYY-MM-DD
 * - 每日任务数上限：1-10（tasksPerDayLimit）
 * 
 * 农历显示：
 * - 显示农历：开关（showLunar）
 * - 显示宜忌：开关（showLunarInfo）
 * 
 * 节假日设置：
 * - 显示节假日标签：开关（showHolidayLabel）
 * - 显示调休信息：开关（showWorkdayLabel）
 * - 刷新节假日数据：按钮
 * 
 * 外观设置：
 * - 已完成删除线：开关（completedStrikethrough）
 * - 任务圆角样式：开关（roundedTask）
 * 
 * 其他：
 * - 节假日数据源：API配置
 * - settings.json：持久化存储位置
 * ============================================================
 */
var MonthlyTasksSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    // 显示设置
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
    new import_obsidian3.Setting(containerEl).setName("默认全天任务").setDesc("新建任务时默认为全天任务（不带具体时间）").addToggle((toggle) => toggle.setValue(this.plugin.settings.defaultAllDayTask).onChange(async (value) => {
      this.plugin.settings.defaultAllDayTask = value;
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    new import_obsidian3.Setting(containerEl).setName("每周第一天").setDesc("设置日历每周的起始日").addDropdown((dropdown) => dropdown.addOption("0", "周日").addOption("1", "周一").setValue(String(this.plugin.settings.firstDayOfWeek)).onChange(async (value) => {
      this.plugin.settings.firstDayOfWeek = parseInt(value);
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    new import_obsidian3.Setting(containerEl).setName("每日任务显示数量").setDesc("每个日期格子最多显示的任务数量").addDropdown((dropdown) => dropdown.addOption("3", "3").addOption("4", "4").addOption("5", "5").addOption("6", "6").addOption("7", "7").addOption("8", "8").addOption("9", "9").addOption("10", "10").setValue(String(this.plugin.settings.tasksPerDayLimit)).onChange(async (value) => {
      this.plugin.settings.tasksPerDayLimit = parseInt(value);
      await this.plugin.saveSettings();
      this.plugin.refreshView();
    }));
    new import_obsidian3.Setting(containerEl).setName("刷新节假日数据").setDesc("从 timor.tech API 获取最新节假日数据").addButton((button) => {
      button.setButtonText("刷新");
      button.buttonEl.addEventListener("click", async () => {
        const currentYear = new Date().getFullYear();
        button.setDisabled(true);
        button.setButtonText("加载中...");
        await Promise.all([
          holidayManager.updateFromNetwork(currentYear - 1),
          holidayManager.updateFromNetwork(currentYear),
          holidayManager.updateFromNetwork(currentYear + 1)
        ]);
        this.plugin.settings.holidaysData = {};
        for (const [year, holidays] of holidayManager.cache.entries()) {
          this.plugin.settings.holidaysData[year] = holidays;
        }
        await this.plugin.saveSettings();
        this.plugin.refreshView();
        new import_obsidian3.Notice("节假日数据已刷新！", 3000);
        button.setDisabled(false);
        button.setButtonText("刷新");
      });
    });

  }
};
