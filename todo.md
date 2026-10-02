# Restaurant Photo Dashboard - 開發進度追蹤

## 版本 2.0 - Google Drive 同步版本

本專案實現了一個 Google Drive 同步的餐廳相片管理平台，具備以下核心功能：

### Google Drive 同步功能
- [x] 建立 Google Drive API 集成模組
- [x] 實現手動刷新功能
- [x] 實現地區分類按鈕（正方形排列）
- [x] 實現餐廳名稱搜尋功能
- [x] 實現每日自動同步 Heartbeat 端點（/api/scheduled/syncGoogleDrive）
- [x] 修正資料查詢錯誤（補齊 photos 表欄位，錯誤已消除）

### 前端 Dashboard（Google Drive 版本）
- [x] 設計優雅精緻的視覺風格
- [x] 實現地區分類按鈕（正方形排列）
- [x] 實現餐廳名稱搜尋指令列
- [x] 實現 Grid 網格展示區
- [x] 實現相片放大預覽功能
- [x] 實現純瀏覽模式（無編輯/刪除）
- [x] 實現手動刷新按鈕

### 測試 & 優化
- [x] 為 Google Drive 路由補上 Vitest 測試
- [x] 實現斐尋防护優化（300ms debounce）
- [x] 在 Google Drive Dashboard 中實現圖片懒加載優化（OptimizedImage 元件）
- [x] 補充前端效能測試（debounce 工具函數）
- [x] 補充 Heartbeat 處理器測試
- [x] 21 項測試全部通過

## 版本 1.0 - 原始版本（已完成）

本專案實現了一個完整的餐廳相片管理平台，具備以下核心功能：

### 資料庫 & 後端基礎
- [x] 設計 photos 表 Schema（相片 ID、S3 key、URL、餐廳名稱、菜式類型、上載時間等）
- [x] 設計 restaurants 表 Schema（餐廳 ID、名稱、菜式類型等）
- [x] 建立資料庫遷移 SQL
- [x] 建立 db.ts 查詢輔助函數

### 後端 API
- [x] 實現相片批次上載 API（支援多張圖片）
- [x] 整合 S3 儲存功能
- [x] 實現 LLM Vision 自動分析相片（提取餐廳名稱、菜式類型）
- [x] 實現相片查詢 API（支援按餐廳名稱篩選）
- [x] 實現相片刪除 API
- [x] 實現相片編輯 API（編輯餐廳名稱、菜式類型）
- [x] 撰寫後端單元測試

### 前端 Dashboard
- [x] 設計優雅精緻的視覺風格（配色、字體、排版）
- [x] 實現相片批次上載介面
- [x] 實現搜尋指令列（即時篩選餐廳名稱）
- [x] 實現 Grid 網格展示區
- [x] 實現相片放大預覽功能
- [x] 實現相片刪除功能
- [x] 實現相片編輯功能（編輯餐廳名稱）

### 測試 & 優化
- [x] 整合測試（上載 → 分析 → 展示 → 搜尋 → 刪除）
- [x] 後端單元測試（相片查詢、刪除、編輯、錯誤處理）
- [x] 端到端整合測試（完整工作流程、多餐廳管理）
- [x] 效能優化（圖片載入、搜尋響應時間）

## 最終交付

所有核心功能已完成並通過測試。餐廳相片 Dashboard 已經就緒可上線使用。

### 完成情況
- 專案初始化完成 ✓
- 資料庫 Schema 設計完成 ✓
- 後端 API 開發完成 ✓
- 前端 Dashboard UI 開發完成 ✓
- 後端單元測試完成 ✓
- 整體整合測試完成 ✓
- Google Drive 同步版本完成 ✓
- 21 項測試全部通過 ✓
- 資料庫欄位修複 ✓
- 圖片懒加載優化 ✓
- Heartbeat 自動同步端點 ✓


---

## 真實 Google Drive 集成

- [x] 驗證資料夾公開狀態（公開分享後可用 HTML 爬取）
- [x] 實作遞迴讀取「地區/餐廳相片」二層結構（以文件名作為餐廳名）
- [x] 更新路由從真實 Google Drive 讀取資料（帶 6 小時快取並保留 Mock fallback）
- [x] 補充真實 API 集成測試（googleDrive.integration.test.ts 不 mock、真實拓 Drive，11 項全過）
- [x] 在 Dashboard 驗證真實資料顯示效果（路由 integration test 透過 tRPC caller 驗證 4 項全過，5 個地區 / 80 張相片）
- [x] 後端路由帶 6 小時快取並保留 Mock fallback（已以 invalidateCache + getDriveTree(true) 驗證，并有錯誤 fallback 到 mock 路徑）


