# 餐廳相片 Dashboard：外部 Hosting 交接文件

> **專案版本**：原始碼 snapshot `91665525`  
> **現行 Manus 網址**：`https://restaurdash-etdvmfa7.manus.space`  
> **交接範圍**：React 前端、Express/tRPC 後端、Drizzle/MySQL schema 及 migrations、測試、部署遷移說明。  
> **不包含**：`node_modules`、build 產物、log、平台設定與任何環境變數／密鑰。

## 1. 網站用途

這是一個受登入及批准機制保護的**餐廳相片管理 Dashboard**。相片原檔不放在本網站伺服器，而是按「地區 →（可選）子地區 → 餐廳相片」結構存於公開 Google Drive 資料夾。本網站負責把 Drive 內的相片 metadata 同步到 MySQL 快取、提供高速搜尋及分類瀏覽，並提供餐廳地址／地圖／待送清單等營運工具。

介面以繁體中文／粵語為主。

## 2. 使用者角色與流程

| 身分 | 可做的事 |
|---|---|
| 未登入訪客 | 只可看登入頁；不能讀取相片或資料。 |
| 已登入但未批准用戶 | 只看到「等待批准」頁。 |
| 已批准用戶 | 可瀏覽 Dashboard、餐廳清單、地址／地圖與待送清單；也可以觸發「同步快取」。 |
| 管理員 | 包含已批准用戶所有權限；另可進入使用者管理頁，批准、拒絕或改回待批的用戶（不可改自己或其他管理員）。 |

現行登入使用 **Manus OAuth**。遷往外部 hosting 時，必須改接新的身份供應商或自行實作登入／session，詳見第 7 節。

## 3. 已有功能

### 3.1 Google Drive 相片 Dashboard

- **公開 Google Drive 資料夾爬蟲**：使用 `embeddedfolderview` HTML，無須 Google Drive API key；資料夾必須維持「知道連結的任何人」可查看。
- **地區、子地區、餐廳、環境篩選**：可按地區、子地區、餐廳名稱及相片檔名解析出的環境（例如日間、黃昏、夜晚、餐廳室內環境）篩選。
- **搜尋及快速選取餐廳**：支援輸入／下拉選取餐廳；可經 URL query 直接定位，例如 `/dashboard?restaurant=餐廳名&region=地區ID`。
- **縮圖預覽與 Drive 原圖連結**：相片 metadata 保留 Google Drive file ID、thumbnail URL 及 web-view URL；原圖仍由 Google Drive 供應。
- **中英文餐廳名**：可由 AI 產生英文名，並容許手動覆寫；手動覆寫不會被下一次 AI 翻譯蓋過。
- **AI 圖片效果**：在預覽中可對相片產生落雨、夜晚、移除人物版本；不會修改 Google Drive 原圖。現行實作使用 Manus 圖像生成服務，外部 hosting 必須換成自有模型／API。
- **每頁 30 張相片及「載入更多」**：正常情況從 `photo_cache` 讀取，避免每次瀏覽都重新爬 Google Drive。

### 3.2 快取、同步與效能

- `photo_cache`：儲存 Google Drive 相片 metadata，並有地區、餐廳複合索引。
- `region_cache`：儲存地區資料、相片數、餐廳數與子地區，讓入頁時能直接從資料庫快速讀取。
- **手動「同步快取」**：所有已批准用戶可執行；重新爬 Google Drive 後更新兩個快取表。
- **SSE 即時同步進度**：前端以 `EventSource('/api/sync-photos-stream')` 接收 `start`、`region-done`、`complete`、`error` 事件，逐區顯示進度和已同步相片數。
- **每日同步**：現行 Manus Heartbeat 每日 `03:00 UTC`（香港時間 `11:00`）呼叫 `POST /api/scheduled/syncGoogleDrive`。外部 hosting 必須改用該平台的 cron job／scheduler，並重做 endpoint 驗證。

### 3.3 餐廳清單、地址及配送工具

- 從 Google Drive 餐廳名稱合併資料庫地址資料；即使未有地址的餐廳亦會顯示。
- 搜尋中文名、英文名或地址；可按瀏覽器 GPS 位置計算距離並排序。
- 顯示 Google Maps 地圖標記及 Google Maps 導航連結。
- 單一或批次（每次 API 最多 20 間）AI 推測餐廳地址，再以 Google Places／Geocoding 取得地址及經緯度。
- 可手動編輯地址、緯度、經度並儲存；有地址標記為可人工核實。
- 「睇相片」可從餐廳清單跳回 Dashboard 並自動套用餐廳／地區篩選。
- 「待送清單」支援加入、移除、清空、地址和導航；清單暫存於**使用者瀏覽器 localStorage**，不會跨裝置同步。

## 4. 技術架構

