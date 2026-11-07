// CI 关卡：独立校验 main.js 里的 BUILTIN_HOLIDAYS 块与 holidays.json 是否一致。
//
// 不复用 sync-holidays.mjs 的生成逻辑 —— 那样生成器自己写错了也会「校验通过」。
// 这里直接从 main.js 抠出块、JSON.parse、逐条深比，并顺带检查数据本身的合法性
// （与运行时 loadBuiltinHolidays / isUsableHolidayData 同一口径）。
//
// 用法: node scripts/check-holidays-sync.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "main.js"), "utf8");
const expected = JSON.parse(fs.readFileSync(path.join(root, "holidays.json"), "utf8"));

const BEGIN = "/* === BUILTIN_HOLIDAYS:BEGIN === */";
const END = "/* === BUILTIN_HOLIDAYS:END === */";
const fail = (msg) => { console.error("::error::" + msg); process.exit(1); };

const bi = src.indexOf(BEGIN);
const ei = src.indexOf(END);
if (bi < 0 || ei < bi) fail("main.js 里找不到 BUILTIN_HOLIDAYS 标记块，请跑 node scripts/sync-holidays.mjs");

const block = src.slice(bi + BEGIN.length, ei);
const eq = block.indexOf("var BUILTIN_HOLIDAYS =");
if (eq < 0) fail("标记块里没有 var BUILTIN_HOLIDAYS 赋值");
let literal = block.slice(eq + "var BUILTIN_HOLIDAYS =".length).trim();
if (!literal.endsWith(";")) fail("BUILTIN_HOLIDAYS 赋值缺少结尾分号");
literal = literal.slice(0, -1).trim();

let actual;
try {
  actual = JSON.parse(literal);
} catch (e) {
  fail("BUILTIN_HOLIDAYS 块不是合法 JSON（生成器应保证可直接 JSON.parse）: " + e.message);
}

const yearsA = Object.keys(actual).sort();
const yearsE = Object.keys(expected).sort();
if (yearsA.join(",") !== yearsE.join(",")) {
  fail(`年份不一致：main.js 内嵌 [${yearsA.join(", ")}]，holidays.json [${yearsE.join(", ")}]。请跑 node scripts/sync-holidays.mjs`);
}

let count = 0;
for (const y of yearsE) {
  if (!/^\d{4}$/.test(y)) fail(`holidays.json 里的年份键「${y}」不是四位数字`);
  const a = actual[y], e = expected[y];
  if (!Array.isArray(a) || !Array.isArray(e)) fail(`${y} 年的数据不是数组`);
  if (a.length !== e.length) fail(`${y} 年条数不一致：内嵌 ${a.length}，holidays.json ${e.length}。请跑 node scripts/sync-holidays.mjs`);
  for (let i = 0; i < e.length; i++) {
    const got = JSON.stringify(a[i]), want = JSON.stringify(e[i]);
    if (got !== want) fail(`${y} 年第 ${i + 1} 条不一致：\n  内嵌 ${got}\n  期望 ${want}\n请跑 node scripts/sync-holidays.mjs`);
    const h = a[i];
    if (!h || typeof h.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(h.date)) fail(`${y} 年第 ${i + 1} 条 date 非法`);
    if (!h.date.startsWith(y + "-")) fail(`${y} 年第 ${i + 1} 条 date「${h.date}」不属于该年份`);
    if (typeof h.name !== "string" || !h.name.trim()) fail(`${y} 年第 ${i + 1} 条 name 为空`);
    if (typeof h.isOff !== "boolean") fail(`${y} 年第 ${i + 1} 条 isOff 不是布尔`);
    if (h.type !== "legal" && h.type !== "workday") fail(`${y} 年第 ${i + 1} 条 type「${h.type}」非法`);
    count++;
  }
}
console.log(`内置节假日数据校验通过：${yearsE.length} 个年份 / ${count} 条，与 holidays.json 逐条一致`);