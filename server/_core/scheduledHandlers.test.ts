import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./env", () => ({ ENV: { cronSecret: "test-secret", dailySyncEnabled: false } }));

import { syncGoogleDriveHandler } from "./scheduledHandlers";
import { crawlDriveTree } from "./googleDrive";
import { prunePhotoCache, upsertRegionCacheBatch } from "../db";

// Mock db helpers
vi.mock("../db", () => ({
  upsertPhotoCacheBatch: vi.fn(async () => undefined),
  prunePhotoCache: vi.fn(async () => 0),
  upsertRegionCacheBatch: vi.fn(async () => undefined),
}));

vi.mock("./googleDrive", () => ({
  crawlDriveTree: vi.fn(async () => ({
    regions: [{
      id: "r1",
      name: "田灣",
      photoCount: 1,
      photos: [{
        id: "photo-1",
        fileName: "和斗.jpg",
        restaurantName: "和斗",
        thumbnailUrl: "https://drive.google.com/thumbnail?id=photo-1",
        viewUrl: "https://drive.google.com/file/d/photo-1/view",
        subRegion: null,
        environment: null,
      }],
    }],
    fetchedAt: Date.now(),
    totalPhotos: 1,
  })),
  invalidateCache: vi.fn(),
}));


function buildRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const authed = (secret = "test-secret"): any => ({
  url: "/api/scheduled/syncGoogleDrive",
  headers: { authorization: `Bearer ${secret}` },
});

describe("syncGoogleDriveHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 without a valid CRON_SECRET", async () => {
    const res = buildRes();
    await syncGoogleDriveHandler({ url: "/x", headers: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(403);

    const res2 = buildRes();
    await syncGoogleDriveHandler(authed("wrong-secret"), res2);
    expect(res2.status).toHaveBeenCalledWith(403);
    expect(prunePhotoCache).not.toHaveBeenCalled();
  });

  it("returns sync result with a valid CRON_SECRET", async () => {
    const res = buildRes();
    await syncGoogleDriveHandler(authed(), res);

    const arg = (res.json as any).mock.calls[0][0];
    expect(arg.ok).toBe(true);
    expect(arg.result.success).toBe(true);
    expect(arg.result.totalRegions).toBe(1);
    expect(arg.result.totalPhotos).toBe(1);
    expect(arg.result.partial).toBe(false);
    expect(prunePhotoCache).toHaveBeenCalledTimes(1);
  });

  it("does not prune photo_cache or overwrite region_cache when the crawl is partial", async () => {
    const full = await (crawlDriveTree as any)();
    (crawlDriveTree as any).mockResolvedValueOnce({ ...full, failedFolderIds: ["r1"] });
    const res = buildRes();
    await syncGoogleDriveHandler(authed(), res);

    const arg = (res.json as any).mock.calls[0][0];
    expect(arg.result.partial).toBe(true);
    expect(arg.result.deletedPhotos).toBe(0);
    expect(prunePhotoCache).not.toHaveBeenCalled();
    expect((upsertRegionCacheBatch as any).mock.calls[0][0]).toEqual([]);
  });

  it("returns 500 when the sync throws", async () => {
    (crawlDriveTree as any).mockRejectedValueOnce(new Error("drive down"));
    const res = buildRes();
    await syncGoogleDriveHandler(authed(), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.json as any).mock.calls[0][0].error).toBe("drive down");
  });
});
