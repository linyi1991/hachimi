# Hachimi 潛水艇工房

FFXIV 專用攻略與共用成品備料清單。四艘普通潛水艇從 1111 起步到 3124，共七種零件各四件，38 種工房交付素材。

## 使用

- 一般連結唯讀，需以負責人核發的帳號與密碼登入，才能填數量、負責人與備註；解鎖 8 小時後失效。
- 已備妥包含已交工房的數量。例如備妥 100、交出 30，分別填 100 與 30。
- 修改後按該列儲存或 Enter。多人同時修改會提示衝突，不會直接覆蓋。
- 每項成品可設定夥伴認領量與其中已完成量。夥伴已完成包含在共用總量內，不重複相加。
- 材料預設保留於第 4 頁，可依已解鎖倉庫選第 1～5 頁並鎖定。位置變更需要 session 加重新輸入目前帳號的密碼；普通更新不接受位置欄位。此鎖定不替代遊戲內倉庫權限。
- 每項材料有留言紀錄，可記數量、分頁、格位。留言不自動加減庫存。
- 留料試算先保留工房直繳量，再分配加工用途，每項庫存只扣一次。
- 舊表庫存包含共用餘額與跨層重複紀錄，沒有自動合併匯入。

## 頁面

`/` 共同備料、`/guide` 新手指南、`/parts` 零件配方、`/voyages` 海域解鎖、`/sources` 核對與來源、`/lookup` 官方資料查詢、`/planner` 1～4 艘共用庫存與保留試算。

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

部署為 Cloudflare Worker ESM，D1 綁定 `DB`；依序套用 `drizzle/` 的遷移。網站服務依 `.openai/hosting.json` 配置部署。

正式入口為 GitHub Pages，GitHub Actions 發布 `pages/`。Worker 僅負責共用資料、授權及備援介面。

後端 `EDIT_ACCOUNTS` 是私密 JSON 陣列，每筆包含 username、獨立 salt 和 PBKDF2-SHA256（100,000 次）hash，不儲存明文密碼。帳號由負責人核發，不提供自行註冊。`SESSION_SECRET` 簽署 8 小時登入 session，session 綁定帳號與憑證版本；移除帳號或更新 hash，舊 session 隨即失效。舊私人連結登入端點已停用，舊 session 不再有效。每 IP 每 15 分鐘最多 8 次登入嘗試；所有寫入仍由後端驗證登入。變更保留位置須重新輸入目前登入帳號的密碼。前端與 GitHub 內不含密碼或帳號 hash。
