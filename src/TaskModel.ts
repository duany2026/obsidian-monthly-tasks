/**
 * =============================================================================
 * obsidian-monthly-tasks - 任务数据模型
 * =============================================================================
 *
 * 定义任务的数据结构、优先级枚举、以及所有与任务相关的
 * 纯函数工具方法（解析、过滤、分组、状态判断等）。
 *
 * 本模块不依赖任何 UI 或 Obsidian API，是纯数据处理层，
 * 方便单独测试和复用。
 *
 * @module TaskModel
 */

// ──────────────────────────────────────────────
// 枚举与接口定义
// ──────────────────────────────────────────────

/**
 * 任务优先级枚举
 *
 * 使用数值表示优先级等级，值越大优先级越高。
 * 与 Obsidian Tasks 插件的优先级标记兼容（⏫/🔼）。
 */
export enum TaskPriority {
	/** 普通优先级（默认） */
	NONE = 0,
	/** 中等优先级 */
	MEDIUM = 2,
	/** 高优先级 */
	HIGH = 3
}

/**
 * 任务数据接口
 *
 * 表示从 Markdown 文件中解析出的单条任务记录。
 * 每个任务通过 `filePath + lineNumber` 唯一标识。
 */
export interface Task {
	/** 唯一标识符，格式为 "filePath:lineNumber" */
	id: string;
	/** 任务文本内容（去除标记后的纯文字） */
	content: string;
	/** 原始行文本（包含所有标记符号的完整内容） */
	rawLine: string;
	/** 所在文件的路径 */
	filePath: string;
	/** 所在文件中的行号（从 0 开始） */
	lineNumber: number;
	/** 是否已完成 */
	completed: boolean;
	/** 开始日期（YYYY-MM-DD 格式），用于跨天任务 */
	startDate?: string;
	/** 截止日期（YYYY-MM-DD 格式），由 📅 标记提取 */
	dueDate?: string;
	/** 优先级等级 */
	priority: TaskPriority;
	/** 记录创建时间的时间戳 */
	createdAt: number;
}

/**
 * 按日期索引的任务映射表
 *
 * key = 日期字符串 (YYYY-MM-DD)
 * value = 当天的任务列表
 */
export type TaskMap = Map<string, Task[]>;

// ──────────────────────────────────────────────
// ID 生成与解析工具
// ──────────────────────────────────────────────

/**
 * 根据文件路径和行号生成任务唯一 ID
 *
 * @param filePath   - 文件在 Vault 中的相对路径
 * @param lineNumber - 行号
 * @returns 格式为 "filePath:lineNumber" 的唯一标识字符串
 *
 * @example
 * generateTaskId('日记/2026-04.md', 5) // => '日记/2026-04.md:5'
 */
export function generateTaskId(filePath: string, lineNumber: number): string {
	return `${filePath}:${lineNumber}`;
}

/**
 * 从任务文本中解析优先级
 *
 * 支持两种标记体系：
 * - Obsidian Tasks 风格：⏫ (高) / 🔼 (中)
 * - Emoji 圆点风格：🔴 (高) / 🟡 (中)
 *
 * @param content - 包含优先级标记的任务文本
 * @returns 对应的优先级枚举值
 */
export function parsePriority(content: string): TaskPriority {
	if (content.includes('⏫') || content.includes('🔴')) return TaskPriority.HIGH;
	if (content.includes('🔼') || content.includes('🟡')) return TaskPriority.MEDIUM;
	return TaskPriority.NONE;
}

/**
 * 清理任务文本，去除所有标记符号
 *
 * 移除以下标记后返回纯任务描述：
 * - 复选框前缀 `- [ ]` / `- [x]`
 * - 日期标记 📅 / ⏳ / 🛫
 * - 时间标记 ⏰
 * - 优先级标记 ⏫ / 🔼 / 🔴 / 🟡
 *
 * @param rawLine - 包含标记的原始行文本
 * @returns 清理后的纯文本内容
 *
 * @example
 * cleanTaskLine('- [ ] 买菜 🔴 📅 2026-04-22') // => '买菜'
 */
export function cleanTaskContent(rawLine: string): string {
	return rawLine
		.replace(/^\s*- \[[ x]\]\s*/i, '')
		.replace(/📅\s*\d{4}-\d{2}-\d{2}/g, '')
		.replace(/⏳\s*\d{4}-\d{2}-\d{2}/g, '')
		.replace(/🛫\s*\d{4}-\d{2}-\d{2}/g, '')
		.replace(/⏰\s*\d{2}:\d{2}/g, '')
		.replace(/⏫|🔼/g, '')
		.replace(/🔴|🟡/g, '')
		.trim();
}

