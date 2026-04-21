/**
 * =============================================================================
 * obsidian-monthly-tasks - 插件主入口
 * =============================================================================
 *
 * 滴答清单风格的 Obsidian 月视图任务管理插件。
 * 提供月历网格视图，支持农历、节假日显示、任务创建与管理。
 *
 * @author  duany
 * @version 1.2.0
 * @license MIT
 * @see     https://github.com/duanydev/obsidian-monthly-tasks
 */

import { Plugin, WorkspaceLeaf, TFile, App, PluginSettingTab, Setting } from 'obsidian';
import { TaskParser } from './TaskParser';
import { MonthlyView, VIEW_TYPE_MONTHLY } from './MonthlyView';

/**
 * 插件设置接口
 *
 * 定义所有用户可配置的选项。
 * 设置数据通过 Obsidian 的 `saveData()` / `loadData()` API
 * 以 JSON 格式持久化存储在插件的 data.json 中。
 */
interface MonthlyTasksSettings {
	/** 已完成任务的显示方式：strike=带删除线, normal=普通文字, hide=隐藏 */
	completedTaskStyle: 'strike' | 'normal' | 'hide';
	/** 新建任务时是否默认为全天任务（不指定具体时间） */
	defaultAllDayTask: boolean;
	/** 每周起始日：0 = 周日，1 = 周一 */
	firstDayOfWeek: number;
	/** 是否在日期格子中显示农历信息 */
	showLunar: boolean;
	/** 是否标注法定节假日和调休上班日 */
	showHoliday: boolean;
	/** 每个日期格子最多显示的任务数量（超出部分折叠为 "+N"） */
	tasksPerDayLimit: number;
	/** 高优先级任务的自定义颜色（十六进制色值） */
	highPriorityColor: string;
	/** 中优先级任务的自定义颜色（十六进制色值） */
	mediumPriorityColor: string;
}

/**
 * 默认设置值
 *
 * 当用户首次安装插件或重置设置时使用这些默认值。
 */
const DEFAULT_SETTINGS: MonthlyTasksSettings = {
	completedTaskStyle: 'strike',
	defaultAllDayTask: true,
	firstDayOfWeek: 0,        // 周日起始
	showLunar: true,
	showHoliday: true,
	tasksPerDayLimit: 5,
	highPriorityColor: '#ef4444',
	mediumPriorityColor: '#f59e0b'
};

/**
 * 月历任务插件主类
 *
 * 继承自 Obsidian 的 `Plugin` 基类，负责：
 * - 注册月历视图到工作区
 * - 管理插件生命周期（加载/卸载）
 * - 监听文件变更并自动刷新视图
 * - 维护设置面板
 *
 * @extends Plugin
 */
export default class MonthlyTasksPlugin extends Plugin {
	/** 当前插件设置 */
	settings: MonthlyTasksSettings;

	/** 任务解析器实例，负责扫描 Vault 中的任务 */
	taskParser: TaskParser;

	/**
	 * 插件加载入口（Obsidian 自动调用）
	 *
	 * 执行顺序：
	 * 1. 加载用户设置（合并默认值）
	 * 2. 初始化任务解析器
	 * 3. 注册自定义视图、Ribbon 图标、命令
	 * 4. 注册设置选项卡
	 * 5. 绑定文件监听事件
	 */
	async onload(): Promise<void> {
		// 1. 加载/初始化设置
		await this.loadSettings();

		// 1.5 自动刷新当年节假日数据（后台静默执行，不阻塞插件加载）
		const { holidayManager } = await import('./HolidayManager');
		holidayManager.updateFromNetwork(new Date().getFullYear()).catch(() => {
			// 静默失败，不影响插件正常使用
		});

		// 2. 初始化任务解析器（传入 App 实例以访问 Vault）
		this.taskParser = new TaskParser(this.app);

		// 3. 注册月历自定义视图
		this.registerView(
			VIEW_TYPE_MONTHLY,
			(leaf) => new MonthlyView(leaf, this.taskParser, this)
		);

		// 4. 在左侧 Ribbon 栏添加图标按钮
		this.addRibbonIcon('calendar', '月历任务', () => this.activateView());

		// 5. 注册命令面板命令
		this.addCommand({ id: 'open-monthly-view', name: '打开月历任务视图', callback: () => this.activateView() });
		this.addCommand({ id: 'refresh-monthly-view', name: '刷新月历任务视图', callback: () => this.refreshView() });

		// 6. 注册设置选项卡
		this.addSettingTab(new MonthlyTasksSettingTab(this.app, this));

		// 7. 监听 Vault 文件变更，自动刷新月历视图
		//    使用防抖避免频繁刷新（300ms 内的多次变更只触发一次刷新）
		const refreshDebounced = this.debounce(() => this.refreshView(), 300);

		// 文件内容被修改时（如手动编辑任务）
		this.registerEvent(this.app.vault.on('modify', (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				this.taskParser.invalidateCache();
				refreshDebounced();
			}
		}));