---

## Lazy-loading 修復（2026-06-01）

- [x] 確認 Google Drive 公開 HTML 對大型資料夾預設只回傳前 50 項
- [x] 改用 `embeddedfolderview` 或可分頁的 endpoint 重寫爬蟲
- [x] 驗證香港仔資料夾能讀到完整 56 張（含新上傳的）
- [x] 集成測試使用相對斷言（`tree.totalPhotos`、`region.photoCount`），無需 hard-coded 數字
- [x] 全部 41 項測試通過（修復後總數：86 張相片 / 5 個地區）


---

## 介面調整（2026-06-02）

- [x] 地區按鈕移到右側 sticky 側欄（兩欄佈局）
- [x] 修正「全部」按鈕無法顯示所有相片（ALL_REGIONS 標記）
- [x] 頂部新增餐廳快速選取下拉選單（combobox，可搜尋）
- [x] getRestaurants procedure（去重、排序餐廳名稱清單）
- [x] 新增 2 項 getRestaurants 端到端測試，全部 43 項測試通過

- [x] 下拉選單依目前選取地區過濾餐廳（getRestaurants 加 regionId 參數）
- [x] 切換地區時清除餐廳選取與搜尋；placeholder 反映目前地區
- [x] 新增「getRestaurants 帶 regionId 只返回該地區餐廳」測試（路由集成測試 7 項通過）

---

## 餐廳英文名自動翻譯（2026-06-02）

- [x] 自動為餐廳產生英文名（LLM 音譯＋意譯，方案 A）
- [x] 新增 restaurant_translations 快取表（中文名 unique → 英文名）
- [x] 翻譯模組 translation.ts：記憶體 + DB 快取，批次 LLM 翻譯，去重
- [x] getRestaurants / getPhotos 回傳附帶 nameEn
- [x] 前端三處顯示英文名：相片卡片、預覽彈窗、下拉選單（英文名亦可被搜尋）
- [x] 翻譯模組單元測試 5 項通過

- [x] 頂部搜尋欄支援用英文名搜尋餐廳（getPhotos 同時比對中文名與英文名）
- [x] 新增「getPhotos 可用英文名搜尋餐廳」端到端測試（路由集成測試 8 項通過）

- [x] 相片卡片在餐廳名／英文名下方顯示所屬地區小標籤（DrivePhoto 加 regionName）
- [x] getPhotos 集成測試加 regionName 斷言（路由集成測試 8 項通過）

---

## 相片環境狀態（2026-06-03）

- [x] 後端：解析檔名 `餐廳名_環境.jpg`，拆出 restaurantName 與 environment（parseFileName）
- [x] 後端：無 `_` 後綴的視為室內（environment 為 null）
- [x] DrivePhoto 加 environment 欄位，getPhotos 一路回傳
- [x] 前端卡片：餐廳名只顯示純餐廳名，環境另以琥珀色小標籤顯示
- [x] 前端預覽彈窗：顯示地區與環境標籤
- [x] 測試：parseFileName 7 項單元測試（有／無環境、多個底線、空字串、大小寫副檔名）全部通過

- [x] 後端 getEnvironments：回傳 { environments, hasIndoor } 供前端建 checkbox
- [x] 後端 getPhotos 加 environments 過濾參數（__indoor__ 代表室內無環境）
- [x] 把「室內」環境字串統一視為無環境（null），避免重複選項
- [x] 前端：地區欄下方加環境多選 checkbox（含「室內（不受環境影響）」）
- [x] 前端：依勾選的環境過濾相片（未勾選＝全部）；切換地區清空環境
- [x] 測試：getEnvironments 去重清單 + environments 過濾 + __indoor__ 過濾（路由集成 11 項通過）

---

## 修正與釐清（2026-06-03 第二輪）

