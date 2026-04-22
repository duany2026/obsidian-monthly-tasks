/**
 * =============================================================================
 * obsidian-monthly-tasks - 日历工具模块
 * =============================================================================
 *
 * 提供月历网格生成、日期计算、格式化等基础工具函数。
 * 是整个插件的数据基础层，不依赖任何 UI 组件。
 *
 * 核心功能：
 * - 生成完整的月历日历数据（含上月/下月的补位日期）
 * - 月份导航（上/下月、回到今天）
 * - 日期格式化与比较
 * - 周数/季度等辅助计算
 *
 * @module Calendar
 */

// ──────────────────────────────────────────────
// 类型定义
// ──────────────────────────────────────────────

/**
 * 单个日期格子的数据模型
 */
export interface CalendarDay {
	/** 该格子的实际公历日期 */
	date: Date;
	/** 月中几号（1-31） */
	day: number;
	/** 所属月份（0-11） */
	month: number;
	/** 所属年份 */
	year: number;
	/** 是否属于当前显示的月份（false = 上月或下月的补位日期） */
	isCurrentMonth: boolean;
	/** 是否为今天 */
	isToday: boolean;
	/** 是否为周末（周六或周日） */
	isWeekend: boolean;
	/** 一周中的第几天（0=周日，6=周六） */
	dayOfWeek: number;
}

/**
 * 完整的月历数据
 *
 * 包含一个固定 6×7 = 42 个格子的数组，
 * 足以覆盖任何月份的所有日期（含补位）。
 */
export interface MonthCalendar {
	/** 年份 */
	year: number;
	/** 月份 (0-based) */
	month: number;
	/** 所有格子数据，固定 42 个元素 */
	days: CalendarDay[];
	/** 周数（通常为 5 或 6） */
	weekCount: number;
}

// ──────────────────────────────────────────────
// 常量定义
// ──────────────────────────────────────────────

/** 星期简称（用于表头） */
export const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

/** 星期全称 */
export const WEEKDAY_FULL_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 月份简称（如 "4月"） */
export const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

/** 月份全称（如 "四月"） */
export const MONTH_FULL_NAMES = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

// ──────────────────────────────────────────────
// 基础日期查询函数
// ──────────────────────────────────────────────

/**
 * 获取指定月份的天数
 *
 * 利用 JS Date 的"溢出自动进位"特性：
 * 传入 month+1 的第 0 天即为当月最后一天。
 *
 * @param year  - 年份
 * @param month - 月份 (0-based)
 * @returns 当月天数（28-31）
 *
 * @example
 * getDaysInMonth(2026, 1) // => 28（2026年2月）
 * getDaysInMonth(2026, 7) // => 31（8月）
 */
export function getDaysInMonth(year: number, month: number): number {
	return new Date(year, month + 1, 0).getDate();
}

/**
 * 获取指定月份第一天是星期几
 *
 * @param year  - 年份
 * @param month - 月份 (0-based)
 * @returns 星期几（0=周日，6=周六）
 */
export function getFirstDayOfMonth(year: number, month: number): number {
	return new Date(year, month, 1).getDay();
}

/**
 * 判断某日期是否为今天
 *
 * 比较年、月、日三个字段。
 */
export function isToday(date: Date): boolean {
	const today = new Date();
	return date.getFullYear() === today.getFullYear()
		&& date.getMonth() === today.getMonth()
		&& date.getDate() === today.getDate();
}

/**
 * 判断某日期是否为周末（周六或周日）
 *
 * @param date - 待判断的日期
 * @returns 是否为周末
 */
export function isWeekend(date: Date): boolean {
	const day = date.getDay();
	return day === 0 || day === 6;
}

/**
 * 判断两个日期是否是同一天
 *
 * @param date1 - 第一个日期
 * @param date2 - 第二个日期
 * @returns 是否同一天
 */
export function isSameDay(date1: Date, date2: Date): boolean {
	return date1.getFullYear() === date2.getFullYear()
		&& date1.getMonth() === date2.getMonth()
		&& date1.getDate() === date2.getDate();
}

