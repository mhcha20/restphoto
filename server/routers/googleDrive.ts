import { router, protectedProcedure, approvedProcedure, adminProcedure } from "../_core/trpc";
import { setManualTranslation, upsertPhotoCacheBatch, prunePhotoCache, getPhotosCached, getPhotoCacheStats, getRestaurantNamesCached, getEnvironmentsCached, upsertRegionCacheBatch, getRegionsCached, getSubRegionsCached } from "../db";
import { clearTranslationMemoryCache } from "../_core/translation";
import { z } from "zod";
import {
  getDriveTree,
  listPhotos,
  listRegions,
  listSubRegions,
  invalidateCache,
  getMockGoogleDriveFolderStructure,
} from "../_core/googleDrive";
import { translateRestaurantNames } from "../_core/translation";
import { generateImage } from "../_core/imageGeneration";
import type { InsertPhotoCache, InsertRegionCache } from "../../drizzle/schema";

/**
 * 依效果類型產生 AI 重繪提示詞。
 * 兩種效果都強制保留店面建築、構圖與招牌文字不變，只改天氣／時段。
 */
export type EffectType = "rain" | "night" | "declutter";

export function buildEffectPrompt(effect: EffectType): string {
  const KEEP =
    "Keep the exact same building, storefront layout, signage text and composition unchanged";
  const prompts: Record<EffectType, string> = {
    rain: `Transform this restaurant storefront photo into a rainy-day scene. Add realistic falling rain, wet reflective ground with puddles, an overcast grey sky, and a moody atmosphere. ${KEEP} — only change the weather and lighting to rain. Photorealistic.`,
    night: `Transform this restaurant storefront photo into a night-time scene. Make the sky dark, turn on the warm glowing shop signage and interior lights, add street lights and a cozy evening ambiance. ${KEEP} — only change the time of day to night. Photorealistic.`,
    declutter: `Remove all people, pedestrians and customers standing or walking in front of this restaurant storefront. Cleanly fill in the area they occupied with the matching ground, pavement and background so the storefront looks empty and unobstructed. ${KEEP} — only remove the people, do not alter the building, signage text or any other objects. Photorealistic.`,
  };
  return prompts[effect];
}

/**
 * 環境狀態排序：依時段邏輯排序（日間 → 黃昏 → 夜晚），
 * 其餘未列出的狀態排在後面，並以中文排序。
 */
const ENV_ORDER = ["日", "日間", "黃昏", "夜晚", "室內"];
function envRank(env: string): number {
  // 以包含關係判斷（例如「黃昏（夏）」也算黃昏）
  for (let i = 0; i < ENV_ORDER.length; i++) {
    if (env.includes(ENV_ORDER[i])) return i;
  }
  return ENV_ORDER.length;
}
export function sortEnvironments(list: string[]): string[] {
  return [...list].sort((a, b) => {
    const ra = envRank(a);
    const rb = envRank(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b, "zh-Hant");
  });
}

/**
 * Google Drive 公開資料夾整合路由
 *
 * 資料來源：直接爬取 Google Drive 公開分享頁面（無需 API 金鑰）
 * 內建記憶體快取，避免過度請求 Drive
 *
 * - `sync`: 手動刷新（清空快取後重新爬取）
 * - `getRegions`: 取得所有地區（給按鈕用）
 * - `getPhotos`: 取得相片清單（依地區/搜尋關鍵字篩選，直接從 Drive 快取讀取）
 * - `getPhotosPaged`: 分頁查詢（從 photo_cache 資料庫讀取，速度快）
 * - `syncPhotos`: 同步 Drive 相片到 photo_cache 資料庫（admin only）
 */
