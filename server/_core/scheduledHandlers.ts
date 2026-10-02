import { timingSafeEqual } from "node:crypto";
import { Request, Response } from "express";
import { ENV } from "./env";
import { crawlDriveTree, invalidateCache } from "./googleDrive";
import { upsertPhotoCacheBatch, prunePhotoCache, upsertRegionCacheBatch } from "../db";
import type { InsertPhotoCache, InsertRegionCache } from "../../drizzle/schema";

function isValidCronSecret(req: Request): boolean {
  if (!ENV.cronSecret) return false; // fail closed when not configured
  const header = req.headers.authorization ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(ENV.cronSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

let syncing = false;

/** Re-crawl Google Drive and refresh photo_cache / region_cache. */
export async function runDriveSync() {
    console.log(
      `[ScheduledSync] Starting daily Google Drive sync at ${new Date().toISOString()}`
    );

    // Invalidate in-memory cache and re-crawl Drive
    invalidateCache();
    const tree = await crawlDriveTree();

    // Build photo_cache rows
    const photoRows: InsertPhotoCache[] = [];
    for (const region of tree.regions) {
      for (const photo of region.photos) {
        photoRows.push({
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
    }

    // Upsert photos to DB
    await upsertPhotoCacheBatch(photoRows);

    // Prune deleted photos
    const activeFileIds = new Set(photoRows.map((r) => r.fileId));
    const failedIds = new Set(tree.failedFolderIds ?? []);
    // 只有完整爬取成功才 prune；局部失敗時保留舊快取，避免誤刪
    const deletedCount = failedIds.size === 0 ? await prunePhotoCache(activeFileIds) : 0;

    // Build and upsert region_cache rows
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

    const syncResult = {
      success: true,
      syncedAt: new Date().toISOString(),
      totalRegions: tree.regions.length,
      totalPhotos: photoRows.length,
      deletedPhotos: deletedCount,
      partial: failedIds.size > 0,
    };
    console.log(`[ScheduledSync] Sync completed`, syncResult);
    return syncResult;
}

/** Start an in-process daily sync at 03:00 UTC (11:00 Hong Kong). */
export function startDailySyncScheduler() {
  if (!ENV.dailySyncEnabled) return;
  const scheduleNext = () => {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 0, 0));
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    setTimeout(async () => {
      try {
        if (!syncing) {
          syncing = true;
          await runDriveSync();
        }
      } catch (error) {
        console.error("[ScheduledSync] Daily sync failed:", error);
      } finally {
        syncing = false;
        scheduleNext();
      }
    }, next.getTime() - now.getTime()).unref();
  };
  scheduleNext();
}

/** POST /api/scheduled/syncGoogleDrive — protected by `Authorization: Bearer $CRON_SECRET`. */
export async function syncGoogleDriveHandler(req: Request, res: Response) {
  if (!isValidCronSecret(req)) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (syncing) {
    return res.status(409).json({ error: "sync already running" });
  }
  syncing = true;
  try {
    const result = await runDriveSync();
    return res.json({ ok: true, result });
  } catch (error) {
    console.error(`[ScheduledSync] Sync failed:`, error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    syncing = false;
  }
}
