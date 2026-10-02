/**
 * Google Drive 公開資料夾爬蟲（無需 API 金鑰）
 *
 * 透過解析 Google Drive 分享頁面的 HTML，遞迴抓取以下結構：
 *   餐廳相片（根資料夾）
 *     └── 地區（如 田灣、銅鑼灣、香港仔...）
 *           └── 餐廳相片檔案（如 君成餃子源.jpg）
 *
 * 由於資料夾必須設為「知道連結的任何人」公開分享，這個爬蟲才能取得資料。
 */

import { ENV } from "./env";

const ROOT_FOLDER_ID =
  ENV.googleDriveFolderId || "1GXeVk67PUcsV8cyndCRAVg4hfGndtCsm";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface DrivePhoto {
  id: string;
  fileName: string;
  restaurantName: string;
  /** 環境狀態（如「晴天」「雨天」「夜晚」）；室內不受影響的相片為 null */
  environment: string | null;
  thumbnailUrl: string;
  viewUrl: string;
  /** 所屬地區名稱（在 listPhotos 彙整時填入） */
  regionName?: string;
  /** 所屬子地區名稱；若相片直接放在地區資料夾（無子地區）則為 null */
  subRegion: string | null;
}

export interface DriveRegion {
  id: string;
  name: string;
  photoCount: number;
  photos: DrivePhoto[];
  /** 子地區清單（依子資料夾名）；若地區下只有相片無子資料夾則為空陣列 */
  subRegions: string[];
}

export interface CrawlResult {
  regions: DriveRegion[];
  fetchedAt: number;
  totalPhotos: number;
  /** 讀取失敗的地區／子地區 folder ID；非空代表爬取不完整，不可 prune 舊快取。 */
  failedFolderIds?: string[];
}

// 保留舊介面以維持向後相容（測試和路由可能還在用）
export interface PhotoMetadata {
  googleDriveFileId: string;
  googleDriveUrl: string;
  fileName: string;
  restaurantName: string;
  region: string;
}

/** 簡單的記憶體快取，避免每次請求都重新爬整個資料夾 */
let cachedResult: CrawlResult | null = null;
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 小時

/**
 * 抓取資料夾 HTML，對暫時性錯誤（5xx / 429 / 網路逾時）自動重試。
 * 用 embeddedfolderview endpoint：
 * 1. 不受 lazy-loading 影響，會一次回傳資料夾內所有檔案
 * 2. HTML 結構乾淨，僅含 flip-entry 區塊（檔名 + file ID + 縮圖）
 * 3. 避免 drive/folders endpoint 預設只顯示前 50 項的限制
 *
 * 重試的目的：Google Drive 偶發回傳 502/503 等暫時性錯誤，
 * 若不重試，單一地區抓取失敗就會讓整個地區的相片消失。
 */