- [x] 修復香港仔照片消失：根因是 Drive 偶發 502，爬蟲未重試導致整個地區清空；已加自動重試（最多 3 次、遞增延遲、30s 逾時）
- [x] 釐清室內語意：`_室內` 後綴＝拍攝室內環境（保留為環境標籤），只有「無後綴」才＝不受環境影響
- [x] 還原 parseFileName：保留「室內」為環境字串，不再視為 null
- [x] checkbox 自然區分「室內」（環境）與「室內（不受環境影響）」（hasIndoor）兩個選項
- [x] 更新 parseFileName 與集成測試以反映新語意（單元 15 項 + 集成 11 項通過）
- [x] 確認手動刷新會 invalidateCache 並重抓 Drive，新增的環境狀態會自動更新
- [x] 手動刷新 onSuccess 同時 invalidate `getEnvironments` 與 `getRestaurants`，環境 checkbox 與餐廳下拉免重整頁即更新

- [x] 餐廳英文名手動覆寫：schema 加 isManual 欄位
- [x] db helper：saveTranslations 不覆寫手動項、setManualTranslation、getAllTranslationFlags
- [x] 後端 setRestaurantNameEn protectedProcedure（登入者可寫）
- [x] 翻譯邏輯：手動覆寫值固定優先於 AI 自動翻譯，清除記憶體快取
- [x] 前端預覽彈窗加入英文名編輯入口（僅登入者見鉛筆），支援儲存/清除
- [x] 單元測試 sortEnvironments（4 項）並通過全部 66 項測試

---

## 子地區層級支援（2026-06-05）

- [x] 子地區支援：爬蟲遞迴讀取地區下子資料夾相片（相容舊「直接放相片」結構），相片加 subRegion 欄位
- [x] 後端提供子地區清單（含張數、餐廳間數）；listPhotos 支援 subRegionName 篩選
- [x] 前端：選定地區後顯示子地區篩選列（含張數·餐廳間數，預設全部），相片標示子地區
- [x] 單元／集成測試覆蓋子地區彙整與篩選（getSubRegions 張數加總＝地區總數、餐廳數、其他排最後；getPhotos 按 subRegion 篩選；無子地區地區相容），加上環境無括號數字後綴、夜間/夜晚同義詞合併、sortSubRegions，全部 82 項測試通過

---

## 餐廳名正規化（方案 A）（2026-06-05）

- [x] normalizeRestaurantName：移除結尾括號數字（（1）/(2)）與「空格＋數字」後綴，反覆移除多重後綴
- [x] 保護以數字結尾的店名（7-11、大家樂2026、譚仔3哥不受影響）；括號內為文字（如（米線））原樣保留
- [x] 套用於 parseFileName，所有下游（卡片標籤、搜尋、餐廳計數、翻譯 key）自動合併
- [x] 甜灣鐵板燒手動英文名 = "Jeppanyaki Delis"
- [x] 新增 24 項 normalizeRestaurantName 單元測試；全部 89 項測試通過

---

## 餐廳下拉隨子地區聯動（2026-06-05）

- [x] getRestaurants 加 subRegion 參數，按子地區過濾餐廳清單
- [x] 前端把目前選取子地區帶入 getRestaurants 查詢；切換子地區清空餐廳選取
- [x] 補集成測試：getRestaurants 帶 subRegion 只返回該子地區餐廳（15 項路由集成測試全過）

---

## 清除篩選掣 + 下拉同步子地區名（2026-06-05）

- [x] 手動刷新掣旁加「清除篩選」按鈕（一鍵重設地區/子地區/環境/搜尋/餐廳選取），無篩選時禁用
- [x] 下拉選單與搜尋 placeholder 揀子地區後同步顯示子地區名（scopeLabel = 子地區 ?? 地區名）
- [x] 抽出 computeScopeLabel helper 並補 5 項單元測試
- [x] 放寬偶發逾時的真實 Drive 整合測試時限（20s）；全部 95 項測試通過

---

## 切換地區/子地區自動重置環境勾選（2026-06-05）

- [x] 確認切換地區 handleSelectRegion 已清空環境勾選（既有）
- [x] handleSelectSubRegion 補上 setSelectedEnvironments([])，切換子地區亦重置環境
- [x] 前端 lib 測試重跑通過（無回退）

---

## 移除訪客瀏覽 + 批准制存取（2026-06-05）

