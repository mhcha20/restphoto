/**
 * SSE endpoint: /api/sync-photos-stream
 *
 * Streams Google Drive sync progress to the client via Server-Sent Events.
 * Each region completion fires a "region-done" event; final "complete" event
 * carries totals. Requires an authenticated, approved user.
 *
 * Event types:
 *   start        { totalRegions }
 *   region-done  { regionIndex, totalRegions, regionName, regionPhotoCount, totalPhotos }
 *   complete     { totalPhotos, totalRegions, deletedPhotos, syncedAt }
 *   error        { error }
 */

import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { crawlDriveTreeWithProgress, invalidateCache } from "./_core/googleDrive";
import {
  upsertPhotoCacheBatch,
  prunePhotoCache,
  upsertRegionCacheBatch,
} from "./db";
import type { InsertPhotoCache, InsertRegionCache } from "../drizzle/schema";

function sendEvent(res: Response, event: string, data: object) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function syncPhotosStreamHandler(req: Request, res: Response) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let user: Awaited<ReturnType<typeof sdk.authenticateRequest>> | null = null;
  try {
    user = await sdk.authenticateRequest(req);
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  // Only approved users and admins may trigger sync
  const accessStatus = (user as any).accessStatus;
  const role = (user as any).role;
  if (accessStatus !== "approved" && role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // ── SSE headers ───────────────────────────────────────────────────────────
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // ── Sync ──────────────────────────────────────────────────────────────────
  try {
    invalidateCache();

    const rows: InsertPhotoCache[] = [];

    const tree = await crawlDriveTreeWithProgress((evt) => {
      if (evt.type === "start") {
        sendEvent(res, "start", { totalRegions: evt.totalRegions });
      } else if (evt.type === "region-done") {
        // Collect photo rows for this region (already accumulated in `rows`)
        sendEvent(res, "region-done", {
          regionIndex: evt.regionIndex,
          totalRegions: evt.totalRegions,
          regionName: evt.regionName,
          regionPhotoCount: evt.regionPhotoCount,
          totalPhotos: evt.totalPhotos,
        });
      }
    });

    // Build photo_cache rows from the completed tree
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
    }

    // Persist to DB
    await upsertPhotoCacheBatch(rows);
    const activeFileIds = new Set(rows.map((r) => r.fileId));
    const deletedCount = await prunePhotoCache(activeFileIds);

    // Sync region_cache
    const regionRows: InsertRegionCache[] = tree.regions.map((region) => {
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

    sendEvent(res, "complete", {
      totalPhotos: rows.length,
      totalRegions: tree.regions.length,
      deletedPhotos: deletedCount,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Sync failed";
    sendEvent(res, "error", { error: msg });
  } finally {
    res.end();
  }
}