async function fetchFolderHtml(
  folderId: string,
  maxRetries = 3
): Promise<string> {
  const url = `https://drive.google.com/embeddedfolderview?id=${folderId}#list`;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { "User-Agent": UA },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (res.ok) {
        return await res.text();
      }
      // 4xx（除了 429）視為永久性錯誤，不重試
      if (res.status < 500 && res.status !== 429) {
        throw new Error(`Failed to fetch folder ${folderId}: ${res.status}`);
      }
      lastErr = new Error(
        `Failed to fetch folder ${folderId}: ${res.status}`
      );
    } catch (err) {
      lastErr = err;
    }
    // 還有重試機會：遞增延遲（0.8s, 1.6s, 2.4s...）後再試
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, attempt * 800));
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Failed to fetch folder ${folderId}`);
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

function cleanId(rawId: string): string {
  // Drive HTML 偶爾會把 ID 加上 -0-16 之類的後綴，要清理掉
  return rawId.replace(/-\d+-\d+$/, "");
}

/**
 * 從 embeddedfolderview HTML 解析所有 flip-entry 區塊。
 * 每個 entry 結構：
 *   <div class="flip-entry" id="entry-{ID}" ...>
 *     <a href="https://drive.google.com/file/d/{ID}/view" ...>
 *       <img src="https://lh3.googleusercontent.com/...=s190" ...>
 *       ...
 *       <div class="flip-entry-title">{檔名 / 資料夾名}</div>
 *
 * 資料夾項目則用 href="https://drive.google.com/folderview?id={ID}"。
 */
function parseFlipEntries(
  html: string
): Array<{ id: string; title: string; kind: "file" | "folder" }> {
  const result: Array<{ id: string; title: string; kind: "file" | "folder" }> =
    [];
  const seen = new Set<string>();
  // 用 flip-entry 區塊切片，再在每個區塊內取資料
  const blockRe = /<div[^>]*class="[^"]*\bflip-entry\b[^"]*"[\s\S]*?<div class="flip-entry-title">([^<]*)<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html))) {
    const block = m[0];
    const title = decodeHtmlEntities(m[1]).trim();
    // 先看是不是檔案
    const fileMatch = block.match(
      /href="https:\/\/drive\.google\.com\/file\/d\/([^/"]+)\//
    );
    if (fileMatch) {
      const id = cleanId(fileMatch[1]);
      if (id.length >= 25 && !seen.has(id)) {
        seen.add(id);
        result.push({ id, title, kind: "file" });
      }
      continue;
    }
    // 再看是不是資料夾
    const folderMatch = block.match(
      /href="https:\/\/drive\.google\.com\/(?:folderview\?id=|drive\/folders\/)([A-Za-z0-9_-]+)/
    );
    if (folderMatch) {
      const id = cleanId(folderMatch[1]);
      if (id.length >= 25 && !seen.has(id)) {
        seen.add(id);
        result.push({ id, title, kind: "folder" });
      }
    }
  }
  return result;
}

function parseSubFolders(
  html: string,
  parentId: string
): Array<{ id: string; name: string }> {
  return parseFlipEntries(html)
    .filter((e) => e.kind === "folder" && e.id !== parentId)
    .map((e) => ({ id: e.id, name: e.title }));
}

const IMAGE_EXT_RE = /\.(jpg|jpeg|png|gif|webp|heic)$/i;

function parseImageFiles(
  html: string,
  parentId: string
): Array<{ id: string; fileName: string }> {
  return parseFlipEntries(html)
    .filter(
      (e) =>
        e.kind === "file" &&
        e.id !== parentId &&
        IMAGE_EXT_RE.test(e.title)
    )
    .map((e) => ({ id: e.id, fileName: e.title }));
}

function buildPhotoUrls(fileId: string): {
  thumbnailUrl: string;
  viewUrl: string;
} {
  return {
    thumbnailUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`,
    viewUrl: `https://drive.google.com/file/d/${fileId}/view`,
  };
}

/**
 * 從檔名解析餐廳名與環境狀態。
 * 規則：檔名格式為 `餐廳名_環境.副檔名`，以「最後一個底線」分隔。
 *   - 「流記艇仔粉_晴天.jpg」  → { restaurantName: "流記艇仔粉", environment: "晴天" }
 *   - 「大囍.jpg」（無底線）   → { restaurantName: "大囍", environment: null }（室內，不受環境影響）
 *   - 「A_B_夜晚.jpg」          → { restaurantName: "A_B", environment: "夜晚" }（只切最後一段為環境）
 * 若底線後為空字串，視為無環境。
 */
/**
 * 正規化環境名稱：移除結尾的括號連數字（支援全形「（1）」與半形「(2)」），
 * 使「夏（1）」「夏(2)」「夏」合併為同一個「夏」。
 * 也一併清除數字前可能出現的空白與連續多個括號數字。
 */
export function normalizeEnvironment(env: string): string {
  let s = env.trim();
  // 反覆移除結尾的數字後綴，讓帶數字與不帶數字的同名環境合併：
  //  - 括號數字：「夏（1）」「夏(2)」→「夏」
  //  - 無括號緊貼數字：「夜間1」「夜晚2」→「夜間」「夜晚」
  // 注意：括號內為文字者（如「黃昏（夏）」）不受影響，原樣保留。
  let prev: string;
  do {
    prev = s;
    s = s
      .replace(/\s*[（(]\s*\d+\s*[）)]\s*$/, "")
      .replace(/\s*\d+\s*$/, "")
      .trim();
  } while (s !== prev);
  // 同義詞合併：「夜間」與「夜晚」統一為「夜晚」。
  if (s === "夜間") s = "夜晚";
  return s;
}

/**
 * 正規化餐廳名稱：移除結尾的「（數字）」/「(數字)」與「空格＋數字」標記，
 * 使「大快活（1）」「大快活(2)」「大快活 1」都合併為「大快活」。
 * 安全考量（方案 A）：不動「無空格也無括號」的尾數字（如「7-11」「大家樂2026」），
 * 以免誤傷以數字結尾的店名。括號內為文字者（如「譚仔（米線）」）也不受影響。
 */
