/**
 * =============================================================================
 * obsidian-monthly-tasks - 月历视图组件
 * =============================================================================
 *
 * 插件的核心 UI 层，负责渲染月历网格、处理用户交互、管理弹窗。
 *
 * 包含 3 个主要类：
 * - **MonthlyView**：主视图，继承 Obsidian 的 ItemView，渲染完整的月历界面
 * - **DatePickerModal**：日期快速跳转弹窗
 * - **CreateTaskModal**：创建/编辑任务的弹窗表单
 *
 * @module MonthlyView
 */

import { ItemView, WorkspaceLeaf, Notice, TFile } from 'obsidian';
import { Task, isOverdue, isMultiDayTask, getMultiDayDuration, getTaskWeekSpans } from './TaskModel';
import { TaskParser } from './TaskParser';
import { generateMonthCalendar, getPrevMonth, getNextMonth, getCurrentYearMonth, getMonthTitle, formatDate, WEEKDAY_NAMES } from './Calendar';
import { getLunarInfo, isSpecialLunarDay } from './LunarCalendar';
import { holidayManager, HolidayType } from './HolidayManager';
import MonthlyTasksPlugin from './main';

/** 月历视图的类型标识符（用于注册和查找视图） */
export const VIEW_TYPE_MONTHLY = 'monthly-tasks-view';

// ──────────────────────────────────────────────
// MonthlyView 主视图类
// ──────────────────────────────────────────────

/**
 * 月历任务视图
 *
 * 继承自 Obsidian 的 `ItemView`，作为侧边栏的一个标签页显示。
 *
 * 布局结构：
 * ```
 * ┌──────────────────────────────────┐
 * │  ‹   2026年4月   ›   [今天] [×] │  ← 头部导航
 * ├──────────────────────────────────┤
 * │  日  一  二  三  四  五  六      │  ← 星期标题行
 * ├──────────────────────────────────┤
 * │  ┌────┐┌────┐┌────┐...          │  ← 日历网格 (6×7)
 * │  │30  ││31  ││1   │            │     每个格子包含：
 * │  │    ││    ││初六│            │       - 日期数字
 * │  │+   ││✓   ││☑️  │            │       - 农历信息
 * │  └────┘└────┘└────┘            │       - 任务列表
 * └──────────────────────────────────┘
 * ```
 */
export class MonthlyView extends ItemView {
	/** 任务解析器引用 */
	private taskParser: TaskParser;

	/** 当前显示的年份 */
	private currentYear: number;
	/** 当前显示的月份 (0-based) */
	private currentMonth: number;
	/** 视图根容器 DOM 元素 */
	private containerEl: HTMLElement;
	/** 头部导航区域 */
	private headerEl: HTMLElement;
	/** 日历网格容器 */
	private gridEl: HTMLElement;
	/** 关联的插件实例（用于读取设置） */
	private plugin: MonthlyTasksPlugin;

	/**
	 * 构造函数
	 *
	 * @param leaf      - Obsidian 工作区叶子节点
	 * @param taskParser - 任务解析器实例
	 * @param plugin    - 插件实例（读取设置）
	 */
	constructor(leaf: WorkspaceLeaf, taskParser: TaskParser, plugin: MonthlyTasksPlugin) {
		super(leaf);
		this.taskParser = taskParser;
		this.plugin = plugin;

		// 初始化为当前月份
		const { year, month } = getCurrentYearMonth();
		this.currentYear = year;
		this.currentMonth = month;
	}

	/** 返回视图类型标识 */
	getViewType(): string { return VIEW_TYPE_MONTHLY; }

	/** 返回视图在标题栏中显示的文字 */
	getDisplayText(): string { return '月历任务'; }

	/** 返回图标名称（使用 Obsidian 内置的 calendar 图标） */
	getIcon(): string { return 'calendar'; }

	/**
	 * 视图被打开时调用（Obsidian 自动触发）
	 *
	 * 创建容器元素并执行首次渲染。
	 */
	async onOpen(): Promise<void> {
		this.containerEl = this.contentEl.createDiv('monthly-tasks-container');
		await this.render();
	}

	/**
	 * 视图关闭时调用
	 *
	 * 清理 DOM 以防止内存泄漏。
	 */
	async onClose(): Promise<void> {
		this.containerEl.empty();
	}