- [x] schema：users 加 accessStatus（pending/approved/rejected，預設 pending）；owner 自動 approved
- [x] migration：產生並套用 SQL；owner 現有列補為 approved
- [x] 後端：新增 approvedProcedure（登入 + approved 或 admin）
- [x] 後端：googleDrive 與 photos 資料 procedure 全改用 approvedProcedure（pending/rejected 登入亦讀不到資料）
- [x] 後端：auth.me 回傳 accessStatus；新增 admin listUsers / setUserAccess
- [x] 前端：移除「以訪客身分瀏覽」入口
- [x] 前端：未登入→登入頁；pending/rejected→等待批准頁；approved/admin→dashboard
- [x] 前端：admin 使用者審批面板（批准/拒絕）+ Dashboard header 入口與登出
- [x] 測試：access.test.ts 12 項全過（攔 pending/rejected、放行 approved/admin、photos.list 亦受控、setUserAccess 權限）；既有測試補 accessStatus 後通過（1 項為真實 Drive 數量浮動）

---

## 日間／夜晚環境標籤配色區分（2026-06-05）

- [x] 新增 envStyle helper：日間=琥珀+太陽圖示、夜晚=靛藍+月亮圖示、室內=石色+房子、其他=灰
- [x] 套用至卡片環境標籤、預覽彈窗、環境 checkbox（選取時用對應深色）
- [x] envStyle 8 項單元測試 + 前端 lib 17 項全過

- [x] 加入「雨天 / rain」環境配色：青藍色 + 雨雲（CloudRain）圖示，套用至卡片／預覽／checkbox；測試補至 10 項全過

---

## 放大預覽：左右切換 + 鍵盤 + 載入淡入（2026-06-06）

- [x] 預覽相片置中（OptimizedImage center 選項）
- [x] 左右箭咀按鈕切換上一張／下一張（清單內循環）+ 張數指示 N / 總數
- [x] 鍵盤：← → 切換、Esc 關閉
- [x] 切換時 key 重設觸發載入 spinner + opacity 淡入
- [x] 抽出 nextIndex helper（gallery.ts）+ 6 項單元測試；前端 lib 共 25 項全過

- [x] 依用戶要求移除左右切換（箭咀、鍵盤←→、張數指示、gallery helper）；保留置中與 Esc 關閉

---

## 放大預覽：圖片特效 section（落雨／夜晚）（2026-06-06）

- [x] 後端 googleDrive.applyEffect（approvedProcedure）：以原圖 + 效果(rain|night) AI 重繪，回傳生成圖 URL
- [x] 後端：效果 prompt（rain=落雨氛圍、night=夜晚氛圍），保留店面構圖與招牌
- [x] 前端預覽彈窗下方加「特效」section：落雨／夜晚兩掣 + 處理中狀態
- [x] 前端：生成後顯示效果圖，可切回原圖、可下載
- [x] 測試：applyEffect 受 approvedProcedure 保護（pending 被擋）、effect 參數驗證、非 url 驗證
- [x] 抽出 buildEffectPrompt 可測函式，斷言兩提示詞含「保留構圖／招牌不變」約束（access.test.ts 共 18 項全過）

- [x] 新增「移除人物」特效（declutter）：AI 移除店面前行人／顧客並填補背景，保留店面與招牌；按鈕用 UserX 綠色；access.test.ts 共 19 項全過
- [x] 移除預覽圖片左上角「特效預覽」字眼角標

---

## 餐廳清單 + GPS 距離排列（2026-06-22）

- [x] Schema：新增 restaurantLocations 表（nameZh, address, lat, lng, region, isVerified）
- [x] migration：產生並套用 SQL
- [x] 後端 db helpers：listRestaurantLocations / getRestaurantLocationByName / upsertRestaurantLocation
- [x] 後端 aiSearchRestaurantAddress：LLM 搜尋地址 → Places API → Geocoding 回退 → AI-only 回退
- [x] 後端 tRPC restaurantLocations router：listLocations / fetchAddress / batchFetchAddresses / upsertLocation（全部 approvedProcedure）
- [x] 前端 RestaurantList.tsx：清單 + 地圖 + GPS 距離排列 + 一鍵導航 + AI 批次搜尋
- [x] Dashboard header 加「餐廳清單」入口連結（MapPin 圖示）
- [x] 測試：restaurantLocations.test.ts 12 項全過；haversine.test.ts 6 項全過；全部 142 項測試通過

---

## 餐廳清單「睇相片」按鈕（2026-06-22）

- [x] RestaurantList 每間餐廳加「睇相片」掣（琥珀色 + Images 圖示）
- [x] 連結至 /dashboard?restaurant=餐廳名（URL encode）
- [x] Dashboard 入頁時讀取 ?restaurant= query param，自動設定餐廳篩選（useSearch + useEffect，僅首次掛載執行）
- [x] TS 0 錯誤，前端 lib 25 項測試全過