/**
 * 从原始行中提取截止日期（📅 标记）
 *
 * @param rawLine - 原始任务行
 * @returns YYYY-MM-DD 格式的日期字符串，或 undefined
 */
export function extractDueDate(rawLine: string): string | undefined {
	const match = rawLine.match(/📅\s*(\d{4}-\d{2}-\d{2})/);
	return match?.[1];
}

/**
 * 从原始行中提取开始日期（🛫 标记，用于跨天任务）
 *
 * @param rawLine - 原始任务行
 * @returns YYYY-MM-DD 格式的日期字符串，或 undefined
 */
export function extractStartDate(rawLine: string): string | undefined {
	const match = rawLine.match(/🛫\s*(\d{4}-\d{2}-\d{2})/);
	return match?.[1];
}

// ──────────────────────────────────────────────
// 任务行识别与状态切换
// ──────────────────────────────────────────────

/**
 * 判断一行文本是否为有效的任务行
 *
 * 匹配格式：`- [ ]` 或 `- [x]`（支持大小写）
 *
 * @param line - 待检测的文本行
 * @returns 是否为任务行
 */
export function isTaskLine(line: string): boolean {
	return /^\s*- \[[ x]\]\s*/i.test(line);
}

/**
 * 判断任务是否已完成
 *
 * 通过检查复选框内是否为 'x' 来判断。
 *
 * @param line - 任务行文本
 * @returns 是否已完成
 */
export function isTaskCompleted(line: string): boolean {
	return /^\s*- \[x\]\s*/i.test(line);
}

/**
 * 切换任务的完成状态
 *
 * 在完成和未完成之间翻转复选框状态。
 *
 * @param rawLine - 原始任务行
 * @returns 状态翻转后的新行文本
 */
export function toggleTaskStatus(rawLine: string): string {
	return isTaskCompleted(rawLine)
		? rawLine.replace(/- \[x\]/i, '- [ ]')
		: rawLine.replace(/- \[ \]/i, '- [x]');
}

// ──────────────────────────────────────────────
// 过滤与分组
// ──────────────────────────────────────────────

/**
 * 任务过滤器接口
 *
 * 定义可组合的过滤条件。
 */
export interface TaskFilter {
	/** 是否包含已完成的任务 */
	includeCompleted?: boolean;
	/** 按优先级筛选 */
	priority?: TaskPriority;
	/** 按文件路径模糊匹配 */
	filePath?: string;
	/** 按标签筛选（预留扩展） */
	tags?: string[];
}

/**
 * 根据过滤条件筛选任务列表
 *
 * @param tasks  - 待筛选的任务数组
 * @param filter - 过滤条件
 * @returns 符合条件的任务子集
 */
export function filterTasks(tasks: Task[], filter: TaskFilter): Task[] {
	return tasks.filter(task => {
		if (filter.includeCompleted === false && task.completed) return false;
		if (filter.priority !== undefined && task.priority !== filter.priority) return false;
		if (filter.filePath !== undefined && !task.filePath.includes(filter.filePath)) return false;
		return true;
	});
}

/**
 * 将任务按日期分组
 *
 * 对于跨天任务，使用 startDate 作为分组键；
 * 单日任务使用 dueDate 作为分组键。
 *
 * 同一天内的排序规则：
 * 1. 未完成任务排在前面
 * 2. 优先级高的排在前面
 *
 * @param tasks - 未分组的任务列表
 * @returns 按日期索引的任务映射表
 */
export function groupTasksByDate(tasks: Task[]): TaskMap {
	const map: TaskMap = new Map();
	for (const task of tasks) {
		if (!task.dueDate) continue;
		// 跨天任务按开始日期分组显示，否则按截止日期
		const displayDate = task.startDate || task.dueDate;
		const existing = map.get(displayDate) || [];
		existing.push(task);
		map.set(displayDate, existing);
	}
	// 排序：未完成 > 已完成；高优先级 > 低优先级
	for (const [date, dateTasks] of map) {
		dateTasks.sort((a, b) => {
			if (a.completed !== b.completed) return a.completed ? 1 : -1;
			return b.priority - a.priority;
		});
		map.set(date, dateTasks);
	}
	return map;
}

// ──────────────────────────────────────────────
// 跨天任务相关
// ──────────────────────────────────────────────