	/**
	 * 渲染整个视图
	 *
	 * 首次打开时创建完整 DOM 结构，
	 * 后续刷新时只更新数据不重建结构（提升性能）。
	 */
	async render(): Promise<void> {
		if (this.containerEl.childElementCount === 0) {
			// 首次渲染：创建所有静态结构
			this.renderHeader();
			this.renderWeekdayHeader();
			this.gridEl = this.containerEl.createDiv('calendar-grid');
		}
		await this.renderCalendarGrid();
	}

	// ── 渲染子区域 ─────────────────────────

	/**
	 * 渲染头部导航栏
	 *
	 * 包含：上/下月按钮、月份标题（可点击跳转）、今天按钮、关闭按钮
	 */
	private renderHeader(): void {
		this.headerEl = this.containerEl.createDiv('monthly-header');

		// 左侧组：上一月 + 标题
		const leftGroup = this.headerEl.createDiv('header-btn-group');
		const prevBtn = leftGroup.createDiv('nav-btn prev-btn');
		prevBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>';
		prevBtn.addEventListener('click', () => this.navigateMonth(-1));

		const titleEl = this.headerEl.createDiv('month-title clickable');
		titleEl.textContent = getMonthTitle(this.currentYear, this.currentMonth);
		titleEl.addEventListener('click', () => this.openDatePicker());

		// 右侧组：下一月 + 今天 + 关闭
		const rightGroup = this.headerEl.createDiv('header-btn-group');
		const nextBtn = rightGroup.createDiv('nav-btn next-btn');
		nextBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>';
		nextBtn.addEventListener('click', () => this.navigateMonth(1));

		const todayBtn = rightGroup.createDiv('today-btn');
		todayBtn.textContent = '回到本月显示';
		todayBtn.addEventListener('click', () => this.goToToday());

		const closeBtn = rightGroup.createDiv('nav-btn close-btn');
		closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
		closeBtn.addEventListener('click', () => this.closeView());
	}

	/**
	 * 关闭当前视图（从工作区移除）
	 */
	private closeView(): void {
		this.app.workspace.getLeavesOfType(VIEW_TYPE_MONTHLY).forEach(leaf => leaf.detach());
	}

	/**
	 * 打开日期选择器弹窗
	 *
	 * 用户点击月份标题后弹出，可选择任意年/月跳转。
	 * 跳转后只更新网格数据，不重建整个视图。
	 */
	private openDatePicker(): void {
		const modal = new DatePickerModal(this.app, this.currentYear, this.currentMonth, async (year, month) => {
			this.currentYear = year;
			this.currentMonth = month;
			await this.renderCalendarGrid();  // 仅更新网格
		});
		modal.open();
	}

	/**
	 * 刷新视图
	 *
	 * @param force - true=完全重建（包括头部），false=仅更新网格数据
	 */
	async refresh(force: boolean = false): Promise<void> {
		this.taskParser.invalidateCache();
		if (force) {
			await this.render();
		} else {
			await this.renderCalendarGrid();
		}
	}

	/**
	 * 渲染星期标题行（日 一 二 ... 六）
	 *
	 * 根据设置中的 firstDayOfWeek 决定排列顺序。
	 */
	private renderWeekdayHeader(): void {
		const weekdayEl = this.containerEl.createDiv('weekday-header');
		const firstDayOfWeek = this.plugin.settings.firstDayOfWeek;

		for (let i = 0; i < 7; i++) {
			const dayIndex = (firstDayOfWeek + i) % 7;  // 支持周一或周日起始
			const dayEl = weekdayEl.createDiv(`weekday-cell${dayIndex === 0 || dayIndex === 6 ? ' weekend' : ''}`);
			dayEl.textContent = WEEKDAY_NAMES[dayIndex];
		}
	}

