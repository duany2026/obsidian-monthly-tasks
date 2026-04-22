/**
 * =============================================================================
 * obsidian-monthly-tasks - 农历计算模块
 * =============================================================================
 *
 * 提供公历→农历转换、传统节日判断、干支生肖计算等功能。
 * 基于 1900-2100 年的农历数据表，覆盖范围足够日常使用。
 *
 * 数据来源：标准农历算法（与手机日历一致）
 *
 * @module LunarCalendar
 */

// ──────────────────────────────────────────────
// 接口定义
// ──────────────────────────────────────────────

/**
 * 农历日期信息
 */
export interface LunarDate {
	/** 农历年份（如 2026） */
	year: number;
	/** 农历月份（1-12） */
	month: number;
	/** 农历日期（1-30） */
	day: number;
	/** 是否为闰月 */
	isLeap: boolean;
	/** 干支纪年（如 "甲辰"） */
	ganZhiYear: string;
	/** 生肖动物（如 "龙"） */
	zodiac: string;
}

// ──────────────────────────────────────────────
// 常量数据表
// ──────────────────────────────────────────────

/**
 * 农历月份名称（简写，用于界面显示）
 *
 * 使用中国传统叫法：
 * 正、二、三、四、五、六、七、八、九、十、冬、腊
 */
const LUNAR_MONTH_NAMES = [
	'正', '二', '三', '四', '五', '六',
	'七', '八', '九', '十', '冬', '腊'
];

/**
 * 农历日期名称
 *
 * 初一至三十的中文表示。
 */
const LUNAR_DAY_NAMES = [
	'初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
	'十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
	'廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'
];

/** 天干（10个） */
const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

/** 地支（12个） */
const DI_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** 生肖动物（12个） */
const ZODIAC_ANIMALS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];

/**
 * 传统节日映射表
 *
 * key: "农历月份-日期" (M-D 格式)
 * value: 节日简称（两字，适合在格子中显示）
 *
 * 这些节日会在月历视图中替代普通农历文字显示。
 */
const TRADITIONAL_HOLIDAYS: Record<string, string> = {
	'1-1':   '春节',
	'1-15':  '元宵',
	'2-2':   '龙抬头',
	'5-5':   '端午',
	'7-7':   '七夕',
	'7-15':  '中元',
	'8-15':  '中秋',
	'9-9':   '重阳',
	'10-1':  '寒衣',
	'10-15': '下元',
	'12-8':  '腊八',
	'12-23': '小年',
	'12-30': '除夕'
};

// ──────────────────────────────────────────────
// 农历数据表 (1900-2100)
// ──────────────────────────────────────────────

/**
 * 1900-2100年农历数据
 *
 * 每个元素为 16 位十六进制数，编码规则：
 * - 低 12 位（bit 0-11）：表示 1-12 月每月的天数
 *   1 = 29 天（小月），0 = 30 天（大月）
 * - 高 4 位（bit 12-15）：表示闰月的月份（0 表示无闰月）
 * - 额外 bit 16（如果存在）：表示闰月天数（1=30天，0=29天）
 *
 * 数据来源：标准天文算法计算结果
 */
const LUNAR_INFO = [
	0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
	0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
	0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
	0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
	0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
	0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5d0, 0x14573, 0x052d0, 0x0a9a8, 0x0e950, 0x06aa0,
	0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
	0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b5a0, 0x195a6,
	0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
	0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
	0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
	0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
	0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
	0x05aa0, 0x076a3, 0x096d0, 0x04bd7, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
	0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
	0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
	0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
	0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
	0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
	0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
	0x0d520
];

// ──────────────────────────────────────────────
// 内部辅助函数（不导出）
// ──────────────────────────────────────────────

/**
 * 获取指定农历年份的总天数
 *
 * 基础天数 = 354 + 大月数量（每月多一天）+ 闰月天数
 *
 * @param year - 农历年份
 * @returns 该年总天数（353-385 之间）
 */
function getLunarYearDays(year: number): number {
	let sum = 348;  // 基准值：12 × 29 = 348
	const info = LUNAR_INFO[year - 1900];

	// 检查每个月是否为大月（bit 为 1 则 +1 天）
	for (let i = 0x8000; i > 0x8; i >>= 1) {
		sum += (info & i) ? 1 : 0;
	}
	return sum + getLeapDays(year);
}

