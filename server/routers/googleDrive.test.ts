import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "../_core/context";

// Mock db helpers，避免測試時連接真實資料庫
// getRegionsCached / getSubRegionsCached 回傳 null 以觸發 Drive fallback
vi.mock("../db", () => ({
  getRegionsCached: vi.fn(async () => null),
  getSubRegionsCached: vi.fn(async () => null),
  upsertPhotoCacheBatch: vi.fn(async () => undefined),
  prunePhotoCache: vi.fn(async () => 0),
  getPhotosCached: vi.fn(async () => ({ items: [], total: 0, hasMore: false })),
  getPhotoCacheStats: vi.fn(async () => ({ totalPhotos: 0, totalRegions: 0, totalRestaurants: 0, lastSyncedAt: null })),
  upsertRegionCacheBatch: vi.fn(async () => undefined),
  getTranslations: vi.fn(async () => new Map()),
  saveTranslations: vi.fn(async () => undefined),
  setManualTranslation: vi.fn(async () => undefined),
}));

// Mock 爬蟲模組，避免測試時實際請求 Google Drive
vi.mock("../_core/googleDrive", () => {
  const mockTree = {
    fetchedAt: Date.now(),
    totalPhotos: 4,
    regions: [
      {
        id: "region-tw",
        name: "田灣",
        photoCount: 2,
        photos: [
          {
            id: "p1",
            fileName: "君成餃子源.jpg",
            restaurantName: "君成餃子源",
            thumbnailUrl: "https://drive.google.com/thumbnail?id=p1&sz=w800",
            viewUrl: "https://drive.google.com/file/d/p1/view",
          },
          {
            id: "p2",
            fileName: "和斗.jpg",
            restaurantName: "和斗",
            thumbnailUrl: "https://drive.google.com/thumbnail?id=p2&sz=w800",
            viewUrl: "https://drive.google.com/file/d/p2/view",
          },
        ],
      },
      {
        id: "region-cwb",
        name: "銅鑼灣",
        photoCount: 0,
        photos: [],
      },
      {
        id: "region-ws",
        name: "黃竹坑",
        photoCount: 2,
        photos: [
          {
            id: "p3",
            fileName: "Bamboo Thai.jpg",
            restaurantName: "Bamboo Thai",
            thumbnailUrl: "https://drive.google.com/thumbnail?id=p3&sz=w800",
            viewUrl: "https://drive.google.com/file/d/p3/view",
          },
          {
            id: "p4",
            fileName: "JOMO.jpg",
            restaurantName: "JOMO",
            thumbnailUrl: "https://drive.google.com/thumbnail?id=p4&sz=w800",
            viewUrl: "https://drive.google.com/file/d/p4/view",
          },
        ],
      },
    ],
  };

  return {
    getDriveTree: vi.fn(async () => mockTree),
    crawlDriveTree: vi.fn(async () => mockTree),
    listRegions: vi.fn(async () =>
      mockTree.regions.map((r) => ({
        id: r.id,
        name: r.name,
        photoCount: r.photoCount,
      }))
    ),
    listPhotos: vi.fn(
      async (opts: { regionId?: string | null; search?: string }) => {
        let photos = opts.regionId
          ? mockTree.regions.find((r) => r.id === opts.regionId)?.photos ?? []
          : mockTree.regions.flatMap((r) => r.photos);
        if (opts.search) {
          const q = opts.search.toLowerCase();
          photos = photos.filter((p) =>
            p.restaurantName.toLowerCase().includes(q)
          );
        }
        return photos;
      }
    ),
    invalidateCache: vi.fn(),
    getMockGoogleDriveFolderStructure: () => [
      {
        googleDriveFileId: "mock-1",
        googleDriveUrl: "https://drive.google.com/file/d/mock-1/view",
        fileName: "和斗.jpg",
        restaurantName: "和斗",
        region: "田灣",
      },
    ],
  };
});

const { googleDriveRouter } = await import("./googleDrive");

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    accessStatus: "approved",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Google Drive Router (real-drive integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getRegions", () => {
    it("returns regions with id/name/photoCount fields", async () => {
      const ctx = createAuthContext();
      const caller = googleDriveRouter.createCaller(ctx);

      const regions = await caller.getRegions();

      expect(Array.isArray(regions)).toBe(true);
      expect(regions.length).toBe(3);
      expect(regions[0]).toEqual({
        id: "region-tw",
        name: "田灣",
        photoCount: 2,
      });
    });

    it("includes regions with zero photos", async () => {
      const ctx = createAuthContext();
      const caller = googleDriveRouter.createCaller(ctx);

      const regions = await caller.getRegions();
      const cwb = regions.find((r) => r.name === "銅鑼灣");

      expect(cwb).toBeDefined();
      expect(cwb!.photoCount).toBe(0);
    });
  });

  describe("getPhotos", () => {
    it("returns all photos when no region specified", async () => {
      const ctx = createAuthContext();
      const caller = googleDriveRouter.createCaller(ctx);

      const photos = await caller.getPhotos({});

      expect(photos.length).toBe(4);
      expect(photos[0]).toHaveProperty("restaurantName");
      expect(photos[0]).toHaveProperty("thumbnailUrl");
      expect(photos[0]).toHaveProperty("viewUrl");
    }, 20000);

    it("filters photos by region", async () => {
      const ctx = createAuthContext();
      const caller = googleDriveRouter.createCaller(ctx);

      const photos = await caller.getPhotos({ regionId: "region-tw" });

      expect(photos.length).toBe(2);
      const names = photos.map((p) => p.restaurantName);
      expect(names).toContain("和斗");
      expect(names).toContain("君成餃子源");
    });

    it("returns empty array for empty region", async () => {
      const ctx = createAuthContext();
      const caller = googleDriveRouter.createCaller(ctx);

      const photos = await caller.getPhotos({ regionId: "region-cwb" });

      expect(photos).toEqual([]);
    });

    it("searches by restaurant name (case-insensitive substring)", async () => {
      const ctx = createAuthContext();
      const caller = googleDriveRouter.createCaller(ctx);

      const photos = await caller.getPhotos({ search: "bamboo" });

      expect(photos.length).toBe(1);
      expect(photos[0].restaurantName).toBe("Bamboo Thai");
    });

    it("supports combining region filter and search", async () => {
      const ctx = createAuthContext();
      const caller = googleDriveRouter.createCaller(ctx);

      const photos = await caller.getPhotos({
        regionId: "region-tw",
        search: "和斗",
      });

      expect(photos.length).toBe(1);
      expect(photos[0].restaurantName).toBe("和斗");
    });

    it("returns empty when search yields no match", async () => {
      const ctx = createAuthContext();
      const caller = googleDriveRouter.createCaller(ctx);

      const photos = await caller.getPhotos({ search: "不存在的餐廳" });

      expect(photos).toEqual([]);
    });
  });

  describe("sync (manual refresh)", () => {
    it("returns success result with region/photo totals", async () => {
      const ctx = createAuthContext();
      const caller = googleDriveRouter.createCaller(ctx);

      const result = await caller.sync({ syncType: "manual" });

      expect(result.success).toBe(true);
      expect(result.totalRegions).toBe(3);
      expect(result.totalPhotos).toBe(4);
      expect(result.syncType).toBe("manual");
      expect(result.syncedAt).toBeInstanceOf(Date);
    });

    it("accepts auto sync type", async () => {
      const ctx = createAuthContext();
      const caller = googleDriveRouter.createCaller(ctx);

      const result = await caller.sync({ syncType: "auto" });

      expect(result.syncType).toBe("auto");
    });
  });
});
