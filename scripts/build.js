// 將 src/engine.js 內嵌進 src/template.html，輸出單一檔案 dist/index.html（無外部相依）
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const read = p => fs.readFileSync(path.join(root, p), "utf8");
const engine = read("src/engine.js").split("if(typeof module")[0]; // 去掉 Node 專用匯出
const tpl = read("src/template.html");
if (!tpl.includes("/*ENGINE*/")) throw new Error("template 缺少 /*ENGINE*/ 佔位符");
// 內嵌 SheetJS（base64，避免 HTML 解析器對 "<!--" 等字串的邊界行為）；先驗證 SHA-256 釘選值
const crypto = require("crypto");
const xl = fs.readFileSync(path.join(root, "vendor/xlsx.full.min.js"));
const pinned = read("vendor/xlsx.full.min.js.sha256").trim().split(/\s+/)[0];
const actual = crypto.createHash("sha256").update(xl).digest("hex");
if (actual !== pinned) throw new Error(`SheetJS SHA-256 不符：預期 ${pinned}，實際 ${actual}`);
if (!tpl.includes("/*SHEETJS*/")) throw new Error("template 缺少 /*SHEETJS*/ 佔位符");
const html = tpl.replace("/*ENGINE*/", () => engine).replace("/*SHEETJS*/", () => xl.toString("base64"));
const dist = path.join(root, "dist");
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, "index.html"), html, "utf8");
fs.writeFileSync(path.join(dist, ".nojekyll"), "");
console.log(`dist/index.html  ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB`);