		// 新建文件时
		this.registerEvent(this.app.vault.on('create', (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				this.taskParser.invalidateCache();
				refreshDebounced();
			}
		}));

		// 删除文件时
		this.registerEvent(this.app.vault.on('delete', () => {
			this.taskParser.invalidateCache();
			refreshDebounced();
		}));

		// 重命名文件时
		this.registerEvent(this.app.vault.on('rename', () => {
			this.taskParser.invalidateCache();
			refreshDebounced();
		}));
	}

	/**
	 * 防抖工具函数
	 *
	 * 将多次连续调用合并为一次执行，适用于高频事件处理。
	 * 例如：快速保存多个文件时不会触发多次渲染。
	 *
	 * @typeParam T - 函数类型
	 * @param fn    - 需要防抖的目标函数
	 * @param delay - 延迟时间（毫秒）
	 * @returns 包装后的防抖函数
	 */
	private debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): (...args: Parameters<T>) => void {
		let timer: number | null = null;
		return (...args: Parameters<T>) => {
			if (timer) window.clearTimeout(timer);
			timer = window.setTimeout(() => fn(...args), delay);
		};
	}

	/**
	 * 从 data.json 加载用户设置
	 *
	 * 使用 `Object.assign` 合并默认值，确保新增设置项有合理的初始值。
	 */
	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	/**
	 * 保存当前设置到 data.json
	 */
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * 激活/打开月历视图
	 *
	 * 如果已有打开的视图则聚焦它，
	 * 否则在右侧面板新建一个视图标签页。
	 */
	async activateView(): Promise<void> {
		const { workspace } = this.app;

		// 查找是否已有月历视图
		const existingLeaf = workspace.getLeavesOfType(VIEW_TYPE_MONTHLY)[0];
		if (existingLeaf) {
			workspace.revealLeaf(existingLeaf);
			return;
		}

		// 获取右侧面板叶子节点并创建新视图
		const leaf = workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({ type: VIEW_TYPE_MONTHLY });
			workspace.revealLeaf(leaf);
		}
	}

	/**
	 * 刷新所有打开的月历视图
	 *
	 * 遍历所有月历视图实例，触发重新渲染。
	 *
	 * @param force - 是否强制完全重建 DOM（true=重建整个视图，false=仅更新数据）
	 */
	async refreshView(force: boolean = false): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MONTHLY);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof MonthlyView) {
				await view.refresh(force);
			}
		}
	}
}

/**
 * 插件设置选项卡
 *
 * 渲染在 Obsidian 设置 → 社区插件 → 月历任务 页面中。
 * 包含使用说明、功能开关、快捷键说明等 UI 元素。
 *
 * @extends PluginSettingTab
 */
class MonthlyTasksSettingTab extends PluginSettingTab {
	/** 关联的插件实例 */
	plugin: MonthlyTasksPlugin;

