import { Request, Response } from "express";
import { sdk } from "./sdk";
import { crawlDriveTree, invalidateCache } from "./googleDrive";
import { upsertPhotoCacheBatch, prunePhotoCache, upsertRegionCacheBatch } from "../db";
import type { InsertPhotoCache, InsertRegionCache } from "../../drizzle/schema";

/**
 * Daily Google Drive sync handler.
 * Triggered by Heartbeat at scheduled time (default: daily at 03:00 UTC).
 * Path: /api/scheduled/syncGoogleDrive
 *
 * This handler clears the in-memory cache and re-crawls the Drive folder so
 * that the next user request gets fresh data.
 */
export async function syncGoogleDriveHandler(req: Request, res: Response) {
  try {
    // Authenticate as cron request
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only endpoint" });
    }

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
      taskUid: user.taskUid,
      totalRegions: tree.regions.length,
      totalPhotos: photoRows.length,
      deletedPhotos: deletedCount,
    };

    console.log(`[ScheduledSync] Sync completed successfully`, syncResult);

    return res.json({ ok: true, result: syncResult });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error(`[ScheduledSync] Sync failed:`, error);

    return res.status(500).json({
      error: errorMsg,
      stack: errorStack,
      context: {
        url: req.url,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
