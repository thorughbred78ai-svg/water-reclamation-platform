// 取得官方 SheetJS 0.20.3 並以「倉庫內釘選的 SHA-256」驗證；不符則不寫入檔案、結束碼 1。
// 釘選值在 vendor/xlsx.full.min.js.sha256（請勿在 CI 內改寫它，否則驗證形同虛設）。
// 已存在且雜湊相符時直接略過，不連網。環境變數 SHEETJS_URL 僅供測試。
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const URL_ = process.env.SHEETJS_URL || "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
const root = path.join(__dirname, ".."), file = path.join(root, "vendor/xlsx.full.min.js");
const pinned = fs.readFileSync(file + ".sha256", "utf8").trim().split(/\s+/)[0].toLowerCase();
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
if (!/^[0-9a-f]{64}$/.test(pinned)) { console.error("釘選值格式錯誤"); process.exit(1); }
if (fs.existsSync(file) && sha(fs.readFileSync(file)) === pinned) { console.log("SheetJS 已就緒且雜湊相符，略過下載"); process.exit(0); }
const get = (u, n = 0) => new Promise((ok, no) => {
  const lib = u.startsWith("https:") ? require("https") : require("http");
  lib.get(u, { timeout: 60000 }, r => {
    if ([301, 302, 307, 308].includes(r.statusCode) && r.headers.location && n < 3) return ok(get(new URL(r.headers.location, u).href, n + 1));
    if (r.statusCode !== 200) return no(new Error("HTTP " + r.statusCode));
    const c = []; r.on("data", d => c.push(d)); r.on("end", () => ok(Buffer.concat(c)));
  }).on("error", no).on("timeout", function () { this.destroy(new Error("逾時")); });
});
get(URL_).then(buf => {
  const h = sha(buf);
  if (h !== pinned) { console.error(`✘ SheetJS 雜湊不符，未寫入檔案\n  釘選值：${pinned}\n  下載值：${h}（${buf.length} bytes）\n  請先以獨立管道確認官方檔雜湊，再決定是否更新 vendor/xlsx.full.min.js.sha256`); process.exit(1); }
  fs.writeFileSync(file, buf); console.log("✔ 已下載官方 SheetJS 並通過雜湊驗證：" + h);
}).catch(e => { console.error("無法下載 SheetJS：" + e.message + "\n離線環境請手動放置官方檔到 vendor/xlsx.full.min.js（雜湊須符合釘選值）"); process.exit(2); });