---

## 餐廳清單自動顯示所有 Drive 餐廳（2026-06-22）

- [x] 後端 listLocations 合併 Google Drive 餐廳名稱（無地址者亦顯示）
- [x] 前端 RestaurantList 適配新資料格式，顯示所有餐廳

---

## 待送清單功能（2026-06-22）

- [x] RestaurantList 加入「加入待送清單」按鈕（每間餐廳旁）
- [x] 待送清單儲存於 localStorage，頁面刷新後不會消失
- [x] Header 待送按鈕開啟右側浮層（Sheet）顯示待送清單（含餐廳名、地址、導航連結）
- [x] 支援移除單間餐廳及清空全部

---

## 相片後台快取 + 分頁載入（2026-06-23）

- [x] 建立 photo_cache 資料表 schema（fileId, name, url, thumbnailUrl, restaurantName, regionId, regionName, subRegionName, environment, createdTime）
- [x] 後端同步函數：從 Google Drive 撈取全部相片並寫入 photo_cache
- [x] tRPC getPhotos 改用 photo_cache 分頁查詢（limit/offset/cursor）
- [x] 前端加入無限滾動分頁載入（每次載入 30 張）
- [x] 加入「同步」按鈕觸發快取更新，顯示同步進度

---

## 相片快取資料庫 + 分頁載入（2026-07-09）

- [x] Schema：新增 photo_cache 表（fileId, name, restaurantName, environment, thumbnailUrl, webViewLink, regionId, regionName, subRegionName, syncedAt）
- [x] migration：產生並套用 SQL
- [x] db helpers：upsertPhotoCacheBatch / prunePhotoCache / getPhotosCached（分頁查詢，支援地區/子地區/餐廳/搜尋/環境篩選）/ getPhotoCacheStats（總張數/地區數/餐廳數/最後同步時間）
- [x] 後端 syncPhotos（adminProcedure）：同步 Drive 所有相片到 photo_cache，刪除舊記錄
- [x] 後端 getPhotoCacheStats（approvedProcedure）：回傳快取統計資訊
- [x] 後端 getPhotosPaged（approvedProcedure）：分頁查詢快取相片，附帶英文名
- [x] 前端：快取未同步時降級使用直接 Drive 查詢（fallback）
- [x] 前端：admin 加「同步快取」按鈕（Database 圖示，綠色），顯示上次同步時間
- [x] 前端：相片區加「載入更多」按鈕（每次 +30 張，最多 6 頁 = 180 張）
- [x] 前端：header 統計改顯示快取數字（快取同步後）
- [x] 前端：快取未同步時在空白頁顯示提示 + 立即同步按鈕（admin only）

---

## 修復入頁載入緩慢（2026-07-09）

- [x] 根本原因：Drive 快取為記憶體快取，cold start 後清空，每次需重新爬取 Drive（數秒）
- [x] Schema：新增 region_cache 資料表（folderId, name, photoCount, restaurantCount, subRegionsJson）
- [x] migration：產生並套用 SQL
- [x] db helpers：upsertRegionCacheBatch / getRegionsCached
- [x] syncPhotos 同步時同時寫入 region_cache（地區快取與相片快取一起更新）
- [x] getRegions 優先從 DB 讀取（毫秒級），快取空才 fallback 到 Drive 爬取

---

## 三項改進（2026-07-09）

- [x] Heartbeat 每日自動同步：每日凌晨自動執行 syncPhotos，更新 photo_cache 和 region_cache
- [x] 合併「手動刷新」和「同步快取」按鈕：移除手動刷新，「同步快取」改為所有已批准用戶可用，補齊所有 invalidate
- [x] 同步進度顯示：同步時顯示目前進度（已處理地區數 / 總地區數 + 相片數），前端顯示進度條
- [x] getSubRegions 從 photo_cache 聚合計算（不再爬取 Drive），加快子地區列表載入

---

## SSE 串流同步進度（2026-07-09）

- [x] 後端：建立 /api/sync-photos-stream SSE endpoint，逐地區回報進度事件（start/region-done/complete/error）
- [x] 前端：改用 EventSource 訂閱 SSE，每個地區完成即時更新進度條和相片計數
- [x] 前端：同步完成後自動 invalidate 所有相關 queries