| 層次 | 現行技術 |
|---|---|
| 前端 | React 19、TypeScript、Vite、Tailwind CSS 4、shadcn/Radix UI、Wouter、TanStack Query |
| API | Node.js、Express 4、tRPC 11、Server-Sent Events（SSE） |
| 資料庫 | MySQL／TiDB、Drizzle ORM、`mysql2` |
| 外部資料 | 公開 Google Drive folder；Google Maps／Places；Manus LLM／image generation（現行環境） |
| 登入與權限 | 現行為 Manus OAuth、cookie session、`approvedProcedure`／`adminProcedure` |
| 自動化 | 現行為 Manus Heartbeat；外部 hosting 需改為平台 cron job |
| 測試 | Vitest；TypeScript 型別檢查 |

### 主要路徑

| 路徑／檔案 | 用途 |
|---|---|
| `client/src/pages/GoogleDriveDashboard.tsx` | 主要相片 Dashboard、篩選、分頁、SSE 同步進度、預覽與 AI 特效。 |
| `client/src/pages/RestaurantList.tsx` | 餐廳清單、地址、地圖、GPS 排序、待送清單。 |
| `client/src/pages/AdminUsers.tsx` | 管理員的使用者批准頁。 |
| `server/routers/googleDrive.ts` | Google Drive tRPC procedures、快取分頁及餐廳名／圖片效果功能。 |
| `server/syncPhotosStream.ts` | `GET /api/sync-photos-stream` SSE 同步 endpoint。 |
| `server/_core/scheduledHandlers.ts` | 每日同步 handler。 |
| `server/_core/googleDrive.ts` | 公開 Drive 資料夾爬蟲、重試、檔名解析、記憶體快取。 |
| `server/routers/restaurantLocations.ts` | 地址查找、Google Places／Geocoding、位置資料。 |
| `server/routers/admin.ts` | 管理員使用者批准功能。 |
| `server/db.ts` | Drizzle data-access helpers，包括快取 upsert、分頁及統計。 |
| `drizzle/schema.ts` | 全部資料表的 TypeScript schema。 |
| `drizzle/*.sql` | 資料庫 migration（新主機首次部署必須執行）。 |

## 5. 資料庫內容

資料表定義和 migrations 已在壓縮包內；**資料庫實際資料不會自動存在於 source code ZIP**。完整遷移必須另行匯入現有資料庫備份，否則會有空的使用者、地址、翻譯和相片快取。

| 表 | 主要用途 |
|---|---|
| `users` | 帳戶、角色、批准狀態。 |
| `restaurants`、`photos` | 既有上載相片／餐廳資料模型。 |
| `google_drive_sync`、`sync_logs` | 同步紀錄模型。 |
| `restaurant_translations` | 中文餐廳名與自動／手動英文名。 |
| `restaurant_locations` | 地址、GPS、AI note、核實狀態。 |
| `photo_cache` | Drive 相片 metadata 的高速分頁快取。 |
| `region_cache` | 地區與子地區的高速快取。 |

> Google Drive 相片原檔並不在資料庫或 ZIP 裏；外部網站繼續讀取同一公開 Drive 資料夾即可。

## 6. 本機啟動與驗證（僅限已完成第 7 節的替換後）

```bash
# 需要 Node.js 22+ 及 pnpm 10+
pnpm install --frozen-lockfile

# 建立 .env（請勿將真實密鑰提交至 git）
cp .env.example .env

# 對全新 MySQL 資料庫套用既有 migrations
pnpm exec drizzle-kit migrate

# 開發模式
pnpm dev

# 型別檢查、測試、production build
pnpm check
pnpm test
pnpm build
NODE_ENV=production pnpm start
```

現有 `package.json` 的 `db:push` 會先產生 migration 再 migrate；**接手部署既有程式時，請優先使用 `pnpm exec drizzle-kit migrate`**，避免無意建立新的 migration 檔。

## 7. 外部 Hosting 必做的遷移工作

此專案的應用程式碼可完整交接，但**不可在非 Manus 主機上原封不動生產部署**，因為以下檔案依賴 Manus 服務／runtime。以下是必做項目。

| 項目 | 現行依賴 | 外部 hosting 的替代／處理 |
|---|---|---|
| 帳戶登入與 session | Manus OAuth、`server/_core/sdk.ts`、`server/_core/oauth.ts`、`server/_core/context.ts` | 改用 Auth0、Clerk、Google OAuth、NextAuth、Passport 或自建 session；把外部帳戶 ID 寫入 `users.openId`，保留 `role` 與 `accessStatus` 規則。 |
| tRPC 授權 | `sdk.authenticateRequest`、`approvedProcedure`、`adminProcedure` | 新 context 必須從新 session 讀取使用者，並保持「approved 或 admin 才可讀取受保護資料」的規則。 |
| 每日同步 | Manus Heartbeat 與 `isCron/taskUid` 驗證 | 用 Vercel Cron、Render Cron Job、Railway Cron、Cloud Scheduler 或 Linux cron；改 handler 為自有 `CRON_SECRET` header 驗證。 |
| Google Maps／Places | Manus Maps proxy（`server/_core/map.ts`） | 建立 Google Cloud project、啟用 Maps JavaScript API、Places API、Geocoding API，並改為使用自己的 API key（須限制 referrer／server IP）。 |
| AI 英文翻譯與地址推斷 | Manus Forge LLM | 以 OpenAI、Gemini、Anthropic 或其他 LLM provider 取代 `server/_core/llm.ts`。 |
| AI 圖片效果 | Manus image generation／Forge storage | 改接圖像模型 API 並把成品上傳至 S3、Cloudflare R2、Supabase Storage 或新主機的物件儲存。 |
| 檔案儲存 proxy | Manus Forge storage、`/manus-storage/*` | 若仍使用既有「上載相片」模組，替換 `server/storage.ts` 與 `server/_core/storageProxy.ts`；Google Drive 瀏覽功能本身不依賴此項。 |
| Vite runtime plugin | `vite-plugin-manus-runtime` | 檢查／移除該 plugin 與 Manus 專屬 public runtime 檔案，改為普通 Vite production build。 |
| 資料庫 | Manus 注入的 `DATABASE_URL` | 於新 MySQL/TiDB 主機設定 `DATABASE_URL`，再匯入資料與 migration。 |