	constructor(app: App, plugin: MonthlyTasksPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * 渲染设置界面
	 *
	 * 每次打开设置页面时会重新调用此方法。
	 * 使用 Obsidian 的 Setting API 构建表单控件。
	 */
	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── 顶部提示条 ───────────────────────────────────
		const tipEl = containerEl.createDiv('setting-item-description mt-settings-tip');
		tipEl.innerHTML = `
			<div class="mt-settings-text">
				📅 点击月历日期创建任务 · 📜 数据自动存入 <code>任务/</code> 目录 · Ctrl/Cmd+P 搜索「月历任务」
			</div>
		`;

		// ── 显示设置 ───────────────────────────────────
		containerEl.createEl('h2', { text: '🔧 显示设置' });

		new Setting(containerEl)
			.setName('已完成任务显示方式')
			.setDesc('已完成任务的展示样式')
			.setClass('mt-completed-style-setting');

		// ── 已完成任务显示方式：分段选择器 ──
		{
			const styleSetting = containerEl.querySelector('.mt-completed-style-setting');
			if (styleSetting) {
				const ctrl = styleSetting.createDiv('mt-segmented-control');
				const options = [
					{ value: 'strike', label: '📏 删除线', desc: '带删除线显示' },
					{ value: 'normal', label: '📝 普通', desc: '普通文字' },
					{ value: 'hide', label: '🙈 隐藏', desc: '不显示' },
				];
				options.forEach(opt => {
					const btn = ctrl.createEl('button', {
						type: 'button',
						text: opt.label,
						cls: `mt-seg-btn${this.plugin.settings.completedTaskStyle === opt.value ? ' selected' : ''}`,
					});
					btn.dataset.value = opt.value;
					btn.setAttribute('aria-label', opt.desc);
					btn.addEventListener('click', async () => {
						this.plugin.settings.completedTaskStyle = opt.value as any;
						await this.plugin.saveSettings();
						ctrl.querySelectorAll('.mt-seg-btn').forEach(b => b.classList.remove('selected'));
						btn.classList.add('selected');
						this.plugin.refreshView();
					});
				});
			}
		}

		new Setting(containerEl)
			.setName('显示农历')
			.setDesc('在日期下方显示农历和节气')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showLunar)
				.onChange(async (value) => {
					this.plugin.settings.showLunar = value;
					await this.plugin.saveSettings();
					this.plugin.refreshView();
				}));

		new Setting(containerEl)
			.setName('显示节假日')
			.setDesc('标注法定节假日和调休')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showHoliday)
				.onChange(async (value) => {
					this.plugin.settings.showHoliday = value;
					await this.plugin.saveSettings();
					this.plugin.refreshView();
				}));

		new Setting(containerEl)
			.setName('刷新节假日数据')
			.setDesc('从网络重新获取当年节假日')
			.addButton(button => button
				.setButtonText('刷新')
				.onClick(async () => {
					button.buttonEl.textContent = '刷新中...';
					button.buttonEl.disabled = true;
					try {
						const { holidayManager } = await import('./HolidayManager');
						await holidayManager.updateFromNetwork(new Date().getFullYear());
						this.plugin.refreshView();
						new Notice('节假日数据已刷新');
					} catch (e) {
						new Notice('刷新失败: ' + (e as Error).message);
					}
					button.buttonEl.textContent = '刷新';
					button.buttonEl.disabled = false;
				}));

		// ── 任务设置 ───────────────────────────────────
		containerEl.createEl('h2', { text: '📝 任务设置' });

		new Setting(containerEl)
			.setName('默认全天任务')
			.setDesc('新建任务默认不带具体时间')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.defaultAllDayTask)
				.onChange(async (value) => {
					this.plugin.settings.defaultAllDayTask = value;
					await this.plugin.saveSettings();
					this.plugin.refreshView();
				}));

		new Setting(containerEl)
			.setName('每周第一天')
			.setDesc('日历每周起始日')
			.addDropdown(dropdown => dropdown
				.addOption('1', '周一')
				.addOption('0', '周日')
				.setValue(String(this.plugin.settings.firstDayOfWeek))
				.onChange(async (value) => {
					this.plugin.settings.firstDayOfWeek = parseInt(value);
					await this.plugin.saveSettings();
					this.plugin.refreshView();
				}));

		new Setting(containerEl)
			.setName('每日任务显示数量')
			.setDesc('每个格子最多显示的任务数')
			.addDropdown(dropdown => dropdown
				.addOption('3', '3个')
				.addOption('4', '4个')
				.addOption('5', '5个')
				.addOption('6', '6个')
				.addOption('7', '7个')
				.addOption('8', '8个')
				.addOption('9', '9个')
				.addOption('10', '10个')
				.setValue(String(this.plugin.settings.tasksPerDayLimit))
				.onChange(async (value) => {
					this.plugin.settings.tasksPerDayLimit = parseInt(value);
					await this.plugin.saveSettings();
					this.plugin.refreshView();
				}));

		// ── 底部信息条 ───────────────────────────────────
		const footerEl = containerEl.createDiv('setting-item-description mt-settings-footer');
		footerEl.innerHTML = `
			<div class="mt-settings-text">
				Markdown 格式 · 兼容 Obsidian Tasks 插件
			</div>
		`;
	}
}
