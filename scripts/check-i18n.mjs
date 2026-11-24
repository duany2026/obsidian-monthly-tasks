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

// ---- 3) 以 "zh-CN": 为键的映射对象必须三语齐全 ----
for (const m of src.matchAll(/\{[^{}]*"zh-CN":\s*[^,{][^{}]*\}/g)) {
  const lit = m[0];
  for (const lang of LANGS) {
    if (!lit.includes(`"${lang}":`)) {
      errors.push(`语言映射缺 ${lang}: ${lit.slice(0, 80)}…`);
      break;
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error("✗", e);
  process.exit(1);
}
console.log(`i18n 检查通过：${baseKeys.length} 个 key × 3 语言，${called.size} 个 tr() 调用点全部命中`);