export const googleDriveRouter = router({
  /**
   * 手動刷新：清空快取並重新爬取整個 Drive 結構
   */
  sync: protectedProcedure
    .input(
      z.object({
        syncType: z.enum(["auto", "manual"]),
      })
    )
    .mutation(async ({ input }) => {
      try {
        invalidateCache();
        const tree = await getDriveTree(true);
        return {
          success: true,
          totalRegions: tree.regions.length,
          totalPhotos: tree.totalPhotos,
          syncType: input.syncType,
          syncedAt: new Date(tree.fetchedAt),
        };
      } catch (error) {
        console.error("[GoogleDrive] Sync failed:", error);
        // 後退到 Mock 資料，避免完全無法使用
        return {
          success: false,
          totalRegions: 0,
          totalPhotos: 0,
          syncType: input.syncType,
          syncedAt: new Date(),
          error: error instanceof Error ? error.message : "Sync failed",
        };
      }
    }),

  /**
   * 同步 Google Drive 相片到 photo_cache 資料庫（admin only）。
   * 完整爬取 Drive → upsert 到 photo_cache → 刪除孤兒記錄。
   * 回傳同步結果（新增/更新/刪除數量）。
   */
  syncPhotos: approvedProcedure.mutation(async () => {
    try {
      // 強制重新爬取 Drive（清空記憶體快取）
      invalidateCache();
      const tree = await getDriveTree(true);
      const totalRegions = tree.regions.length;
      // 把所有相片轉換為 photo_cache 記錄，並記錄逐地區進度
      const rows: InsertPhotoCache[] = [];
      const regionProgress: Array<{ name: string; photoCount: number }> = [];
      for (const region of tree.regions) {
        for (const photo of region.photos) {
          rows.push({
            fileId: photo.id,
            name: photo.fileName,
            thumbnailUrl: photo.thumbnailUrl,
            webViewLink: photo.viewUrl,
            restaurantName: photo.restaurantName,
            regionId: region.id,
            regionName: region.name,
            subRegionName: photo.subRegion ?? null,
            environment: photo.environment ?? null,
            mimeType: "image/jpeg",
            createdTime: null,
          });
        }
        regionProgress.push({ name: region.name, photoCount: region.photos.length });
      }
      // Upsert 相片到資料庫
      await upsertPhotoCacheBatch(rows);
      // 清理孤兒記錄（Drive 上已刪除的相片）
      const activeFileIds = new Set(rows.map((r) => r.fileId));
      const failedIds = new Set(tree.failedFolderIds ?? []);
      // 只有完整爬取成功才 prune；局部失敗時保留舊快取，避免誤刪
      const deletedCount = failedIds.size === 0 ? await prunePhotoCache(activeFileIds) : 0;
      // 同步地區快取（讓 getRegions 可從 DB 即時讀取）
      const regionRows: InsertRegionCache[] = tree.regions.filter((r) => !failedIds.has(r.id)).map((region) => {
        const uniqueRestaurants = new Set(region.photos.map((p) => p.restaurantName));
        const subRegionNames = Array.from(
          new Set(region.photos.map((p) => p.subRegion).filter((s): s is string => !!s))
        );
        return {
          folderId: region.id,
          name: region.name,
          photoCount: region.photos.length,
          restaurantCount: uniqueRestaurants.size,
          subRegionsJson: subRegionNames.length > 0 ? JSON.stringify(subRegionNames) : null,
        };
      });
      await upsertRegionCacheBatch(regionRows);
      return {
        success: true,
        totalPhotos: rows.length,
        totalRegions,
        deletedPhotos: deletedCount,
        syncedAt: new Date(),
        regionProgress,
      };
    } catch (error) {
      console.error("[GoogleDrive] syncPhotos failed:", error);
      return {
        success: false,
        totalPhotos: 0,
        totalRegions: 0,
        deletedPhotos: 0,
        syncedAt: new Date(),
        regionProgress: [] as Array<{ name: string; photoCount: number }>,
        error: error instanceof Error ? error.message : "Sync failed",
      };
    }
  }),

  /**
   * 取得 photo_cache 統計資訊（總相片數、地區數、餐廳數、最後同步時間）。
   */
  getPhotoCacheStats: approvedProcedure.query(async () => {
    return await getPhotoCacheStats();
  }),

  /**
   * 從 photo_cache 分頁查詢相片（快速，不需爬 Drive）。
   * 支援地區/子地區/餐廳名稱/搜尋/環境篩選。
   * 每頁 30 張，以 offset 分頁。
   */
  getPhotosPaged: approvedProcedure
    .input(
      z.object({
        regionId: z.string().nullable().optional(),
        subRegionName: z.string().nullable().optional(),
        restaurantName: z.string().nullable().optional(),
        search: z.string().nullable().optional(),
        environments: z.array(z.string()).optional(),
        limit: z.number().min(1).max(100).default(30),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const result = await getPhotosCached({
        regionId: input.regionId ?? null,
        subRegionName: input.subRegionName ?? null,
        restaurantName: input.restaurantName ?? null,
        search: input.search ?? null,
        environments: input.environments ?? null,
        limit: input.limit,
        offset: input.offset,
      });

      // 附帶英文名（自動翻譯 + 快取）
      const names = Array.from(new Set(result.items.map((p) => p.restaurantName)));
      const enMap = await translateRestaurantNames(names, { wait: false });

      const items = result.items.map((p) => ({
        id: p.fileId,
        fileId: p.fileId,
        fileName: p.name,
        restaurantName: p.restaurantName,
        restaurantNameEn: enMap.get(p.restaurantName.trim()) ?? null,
        environment: p.environment ?? null,
        thumbnailUrl: p.thumbnailUrl ?? `https://drive.google.com/thumbnail?id=${p.fileId}&sz=w800`,
        viewUrl: p.webViewLink ?? `https://drive.google.com/file/d/${p.fileId}/view`,
        regionName: p.regionName,
        subRegion: p.subRegionName ?? null,
      }));

      return {
        items,
        total: result.total,
        hasMore: result.hasMore,
        offset: input.offset,
        limit: input.limit,
      };
    }),

  /**
   * 取得所有地區（含相片張數）
   */
  getRegions: approvedProcedure.query(async () => {
    // 優先從 DB 快取讀取（毫秒級）
    const cached = await getRegionsCached();
    if (cached && cached.length > 0) {
      return cached;
    }
    // 快取為空：爬取 Drive（首次使用或快取失效）
    try {
      const regions = await listRegions();
      if (regions.length === 0) {
        // 若 Drive 還沒爬到（例如離線），退回 Mock 地區
        const mock = getMockGoogleDriveFolderStructure();
        const uniq = Array.from(new Set(mock.map((m) => m.region)));
        return uniq.map((name, idx) => ({
          id: `mock-${idx}`,
          name,
          photoCount: mock.filter((m) => m.region === name).length,
          restaurantCount: new Set(
            mock.filter((m) => m.region === name).map((m) => m.restaurantName)
          ).size,
          subRegions: [] as string[],
        }));
      }
      return regions;
    } catch (error) {
      console.warn("[GoogleDrive] getRegions failed, using mock:", error);
      const mock = getMockGoogleDriveFolderStructure();
      const uniq = Array.from(new Set(mock.map((m) => m.region)));
      return uniq.map((name, idx) => ({
        id: `mock-${idx}`,
        name,
        photoCount: mock.filter((m) => m.region === name).length,
        restaurantCount: new Set(
          mock.filter((m) => m.region === name).map((m) => m.restaurantName)
        ).size,
        subRegions: [] as string[],
      }));
    }
  }),

  /**
   * 取得指定地區的子地區清單（含張數與餐廳間數）。
   * 若地區無子地區則回傳空陣列。
   */
  getSubRegions: approvedProcedure
    .input(z.object({ regionId: z.string() }))
    .query(async ({ input }) => {
      try {
        // 優先從 photo_cache 聚合計算（毫秒級）
        const cached = await getSubRegionsCached(input.regionId);
        if (cached !== null) return cached;
        // 快取為空，fallback 到 Drive 爬取
        return await listSubRegions(input.regionId);
      } catch (error) {
        console.warn("[GoogleDrive] getSubRegions failed:", error);
        return [] as Array<{
          name: string;
          photoCount: number;
          restaurantCount: number;
        }>;
      }
    }),

  /**
   * 取得相片清單：支援按地區 ID 篩選 + 餐廳名稱搜尋
   * （保留原有行為，直接從 Drive 記憶體快取讀取）
   */
  getPhotos: approvedProcedure
    .input(
      z.object({
        regionId: z.string().nullable().optional(),
        subRegion: z.string().nullable().optional(),
        search: z.string().optional(),
        // 要保留的環境清單；空陣列／未提供＝不過濾。
        // 特殊值 "__indoor__" 代表「室內（無環境）」的相片。
        environments: z.array(z.string()).optional(),
      })
    )
    .query(async ({ input }) => {
      const envSet =
        input.environments && input.environments.length > 0
          ? new Set(input.environments)
          : null;
      const matchEnv = (env: string | null): boolean => {
        if (!envSet) return true;
        if (env === null) return envSet.has("__indoor__");
        return envSet.has(env);
      };
      try {
        // 先取得（依地區）全部相片，不在此層用中文名過濾，
        // 改為在附上英文名後，同時比對中文名與英文名做搜尋。
        const photos = await listPhotos({
          regionId: input.regionId ?? null,
          subRegion: input.subRegion ?? null,
        });
        // 附帶英文名（自動翻譯 + 快取）
        const names = photos.map((p) => p.restaurantName);
        const enMap = await translateRestaurantNames(names, { wait: false });
        const withEn = photos
          .filter((p) => matchEnv(p.environment))
          .map((p) => ({
            ...p,
            restaurantNameEn: enMap.get(p.restaurantName.trim()) ?? null,
          }));

        const q = input.search?.trim().toLowerCase();
        if (!q) return withEn;
        // 中文名或英文名任一命中即保留
        return withEn.filter(
          (p) =>
            p.restaurantName.toLowerCase().includes(q) ||
            (p.restaurantNameEn ?? "").toLowerCase().includes(q)
        );
      } catch (error) {
        console.warn("[GoogleDrive] getPhotos failed, using mock:", error);
        const mock = getMockGoogleDriveFolderStructure();
        let filtered = mock;
        if (input.search && input.search.trim()) {
          const q = input.search.toLowerCase();
          filtered = filtered.filter((p) =>
            p.restaurantName.toLowerCase().includes(q)
          );
        }
        return filtered.map((p) => ({
          id: p.googleDriveFileId,
          fileName: p.fileName,
          restaurantName: p.restaurantName,
          environment: null as string | null,
          thumbnailUrl: p.googleDriveUrl,
          viewUrl: p.googleDriveUrl,
          regionName: p.region,
        }));
      }
    }),

  /**
   * 取得所有餐廳名稱清單（去重、依名稱排序），給頂部下拉選單快速定位用
   */
  getRestaurants: approvedProcedure
    .input(
      z
        .object({
          regionId: z.string().nullable().optional(),
          subRegion: z.string().nullable().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const regionId = input?.regionId ?? null;
      const subRegion = input?.subRegion ?? null;
      const dedupe = (
        items: { restaurantName: string }[]
      ): { name: string }[] => {
        const seen = new Set<string>();
        const result: { name: string }[] = [];
        for (const item of items) {
          const name = item.restaurantName?.trim();
          if (!name || seen.has(name)) continue;
          seen.add(name);
          result.push({ name });
        }
        result.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
        return result;
      };

      try {
        // 優先讀 photo_cache（資料庫，毫秒級）；快取未同步先退回爬 Drive
        let list: { name: string }[];
        const cachedNames = await getRestaurantNamesCached({ regionId, subRegion });
        if (cachedNames.length > 0 || (await getPhotoCacheStats()).totalPhotos > 0) {
          list = dedupe(cachedNames.map((restaurantName) => ({ restaurantName })));
        } else {
          list = dedupe(await listPhotos({ regionId, subRegion }));
        }
        // 附帶英文名（只讀快取；缺失者喺背景翻譯，唔阻住回應）
        const enMap = await translateRestaurantNames(list.map((r) => r.name), { wait: false });
        return list.map((r) => ({
          name: r.name,
          nameEn: enMap.get(r.name.trim()) ?? null,
        }));
      } catch (error) {
        console.warn(
          "[GoogleDrive] getRestaurants failed, using mock:",
          error
        );
        const mock = getMockGoogleDriveFolderStructure();
        return dedupe(mock).map((r) => ({ name: r.name, nameEn: null }));
      }
    }),

  /**
   * 取得目前（依地區）所有可選環境清單，給前端建環境多選 checkbox。
   * 回傳格式：{ environments: string[]; hasIndoor: boolean }
   *   - environments：去重、排序後的環境名稱（如「晴天」「夜晚」）
   *   - hasIndoor：是否存在「室內（無環境）」的相片
   */
  getEnvironments: approvedProcedure
    .input(
      z
        .object({
          regionId: z.string().nullable().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const regionId = input?.regionId ?? null;
      try {
        const cached = await getEnvironmentsCached({ regionId });
        if (cached.environments.length > 0 || cached.hasIndoor) {
          return {
            environments: sortEnvironments(cached.environments),
            hasIndoor: cached.hasIndoor,
          };
        }
        if ((await getPhotoCacheStats()).totalPhotos > 0) {
          return { environments: [] as string[], hasIndoor: false };
        }
        const photos = await listPhotos({ regionId });
        const set = new Set<string>();
        let hasIndoor = false;
        for (const p of photos) {
          if (p.environment === null || p.environment === "") {
            hasIndoor = true;
          } else {
            set.add(p.environment);
          }
        }
        const environments = sortEnvironments(Array.from(set));
        return { environments, hasIndoor };
      } catch (error) {
        console.warn(
          "[GoogleDrive] getEnvironments failed, using mock:",
          error
        );
        return { environments: [] as string[], hasIndoor: true };
      }
    }),

  /**
   * 手動覆寫某間餐廳的英文名（需登入）。
   * - nameEn 有值：設為手動覆寫，後續不會被 AI 翻譯蓋過
   * - nameEn 為空：清除覆寫，下次恢復由 AI 自動翻譯
   */
  setRestaurantNameEn: protectedProcedure
    .input(
      z.object({
        nameZh: z.string().min(1),
        nameEn: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      await setManualTranslation(input.nameZh, input.nameEn);
      // 清除翻譯模組的記憶體快取，讓下次查詢拿到最新覆寫值
      clearTranslationMemoryCache();
      return { success: true };
    }),

  /**
   * 對一張相片套用天氣特效（AI 重繪）。
   * - effect = "rain"：變成落雨氛圍（雨絲、濕地反光、陰沉天色）
   * - effect = "night"：變成夜晚氛圍（暗夜、招牌燈光、街燈）
   * 以原圖為基礎重繪，保留店面構圖與招牌。
   * 生成圖儲於 S3，回傳 url。不會動到 Google Drive 原始相片。
   */
  applyEffect: approvedProcedure
    .input(
      z.object({
        imageUrl: z.string().url(),
        effect: z.enum(["rain", "night", "declutter"]),
      })
    )
    .mutation(async ({ input }) => {
      const { url } = await generateImage({
        prompt: buildEffectPrompt(input.effect),
        originalImages: [{ url: input.imageUrl, mimeType: "image/jpeg" }],
      });
      if (!url) {
        throw new Error("特效生成失敗，請稍後再試");
      }
      return { url, effect: input.effect };
    }),

  /**
   * 取得 Drive 樹狀結構（給 getDriveTree 用）
   */
  getDriveTree: approvedProcedure.query(async () => {
    try {
      const tree = await getDriveTree();
      return {
        regions: tree.regions.map((r) => ({
          id: r.id,
          name: r.name,
          photoCount: r.photoCount,
          subRegions: r.subRegions,
        })),
        fetchedAt: new Date(tree.fetchedAt),
        totalPhotos: tree.totalPhotos,
      };
    } catch (error) {
      console.warn("[GoogleDrive] getDriveTree failed:", error);
      return { regions: [], fetchedAt: new Date(), totalPhotos: 0 };
    }
  }),
});