// ──────────────────────────────────────────────
// 格式化函数
// ──────────────────────────────────────────────

/**
 * 格式化为 ISO 日期字符串
 *
 * @param date - 日期对象
 * @returns "YYYY-MM-DD" 格式字符串
 */
export function formatDate(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * 格式化为中文长日期
 *
 * @param date - 日期对象
 * @returns "YYYY年M月D日" 格式字符串
 */
export function formatDateCN(date: Date): string {
	return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * 格式化为短日期（不含年份）
 *
 * @param date - 日期对象
 * @returns "M月D日" 格式字符串
 */
export function formatDateShort(date: Date): string {
	return `${date.getMonth() + 1}月${date.getDate()}日`;
}

// ──────────────────────────────────────────────
// 月历生成核心函数
// ──────────────────────────────────────────────

/**
 * 生成完整月历数据
 *
 * 构建一个 6 行 × 7 列的日历网格（共 42 个格子），
 * 包含当前月的所有日期以及前后月份的补位日期，
 * 确保网格完全填满。
 *
 * 补位规则示例（假设每月从周一开始）：
 * ```
 *     一  二  三  四  五  六  日
 *         1   2   3   4   5   6    ← 上月末尾补位
 *  7   8   9  10  11  12  13
 * ...
 * 28  29  30  31                    ← 当前月末尾
 *  1   2   3   4                   → 下月初补位
 * ```
 *
 * @param year           - 年份
 * @param month          - 月份 (0-based)
 * @param firstDayOfWeek - 每周起始日：0=周日，1=周一
 * @returns 完整的月历数据对象
 */
export function generateMonthCalendar(year: number, month: number, firstDayOfWeek = 1): MonthCalendar {
	const days: CalendarDay[] = [];

	const daysInMonth = getDaysInMonth(year, month);
	const firstDayWeekday = getFirstDayOfMonth(year, month);

	// 计算需要从上个月借多少天来填满第一行
	let daysFromPrevMonth = firstDayWeekday - firstDayOfWeek;
	if (daysFromPrevMonth < 0) daysFromPrevMonth += 7;

	// 上个月信息（用于补位）
	const prevMonth = month === 0 ? 11 : month - 1;
	const prevYear = month === 0 ? year - 1 : year;
	const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);

	// ── 第一部分：上个月的补位日期 ──
	for (let i = daysFromPrevMonth - 1; i >= 0; i--) {
		const day = daysInPrevMonth - i;
		const date = new Date(prevYear, prevMonth, day);
		days.push({
			date, day, month: prevMonth, year: prevYear,
			isCurrentMonth: false, isToday: isToday(date),
			isWeekend: isWeekend(date), dayOfWeek: date.getDay()
		});
	}

	// ── 第二部分：当前月的所有日期 ──
	for (let day = 1; day <= daysInMonth; day++) {
		const date = new Date(year, month, day);
		days.push({
			date, day, month, year,
			isCurrentMonth: true, isToday: isToday(date),
			isWeekend: isWeekend(date), dayOfWeek: date.getDay()
		});
	}

	// ── 第三部分：下个月的补位日期 ──
	const remainingDays = 42 - days.length;  // 确保总共 42 个格子
	const nextMonth = month === 11 ? 0 : month + 1;
	const nextYear = month === 11 ? year + 1 : year;

	for (let day = 1; day <= remainingDays; day++) {
		const date = new Date(nextYear, nextMonth, day);
		days.push({
			date, day, month: nextMonth, year: nextYear,
			isCurrentMonth: false, isToday: isToday(date),
			isWeekend: isWeekend(date), dayOfWeek: date.getDay()
		});
	}

	return { year, month, days, weekCount: days.length / 7 };
}

// ──────────────────────────────────────────────
// 导航函数
// ──────────────────────────────────────────────

/**
 * 获取上一月的年月
 *
 * 自动处理跨年边界（如 1月→上年12月）。
 *
 * @param year  - 当前年份
 * @param month - 当前月份 (0-based)
 * @returns { year, month }
 */
export function getPrevMonth(year: number, month: number): { year: number; month: number } {
	return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
}

/**
 * 获取下一月的年月
 *
 * 自动处理跨年边界（如 12月→次年1月）。
 *
 * @param year  - 当前年份
 * @param month - 当前月份 (0-based)
 * @returns { year, month }
 */
export function getNextMonth(year: number, month: number): { year: number; month: number } {
	return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
}

/**
 * 获取当前的年月
 *
 * @returns { year, month } 其中 month 为 0-based
 */
export function getCurrentYearMonth(): { year: number; month: number } {
	const now = new Date();
	return { year: now.getFullYear(), month: now.getMonth() };
}

// ──────────────────────────────────────────────
// 解析与计算辅助函数
// ──────────────────────────────────────────────

/**
 * 将 ISO 日期字符串解析为 Date 对象
 *
 * @param dateStr - "YYYY-MM-DD" 格式的字符串
 * @returns Date 对象，解析失败返回 null
 */
export function parseDate(dateStr: string): Date | null {
	const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return null;

	const year = parseInt(match[1]);
	const month = parseInt(match[2]) - 1;
	const day = parseInt(match[3]);
	const date = new Date(year, month, day);

	return isNaN(date.getTime()) ? null : date;
}

/**
 * 计算两个日期之间的天数差
 *
 * @param date1 - 起始日期
 * @param date2 - 结束日期
 * @returns 相差天数（可为负数）
 */
export function daysBetween(date1: Date, date2: Date): number {
	const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
	const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
	return Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * 日期偏移：获取 N 天后的日期
 *
 * @param date - 基准日期
 * @param days - 偏移天数（正=未来，负=过去）
 * @returns 新的日期对象
 */
export function addDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}

/**
 * 月份偏移：获取 N 个月后的日期
 *
 * @param date   - 基准日期
 * @param months - 偏移月数
 * @returns 新的日期对象
 */
export function addMonths(date: Date, months: number): Date {
	const result = new Date(date);
	result.setMonth(result.getMonth() + months);
	return result;
}

/**
 * 获取指定月份的首尾日期范围
 *
 * @param year  - 年份
 * @param month - 月份 (0-based)
 * @returns { start: 本月1号, end: 本月最后一天 }
 */
export function getMonthDateRange(year: number, month: number): { start: Date; end: Date } {
	return { start: new Date(year, month, 1), end: new Date(year, month + 1, 0) };
}

/**
 * 获取指定日期所属季度的三个月份
 *
 * @param date - 参考日期
 * @returns 季度内的三个月份数组 (0-based)
 */
export function getQuarterMonths(date: Date = new Date()): number[] {
	const quarter = Math.floor(date.getMonth() / 3);
	return [quarter * 3, quarter * 3 + 1, quarter * 3 + 2];
}

/**
 * 生成年份列表
 *
 * @param startYear - 起始年份（默认 2020）
 * @param endYear   - 结束年份（默认 2030）
 * @returns 年份数组
 */
export function getYearList(startYear = 2020, endYear = 2030): number[] {
	const years: number[] = [];
	for (let year = startYear; year <= endYear; year++) years.push(year);
	return years;
}

// ──────────────────────────────────────────────
// 显示文本生成
// ──────────────────────────────────────────────

/**
 * 生成月份标题文本
 *
 * @param year  - 年份
 * @param month - 月份 (0-based)
 * @returns 如 "2026年 4月"
 */
export function getMonthTitle(year: number, month: number): string {
	return `${year}年 ${MONTH_NAMES[month]}`;
}

/**
 * 生成完整的日期标题
 *
 * @param date - 日期对象
 * @returns 如 "2026年4月22日 周三"
 */
export function getFullDateTitle(date: Date): string {
	return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAY_FULL_NAMES[date.getDay()]}`;
}