/**
 * 判断是否为跨天任务
 *
 * 跨天任务同时拥有 startDate 和 dueDate，且两者不同。
 *
 * @param task - 任务对象
 * @returns 是否为跨天任务
 */
export function isMultiDayTask(task: Task): boolean {
	return !!task.startDate && task.startDate !== task.dueDate;
}

/**
 * 计算跨天任务的天数跨度
 *
 * @param task - 任务对象
 * @returns 持续天数（含首尾）
 */
export function getMultiDayDuration(task: Task): number {
	if (!isMultiDayTask(task)) return 1;
	const start = new Date(task.startDate!);
	const end = new Date(task.dueDate);
	return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * 计算跨天任务在某月内的网格位置范围
 *
 * 用于确定跨天任务条在月历网格中的起始和结束格子索引。
 *
 * @param task           - 跨天任务对象
 * @param year           - 目标年份
 * @param month          - 目标月份（0-based）
 * @param firstDayOfWeek - 每周起始日（0=周日，1=周一）
 * @returns 起止格子的索引，如果不在该月则返回 null
 */
export function getMultiDayTaskRangeInMonth(task: Task, year: number, month: number, firstDayOfWeek = 0): { startIndex: number; endIndex: number } | null {
	if (!isMultiDayTask(task) || !task.startDate) return null;

	const taskStart = new Date(task.startDate);
	const taskEnd = new Date(task.dueDate);
	const monthStart = new Date(year, month, 1);
	const monthEnd = new Date(year, month + 1, 0);

	// 如果任务范围完全不在该月内
	if (taskEnd < monthStart || taskStart > monthEnd) return null;

	// 计算该月第一天的偏移量（用于对齐星期）
	const firstDayIndex = monthStart.getDay();
	const paddingDays = (firstDayIndex - firstDayOfWeek + 7) % 7;

	// 将任务起止日期裁剪到该月范围内
	const effectiveStart = taskStart < monthStart ? monthStart : taskStart;
	const effectiveEnd = taskEnd > monthEnd ? monthEnd : taskEnd;

	const startDayOfMonth = effectiveStart.getDate() - 1;  // 转为 0-based
	const endDayOfMonth = effectiveEnd.getDate() - 1;

	return { startIndex: paddingDays + startDayOfMonth, endIndex: paddingDays + endDayOfMonth };
}

/**
 * 将跨天任务拆分为按周分布的片段
 *
 * 一个跨越多周的任务会被拆分为多个周片段，
 * 每个片段独立定位到对应周的列上。
 *
 * @param task           - 跨天任务对象
 * @param year           - 年份
 * @param month          - 月份
 * @param firstDayOfWeek - 每周起始日
 * @returns 周片段数组，每项包含周索引和列范围
 */
export function getTaskWeekSpans(task: Task, year: number, month: number, firstDayOfWeek = 0): Array<{ weekIndex: number; startCol: number; endCol: number }> {
	if (!isMultiDayTask(task) || !task.startDate) return [];

	const range = getMultiDayTaskRangeInMonth(task, year, month, firstDayOfWeek);
	if (!range) return [];

	const { startIndex, endIndex } = range;
	const spans: Array<{ weekIndex: number; startCol: number; endCol: number }> = [];

	let currentIndex = startIndex;
	while (currentIndex <= endIndex) {
		const weekIndex = Math.floor(currentIndex / 7);
		const weekStart = weekIndex * 7;
		const weekEnd = weekStart + 6;
		spans.push({
			weekIndex,
			startCol: Math.max(currentIndex, weekStart) - weekStart,
			endCol: Math.min(endIndex, weekEnd) - weekStart
		});
		currentIndex = weekEnd + 1;
	}
	return spans;
}

// ──────────────────────────────────────────────
// 日期辅助判断
// ──────────────────────────────────────────────

/**
 * 判断某日期是否已过期（早于今天零点）
 *
 * @param dateStr - YYYY-MM-DD 格式的日期字符串
 * @returns 是否已过期
 */
export function isOverdue(dateStr: string): boolean {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const checkDate = new Date(dateStr);
	checkDate.setHours(0, 0, 0, 0);
	return checkDate < today;
}

/**
 * 判断某日期是否为今天
 *
 * @param dateStr - YYYY-MM-DD 格式的日期字符串
 * @returns 是否为今天
 */
export function isToday(dateStr: string): boolean {
	const today = new Date();
	const checkDate = new Date(dateStr);
	return today.getFullYear() === checkDate.getFullYear()
		&& today.getMonth() === checkDate.getMonth()
		&& today.getDate() === checkDate.getDate();
}