	/**
	 * 渲染日历网格的核心方法
	 *
	 * 执行流程：
	 * 1. 更新标题文字
	 * 2. 解析所有任务并按日期分组
	 * 3. 分离单日任务和跨天任务
	 * 4. 渲染每个日期格子
	 * 5. 在顶层渲染跨天任务条
	 */
	private async renderCalendarGrid(): Promise<void> {
		// 1. 更新标题
		const titleEl = this.headerEl.querySelector('.month-title');
		if (titleEl) titleEl.textContent = getMonthTitle(this.currentYear, this.currentMonth);

		// 2. 清空旧内容并生成新的日历数据
		this.gridEl.empty();
		const calendar = generateMonthCalendar(this.currentYear, this.currentMonth, this.plugin.settings.firstDayOfWeek);
		const taskMap = await this.taskParser.parseAllTasks(true);  // 强制刷新

		// 3. 分离单日任务和跨天任务
		const singleDayTasks = new Map<string, Task[]>();
		const multiDayTasks: Task[] = [];

		for (const [dateStr, tasks] of taskMap.taskMap) {
			const singleTasks: Task[] = [];
			for (const task of tasks) {
				if (isMultiDayTask(task)) multiDayTasks.push(task);
				else singleTasks.push(task);
			}
			if (singleTasks.length > 0) singleDayTasks.set(dateStr, singleTasks);
		}

		// 4. 渲染日期格子
		for (const day of calendar.days) {
			this.renderDayCell(day, singleDayTasks.get(formatDate(day.date)) || []);
		}

		// 5. 渲染跨天任务条（浮在格子之上）
		this.renderMultiDayTaskBars(multiDayTasks, calendar.days);
	}

	/**
	 * 渲染跨天任务横条
	 *
	 * 跨天任务不是放在单个格子里，而是以横条形式
	 * 浮在整个日历网格上方，横跨多个日期列。
	 *
	 * 算法要点：
	 * 1. 将每个跨天任务按周拆分为多个片段
	 * 2. 每周的片段独立计算垂直位置（避免重叠）
	 * 3. 使用绝对定位（百分比坐标）放置到正确位置
	 */
	private renderMultiDayTaskBars(multiDayTasks: Task[], calendarDays: import('./Calendar').CalendarDay[]): void {
		if (multiDayTasks.length === 0) return;

		// 计算每个任务的周跨度
		const taskSpans: Array<{
			task: Task;
			weekIndex: number;
			startCol: number;
			endCol: number;
		}> = [];

		for (const task of multiDayTasks) {
			const spans = getTaskWeekSpans(task, this.currentYear, this.currentMonth, this.plugin.settings.firstDayOfWeek);
			for (const span of spans) {
				taskSpans.push({ task, weekIndex: span.weekIndex, startCol: span.startCol, endCol: span.endCol });
			}
		}

		// 按周分组
		const weekGroups = new Map<number, typeof taskSpans>();
		for (const span of taskSpans) {
			const existing = weekGroups.get(span.weekIndex) || [];
			existing.push(span);
			weekGroups.set(span.weekIndex, existing);
		}

		// 为每周的任务分配行位置（避免重叠）
		const weekRows = new Map<number, Map<string, number>>();

		for (const [weekIndex, spans] of weekGroups) {
			spans.sort((a, b) => a.startCol - b.startCol);  // 按起始列排序
			const taskRows = new Map<string, number>();
			const occupiedRows: Array<{ start: number; end: number }>[] = [];

			for (const span of spans) {
				let rowIndex = 0;
				while (true) {
					if (!occupiedRows[rowIndex]) occupiedRows[rowIndex] = [];
					// 检查是否与已有任务冲突
					const hasConflict = occupiedRows[rowIndex].some(occ => !(span.endCol < occ.start || span.startCol > occ.end));
					if (!hasConflict) {
						taskRows.set(span.task.id, rowIndex);
						occupiedRows[rowIndex].push({ start: span.startCol, end: span.endCol });
						break;
					}
					rowIndex++;
				}
			}
			weekRows.set(weekIndex, taskRows);
		}

		// 创建容器并渲染任务条
		const multiDayContainer = this.gridEl.createDiv('multiday-task-container');

		for (const span of taskSpans) {
			const weekTaskRows = weekRows.get(span.weekIndex);
			if (!weekTaskRows) continue;

			const rowIndex = weekTaskRows.get(span.task.id);
			if (rowIndex === undefined) continue;

			const barEl = multiDayContainer.createDiv('multiday-task-bar');
			barEl.textContent = span.task.content;

			// 应用优先级和完成状态样式
			barEl.addClass(`multiday-priority-${span.task.priority}`);
			if (span.task.completed) barEl.addClass('completed');

			// 百分比定位：适应不同屏幕宽度
			const colWidth = 100 / 7;
			const left = span.startCol * colWidth;
			const width = (span.endCol - span.startCol + 1) * colWidth;
			const weekHeightPercent = 100 / 6;  // 6 行均分高度
			const rowOffsetPercent = (rowIndex * 4) + 2;
			const topPercent = span.weekIndex * weekHeightPercent + rowOffsetPercent;

			barEl.style.cssText = `
				position: absolute;
				left: ${left}%;
				width: ${width}%;
				top: ${topPercent}%;
			`;

			// 点击切换完成状态
			barEl.addEventListener('click', (e) => {
				e.stopPropagation();
				this.toggleTask(span.task);
			});
		}
	}

