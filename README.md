# water-reclamation-platform

# 水資源回收中心整合平台

單一 HTML、純前端、無後端。功能：流程圖（可拖曳、新增／刪除單元與流股）、穩態質量平衡（含回流與濾液回流）、污泥線、能耗推估（曝氣＋泵浦）、JSON／Excel 匯入匯出。

> **所有預設數值為示範資料，非正式設計值。** 結果為輔助估算，須由專業人員覆核；不得作為放流許可、法規申報或採購依據。本系統不連接任何即時設備、不下達控制、不蒐集個資。

## 專案結構
```
vendor/              內嵌的 SheetJS 與其 SHA-256、授權
src/engine.js        求解器、驗證、Excel 轉換、能耗（純函式，可測試）
src/template.html    介面（含 /*ENGINE*/ 佔位符）
scripts/build.js     內嵌 engine → dist/index.html（單一檔案）
tests/               node:test 自動測試（無外部相依）
.github/workflows/   測試、建置、部署到 GitHub Pages
```

## 部署到 GitHub Pages（只需一次設定）
1. 建立 GitHub 倉庫並推送本專案到 `main` 分支。
2. 倉庫 **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。
3. 推送後到 **Actions** 分頁查看流程；成功後網址為 `https://<帳號>.github.io/<倉庫名>/`。
4. Pull Request 只跑測試與建置，不部署。

## 本機開發
```bash
npm test          # 測試
npm run build     # 產生 dist/index.html（可直接用瀏覽器開啟）
```
修改請編輯 `src/`，**不要直接修改 dist/**（已被 .gitignore 排除）。

## 安全與維運注意
- 頁面以 CSP meta 限制連線，且**不載入任何外部腳本**；Excel 功能使用內嵌的 SheetJS 0.20.3（`vendor/xlsx.full.min.js`，Apache-2.0，授權見 `vendor/LICENSE-SheetJS.txt`），完全離線可用。
- SheetJS 完整性：建置時比對 `vendor/*.sha256`；CI 另會下載官方 `cdn.sheetjs.com` 同版檔案比對 SHA-256，不一致即失敗。**目前 vendor 檔來源為 npm 套件 `@e965/xlsx@0.20.3`（第三方自動轉發官方發行檔），尚未與官方檔比對**；請以首次 CI 結果為準，若失敗請改用官方檔：
  `curl -o vendor/xlsx.full.min.js https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js && (cd vendor && sha256sum xlsx.full.min.js > xlsx.full.min.js.sha256)`
- 升級 SheetJS 時請同步更新 vendor 檔、`.sha256` 與 workflow 內的版本網址；避免使用 npm 上的 `xlsx@0.18.5`（有已知漏洞）。
- GitHub Pages 為公開網站，**請勿放入真實廠區資料或機敏資訊**；政府內部使用請部署到機關核准的內部主機。
- Workflow 使用 `actions/*` 官方 action 的主版本標籤；正式環境建議改為釘選 commit SHA，並定期檢查是否有新版。
- 匯入的 JSON／Excel 視為不受信任輸入，已做大小、列數、欄位型別與範圍驗證。