### Google Drive 注意事項

- `GOOGLE_DRIVE_FOLDER_ID` 未設定時，程式目前有一個預設 root folder ID；外部主機建議**強制以環境變數設定**，方便日後更換。
- Drive root folder 及所有需要讀取的子資料夾必須公開給「知道連結的任何人」。
- 現行爬蟲使用 Drive 的公開 HTML，而非官方 API；Google 如修改 HTML 結構，需要維護 `server/_core/googleDrive.ts` 的 parser。
- 同步工作應僅在完整爬取成功時才 prune 舊快取。接手時建議保留或強化這項保護，以免網路／Drive 局部失敗而錯刪既有 `photo_cache` 資料。

## 8. 環境變數

壓縮包內附有 `.env.example`，只含 placeholder。以下是環境變數的用途：

| 變數 | 外部部署需求 |
|---|---|
| `NODE_ENV` | `production`。 |
| `PORT` | 主機指定的 HTTP port。 |
| `DATABASE_URL` | **必填**；MySQL/TiDB connection URL。 |
| `GOOGLE_DRIVE_FOLDER_ID` | 建議必填；公開 Drive 根資料夾 ID。 |
| `JWT_SECRET` | 更換成新的高強度 session secret。 |
| `OAUTH_SERVER_URL`、`VITE_APP_ID` | Manus OAuth 專用；遷移至新 auth 後應移除／改成新 provider 的設定。 |
| `BUILT_IN_FORGE_API_URL`、`BUILT_IN_FORGE_API_KEY` | Manus Forge 專用；遷移到新的 AI／storage provider 後取代。 |
| `OWNER_OPEN_ID` | 現行 Manus owner ID；新登入方案下重新指定／建立初始 admin。 |

**不要**從現行環境複製 Manus OAuth、Forge、Database 的秘密值到外部供應商，應在新平台重新建立或取得憑證。

## 9. 建議交接步驟

1. 在新 hosting 建立 Node.js 22+ service 和 MySQL 8+／TiDB 資料庫。
2. 解壓 source code，執行 `pnpm install --frozen-lockfile`。
3. 對新資料庫套用 `drizzle/` migrations，並匯入現有 production DB data backup。
4. 先替換登入／session、cron 簽名驗證、Maps、LLM、圖片／object storage 等 Manus 專屬服務。
5. 設定 `GOOGLE_DRIVE_FOLDER_ID`，並確認該資料夾對匿名讀取開放。
6. 用 staging 網域測試：登入、pending/approved/admin 權限、相片快取同步、SSE 進度、地區／子地區／餐廳篩選、餐廳地址與地圖。
7. 設定每日 `03:00 UTC` 的安全 cron call；驗證第一次同步完成後，`photo_cache` 和 `region_cache` 都有資料。
8. 把網域 DNS 指向新 hosting，保留 Manus 原網站直到完成 rollback window。

## 10. 驗收清單

- [ ] `pnpm check` 通過
- [ ] `pnpm test` 通過（現行真實 Google Drive 整合測試可能受網路 timeout 影響，應與 unit test 分開檢視）
- [ ] 新登入後用戶在 `users` 建立，且角色／批准限制正確
- [ ] 已批准用戶可以讀取 Dashboard；未批准用戶不可以
- [ ] 「同步快取」顯示 SSE start、逐區進度及 complete/error
- [ ] `photo_cache`、`region_cache` 同步後有預期數量
- [ ] 篩選、搜尋、分頁、相片預覽與 Drive 原圖連結正常
- [ ] 餐廳清單、地址編輯、地圖、GPS 排序、待送清單正常
- [ ] 每日 cron 有驗證、可成功執行，且同步失敗不會清空現有快取

## 11. Manus 內建 Hosting 與外部 Hosting

Manus 內建 hosting 支援使用自訂網域，若只想換網址而不是換技術平台，通常比外遷更直接，並可保留目前的 Manus OAuth、資料庫、AI、Maps、storage 與 Heartbeat 整合。

若選擇外部 hosting，請按本文件第 7 節進行服務替換；這是一次完整的應用程式遷移，而非只上傳靜態 HTML。