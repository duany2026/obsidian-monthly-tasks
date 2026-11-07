// 从 holidays.json 生成 main.js 里的 BUILTIN_HOLIDAYS 标记块。
//
// 为什么需要这一步：Obsidian 社区目录安装插件时只下载 main.js / manifest.json /
// styles.css 三份资产，仓库里的 holidays.json 不会跟着装进用户的插件目录。
// 内置节假日兜底若只存在于外部文件，目录安装的用户就完全没有离线数据。
//
// 维护方式仍然是「数据与代码分离」：改 holidays.json，然后跑
//   node scripts/sync-holidays.mjs
// 再一起提交。CI 会跑 check-holidays-sync.mjs，忘了同步就发布失败。
//
// 用法: node scripts/sync-holidays.mjs [--check]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mainPath = path.join(root, "main.js");
const jsonPath = path.join(root, "holidays.json");

const BEGIN = "/* === BUILTIN_HOLIDAYS:BEGIN === */";
const END = "/* === BUILTIN_HOLIDAYS:END === */";
// 标记块缺失时的插入锚点（该行原本是「数据已外置」的说明注释）
const ANCHOR = "// 内置节假日兜底数据已外置为插件目录下的 holidays.json";

const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

// 逐条一行，键顺序固定，整体仍是合法 JSON —— 校验脚本可以直接 JSON.parse，
// 不需要 eval，也就不给「用校验脚本执行任意代码」留口子。
const KEYS = ["date", "name", "type", "isOff"];
function entryLine(h) {
  const parts = KEYS.filter((k) => k in h).map((k) => `${JSON.stringify(k)}: ${JSON.stringify(h[k])}`);
  const extra = Object.keys(h).filter((k) => !KEYS.includes(k));
  if (extra.length) throw new Error(`holidays.json 里 ${h.date} 有意料之外的字段: ${extra.join(", ")}`);
  return `    { ${parts.join(", ")} }`;
}

const years = Object.keys(data).sort();
const body = [
  BEGIN,
  "/* 由 scripts/sync-holidays.mjs 从 holidays.json 生成，请勿手改本块。",
  "   改数据请改 holidays.json 再跑同步脚本；CI 会拦住两者漂移。 */",
  "var BUILTIN_HOLIDAYS = {",
  ...years.map((y, i) => {
    const rows = data[y].map(entryLine).join(",\n");
    return `  ${JSON.stringify(y)}: [\n${rows}\n  ]${i < years.length - 1 ? "," : ""}`;
  }),
  "};",
  END,
].join("\n");

const buf = fs.readFileSync(mainPath);
const src = buf.toString("utf8");
// 跟随文件现有行尾（仓库约定 main.js 为 CRLF），不引入混行尾
const eol = src.includes("\r\n") ? "\r\n" : "\n";
const block = body.replace(/\n/g, eol);

let out;
const bi = src.indexOf(BEGIN);
const ei = src.indexOf(END);
if (bi >= 0 && ei > bi) {
  out = src.slice(0, bi) + block + src.slice(ei + END.length);
} else {
  const ai = src.indexOf(ANCHOR);
  if (ai < 0) throw new Error("main.js 里既没有标记块也没有插入锚点，请先确认文件结构");
  const lineEnd = src.indexOf(eol, ai);
  const insertAt = lineEnd < 0 ? src.length : lineEnd + eol.length;
  out = src.slice(0, insertAt) + eol + block + eol + src.slice(insertAt);
}

if (process.argv.includes("--check")) {
  if (out !== src) {
    console.error("main.js 的 BUILTIN_HOLIDAYS 块与 holidays.json 不一致，请跑 node scripts/sync-holidays.mjs");
    process.exit(1);
  }
  console.log(`内置节假日数据与 holidays.json 一致（${years.length} 个年份，${years.reduce((n, y) => n + data[y].length, 0)} 条）`);
} else {
  if (out === src) {
    console.log("已是最新，无需改动");
  } else {
    fs.writeFileSync(mainPath, out, "utf8");
    console.log(`已同步 ${years.length} 个年份 / ${years.reduce((n, y) => n + data[y].length, 0)} 条到 main.js`);
  }
}