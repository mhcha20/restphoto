# 餐廳相片 Dashboard（restphoto）

給日後 AI 嘅項目背景。用戶用廣東話溝通，回覆用繁體廣東話；用戶唔係寫程式嘅人。所有網站一覽：`docs/ALL_SITES.md`。

## 接手先讀
- `EXTERNAL_HOSTING_HANDOVER.md`：**最完整嘅說明**（用途、角色、功能、架構、資料表、由 Manus 搬出要換嘅嘢）。
- `todo.md`：Manus 時期功能清單。`README.md` 係 Manus 範本原文（tRPC 開發流程有用，Manus OAuth 部分唔適用）。

## 係咩
要登入＋**管理員批准**先睇到嘅餐廳相片管理 Dashboard。相片原檔喺**公開 Google Drive 資料夾**（地區 →（子地區）→ 餐廳），網站爬 Drive（`embeddedfolderview`，毋須 API key）將 metadata 同步入 MySQL 快取（`photo_cache`、`region_cache`），提供：
- 地區／子地區／餐廳／環境（日間、黃昏、夜晚、室內）篩選、搜尋、每頁 30 張＋載入更多、燈箱預覽、Drive 原圖連結；R2 縮圖快取。
- 中英文餐廳名（AI 譯＋手動覆寫）；AI 圖片效果（落雨、夜晚、移除人物，唔改 Drive 原圖）。
- 餐廳清單：地址（AI 推測＋Google Places／Geocoding，可手動改）、GPS 距離排序、地圖、導航；**待送清單**（只存瀏覽器 localStorage）。
- 手動「同步快取」（SSE 即時進度 `/api/sync-photos-stream`）；每日同步 endpoint `POST /api/scheduled/syncGoogleDrive`（`Authorization: Bearer $CRON_SECRET`，要外部 cron 叫；Railway 上有冇設定 cron 未確認）。
- 管理員批准／拒絕用戶（`/admin` 用戶管理）。
React 19＋Vite＋Tailwind 4、Express＋tRPC 11、Drizzle＋MySQL、Google 登入、R2。

## 部署
- Railway project `restphoto`（id `cb041734-4e1d-4ba5-9a4e-e8447229645f`），service `web`（`11b63e1d-bdba-4f8a-ab70-5f763d158885`）＋`MySQL`，環境 `production`（`254def58-464b-4fb0-9015-e0851be80511`），region 新加坡。
- **部署 branch：`main`**（GitHub 默認 branch 係 `claude/compassionate-heisenberg-swcvrz`）。網址 https://web-production-dffd9.up.railway.app
- `railway.json`：Nixpacks、`pnpm build`、start `pnpm exec drizzle-kit migrate && pnpm start`；要 Node 22（`.nvmrc`、`NIXPACKS_NODE_VERSION`）。
- Variables（只記名稱）：`DATABASE_URL`、`JWT_SECRET`、`APP_URL`、`ADMIN_EMAIL`、`GOOGLE_CLIENT_ID／SECRET`、`GOOGLE_DRIVE_FOLDER_ID`、`GOOGLE_MAPS_API_KEY`、`VITE_GOOGLE_MAPS_API_KEY`、`S3_*`（含 `S3_PUBLIC_URL`）、`CRON_SECRET`、`ANTHROPIC_API_KEY`、`OPENROUTER_API_KEY`、`XAI_API_KEY`、`NIXPACKS_NODE_VERSION`、`NODE_ENV`。

## ⚠ 未上線嘅改動
`claude/compassionate-heisenberg-swcvrz` 有一個 2026-10-31 commit「Use the Anthropic API (Claude) for text tasks instead of OpenRouter」（`server/_core/llm.ts`），**未 merge 入 `main`**，所以網站仲用 OpenRouter。要上線就開 PR merge 入 `main`。

## 修改歷史
- 10-02：由 Manus 交接包匯入 → 換走 Manus 服務（Google 登入、R2、自己嘅 LLM）→ Drive 爬唔齊唔刪快取 → Node 22 → R2 縮圖快取。
- 10-03：加快首頁載入；重新設計（暖橙紅主題、相片 grid、燈箱、手機版、餐廳卡片），PR #1 merge 入 main。
- 10-31（未上線）：文字任務改用 Anthropic API。