	/**
	 * 渲染单个日期格子
	 *
	 * 每个格子包含：
	 * - 日期数字 + 农历信息
	 * - 节假日标注（如 "春节"、"休"）
	 * - 任务列表（带数量限制）
	 * - "+N" 折叠提示 / "+" 新建按钮
	 *
	 * 格子的 CSS 类会根据日期类型自动添加：
	 * - other-month: 非当月日期（灰色）
	 * - today: 今天（高亮）
	 * - holiday: 法定节假日
	 * - workday: 调休上班日
	 * - weekend / weekday
	 */
	private renderDayCell(day: import('./Calendar').CalendarDay, tasks: Task[]): void {
		const cellEl = this.gridEl.createDiv('day-cell');

		// 基础状态判断
		if (!day.isCurrentMonth) cellEl.addClass('other-month');
		if (day.isToday) cellEl.addClass('today');

		// 节假日/周末/工作日标记
		const holidayInfo = holidayManager.getHolidayInfo(day.date);
		if (holidayInfo) {
			if (holidayInfo.type === HolidayType.LEGAL) cellEl.addClass('holiday');
			else if (holidayInfo.type === HolidayType.WORKDAY) cellEl.addClass('workday');
		} else if (day.isWeekend) {
			cellEl.addClass('weekend');
		} else {
			cellEl.addClass('weekday');
		}

		// ── 格子头部（日期 + 农历）────────
		const headerEl = cellEl.createDiv('day-header');
		const headerRow = headerEl.createDiv('day-header-row');
		headerRow.createDiv('day-number').textContent = String(day.day);

		// 农历显示（可选）
		if (this.plugin.settings.showLunar) {
			const lunarInfo = getLunarInfo(day.date);
			const lunarEl = headerRow.createDiv('lunar-info');
			lunarEl.textContent = lunarInfo.text;
			// 初一/十五加粗显示
			if (isSpecialLunarDay(day.date) && !lunarInfo.isFestival) lunarEl.addClass('special-lunar');
		}

		// 法定节假日名称
		if (this.plugin.settings.showHoliday && holidayInfo?.type === HolidayType.LEGAL) {
			headerEl.createDiv('holiday-name').textContent = holidayInfo.name;
		}

		// ── 任务列表 ───────────────────────
		const tasksEl = cellEl.createDiv('day-tasks');

		// 过滤已完成的任务（根据设置决定是否隐藏）
		const displayTasksList = this.plugin.settings.showCompletedTasks ? tasks : tasks.filter(t => !t.completed);

		// 限制显示数量（超出折叠为 "+N"）
		const limit = this.plugin.settings.tasksPerDayLimit;
		const displayTasks = displayTasksList.slice(0, limit);
		const remainingCount = displayTasksList.length - displayTasks.length;

		for (const task of displayTasks) this.renderTaskItem(tasksEl, task, day.date);

		if (remainingCount > 0) tasksEl.createDiv('more-tasks').textContent = `+${remainingCount}`;
		if (tasks.length === 0) tasksEl.createDiv('empty-hint').textContent = '+';

		// 点击空白区域 → 打开创建任务弹窗
		cellEl.addEventListener('click', (e) => {
			if ((e.target as HTMLElement).closest('.task-item')) return;
			this.openCreateTaskModal(day.date, tasks);
		});
	}

