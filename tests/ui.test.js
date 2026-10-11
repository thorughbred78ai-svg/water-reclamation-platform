// 端對端：載入建置後的 dist/index.html，驗證內嵌 SheetJS 於「無網路」下可匯出／匯入 Excel
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
let JSDOM; try { ({ JSDOM } = require("jsdom")); } catch (e) { /* 未安裝 devDependencies 時略過 */ }
const opt = { skip: !JSDOM && "需要 jsdom（npm install）" };
const build = () => execFileSync("node", [path.join(__dirname, "../scripts/build.js")], { stdio: "pipe" });

test("建置產物不含外部腳本來源且內嵌 SheetJS", opt, () => {
  build(); const h = fs.readFileSync(path.join(__dirname, "../dist/index.html"), "utf8");
  assert.ok(!h.includes("cdn.sheetjs.com")); assert.ok(!/<script[^>]+src=/i.test(h)); assert.ok(h.includes('id="sheetjs"'));
});
test("離線 Excel 匯出→匯入往返（內嵌 SheetJS）", opt, async () => {
  build(); const html = fs.readFileSync(path.join(__dirname, "../dist/index.html"), "utf8");
  let saved = null;
  const d = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/", beforeParse(w) {
    w.URL.createObjectURL = b => { saved = b; return "blob:x"; }; w.HTMLAnchorElement.prototype.click = function () {};
    w.fetch = () => { throw new Error("不應有網路請求"); };
  } });
  const w = d.window, D = w.document, errs = []; w.addEventListener("error", e => errs.push(e.message));
  assert.equal(w.XLSX, undefined);
  D.getElementById("t-io").click();
  D.querySelector('#p-io [data-a="ex"]').dispatchEvent(new w.Event("click", { bubbles: true }));
  await new Promise(r => setTimeout(r, 400));
  assert.ok(w.XLSX, "SheetJS 應被載入"); assert.ok(saved, "應產生下載檔");
  const buf = Buffer.from(await new Promise((ok, no) => { const fr = new w.FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsArrayBuffer(saved); }));
  const wb = w.XLSX.read(buf, { type: "buffer" });
  assert.ok(["Source", "Units", "Streams", "Energy", "Balance"].every(n => wb.SheetNames.includes(n)));
  const inp = D.querySelector('#p-io [data-a="ix"]');
  Object.defineProperty(inp, "files", { value: [{ size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) }] });
  inp.dispatchEvent(new w.Event("change")); await new Promise(r => setTimeout(r, 400));
  assert.match(D.querySelector("#p-io .msg").textContent, /Excel 匯入成功/);
  assert.equal(D.getElementById("chip").textContent.includes("BALANCED"), true); assert.deepEqual(errs, []);
});
