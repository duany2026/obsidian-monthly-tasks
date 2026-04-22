/**
 * =============================================================================
 * obsidian-monthly-tasks - 任务解析器
 * =============================================================================
 *
 * 负责扫描 Obsidian Vault 中的所有 Markdown 文件，
 * 解析符合 Tasks 插件格式的任务行，提供任务的
 * 增删改查操作。
 *
 * 核心能力：
 * - 遍历所有 .md 文件，通过 MetadataCache 高效提取任务
 * - 解析任务语法（复选框、日期标记、优先级 emoji）
 * - 支持创建新任务（自动管理目标文件）
 * - 内置缓存机制避免重复扫描
 *
 * @module TaskParser
 */

import { App, TFile, ListItemCache } from 'obsidian';
import { Task, TaskMap, generateTaskId, parsePriority, cleanTaskContent, extractDueDate, extractStartDate, isTaskLine, isTaskCompleted, groupTasksByDate } from './TaskModel';

// ──────────────────────────────────────────────
// 接口定义
// ──────────────────────────────────────────────

/**
 * 解析结果接口
 *
 * 包含完整的任务列表和按日期分组的映射表。
 */
export interface ParseResult {
	/** 扫描到的全部任务（扁平数组） */
	tasks: Task[];
	/** 按日期索引的任务映射表 */
	taskMap: TaskMap;
	/** 解析完成的时间戳（用于缓存有效性判断） */
	parseTime: number;
}

// ──────────────────────────────────────────────
// TaskParser 类
// ──────────────────────────────────────────────

/**
 * 任务解析器
 *
 * 作为插件的数据层核心，封装了所有文件 I/O 和任务解析逻辑。
 * 使用 Obsidian 的 MetadataCache API 高效获取文件结构信息，
 * 避免逐行正则匹配的性能问题。
 *
 * @example
 * ```ts
 * const parser = new TaskParser(app);
 * const result = await parser.parseAllTasks();
 * console.log(result.taskMap.get('2026-04-22')); // 当天的任务列表
 * ```
 */
export class TaskParser {
	/** Obsidian App 实例引用 */
	private app: App;

	/** 最近一次的解析结果缓存（5秒内有效） */
	private cache: ParseResult | null = null;

	/** 上次缓存的更新时间戳 */
	private lastParseTime = 0;

	/** 缓存有效期（毫秒），防止高频调用时反复扫描整个 Vault */
	private readonly CACHE_DURATION = 5000;

	constructor(app: App) {
		this.app = app;
	}

	// ── 任务扫描 ──────────────────────────────

	/**
	 * 解析 Vault 中的所有任务
	 *
	 * 遍历仓库中所有 Markdown 文件，提取任务行并构建索引。
	 * 结果会缓存 5 秒，在此期间的重复调用直接返回缓存。
	 *
	 * @param forceRefresh - 是否强制忽略缓存重新扫描
	 * @returns 解析结果（包含任务列表和按日期分组的 Map）
	 */
	async parseAllTasks(forceRefresh = false): Promise<ParseResult> {
		// 命中缓存则直接返回
		if (!forceRefresh && this.cache && Date.now() - this.lastParseTime < this.CACHE_DURATION) {
			return this.cache;
		}

		const tasks: Task[] = [];
		const files = this.app.vault.getMarkdownFiles();

		// 逐文件扫描
		for (const file of files) {
			const fileTasks = await this.parseFile(file);
			tasks.push(...fileTasks);
		}

		// 构建日期索引并更新缓存
		const taskMap = groupTasksByDate(tasks);
		const now = Date.now();
		this.cache = { tasks, taskMap, parseTime: now };
		this.lastParseTime = now;

		return this.cache;
	}

	/**
	 * 解析单个文件中的任务
	 *
	 * 利用 Obsidian 的 `MetadataCache` 获取文件的结构化信息，
	 * 只检查被识别为 `task` 的 list item，避免逐行遍历。
	 *
	 * @param file - 目标 Markdown 文件
	 * @returns 该文件中找到的任务列表
	 */
	async parseFile(file: TFile): Promise<Task[]> {
		const tasks: Task[] = [];

		// 通过元数据缓存获取文件的列表项信息
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.listItems) return tasks;

		// 读取完整文件内容（用于提取原始行文本）
		const content = await this.app.vault.cachedRead(file);
		const lines = content.split('\n');

		for (const item of cache.listItems) {
			// 只处理被 Obsidian 识别为"任务"的列表项
			if (item.task === undefined) continue;

			const lineNumber = item.position.start.line;
			const line = lines[lineNumber];
			if (!line || !isTaskLine(line)) continue;

			const task = this.parseTaskLine(line, file.path, lineNumber);
			if (task) tasks.push(task);
		}