	/**
	 * 渲染单个任务项
	 *
	 * 显示格式：
	 * - 单日任务：纯文本 + 优先级色块
	 * - 跨天任务：文本 "(N天)" + 起止位置标记
	 * - 已完成任务：删除线样式
	 * - 逾期任务：红色警告
	 */
	private renderTaskItem(container: HTMLElement, task: Task, dayDate?: Date): void {
		const taskEl = container.createDiv('task-item');

		// 状态样式
		if (task.completed) taskEl.addClass('completed');
		if (task.dueDate && isOverdue(task.dueDate) && !task.completed) taskEl.addClass('overdue');
		taskEl.addClass(`priority-bg-${task.priority}`);

		// 跨天任务特殊处理
		const multiDay = isMultiDayTask(task);
		if (multiDay) {
			taskEl.addClass('multi-day-task');
			taskEl.setAttribute('data-duration', String(getMultiDayDuration(task)));
			if (dayDate && task.startDate) {
				const start = new Date(task.startDate);
				const dayIndex = Math.floor((dayDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
				taskEl.setAttribute('data-day-index', String(dayIndex));
				if (dayIndex === 0) taskEl.addClass('multi-day-start');
				if (dayDate.toISOString().split('T')[0] === task.dueDate) taskEl.addClass('multi-day-end');
			}
		}

		// 内容文本
		const contentEl = taskEl.createDiv('task-content');
		contentEl.textContent = multiDay ? `${task.content} (${getMultiDayDuration(task)}天)` : task.content;
		contentEl.setAttribute('title', task.content);  // 悬停提示完整内容

		// 点击 → 切换完成状态
		taskEl.addEventListener('click', (e) => {
			e.stopPropagation();
			this.toggleTask(task);
		});
	}

	/**
	 * 切换任务完成状态
	 *
	 * 通过 TaskParser 修改文件内容，
	 * 成功后显示通知并延迟 200ms 刷新视图。
	 */
	private async toggleTask(task: Task): Promise<void> {
		const success = await this.taskParser.toggleTask(task);
		if (success) {
			new Notice(task.completed ? '任务已标记为未完成' : '任务已完成');
			setTimeout(() => this.refresh(), 200);
		} else {
			new Notice('操作失败，请重试');
		}
	}

	/**
	 * 打开创建任务弹窗
	 *
	 * @param date          - 点击的目标日期
	 * @param existingTasks - 当天已有的任务列表（显示在弹窗中供参考）
	 */
	private openCreateTaskModal(date: Date, existingTasks: Task[] = []): void {
		const modal = new CreateTaskModal(this.app, date,
			async (content, isAllDay, time, priority, endDate) => {
				const success = await this.taskParser.createTaskForDate(date, content, isAllDay, time, priority, endDate);
				if (success) {
					new Notice('任务已创建');
					await this.refresh(true);
				} else {
					new Notice('创建失败，请重试');
				}
			},
			this.plugin, existingTasks
		);
		modal.open();
	}

	/**
	 * 导航到相邻月份
	 *
	 * @param direction - -1=上月, +1=下月
	 */
	private async navigateMonth(direction: number): Promise<void> {
		const target = direction < 0
			? getPrevMonth(this.currentYear, this.currentMonth)
			: getNextMonth(this.currentYear, this.currentMonth);
		this.currentYear = target.year;
		this.currentMonth = target.month;
		await this.renderCalendarGrid();
	}

	/**
	 * 回到当前月
	 */
	private async goToToday(): Promise<void> {
		const { year, month } = getCurrentYearMonth();
		this.currentYear = year;
		this.currentMonth = month;
		await this.renderCalendarGrid();
	}
}

// ──────────────────────────────────────────────
// DatePickerModal 日期选择器弹窗
// ──────────────────────────────────────────────

/**
 * 日期快速跳转弹窗
 *
 * 允许用户通过年份输入框 + 月份按钮网格
 * 快速跳转到指定的年/月。
 *
 * 特性：
 * - 年份支持手动输入或 +/- 按钮调整
 * - 月份使用 3×4 按钮网格，高亮当前选中月份
 * - 当前月份有特殊标记
 * - 支持键盘操作
 */
class DatePickerModal {
	private app: import('obsidian').App;
	private year: number;
	private month: number;
	private onSubmit: (year: number, month: number) => void;
	private modalEl: HTMLElement;
	private currentYear: number;
	private currentMonth: number;

	constructor(
		app: import('obsidian').App,
		currentYear: number,
		currentMonth: number,
		onSubmit: (year: number, month: number) => void
	) {
		this.app = app;
		this.year = currentYear;
		this.month = currentMonth;
		this.onSubmit = onSubmit;

		// 记录"今天"所在的年月（用于高亮标记）
		const now = new Date();
		this.currentYear = now.getFullYear();
		this.currentMonth = now.getMonth();
	}

	/**
	 * 显示弹窗
	 *
	 * 创建遮罩层 + 弹窗 DOM，绑定事件处理器。
	 */
	open(): void {
		// 半透明遮罩背景
		const overlay = document.createElement('div');
		overlay.className = 'modal-overlay';
		document.body.appendChild(overlay);

		// 弹窗主体
		this.modalEl = document.createElement('div');
		this.modalEl.className = 'date-picker-modal';

		// ── 标题 ──────────────────────────
		const titleEl = this.modalEl.createDiv('modal-title');
		titleEl.textContent = '选择日期';

		// ── 年份选择区 ─────────────────────
		const yearSection = this.modalEl.createDiv('picker-section');
		yearSection.createEl('div', { cls: 'section-label', text: '年份' });

		const yearInputWrapper = yearSection.createDiv('year-input-wrapper');

		// 减号按钮
		const yearDecBtn = yearInputWrapper.createEl('button', { cls: 'year-nav-btn', text: '−' });

		// 数字输入框
		const yearInput = yearInputWrapper.createEl('input', {
			cls: 'year-input',
			attr: { type: 'number', value: String(this.year), min: '1900', max: '2100' }
		});

		// 加号按钮
		const yearIncBtn = yearInputWrapper.createEl('button', { cls: 'year-nav-btn', text: '+' });

		// 当前年份提示
		const currentYearHint = yearSection.createEl('div', {
			cls: 'current-year-hint',
			text: `当前年份: ${this.currentYear}`
		});

		// 年份调整事件
		yearDecBtn.addEventListener('click', () => {
			this.year = Math.max(1900, this.year - 1);
			yearInput.value = String(this.year);
		});
		yearIncBtn.addEventListener('click', () => {
			this.year = Math.min(2100, this.year + 1);
			yearInput.value = String(this.year);
		});
		yearInput.addEventListener('change', () => {
			let val = parseInt(yearInput.value);
			if (isNaN(val)) val = this.currentYear;
			val = Math.max(1900, Math.min(2100, val));
			this.year = val;
			yearInput.value = String(val);
		});

		// ── 月份选择区（按钮网格）─────────
		const monthSection = this.modalEl.createDiv('picker-section');
		monthSection.createEl('div', { cls: 'section-label', text: '月份' });

		const monthGrid = monthSection.createDiv('month-grid');
		const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

		for (let m = 0; m < 12; m++) {
			const isSelected = (m === this.month);
			const isCurrent = (m === this.currentMonth);
			const monthBtn = monthGrid.createEl('button', {
				cls: `month-btn ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`,
				text: monthNames[m]
			});
			monthBtn.addEventListener('click', () => {
				monthGrid.querySelectorAll('.month-btn').forEach(btn => btn.removeClass('selected'));
				monthBtn.addClass('selected');
				this.month = m;
			});
		}

		// ── 底部按钮组 ─────────────────────
		const btnGroup = this.modalEl.createDiv('modal-buttons');

		const cancelBtn = btnGroup.createEl('button', { cls: 'btn-cancel', text: '取消' });
		cancelBtn.addEventListener('click', () => this.close(overlay));

		const confirmBtn = btnGroup.createEl('button', { cls: 'btn-confirm', text: '确定' });
		confirmBtn.addEventListener('click', () => {
			this.onSubmit(this.year, this.month);
			this.close(overlay);
		});

		document.body.appendChild(this.modalEl);

		// 点击遮罩层关闭
		overlay.addEventListener('click', () => this.close(overlay));
	}

	/**
	 * 关闭弹窗并清理 DOM
	 */
	private close(overlay: HTMLElement): void {
		overlay.remove();
		this.modalEl.remove();
	}
}

// ──────────────────────────────────────────────
// CreateTaskModal 创建任务弹窗
// ──────────────────────────────────────────────

/**
 * 创建任务弹窗
 *
 * 一个功能丰富的模态对话框，包含：
 * - 日期信息展示（含节假日）
 * - 已有任务列表预览
 * - 任务内容输入框
 * - 时间选择器（小时:分钟 下拉框 + 全天开关）
 * - 结束日期选择器（跨天任务用）
 * - 优先级选择器（三档：高/中/普通）
 * - 取消/确认按钮
 * - 键盘快捷键支持（Enter=提交, Escape=取消）
 *
 * 交互设计原则：
 * - 输入框自动聚焦
 * - 默认全天任务可通过开关切换为指定时间
 * - 跨天任务默认关闭，开启后才显示结束日期选择
 */
class CreateTaskModal {
	private app: import('obsidian').App;
	private date: Date;
	private onSubmit: (content: string, isAllDay: boolean, time?: string, priority?: number, endDate?: Date) => void;
	private modalEl: HTMLElement;
	private plugin: MonthlyTasksPlugin;
	private existingTasks: Task[];

	constructor(
		app: import('obsidian').App,
		date: Date,
		onSubmit: (content: string, isAllDay: boolean, time?: string, priority?: number, endDate?: Date) => void,
		plugin: MonthlyTasksPlugin,
		existingTasks: Task[] = []
	) {
		this.app = app;
		this.date = date;
		this.onSubmit = onSubmit;
		this.plugin = plugin;
		this.existingTasks = existingTasks;
	}

	/**
	 * 显示弹窗
	 */
	open(): void {
		// ── 遮罩层 ──────────────────────────
		const overlay = document.createElement('div');
		overlay.className = 'modal-overlay';
		document.body.appendChild(overlay);

		// ── 弹窗主体 ───────────────────────
		this.modalEl = document.createElement('div');
		this.modalEl.className = 'create-task-modal';

		// ── 日期信息头部 ───────────────────
		const dateInfoEl = this.modalEl.createDiv('modal-date-info');
		const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][this.date.getDay()];
		const holidayInfo = holidayManager.getHolidayInfo(this.date);
		const holidayText = holidayInfo ? ` · ${holidayInfo.name}` : '';
		dateInfoEl.innerHTML = `<div class="date-main">${this.date.getMonth() + 1}月${this.date.getDate()}日 · ${weekday}${holidayText}</div>`;

		// ── 已有任务预览 ───────────────────
		if (this.existingTasks.length > 0) {
			const existingTasksEl = this.modalEl.createDiv('modal-existing-tasks');
			existingTasksEl.createEl('div', { cls: 'existing-tasks-title', text: `今日已有 ${this.existingTasks.length} 个任务` });
			const tasksListEl = existingTasksEl.createDiv('existing-tasks-list');

			this.existingTasks.slice(0, 5).forEach(task => {
				const taskEl = tasksListEl.createDiv('existing-task-item');
				if (task.completed) taskEl.addClass('completed');
				if (task.priority > 0) taskEl.addClass(`priority-${task.priority}`);
				taskEl.textContent = task.content;
			});

			if (this.existingTasks.length > 5) {
				tasksListEl.createDiv('existing-tasks-more').textContent = `还有 ${this.existingTasks.length - 5} 个任务...`;
			}
		}

		// ── 任务内容输入框 ─────────────────
		const inputWrapper = this.modalEl.createDiv('task-input-wrapper');
		const inputEl = inputWrapper.createEl('input', {
			cls: 'task-input',
			attr: { type: 'text', placeholder: '输入任务内容...' }
		});

		// ── 时间选择器（条件显示）──────────
		let timeInputEl: HTMLInputElement | null = null;
		let isAllDay = this.plugin.settings.defaultAllDayTask;

		// 如果默认不是全天模式，才显示时间选择器
		if (!this.plugin.settings.defaultAllDayTask) {
			const timeContainer = this.modalEl.createDiv('modal-time-container');
			timeContainer.createEl('span', { cls: 'time-label', text: '时间' });

			const timeWrapper = timeContainer.createDiv('time-input-wrapper');
			timeInputEl = timeWrapper.createEl('input', {
				cls: 'time-input',
				attr: { type: 'time', value: '09:00' }
			});

			// 全天任务开关
			const allDayToggle = timeWrapper.createDiv('all-day-toggle');
			const allDayCheckbox = allDayToggle.createEl('input', { attr: { type: 'checkbox' } });
			allDayToggle.createEl('span', { text: '全天' });

			allDayCheckbox.addEventListener('change', (e) => {
				isAllDay = (e.target as HTMLInputElement).checked;
				if (timeInputEl) {
					timeInputEl.disabled = isAllDay;
					timeInputEl.style.opacity = isAllDay ? '0.4' : '1';
				}
			});
		}

		// ── 结束日期选择（跨天任务）────────
		const endDateContainer = this.modalEl.createDiv('modal-end-date');
		endDateContainer.createEl('span', { cls: 'end-date-label', text: '结束日期' });

		const endDateWrapper = endDateContainer.createDiv('end-date-wrapper');

		let endDate: Date | undefined = undefined;
		let isMultiDay = false;

		// 跨天任务开关
		const multiDayToggle = endDateWrapper.createDiv('multi-day-toggle');
		const multiDayCheckbox = multiDayToggle.createEl('input', { attr: { type: 'checkbox' } });
		multiDayToggle.createEl('span', { text: '跨天任务' });

		const endDateInput = endDateWrapper.createEl('input', {
			cls: 'end-date-input',
			attr: { type: 'date', value: this.formatDateForInput(this.date), min: this.formatDateForInput(this.date) }
		});
		endDateInput.style.display = 'none';  // 默认隐藏

		multiDayCheckbox.addEventListener('change', (e) => {
			isMultiDay = (e.target as HTMLInputElement).checked;
			endDateInput.style.display = isMultiDay ? 'block' : 'none';
			if (isMultiDay) {
				endDate = new Date(endDateInput.value);
			} else {
				endDate = undefined;
			}
		});

		endDateInput.addEventListener('change', (e) => {
			if (isMultiDay) {
				endDate = new Date((e.target as HTMLInputElement).value);
			}
		});

		// ── 优先级选择器 ───────────────────
		const priorityContainer = this.modalEl.createDiv('modal-priority');
		priorityContainer.createEl('span', { cls: 'priority-label', text: '优先级' });
		const priorityGroup = priorityContainer.createDiv('priority-group');

		const priorities = [
			{ value: 3, class: 'priority-high', label: '高' },
			{ value: 2, class: 'priority-medium', label: '中' },
			{ value: 0, class: 'priority-none', label: '普通' }
		];

		let selectedPriority = 0;
		const priorityWrappers: HTMLElement[] = [];

		priorities.forEach((p, index) => {
			const wrapper = priorityGroup.createDiv('priority-btn-wrapper');
			if (p.value === 0) wrapper.addClass('selected');  // 默认选中"普通"

			const btn = wrapper.createEl('button', {
				cls: `priority-btn ${p.class} ${p.value === 0 ? 'selected' : ''}`
			});

			wrapper.createDiv('priority-btn-text').textContent = p.label;
			priorityWrappers.push(wrapper);

			wrapper.addEventListener('click', () => {
				selectedPriority = p.value;
				priorityWrappers.forEach(w => {
					w.removeClass('selected');
					w.querySelector('.priority-btn')?.removeClass('selected');
				});
				wrapper.addClass('selected');
				btn.addClass('selected');
			});
		});

		// ── 底部按钮 ───────────────────────
		const btnGroup = this.modalEl.createDiv('modal-buttons');

		const cancelBtn = btnGroup.createEl('button', { cls: 'btn-cancel', text: '取消' });
		cancelBtn.addEventListener('click', () => this.close(overlay));

		const confirmBtn = btnGroup.createEl('button', { cls: 'btn-confirm', text: '添加任务' });

		// 提交逻辑
		const submitTask = () => {
			const content = inputEl.value.trim();
			if (content) {
				const time = timeInputEl && !isAllDay ? timeInputEl.value : undefined;
				this.onSubmit(content, isAllDay, time, selectedPriority, endDate);
				this.close(overlay);
			}
		};

		confirmBtn.addEventListener('click', submitTask);

		// 自动聚焦到输入框
		setTimeout(() => { inputEl.focus(); }, 100);

		// 键盘快捷键：Enter 提交 / Escape 关闭
		inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') submitTask();
			else if (e.key === 'Escape') this.close(overlay);
		});

		document.body.appendChild(this.modalEl);

		// 点击遮罩关闭
		overlay.addEventListener('click', () => this.close(overlay));
	}

	/**
	 * 关闭弹窗并清理 DOM
	 */
	private close(overlay: HTMLElement): void {
		overlay.remove();
		this.modalEl.remove();
	}

	/**
	 * 格式化 Date 对象为 HTML date input 所需的格式
	 */
	private formatDateForInput(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}
}