/**
 * 获取指定年份闰月的天数
 *
 * @param year - 农历年份
 * @returns 闰月天数（29 或 30），无闰月返回 0
 */
function getLeapDays(year: number): number {
	if (getLeapMonth(year)) {
		return (LUNAR_INFO[year - 1900] & 0x10000) ? 30 : 29;
	}
	return 0;
}

/**
 * 获取指定年份的闰月月份
 *
 * 从数据的高 4 位提取。
 *
 * @param year - 农历年份
 * @returns 闰月月份（1-12），0 表示无闰月
 */
function getLeapMonth(year: number): number {
	return LUNAR_INFO[year - 1900] & 0xf;
}

/**
 * 获取指定农历月份的天数
 *
 * @param year  - 农历年份
 * @param month - 农历月份（1-12）
 * @returns 该月天数（29 或 30）
 */
function getLunarMonthDays(year: number, month: number): number {
	return (LUNAR_INFO[year - 1900] & (0x10000 >> month)) ? 30 : 29;
}

// ──────────────────────────────────────────────
// 核心转换函数
// ──────────────────────────────────────────────

/**
 * 公历日期 → 农历日期转换
 *
 * 算法概述：
 * 1. 计算从基准日（1900年1月31日 = 农历正月初一）到目标日期的总天数偏移量
 * 2. 按逐年累减确定农历年份
 * 3. 在该年内按逐月累减确定农历月份和日期
 * 4. 计算干支和生肖
 *
 * @param date - 公历 Date 对象
 * @returns 完整的农历日期信息
 * @throws 当年份超出 1900-2100 范围时抛出错误
 *
 * @example
 * solarToLunar(new Date(2026, 3, 22)) // => { year: 2026, month: 3, day: 6, ... } （三月初六）
 */
