/**
 * =============================================================================
 * obsidian-monthly-tasks - 节假日管理模块
 * =============================================================================
 *
 * 管理中国法定节假日和调休上班日数据。
 * 内置 2024-2027 年的完整节假日安排（来源：国务院办公厅通知）。
 *
 * 功能：
 * - 查询某日期是否为节假日/调休工作日
 * - 在月历视图中标注"休"/"班"
 * - 提供年度/月度节假日列表查询
 *
 * 数据更新：每年底国务院发布下一年安排后，在此文件中添加新数据即可。
 *
 * @module HolidayManager
 */

// ──────────────────────────────────────────────
// 枚举与接口定义
// ──────────────────────────────────────────────

/**
 * 日期类型枚举
 */
export enum HolidayType {
	/** 法定节假日（放假） */
	LEGAL = 'legal',
	/** 调休上班日（周末但要上班） */
	WORKDAY = 'workday',
	/** 普通周末（周六/周日） */
	WEEKEND = 'weekend',
	/** 普通工作日 */
	NORMAL = 'normal'
}

/**
 * 单条节假日记录
 */
export interface HolidayInfo {
	/** 日期字符串 (YYYY-MM-DD) */
	date: string;
	/** 显示名称（如 "春节"、"班"、"元旦"） */
	name: string;
	/** 日期类型 */
	type: HolidayType;
	/** 是否为放假日 */
	isOff: boolean;
}

/**
 * 年度节假日数据集合
 */
export interface YearHolidays {
	/** 年份 */
	year: number;
	/** 该年所有特殊日期记录 */
	holidays: HolidayInfo[];
	/** 最后更新时间（预留） */
	lastUpdate: string;
}

// ──────────────────────────────────────────────
// 内置节假日数据 (2024-2027)
// ──────────────────────────────────────────────

/**
 * 内置节假日数据
 *
 * 数据结构说明：
 * - key = 年份（数字）
 * - value = 该年的所有特殊日期数组
 *   - LEGAL 类型：法定节假日
 *   - WORKDAY 类型：调休上班日
 *
 * 注意：
 * - 除夕通常包含在春节假期内，但国务院不一定每年都正式列入
 * - 国庆+中秋重叠时名称会合并显示
 * - 数据来源：国务院办公厅发布的年度放假安排通知
 *
 * TODO: 每年底添加新一年的数据；或实现联网自动更新功能。
 */
