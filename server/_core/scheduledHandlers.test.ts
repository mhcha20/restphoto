import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncGoogleDriveHandler } from "./scheduledHandlers";

// Mock db helpers
vi.mock("../db", () => ({
  upsertPhotoCacheBatch: vi.fn(async () => undefined),
  prunePhotoCache: vi.fn(async () => 0),
  upsertRegionCacheBatch: vi.fn(async () => undefined),
}));

vi.mock("./sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(),
  },
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

import { sdk } from "./sdk";

function buildRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("syncGoogleDriveHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when request is not authenticated as cron", async () => {
    (sdk.authenticateRequest as any).mockResolvedValue({
      isCron: false,
      taskUid: null,
    });
    const req: any = { url: "/api/scheduled/syncGoogleDrive" };
    const res = buildRes();

    await syncGoogleDriveHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "cron-only endpoint" });
  });

  it("returns sync result when authenticated as cron", async () => {
    (sdk.authenticateRequest as any).mockResolvedValue({
      isCron: true,
      taskUid: "task_abc",
    });
    const req: any = { url: "/api/scheduled/syncGoogleDrive" };
    const res = buildRes();

    await syncGoogleDriveHandler(req, res);

    expect(res.json).toHaveBeenCalled();
    const arg = (res.json as any).mock.calls[0][0];
    expect(arg.ok).toBe(true);
    expect(arg.result.success).toBe(true);
    expect(arg.result.taskUid).toBe("task_abc");
    expect(arg.result.totalRegions).toBe(1);
    expect(arg.result.totalPhotos).toBe(1);
  });

  it("returns 500 with error info when authentication throws", async () => {
    (sdk.authenticateRequest as any).mockRejectedValue(
      new Error("auth failed")
    );
    const req: any = { url: "/api/scheduled/syncGoogleDrive" };
    const res = buildRes();

    await syncGoogleDriveHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const arg = (res.json as any).mock.calls[0][0];
    expect(arg.error).toBe("auth failed");
  });
});