export function normalizeRestaurantName(name: string): string {
  let s = name.trim();
  let prev: string;
  do {
    prev = s;
    s = s
      // 結尾括號純數字：「（1）」「(2)」
      .replace(/\s*[（(]\s*\d+\s*[）)]\s*$/, "")
      // 結尾「空格（含全形空格）＋純數字」：「大快活 1」
      .replace(/[\s\u3000]+\d+\s*$/, "")
      .trim();
  } while (s !== prev);
  return s;
}

export function parseFileName(fileName: string): {
  restaurantName: string;
  environment: string | null;
} {
  const base = fileName.replace(/\.[A-Za-z]+$/, "").trim();
  const idx = base.lastIndexOf("_");
  if (idx === -1) {
    return { restaurantName: normalizeRestaurantName(base), environment: null };
  }
  const namePart = normalizeRestaurantName(base.slice(0, idx).trim());
  let envPart = base.slice(idx + 1).trim();
  if (!namePart || !envPart) {
    // 例如「_晴天」或「流記_」這類異常，退回整段當餐廳名
    return { restaurantName: normalizeRestaurantName(base), environment: null };
  }
  // 正規化環境：移除結尾的括號連數字（如「夏（1）」「夏(2)」→「夏」），
  // 讓帶數字與不帶數字的同名環境合併為同一個狀態。
  envPart = normalizeEnvironment(envPart);
  if (!envPart) {
    return { restaurantName: namePart, environment: null };
  }
  // 注意：`_室內` 後綴代表「拍攝餐廳室內環境」，是一種環境狀態，
  // 與「無後綴＝餐廳位於室內、不受天氣影響」是兩回事，故保留為環境字串。
  return { restaurantName: namePart, environment: envPart };
}

/**
 * 子地區排序：「其他」始終排最後，其餘依繁體中文排序。
 */
export function sortSubRegions(list: string[]): string[] {
  return [...list].sort((a, b) => {
    const ao = a === "其他" ? 1 : 0;
    const bo = b === "其他" ? 1 : 0;
    if (ao !== bo) return ao - bo;
    return a.localeCompare(b, "zh-Hant");
  });
}

/** 真正的爬蟲：從 Google Drive HTML 解析地區和相片 */
export async function crawlDriveTree(): Promise<CrawlResult> {
  const rootHtml = await fetchFolderHtml(ROOT_FOLDER_ID);
  const regionsRaw = parseSubFolders(rootHtml, ROOT_FOLDER_ID);

  const regions: DriveRegion[] = [];
  const failedFolderIds: string[] = [];
  let totalPhotos = 0;

  for (const region of regionsRaw) {
    try {
      const regionHtml = await fetchFolderHtml(region.id);
      const entries = parseFlipEntries(regionHtml);

      // 地區資料夾下可能同時有：直接放的相片（舊結構）與子資料夾（子地區）。
      const directFiles = entries.filter(
        (e) => e.kind === "file" && e.id !== region.id && IMAGE_EXT_RE.test(e.title)
      );
      const subFolders = entries.filter(
        (e) => e.kind === "folder" && e.id !== region.id
      );

      const photos: DrivePhoto[] = [];
      const subRegions: string[] = [];

      // 1) 直接放在地區資料夾的相片：subRegion = null
      for (const p of directFiles) {
        const { restaurantName, environment } = parseFileName(p.title);
        photos.push({
          id: p.id,
          fileName: p.title,
          restaurantName,
          environment,
          subRegion: null,
          ...buildPhotoUrls(p.id),
        });
      }

      // 2) 遞迴讀取每個子地區資料夾的相片：subRegion = 子資料夾名
      for (const sub of subFolders) {
        try {
          const subHtml = await fetchFolderHtml(sub.id);
          const subPhotos = parseImageFiles(subHtml, sub.id);
          if (subPhotos.length > 0) {
            subRegions.push(sub.title);
          }
          for (const p of subPhotos) {
            const { restaurantName, environment } = parseFileName(p.fileName);
            photos.push({
              id: p.id,
              fileName: p.fileName,
              restaurantName,
              environment,
              subRegion: sub.title,
              ...buildPhotoUrls(p.id),
            });
          }
          await new Promise((r) => setTimeout(r, 200));
        } catch (subErr) {
          failedFolderIds.push(region.id);
          console.warn(
            `[GoogleDrive] Failed to fetch sub-region ${region.name}/${sub.title}:`,
            subErr
          );
        }
      }

      regions.push({
        id: region.id,
        name: region.name,
        photoCount: photos.length,
        photos,
        subRegions: sortSubRegions(subRegions),
      });
      totalPhotos += photos.length;

      // 友善節流，避免被 Drive 限速
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      failedFolderIds.push(region.id);
      console.warn(
        `[GoogleDrive] Failed to fetch region ${region.name}:`,
        err
      );
      regions.push({
        id: region.id,
        name: region.name,
        photoCount: 0,
        photos: [],
        subRegions: [],
      });
    }
  }

  const result: CrawlResult = {
    regions,
    fetchedAt: Date.now(),
    totalPhotos,
    failedFolderIds,
  };
  cachedResult = result;
  return result;
}