const BUILTIN_HOLIDAYS: Record<number, HolidayInfo[]> = {
	2024: [
		// 元旦
		{ date: '2024-01-01', name: '元旦', type: HolidayType.LEGAL, isOff: true },
		// 春节
		{ date: '2024-02-09', name: '除夕', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-02-10', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-02-11', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-02-12', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-02-13', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-02-14', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-02-15', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-02-16', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-02-17', name: '春节', type: HolidayType.LEGAL, isOff: true },
		// 春节调休上班
		{ date: '2024-02-04', name: '班', type: HolidayType.WORKDAY, isOff: false },
		{ date: '2024-02-18', name: '班', type: HolidayType.WORKDAY, isOff: false },
		// 清明节
		{ date: '2024-04-04', name: '清明节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-04-05', name: '清明节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-04-06', name: '清明节', type: HolidayType.LEGAL, isOff: true },
		// 劳动节
		{ date: '2024-05-01', name: '劳动节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-05-02', name: '劳动节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-05-03', name: '劳动节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-05-04', name: '劳动节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-05-05', name: '劳动节', type: HolidayType.LEGAL, isOff: true },
		// 劳动节调休上班
		{ date: '2024-04-28', name: '班', type: HolidayType.WORKDAY, isOff: false },
		{ date: '2024-05-11', name: '班', type: HolidayType.WORKDAY, isOff: false },
		// 端午节
		{ date: '2024-06-10', name: '端午节', type: HolidayType.LEGAL, isOff: true },
		// 中秋节
		{ date: '2024-09-15', name: '中秋节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-09-16', name: '中秋节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-09-17', name: '中秋节', type: HolidayType.LEGAL, isOff: true },
		// 中秋节调休上班
		{ date: '2024-09-14', name: '班', type: HolidayType.WORKDAY, isOff: false },
		// 国庆节
		{ date: '2024-10-01', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-10-02', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-10-03', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-10-04', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-10-05', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-10-06', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2024-10-07', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		// 国庆节调休上班
		{ date: '2024-09-29', name: '班', type: HolidayType.WORKDAY, isOff: false },
		{ date: '2024-10-12', name: '班', type: HolidayType.WORKDAY, isOff: false },
	],
	2025: [
		{ date: '2025-01-01', name: '元旦', type: HolidayType.LEGAL, isOff: true },
		// 春节
		{ date: '2025-01-28', name: '除夕', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-01-29', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-01-30', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-01-31', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-02-01', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-02-02', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-02-03', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-02-04', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-01-26', name: '班', type: HolidayType.WORKDAY, isOff: false },
		{ date: '2025-02-08', name: '班', type: HolidayType.WORKDAY, isOff: false },
		// 清明节
		{ date: '2025-04-04', name: '清明节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-04-05', name: '清明节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-04-06', name: '清明节', type: HolidayType.LEGAL, isOff: true },
		// 劳动节
		{ date: '2025-05-01', name: '劳动节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-05-02', name: '劳动节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-05-03', name: '劳动节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-05-04', name: '劳动节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-05-05', name: '劳动节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-04-27', name: '班', type: HolidayType.WORKDAY, isOff: false },
		// 端午节
		{ date: '2025-05-31', name: '端午节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-06-01', name: '端午节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-06-02', name: '端午节', type: HolidayType.LEGAL, isOff: true },
		// 国庆节、中秋节（2025年重合）
		{ date: '2025-10-01', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-10-02', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-10-03', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-10-04', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-10-05', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-10-06', name: '国庆节/中秋节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-10-07', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-10-08', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2025-09-28', name: '班', type: HolidayType.WORKDAY, isOff: false },
		{ date: '2025-10-11', name: '班', type: HolidayType.WORKDAY, isOff: false },
	],
	2026: [
		{ date: '2026-01-01', name: '元旦', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-01-02', name: '元旦', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-01-03', name: '元旦', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-01-04', name: '班', type: HolidayType.WORKDAY, isOff: false },
		// 春节
		{ date: '2026-02-17', name: '除夕', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-02-18', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-02-19', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-02-20', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-02-21', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-02-22', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-02-23', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-02-24', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-02-15', name: '班', type: HolidayType.WORKDAY, isOff: false },
		{ date: '2026-02-28', name: '班', type: HolidayType.WORKDAY, isOff: false },
		// 清明节
		{ date: '2026-04-04', name: '清明节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-04-05', name: '清明节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-04-06', name: '清明节', type: HolidayType.LEGAL, isOff: true },
		// 劳动节
		{ date: '2026-05-01', name: '劳动节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-05-02', name: '劳动节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-05-03', name: '劳动节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-05-04', name: '劳动节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-05-05', name: '劳动节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-04-26', name: '班', type: HolidayType.WORKDAY, isOff: false },
		{ date: '2026-05-09', name: '班', type: HolidayType.WORKDAY, isOff: false },
		// 端午节
		{ date: '2026-06-19', name: '端午节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-06-20', name: '端午节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-06-21', name: '端午节', type: HolidayType.LEGAL, isOff: true },
		// 中秋节
		{ date: '2026-09-25', name: '中秋节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-09-26', name: '中秋节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-09-27', name: '中秋节', type: HolidayType.LEGAL, isOff: true },
		// 国庆节
		{ date: '2026-10-01', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-10-02', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-10-03', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-10-04', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-10-05', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-10-06', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-10-07', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-10-08', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-09-20', name: '班', type: HolidayType.WORKDAY, isOff: false },
		{ date: '2026-10-10', name: '班', type: HolidayType.WORKDAY, isOff: false },
	],
	2027: [
		{ date: '2027-01-01', name: '元旦', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-01-02', name: '元旦', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-01-03', name: '元旦', type: HolidayType.LEGAL, isOff: true },
		{ date: '2026-12-31', name: '班', type: HolidayType.WORKDAY, isOff: false },
		{ date: '2027-01-09', name: '班', type: HolidayType.WORKDAY, isOff: false },
		// 春节
		{ date: '2027-02-06', name: '除夕', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-02-07', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-02-08', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-02-09', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-02-10', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-02-11', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-02-12', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-02-13', name: '春节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-02-05', name: '班', type: HolidayType.WORKDAY, isOff: false },
		{ date: '2027-02-20', name: '班', type: HolidayType.WORKDAY, isOff: false },
		// 清明节
		{ date: '2027-04-03', name: '清明节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-04-04', name: '清明节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-04-05', name: '清明节', type: HolidayType.LEGAL, isOff: true },
		// 劳动节
		{ date: '2027-05-01', name: '劳动节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-05-02', name: '劳动节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-05-03', name: '劳动节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-05-04', name: '劳动节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-05-05', name: '劳动节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-04-25', name: '班', type: HolidayType.WORKDAY, isOff: false },
		{ date: '2027-05-08', name: '班', type: HolidayType.WORKDAY, isOff: false },
		// 端午节
		{ date: '2027-06-09', name: '端午节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-06-10', name: '端午节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-06-11', name: '端午节', type: HolidayType.LEGAL, isOff: true },
		// 中秋节
		{ date: '2027-09-15', name: '中秋节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-09-16', name: '中秋节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-09-17', name: '中秋节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-09-12', name: '班', type: HolidayType.WORKDAY, isOff: false },
		{ date: '2027-09-26', name: '班', type: HolidayType.WORKDAY, isOff: false },
		// 国庆节
		{ date: '2027-10-01', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-10-02', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-10-03', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-10-04', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-10-05', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-10-06', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-10-07', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-10-08', name: '国庆节', type: HolidayType.LEGAL, isOff: true },
		{ date: '2027-09-19', name: '班', type: HolidayType.WORKDAY, isOff: false },
		{ date: '2027-10-09', name: '班', type: HolidayType.WORKDAY, isOff: false },
	],
};

// ──────────────────────────────────────────────
// 节假日管理器类
// ──────────────────────────────────────────────

/**
 * 节假日管理器
 *
 * 单例模式使用：通过导出的 `holidayManager` 实例直接调用。
 *
 * @example
 * import { holidayManager } from './HolidayManager';
 *
 * const info = holidayManager.getHolidayInfo(new Date(2026, 0, 1));
 * console.log(info); // => { date: '2026-01-01', name: '元旦', type: 'legal', isOff: true }
 */
export class HolidayManager {
	/** 按年份索引的缓存数据 */
	private cache: Map<number, HolidayInfo[]> = new Map();

	constructor() {
		this.loadBuiltinData();
	}

	/**
	 * 加载内置节假日数据到内存缓存
	 */
	private loadBuiltinData(): void {
		for (const [year, holidays] of Object.entries(BUILTIN_HOLIDAYS)) {
			this.cache.set(parseInt(year), [...holidays]);
		}
	}

	// ── 查询方法 ────────────────────────────

	/**
	 * 获取指定日期的节假日信息
	 *
	 * @param date - 要查询的日期
	 * @returns 节假日信息对象，无匹配返回 undefined
	 */
	getHolidayInfo(date: Date): HolidayInfo | undefined {
		const dateStr = this.formatDate(date);
		const year = date.getFullYear();
		const holidays = this.cache.get(year) || [];
		return holidays.find(h => h.date === dateStr);
	}

	/**
	 * 获取指定年份的全部节假日数据
	 *
	 * @param year - 年份
	 * @returns 该年的所有特殊日期记录
	 */
	getYearHolidays(year: number): HolidayInfo[] {
		return this.cache.get(year) || [];
	}

	/**
	 * 判断是否为法定节假日
	 *
	 * @param date - 日期
	 * @returns 是否为法定节假日（且放假）
	 */
	isHoliday(date: Date): boolean {
		const info = this.getHolidayInfo(date);
		return info?.type === HolidayType.LEGAL && info.isOff;
	}

	/**
	 * 判断是否为调休上班日
	 *
	 * @param date - 日期
	 * @returns 是否需要上班的调休日
	 */
	isWorkday(date: Date): boolean {
		const info = this.getHolidayInfo(date);
		return info?.type === HolidayType.WORKDAY;
	}

	/**
	 * 判断是否为普通周末
	 *
	 * @param date - 日期
	 * @returns 是否为周六或周日
	 */
	isWeekend(date: Date): boolean {
		const day = date.getDay();
		return day === 0 || day === 6;
	}

	/**
	 * 获取日期的综合类型
	 *
	 * 优先级：法定假日 > 调休 > 周末 > 普通
	 *
	 * @param date - 日期
	 * @returns 对应的 HolidayType 枚举值
	 */
	getDateType(date: Date): HolidayType {
		const info = this.getHolidayInfo(date);
		if (info) return info.type;
		if (this.isWeekend(date)) return HolidayType.WEEKEND;
		return HolidayType.NORMAL;
	}

	/**
	 * 获取日期的显示名称
	 *
	 * 如 "春节"、"国庆节"、"班"、"" 等
	 *
	 * @param date - 日期
	 * @returns 名称字符串，无则 undefined
	 */
	getDateName(date: Date): string | undefined {
		const info = this.getHolidayInfo(date);
		return info?.name;
	}

	/**
	 * 获取日期角标（用于在格子中显示"休"/"班"标签）
	 *
	 * @param date - 日期
	 * @returns 角标文本和类型，无需显示返回 undefined
	 */
	getDateBadge(date: Date): { text: string; type: 'off' | 'work' } | undefined {
		const info = this.getHolidayInfo(date);
		if (!info) return undefined;

		if (info.type === HolidayType.LEGAL && info.isOff) {
			return { text: '休', type: 'off' };
		}
		if (info.type === HolidayType.WORKDAY) {
			return { text: '班', type: 'work' };
		}
		return undefined;
	}

	// ── 月度查询 ─────────────────────────────

	/**
	 * 获取指定月份的所有节假日
	 *
	 * @param year  - 年份
	 * @param month - 月份 (1-based)
	 * @returns 该月的节假日记录
	 */
	getMonthHolidays(year: number, month: number): HolidayInfo[] {
		const holidays = this.getYearHolidays(year);
		return holidays.filter(h => {
			const date = new Date(h.date);
			return date.getMonth() + 1 === month;
		});
	}

	// ── 数据更新（预留）──────────────────────

	/**
	 * 从网络更新节假日数据（预留接口）
	 *
	 * TODO: 接入 timor.tech 或类似 API 实现自动更新
	 *
	 * @param year - 需要更新的年份
	 * @returns 是否成功
	 */
	async updateFromNetwork(year: number): Promise<boolean> {
		console.log(`节假日数据：使用内置数据 ${year}年`);
		return true;
	}

	// ── 私有工具 ─────────────────────────────

	/**
	 * 格式化日期为 YYYY-MM-DD
	 */
	private formatDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}
}

// ──────────────────────────────────────────────
// 全局单例实例
// ──────────────────────────────────────────────

/**
 * 全局节假日管理器实例
 *
 * 整个插件共享同一个实例，避免重复加载内置数据。
 *
 * @example
 * import { holidayManager } from './HolidayManager';
 *
 * if (holidayManager.isHoliday(today)) {
 *     // 今天是节假日 🎉
 * }
 */
export const holidayManager = new HolidayManager();
