#!/usr/bin/env node
// i18n 完整性检查（发版前跑）：防「加功能忘了补翻译」
// 1) I18N 三套词典（zh-CN / zh-TW / en）key 完全一致
// 2) 所有 tr("key") 调用点的 key 在词典里存在
// 3) 所有含 "zh-CN" 的语言映射对象同时含 "zh-TW" 和 "en"（如 TASK_FOLDER_NAMES、文件名/月份节映射）
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../main.js", import.meta.url), "utf8");
const LANGS = ["zh-CN", "zh-TW", "en"];
const errors = [];

// ---- 取 I18N 对象字面量：从 `var I18N = {` 起按花括号配对 ----
const start = src.indexOf("var I18N = {");
if (start === -1) {
  console.error("找不到 var I18N = {");
  process.exit(1);
}
const braceStart = src.indexOf("{", start);
let depth = 0, end = -1;
for (let i = braceStart; i < src.length; i++) {
  const ch = src[i];
  if (ch === "{") depth++;
  else if (ch === "}") {
    depth--;
    if (depth === 0) { end = i + 1; break; }
  }
}
if (end === -1) { console.error("I18N 对象括号不配对"); process.exit(1); }
const I18N = new Function(`return (${src.slice(braceStart, end)})`)();

// ---- 1) 三套词典 key 一致 ----
const baseKeys = Object.keys(I18N["zh-CN"]).sort();
for (const lang of ["zh-TW", "en"]) {
  const keys = new Set(Object.keys(I18N[lang] || {}));
  const missing = baseKeys.filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !baseKeys.includes(k));
  if (missing.length) errors.push(`${lang} 缺少 ${missing.length} 个 key: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}`);
  if (extra.length) errors.push(`${lang} 多出 ${extra.length} 个 key: ${extra.slice(0, 10).join(", ")}${extra.length > 10 ? "…" : ""}`);
}

// ---- 2) tr("...") 调用点的 key 都在 zh-CN 里 ----
const known = new Set(baseKeys);
const called = new Set();
for (const m of src.matchAll(/\btr\(\s*"([^"]+)"/g)) called.add(m[1]);
const unknown = [...called].filter((k) => {
  if (k.endsWith(".")) {
    // 动态拼接（tr("view.mode." + x)）：只要求存在该前缀的真实 key
    return !baseKeys.some((real) => real.startsWith(k));
  }
  return !known.has(k);
});
if (unknown.length) errors.push(`tr() 引用了不存在的 key: ${unknown.join(", ")}`);

// ---- 2b) 动态 key：前缀→取值域，逐值验证（表驱动，新增动态 tr() 模式在此登记） ----
// key: tr("前缀." + 变量)；value: main.js 里提供取值列表的数组变量名
const DYNAMIC_KEYS = {
  // ["var", "数组变量名"]：从代码里的数组字面量取取值域；["list", [...]]：直接给取值域
  "view.mode.": ["var", "VIEW_MODES"],
  "view.mode.desc.": ["var", "VIEW_MODES"],
};
for (const [prefix, spec] of Object.entries(DYNAMIC_KEYS)) {
  let values;
  if (spec[0] === "var") {
    // 取 `var NAME = {...}` 或 `var NAME = [...]` 的整个字面量（可能嵌套），抽出全部字符串
    const vm = src.match(new RegExp(`var ${spec[1]} = `));
    if (!vm) { errors.push(`找不到动态 key 取值域 ${spec[1]}`); continue; }
    const openIdx = src.slice(vm.index).search(/[{[]/);
    const lit = extractLiteral(src, vm.index + openIdx);
    values = [...lit.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  } else {
    values = spec[1];
  }
  for (const raw of values) {
    // 字面量里本身就可能带前缀，有则剥掉再拼
    const v = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
    if (!known.has(prefix + v)) errors.push(`词典缺动态 key: ${prefix + v}`);
  }
}
const registeredPrefixes = Object.keys(DYNAMIC_KEYS);
for (const k of [...called].filter((k) => k.endsWith(".") && !registeredPrefixes.includes(k))) {
  // 未登记的动态前缀至少要求有真实 key 兜底
  if (!baseKeys.some((real) => real.startsWith(k))) errors.push(`tr() 引用了不存在的 key: ${k}…`);
}

// ---- 3) 以任一语言为键的映射对象必须语言齐全（zh-CN 被整个删掉也能抓到） ----
// REQUIRE_ALL_THREE=true：映射必须三语齐全（本仓库约定）；
// =false：允许"zh-CN 即源语言值、只补 zh-TW+en 翻译"的映射（此时要求 zh-TW 和 en 成对出现）
const REQUIRE_ALL_THREE = true;
// FILE_FORMATS 这类映射的值本身是对象：正则按 {…} 匹配会停在嵌套括号上，
// 必须按"lang 键出现在哪个对象顶层"来还原映射（顺带兼容 `en :` 带空格的写法）
const isKeyPos = (s, idx) => {
  // 前面最近一个非空白字符必须是 { 或 ,——对象成员位，排除三元/字符串里的 "zh-CN" : 值
  let i = idx - 1;
  while (i >= 0 && /\s/.test(s[i])) i--;
  return i >= 0 && (s[i] === "{" || s[i] === ",");
};
const seenMaps = new Set();
for (const m of src.matchAll(/(?:"zh-CN"|"zh-TW"|"en"|en)\s*:/g)) {
  if (!isKeyPos(src, m.index)) continue;
  // 向前配平找包住它的对象
  let depth = 0, open = -1;
  for (let i = m.index - 1; i >= 0; i--) {
    const c = src[i];
    if (c === "}") depth++;
    else if (c === "{") { if (depth === 0) { open = i; break; } depth--; }
  }
  if (open === -1 || seenMaps.has(open)) continue;
  seenMaps.add(open);
  const lit = extractLiteral(src, open);
  // 只数这个对象顶层的 lang 键（嵌套对象里的 zh-CN: 不算）
  const topKeys = new Set();
  let d = 0;
  for (const km of lit.matchAll(/(?:"zh-CN"|"zh-TW"|"en"|en)\s*:/g)) {
    d = 0;
    for (let i = 0; i < km.index; i++) {
      if (lit[i] === "{") d++;
      else if (lit[i] === "}") d--;
    }
    if (d === 1 && isKeyPos(lit, km.index)) topKeys.add(km[0].replace(/["\s:]/g, ""));
  }
  if (!topKeys.size) continue;
  const required = REQUIRE_ALL_THREE ? LANGS : ["zh-TW", "en"];
  for (const lang of required) {
    if (!topKeys.has(lang)) {
      errors.push(`语言映射缺 ${lang}: ${lit.slice(0, 80)}…`);
      break;
    }
  }
}

/** 从 open 位置的 { 或 [ 起配平到对应闭括号，返回整段字面量 */
function extractLiteral(s, open) {
  const OPEN = s[open], CLOSE = OPEN === "{" ? "}" : "]";
  let d = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === OPEN) d++;
    else if (s[i] === CLOSE) { d--; if (d === 0) return s.slice(open, i + 1); }
  }
  return s.slice(open);
}

if (errors.length) {
  for (const e of errors) console.error("✗", e);
  process.exit(1);
}
console.log(`i18n 检查通过：${baseKeys.length} 个 key × 3 语言，${called.size} 个 tr() 调用点全部命中`);