/** 取得快取的爬蟲結果，過期則重新爬 */
export async function getDriveTree(forceRefresh = false): Promise<CrawlResult> {
  if (
    !forceRefresh &&
    cachedResult &&
    Date.now() - cachedResult.fetchedAt < CACHE_TTL_MS
  ) {
    return cachedResult;
  }
  return await crawlDriveTree();
}

/** 取得所有地區的精簡列表（給按鈕用，含相片張數與去重後餐廳間數、子地區清單） */
export async function listRegions(): Promise<
  Array<{
    id: string;
    name: string;
    photoCount: number;
    restaurantCount: number;
    subRegions: string[];
  }>
> {
  const tree = await getDriveTree();
  return tree.regions.map((r) => ({
    id: r.id,
    name: r.name,
    photoCount: r.photoCount,
    restaurantCount: new Set(r.photos.map((p) => p.restaurantName)).size,
    subRegions: r.subRegions,
  }));
}

/**
 * 取得指定地區的子地區清單（含每個子地區的張數與餐廳間數）。
 * 若地區無子地區則回傳空陣列。
 */
export async function listSubRegions(
  regionId: string
): Promise<
  Array<{ name: string; photoCount: number; restaurantCount: number }>
> {
  const tree = await getDriveTree();
  const region = tree.regions.find((r) => r.id === regionId);
  if (!region) return [];
  return region.subRegions.map((name) => {
    const photos = region.photos.filter((p) => p.subRegion === name);
    return {
      name,
      photoCount: photos.length,
      restaurantCount: new Set(photos.map((p) => p.restaurantName)).size,
    };
  });
}

/** 取得指定地區的相片，並可選按子地區、餐廳名稱模糊搜尋 */
export async function listPhotos(opts: {
  regionId?: string | null;
  subRegion?: string | null;
  search?: string;
}): Promise<DrivePhoto[]> {
  const tree = await getDriveTree();
  let photos: DrivePhoto[] = [];
  if (opts.regionId) {
    const region = tree.regions.find((r) => r.id === opts.regionId);
    photos = region
      ? region.photos.map((p) => ({ ...p, regionName: region.name }))
      : [];
  } else {
    photos = tree.regions.flatMap((r) =>
      r.photos.map((p) => ({ ...p, regionName: r.name }))
    );
  }

  // 子地區篩選（僅在選定地區時有意義）
  if (opts.subRegion && opts.subRegion.trim()) {
    photos = photos.filter((p) => p.subRegion === opts.subRegion);
  }

  if (opts.search && opts.search.trim()) {
    const q = opts.search.trim().toLowerCase();
    photos = photos.filter((p) =>
      p.restaurantName.toLowerCase().includes(q)
    );
  }

  return photos;
}

/** 手動清空快取（給「手動刷新」按鈕用） */
export function invalidateCache(): void {
  cachedResult = null;
}

// ---------------------------------------------------------------
// SSE 進度回報版本：每完成一個地區就呼叫 callback
// ---------------------------------------------------------------

export interface RegionProgressEvent {
  type: "start" | "region-done" | "complete" | "error";
  regionIndex?: number;
  totalRegions?: number;
  regionName?: string;
  regionPhotoCount?: number;
  totalPhotos?: number;
  deletedPhotos?: number;
  error?: string;
}

