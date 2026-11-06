# Hachimi 潛水艇工房

FFXIV 專用攻略與共用成品備料清單。四艘普通潛水艇從 1111 起步到 3124，共七種零件各四件，38 種工房交付素材。

## 使用

- 一般連結唯讀，私人編輯連結還須輸入通關密語，才能填數量、負責人與備註；解鎖 8 小時後失效。
- 已備妥包含已交工房的數量。例如備妥 100、交出 30，分別填 100 與 30。
- 修改後按該列儲存或 Enter。多人同時修改會提示衝突，不會直接覆蓋。
- 舊表庫存包含共用餘額與跨層重複紀錄，沒有自動合併匯入。

## 頁面

`/` 共同備料、`/guide` 新手指南、`/parts` 零件配方、`/voyages` 海域解鎖、`/sources` 核對與來源、`/lookup` 官方資料查詢。

## 資料

核對日期 2026-11-07。45 種素材配方的投入及產出比對官方 Lodestone；七種工房施工配方比對 Console Games Wiki 與使用者提供網站。官方物品頁未列完整工房施工用料，因此這部分不標成官方用料認證。

官方為國際服資料，繁中物品名稱沿用使用者原表。網站來源頁與 `data.json` 列有逐項來源。`assets/materials.xlsx` 提供完整材料展開、庫存公式與原表發現。

參考：

- https://na.finalfantasyxiv.com/lodestone/playguide/db/
- https://ffxiv.consolegameswiki.com/wiki/Subaquatic_Voyages
- https://babelin.netlify.app/submarine
- https://gist.github.com/marsantony/dc44fd900751d517e2958e188c0a6849
- https://wiki.ffxivteamcraft.com/advanced-features/teams

## 執行與部署

Node.js 24：`npm run build`、`npm test`、`npm run dev`。無外部套件。

部署為 Cloudflare Worker ESM，D1 綁定 `DB`；先套用 `drizzle/0000_progress.sql`。網站服務依 `.openai/hosting.json` 配置部署。

正式入口為 GitHub Pages，GitHub Actions 發布 `pages/`。Worker 僅負責共用資料、授權及備援介面。

後端環境變數 `EDIT_KEY_HASH` 儲存 32-byte 隨機編輯密鑰的 SHA-256，密鑰本身不得放進程式碼或版本庫。前端從 `#edit=...` 取得密鑰，以 Authorization header 送出。密鑰不出現在伺服器 URL；編輯連結本身不能寫入。`EDIT_PASSPHRASE_HASH` 是獨立通關密語 hash，`SESSION_SECRET` 用於簽署 8 小時編輯 session。解鎖端點每 IP 每 15 分鐘最多 8 次嘗試。後端每次寫入皆驗證 session；更新 `SESSION_SECRET` 並重新部署會撤銷所有 session，更新連結或密語 hash 可撤銷相應憑證。

## 測試

涵蓋未授權拒絕、編輯授權、輸入檢查、同列並行衝突、資料持續讀取、五個頁面、Excel 下載、38 種總用量、28 件零件與官方配方核對。

網站為非官方玩家工具，與 Square Enix 無隸屬關係。