		return tasks;
	}

	/**
	 * 解析单行文本为 Task 对象
	 *
	 * 从原始行中提取：内容、优先级、日期、完成状态等信息。
	 *
	 * @param line       - 原始行文本
	 * @param filePath   - 文件路径
	 * @param lineNumber - 行号
	 * @returns 解析后的 Task 对象，如果内容为空则返回 null
	 */
	private parseTaskLine(line: string, filePath: string, lineNumber: number): Task | null {
		const content = cleanTaskContent(line);
		if (!content) return null;  // 空内容则跳过

		return {
			id: generateTaskId(filePath, lineNumber),
			content,
			rawLine: line,
			filePath,
			lineNumber,
			completed: isTaskCompleted(line),
			startDate: extractStartDate(line),
			dueDate: extractDueDate(line),
			priority: parsePriority(line),
			createdAt: Date.now()
		};
	}

	// ── 查询方法 ──────────────────────────────

	/**
	 * 获取指定日期的所有任务
	 *
	 * @param dateStr        - 日期字符串 (YYYY-MM-DD)
	 * @param forceRefresh   - 是否强制刷新缓存
	 * @returns 该日期的任务列表
	 */
	async getTasksByDate(dateStr: string, forceRefresh: boolean = false): Promise<Task[]> {
		const result = await this.parseAllTasks(forceRefresh);
		return result.taskMap.get(dateStr) || [];
	}

	/**
	 * 获取指定日期范围内的任务
	 *
	 * @param startDate - 起始日期 (YYYY-MM-DD)
	 * @param endDate   - 结束日期 (YYYY-MM-DD)
	 * @returns 按日期索引的任务子集
	 */
	async getTasksByDateRange(startDate: string, endDate: string): Promise<TaskMap> {
		const result = await this.parseAllTasks();
		const filteredMap: TaskMap = new Map();

		for (const [dateStr, tasks] of result.taskMap) {
			if (dateStr >= startDate && dateStr <= endDate) {
				filteredMap.set(dateStr, tasks);
			}
		}
		return filteredMap;
	}

	// ── 写入方法 ──────────────────────────────

	/**
	 * 切换任务完成状态
	 *
	 * 直接修改文件中的复选框状态：
	 * `- [ ]` → `- [x]` 或反之。
	 *
	 * @param task - 要切换的任务对象
	 * @returns 操作是否成功
	 */
	async toggleTask(task: Task): Promise<boolean> {
		try {
			// 定位到文件
			const file = this.app.vault.getAbstractFileByPath(task.filePath);
			if (!(file instanceof TFile)) return false;

			// 读取文件内容
			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			if (task.lineNumber >= lines.length) return false;

			// 翻转该行的复选框状态
			const line = lines[task.lineNumber];
			lines[task.lineNumber] = isTaskCompleted(line)
				? line.replace(/- \[[xX]\]/, '- [ ]')
				: line.replace(/- \[ \]/, '- [x]');

			// 写回文件
			await this.app.vault.modify(file, lines.join('\n'));
			this.invalidateCache();
			return true;
		} catch (error) {
			console.error('切换任务状态失败:', error);
			return false;
		}
	}

	/**
	 * 向指定文件写入一条新任务
	 *
	 * 任务格式遵循 Dataview/Tasks 插件标准：
	 * ```
	 * - [ ] [优先级] 内容 📅 截止日期 🛫 开始日期 ⏰ 时间
	 * ```
	 *
	 * @param filePath   - 目标文件路径
	 * @param content    - 任务描述文本
	 * @param dueDate    - 截止日期 (YYYY-MM-DD)
	 * @param isAllDay    - 是否为全天任务（影响是否添加时间标记）
	 * @param time       - 具体时间 (HH:mm)，仅非全天任务时使用
	 * @param priority   - 优先级 (0=普通, 2=中, 3=高)
	 * @param startDate  - 开始日期，用于跨天任务
	 * @returns 操作是否成功
	 */
	async createTask(filePath: string, content: string, dueDate?: string, isAllDay?: boolean, time?: string, priority?: number, startDate?: string): Promise<boolean> {
		try {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) return false;

			const fileContent = await this.app.vault.read(file);

			// 构建任务行文本
			const priorityMark = priority === 3 ? '⏫ ' : priority === 2 ? '🔼 ' : '';
			let taskLine = `- [ ] ${priorityMark}${content}`;

			if (!isAllDay && time) taskLine += ` ⏰ ${time}`;
			if (startDate && startDate !== dueDate) taskLine += ` 🛫 ${startDate}`;
			if (dueDate) taskLine += ` 📅 ${dueDate}`;

			// 追加到文件末尾
			await this.app.vault.modify(file, fileContent + '\n' + taskLine + '\n');
			this.invalidateCache();
			return true;
		} catch (error) {
			console.error('创建任务失败:', error);
			return false;
		}
	}

	/**
	 * 为指定日期创建任务（智能选择存储位置）
	 *
	 * 存储优先级：
	 * 1. 如果当天存在日记文件 → 写入日记文件
	 * 2. 否则 → 创建或追加到 `任务/YYYYMM任务.md`
	 *
	 * @param date     - 目标日期
	 * @param content  - 任务内容
	 * @param isAllDay - 是否全天任务
	 * @param time    - 具体时间
	 * @param priority - 优先级
	 * @param endDate  - 结束日期（跨天任务用）
	 * @returns 是否创建成功
	 */
	async createTaskForDate(date: Date, content: string, isAllDay = true, time?: string, priority?: number, endDate?: Date): Promise<boolean> {
		const dateStr = this.formatDate(date);
		const endDateStr = endDate ? this.formatDate(endDate) : dateStr;

		// 优先尝试写入日记文件
		const dailyNotePath = this.findDailyNotePath(date);
		if (dailyNotePath) {
			return this.createTask(dailyNotePath, content, endDateStr, isAllDay, time, priority, dateStr);
		}

		// 回退到默认任务文件
		const defaultFile = await this.getOrCreateDefaultTaskFile(date);
		return defaultFile ? this.createTask(defaultFile, content, endDateStr, isAllDay, time, priority, dateStr) : false;
	}

	// ── 文件查找与创建 ────────────────────────

	/**
	 * 尝试查找当天的日记文件
	 *
	 * 检查多种常见的日记文件路径格式：
	 * - YYYY-MM-DD.md（Obsidian 默认）
	 * - YYYY/MM/DD.md
	 * - 日记/YYYY-MM-DD.md
	 * - Daily/YYYY-MM-DD.md
	 *
	 * @param date - 目标日期
	 * @returns 找到的文件路径，未找到返回 null
	 */
	private findDailyNotePath(date: Date): string | null {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, '0');
		const d = String(date.getDate()).padStart(2, '0');

		const formats = [
			`${y}-${m}-${d}.md`,
			`${y}/${m}/${d}.md`,
			`日记/${y}-${m}-${d}.md`,
			`Daily/${y}-${m}-${d}.md`
		];

		for (const format of formats) {
			const file = this.app.vault.getAbstractFileByPath(format);
			if (file instanceof TFile) return format;
		}
		return null;
	}

	/**
	 * 获取或创建默认任务存储文件
	 *
	 * 文件路径格式：`任务/YYYYMM任务.md`
	 * 如果文件不存在则自动创建并写入头部说明。
	 *
	 * @param date - 用于确定年月的日期
	 * @returns 文件路径，创建失败返回 null
	 */
	private async getOrCreateDefaultTaskFile(date?: Date): Promise<string | null> {
		const now = date || new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, '0');

		const folderPath = '任务';
		const filePath = `${folderPath}/${year}${month}任务.md`;

		// 文件已存在则直接返回
		if (this.app.vault.getAbstractFileByPath(filePath) instanceof TFile) return filePath;

		try {
			// 确保文件夹存在
			await this.ensureFolderExists(folderPath);

			// 创建文件并写入初始内容
			await this.app.vault.create(filePath, `# ${year}年${month}月任务列表\n\n> 这是由「月历任务」插件自动创建的任务文件。\n> 在月历视图中添加的任务会保存在这里。\n\n`);
			return filePath;
		} catch (error) {
			console.error('创建默认任务文件失败:', error);
			return null;
		}
	}

	/**
	 * 确保文件夹及其父目录存在
	 *
 * 递归检查并创建路径中的每一级目录。
	 *
	 * @param folderPath - 文件夹路径（如 "任务/2026"）
	 */
	private async ensureFolderExists(folderPath: string): Promise<void> {
		const parts = folderPath.split('/');
		let currentPath = '';

		for (const part of parts) {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(currentPath)) {
				await this.app.vault.createFolder(currentPath);
			}
		}
	}

	// ── 缓存与工具 ────────────────────────────

	/**
	 * 使缓存失效
	 *
	 * 在文件被修改后调用，确保下次查询会重新扫描。
	 */
	invalidateCache(): void {
		this.cache = null;
		this.lastParseTime = 0;
	}

	/**
	 * 格式化日期为 YYYY-MM-DD 字符串
	 *
	 * @param date - 日期对象
	 * @returns ISO 格式日期字符串
	 */
	private formatDate(date: Date): string {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}

	// ── 辅助查询 ────────────────────────────

	/**
	 * 获取所有有任务的日期列表
	 *
	 * @returns 日期字符串数组
	 */
	async getDatesWithTasks(): Promise<string[]> {
		const result = await this.parseAllTasks();
		return Array.from(result.taskMap.keys());
	}

	/**
	 * 搜索包含关键词的任务
	 *
	 * 不区分大小写的模糊搜索。
	 *
	 * @param keyword - 搜索关键词
	 * @returns 匹配的任务列表
	 */
	async searchTasks(keyword: string): Promise<Task[]> {
		const result = await this.parseAllTasks();
		return result.tasks.filter(task => task.content.toLowerCase().includes(keyword.toLowerCase()));
	}

	/**
	 * 获取任务统计摘要
	 *
	 * @returns 总数、已完成数、待完成数、逾期数
	 */
	async getTaskStats(): Promise<{ total: number; completed: number; pending: number; overdue: number }> {
		const result = await this.parseAllTasks();
		const today = new Date().toISOString().split('T')[0];

		let completed = 0, pending = 0, overdue = 0;
		for (const task of result.tasks) {
			if (task.completed) completed++;
			else {
				pending++;
				if (task.dueDate && task.dueDate < today) overdue++;
			}
		}
		return { total: result.tasks.length, completed, pending, overdue };
	}
}