export async function crawlDriveTreeWithProgress(
  onProgress: (event: RegionProgressEvent) => void
): Promise<CrawlResult> {
  const rootHtml = await fetchFolderHtml(ROOT_FOLDER_ID);
  const regionsRaw = parseSubFolders(rootHtml, ROOT_FOLDER_ID);
  const totalRegions = regionsRaw.length;
  const regions: DriveRegion[] = [];
  const failedFolderIds: string[] = [];
  let totalPhotos = 0;

  onProgress({ type: "start", totalRegions });

  for (let i = 0; i < regionsRaw.length; i++) {
    const region = regionsRaw[i];
    try {
      const regionHtml = await fetchFolderHtml(region.id);
      const entries = parseFlipEntries(regionHtml);
      const directFiles = entries.filter(
        (e) => e.kind === "file" && e.id !== region.id && IMAGE_EXT_RE.test(e.title)
      );
      const subFolders = entries.filter(
        (e) => e.kind === "folder" && e.id !== region.id
      );
      const photos: DrivePhoto[] = [];
      const subRegions: string[] = [];
      for (const p of directFiles) {
        const { restaurantName, environment } = parseFileName(p.title);
        photos.push({
          id: p.id,
          fileName: p.title,
          restaurantName,
          environment,
          subRegion: null,
          ...buildPhotoUrls(p.id),
        });
      }
      for (const sub of subFolders) {
        try {
          const subHtml = await fetchFolderHtml(sub.id);
          const subPhotos = parseImageFiles(subHtml, sub.id);
          if (subPhotos.length > 0) subRegions.push(sub.title);
          for (const p of subPhotos) {
            const { restaurantName, environment } = parseFileName(p.fileName);
            photos.push({
              id: p.id,
              fileName: p.fileName,
              restaurantName,
              environment,
              subRegion: sub.title,
              ...buildPhotoUrls(p.id),
            });
          }
          await new Promise((r) => setTimeout(r, 200));
        } catch (subErr) {
          failedFolderIds.push(region.id);
          console.warn(`[GoogleDrive] Failed to fetch sub-region ${region.name}/${sub.title}:`, subErr);
        }
      }
      regions.push({
        id: region.id,
        name: region.name,
        photoCount: photos.length,
        photos,
        subRegions: sortSubRegions(subRegions),
      });
      totalPhotos += photos.length;
      onProgress({
        type: "region-done",
        regionIndex: i + 1,
        totalRegions,
        regionName: region.name,
        regionPhotoCount: photos.length,
        totalPhotos,
      });
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      failedFolderIds.push(region.id);
      console.warn(`[GoogleDrive] Failed to fetch region ${region.name}:`, err);
      regions.push({ id: region.id, name: region.name, photoCount: 0, photos: [], subRegions: [] });
      onProgress({
        type: "region-done",
        regionIndex: i + 1,
        totalRegions,
        regionName: region.name,
        regionPhotoCount: 0,
        totalPhotos,
      });
    }
  }

  const result: CrawlResult = { regions, fetchedAt: Date.now(), totalPhotos, failedFolderIds };
  cachedResult = result;
  return result;
}

// ---------------------------------------------------------------
// 以下為向後相容的舊 API（保留給既有測試/路由）
// ---------------------------------------------------------------

/** @deprecated 使用 listPhotos / listRegions */
export async function syncGoogleDriveFolders(): Promise<PhotoMetadata[]> {
  invalidateCache();
  const tree = await getDriveTree(true);
  const photos: PhotoMetadata[] = [];
  for (const region of tree.regions) {
    for (const p of region.photos) {
      photos.push({
        googleDriveFileId: p.id,
        googleDriveUrl: p.viewUrl,
        fileName: p.fileName,
        restaurantName: p.restaurantName,
        region: region.name,
      });
    }
  }
  return photos;
}

/** @deprecated 改用 listPhotos / listRegions */
export function getMockGoogleDriveFolderStructure(): PhotoMetadata[] {
  return [
    {
      googleDriveFileId: "mock-1",
      googleDriveUrl: "https://drive.google.com/file/d/mock-1/view",
      fileName: "和斗.jpg",
      restaurantName: "和斗",
      region: "田灣",
    },
    {
      googleDriveFileId: "mock-2",
      googleDriveUrl: "https://drive.google.com/file/d/mock-2/view",
      fileName: "大囍.jpg",
      restaurantName: "大囍",
      region: "鴨脷洲",
    },
  ];
}