export function solarToLunar(date: Date): LunarDate {
	let year = date.getFullYear();
	let month = date.getMonth() + 1;
	let day = date.getDate();

	// 边界检查
	if (year < 1900 || year > 2100) {
		throw new Error('年份超出支持范围（1900-2100）');
	}

	// 计算从 1900-01-31 到目标日期的天数差
	let offset = Math.floor((date.getTime() - new Date(1900, 0, 31).getTime()) / 86400000);

	// 逐步确定农历年份
	let lunarYear = 1900;
	let daysInYear = getLunarYearDays(lunarYear);
	while (offset >= daysInYear) {
		offset -= daysInYear;
		lunarYear++;
		daysInYear = getLunarYearDays(lunarYear);
	}

	// 逐步确定农历月份
	const leapMonth = getLeapMonth(lunarYear);
	let isLeap = false;
	let lunarMonth = 1;

	while (true) {
		let daysInMonth = getLunarMonthDays(lunarYear, lunarMonth);

		// 处理闰月逻辑
		if (leapMonth === lunarMonth && !isLeap) {
			if (offset >= daysInMonth) {
				offset -= daysInMonth;
				lunarMonth++;
			} else {
				isLeap = true;  // 进入闰月
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

	// 计算干支纪年
	const ganIndex = (lunarYear - 4) % 10;
	const zhiIndex = (lunarYear - 4) % 12;
	const ganZhiYear = TIAN_GAN[ganIndex] + DI_ZHI[zhiIndex];

	// 计算生肖
	const zodiac = ZODIAC_ANIMALS[zhiIndex];

	return { year: lunarYear, month: lunarMonth, day: lunarDay, isLeap, ganZhiYear, zodiac };
}

// ──────────────────────────────────────────────
// 显示文本生成函数
// ──────────────────────────────────────────────

/**
 * 获取用于显示的农历文本（精简版）
 *
 * 显示规则：
 * - 初一 → 显示月份名（如 "四月"）
 * - 闰月初一 → 显示"闰X月"
 * - 其他日期 → 显示日名（如 "初六"、"十五"）
 * - 传统节日 → 直接显示节日名（由 getLunarInfo 处理）
 *
 * @param lunarDate - 农历日期对象
 * @returns 适合在格子中显示的短文本
 *
 * @example
 * // 初一
 * getLunarDayText({ day: 1, month: 4, ... }) // => "四月"
 * // 初六
 * getLunarDayText({ day: 6, ... })           // => "初六"
 */
export function getLunarDayText(lunarDate: LunarDate): string {
	// 初一特殊处理：显示月份
	if (lunarDate.day === 1) {
		const monthName = LUNAR_MONTH_NAMES[lunarDate.month - 1];
		return lunarDate.isLeap ? `闰${monthName}月` : `${monthName}月`;
	}
	return LUNAR_DAY_NAMES[lunarDate.day - 1];
}

/**
 * 获取完整的农历日期文本
 *
 * 如 "正月初一"、"腊月三十"、"闰四月十五"
 *
 * @param lunarDate - 农历日期对象
 * @returns 完整的中文农历日期
 */
export function getFullLunarText(lunarDate: LunarDate): string {
	const monthName = LUNAR_MONTH_NAMES[lunarDate.month - 1];
	const dayName = LUNAR_DAY_NAMES[lunarDate.day - 1];
	const leapPrefix = lunarDate.isLeap ? '闰' : '';
	return `${leapPrefix}${monthName}月${dayName}`;
}

/**
 * 判断某农历日期是否为传统节日
 *
 * @param lunarDate - 农历日期对象
 * @returns 节日名称字符串，不是节日则返回 undefined
 *
 * @example
 * getTraditionalHoliday({ month: 1, day: 1 }) // => "春节"
 * getTraditionalHoliday({ month: 5, day: 5 }) // => "端午"
 */
export function getTraditionalHoliday(lunarDate: LunarDate): string | undefined {
	const key = `${lunarDate.month}-${lunarDate.day}`;
	return TRADITIONAL_HOLIDAYS[key];
}

/**
 * 获取指定公历年份对应的生肖年名称
 *
 * @param year - 公历年份
 * @returns 如 "龙年"
 */
export function getZodiacYear(year: number): string {
	const zodiacIndex = (year - 4) % 12;
	return ZODIAC_ANIMALS[zodiacIndex] + '年';
}

/**
 * 获取指定公历年份对应的干支年名称
 *
 * @param year - 公历年份
 * @returns 如 "甲辰年"
 */
export function getGanZhiYear(year: number): string {
	const ganIndex = (year - 4) % 10;
	const zhiIndex = (year - 4) % 12;
	return TIAN_GAN[ganIndex] + DI_ZHI[zhiIndex] + '年';
}

// ──────────────────────────────────────────────
// 综合接口（供 UI 层调用）
// ──────────────────────────────────────────────

/**
 * 获取公历日期对应的农历显示信息（UI 友好版）
 *
 * 这是 UI 层调用的主要入口函数。
 * 自动判断是否为节日并返回适当的显示文本。
 *
 * @param date - 公历 Date 对象
 * @returns 包含显示文本和是否为节日的信息对象
 *
 * @example
 * // 春节当天
 * getLunarInfo(new Date(2026, 1, 17)) // => { text: "春节", isFestival: true }
 * // 普通日子
 * getLunarInfo(new Date(2026, 3, 22))    // => { text: "初六", isFestival: false }
 */
export function getLunarInfo(date: Date): {
	text: string;
	isFestival: boolean;
	festivalName?: string;
} {
	try {
		const lunarDate = solarToLunar(date);
		const holiday = getTraditionalHoliday(lunarDate);

		if (holiday) {
			return { text: holiday, isFestival: true, festivalName: holiday };
		}
		return { text: getLunarDayText(lunarDate), isFestival: false };
	} catch (e) {
		// 超出范围时返回空文本
		return { text: '', isFestival: false };
	}
}

/**
 * 判断是否为特殊的农历日期（初一或十五）
 *
 * 这些日期在 UI 上通常需要加粗或高亮显示。
 *
 * @param date - 公历 Date 对象
 * @returns 是否为初一或十五
 */
export function isSpecialLunarDay(date: Date): boolean {
	try {
		const lunarDate = solarToLunar(date);
		return lunarDate.day === 1 || lunarDate.day === 15;
	} catch (e) {
		return false;
	}
}
