/**
 * 批准制存取控制測試
 *
 * 驗證：
 * 1. approvedProcedure（以 googleDrive.getRegions 為代表）會攔截 pending / rejected，
 *    放行 approved 與 admin。
 * 2. admin 專用的 setUserAccess 只有 admin 可呼叫，且不能改自己或其他 admin。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import type { User } from "../../drizzle/schema";

// Mock 爬蟲，避免真實請求 Drive
vi.mock("../_core/googleDrive", () => ({
  listRegions: vi.fn(async () => [
    { id: "r1", name: "地區一", photoCount: 1 },
  ]),
  listSubRegions: vi.fn(async () => []),
  listPhotos: vi.fn(async () => []),
  getDriveTree: vi.fn(async () => ({ fetchedAt: Date.now(), totalPhotos: 0, regions: [] })),
  invalidateCache: vi.fn(),
  getMockGoogleDriveFolderStructure: vi.fn(() => ({ regions: [] })),
}));

// Mock db helpers used by admin + photos routers
const mockUsers: User[] = [];
vi.mock("../db", () => ({
  listAllUsers: vi.fn(async () => mockUsers),
  setUserAccessStatus: vi.fn(async () => true),
  setManualTranslation: vi.fn(async () => undefined),
  // photos router helpers（pending 應在 approvedProcedure 階段就被擋，不會真的呼叫到）
  getUserPhotos: vi.fn(async () => []),
  getPhotoById: vi.fn(async () => null),
  createPhoto: vi.fn(async () => ({ id: 1 })),
  deletePhoto: vi.fn(async () => undefined),
  updatePhoto: vi.fn(async () => undefined),
  getOrCreateRestaurant: vi.fn(async () => ({ id: 1 })),
  // googleDrive router helpers
  getRegionsCached: vi.fn(async () => null),
  getSubRegionsCached: vi.fn(async () => null),
  upsertPhotoCacheBatch: vi.fn(async () => undefined),
  prunePhotoCache: vi.fn(async () => 0),
  getPhotosCached: vi.fn(async () => ({ items: [], total: 0, hasMore: false })),
  getPhotoCacheStats: vi.fn(async () => ({ totalPhotos: 0, totalRegions: 0, totalRestaurants: 0, lastSyncedAt: null })),
  upsertRegionCacheBatch: vi.fn(async () => undefined),
  getTranslations: vi.fn(async () => new Map()),
  saveTranslations: vi.fn(async () => undefined),
  listRestaurantLocations: vi.fn(async () => []),
  getRestaurantLocationByName: vi.fn(async () => null),
  upsertRestaurantLocation: vi.fn(async () => undefined),
}));

// Mock 圖像生成，避免真實呼叫 AI
 vi.mock("../_core/imageGeneration", () => ({
  generateImage: vi.fn(async () => ({ url: "/manus-storage/generated/mock.png" })),
}));

import { appRouter } from "../routers";
import { listAllUsers, setUserAccessStatus } from "../db";
import { generateImage } from "../_core/imageGeneration";
import { buildEffectPrompt } from "./googleDrive";

function makeUser(overrides: Partial<User>): User {
  return {
    id: 1,
    openId: "u-1",
    name: "User One",
    email: "u1@example.com",
    loginMethod: "manus",
    role: "user",
    accessStatus: "pending",
    googleDriveFolderId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function ctxFor(user: User | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

describe("approvedProcedure 存取控制", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("未登入：UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(ctxFor(null));
    await expect(caller.googleDrive.getRegions()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("pending 使用者：FORBIDDEN", async () => {
    const caller = appRouter.createCaller(
      ctxFor(makeUser({ accessStatus: "pending" }))
    );
    await expect(caller.googleDrive.getRegions()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejected 使用者：FORBIDDEN", async () => {
    const caller = appRouter.createCaller(
      ctxFor(makeUser({ accessStatus: "rejected" }))
    );
    await expect(caller.googleDrive.getRegions()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("approved 使用者：可讀資料", async () => {
    const caller = appRouter.createCaller(
      ctxFor(makeUser({ accessStatus: "approved" }))
    );
    const regions = await caller.googleDrive.getRegions();
    expect(regions.length).toBe(1);
  });

  it("admin 即使 accessStatus 非 approved 也放行", async () => {
    const caller = appRouter.createCaller(
      ctxFor(makeUser({ role: "admin", accessStatus: "pending" }))
    );
    const regions = await caller.googleDrive.getRegions();
    expect(regions.length).toBe(1);
  });

  it("pending 使用者呼叫 photos.list：FORBIDDEN", async () => {
    const caller = appRouter.createCaller(
      ctxFor(makeUser({ accessStatus: "pending" }))
    );
    await expect(caller.photos.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("approved 使用者呼叫 photos.list：可通過", async () => {
    const caller = appRouter.createCaller(
      ctxFor(makeUser({ accessStatus: "approved" }))
    );
    const photos = await caller.photos.list({});
    expect(Array.isArray(photos)).toBe(true);
  });
});

describe("buildEffectPrompt 提示詞約束", () => {
  it("rain 提示詞含「保留構圖／招牌不變」與雨天關鍵詞", () => {
    const p = buildEffectPrompt("rain");
    expect(p).toContain("signage text and composition unchanged");
    expect(p.toLowerCase()).toContain("rain");
  });

  it("night 提示詞含「保留構圖／招牌不變」與夜晚關鍵詞", () => {
    const p = buildEffectPrompt("night");
    expect(p).toContain("signage text and composition unchanged");
    expect(p.toLowerCase()).toContain("night");
  });

  it("declutter 提示詞含「移除人物」與「保留構圖／招牌不變」", () => {
    const p = buildEffectPrompt("declutter");
    expect(p).toContain("signage text and composition unchanged");
    expect(p.toLowerCase()).toContain("remove all people");
  });
});

describe("googleDrive.applyEffect 圖片特效", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pending 使用者：FORBIDDEN（不會呼叫生成）", async () => {
    const caller = appRouter.createCaller(
      ctxFor(makeUser({ accessStatus: "pending" }))
    );
    await expect(
      caller.googleDrive.applyEffect({
        imageUrl: "https://example.com/a.jpg",
        effect: "rain",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("approved 使用者：回傳生成圖 url", async () => {
    const caller = appRouter.createCaller(
      ctxFor(makeUser({ accessStatus: "approved" }))
    );
    const res = await caller.googleDrive.applyEffect({
      imageUrl: "https://example.com/a.jpg",
      effect: "night",
    });
    expect(res.url).toBe("/manus-storage/generated/mock.png");
    expect(res.effect).toBe("night");
    expect(generateImage).toHaveBeenCalledTimes(1);
  });

  it("無效 effect 參數：驗證失敗", async () => {
    const caller = appRouter.createCaller(
      ctxFor(makeUser({ accessStatus: "approved" }))
    );
    await expect(
      // 故意傳不在 enum 內的值
      caller.googleDrive.applyEffect({
        imageUrl: "https://example.com/a.jpg",
        // @ts-expect-error 測試無效值
        effect: "snow",
      })
    ).rejects.toBeTruthy();
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("非 url 格式 imageUrl：驗證失敗", async () => {
    const caller = appRouter.createCaller(
      ctxFor(makeUser({ accessStatus: "approved" }))
    );
    await expect(
      caller.googleDrive.applyEffect({
        imageUrl: "not-a-url",
        effect: "rain",
      })
    ).rejects.toBeTruthy();
    expect(generateImage).not.toHaveBeenCalled();
  });
});

describe("admin.setUserAccess 權限", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsers.length = 0;
  });

  it("非 admin 呼叫：FORBIDDEN", async () => {
    const caller = appRouter.createCaller(
      ctxFor(makeUser({ id: 5, openId: "normal", accessStatus: "approved" }))
    );
    await expect(
      caller.admin.setUserAccess({ userId: 1, accessStatus: "approved" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admin 批准一般使用者：成功", async () => {
    const admin = makeUser({ id: 1, openId: "owner", role: "admin", accessStatus: "approved" });
    const target = makeUser({ id: 2, openId: "guest", accessStatus: "pending" });
    mockUsers.push(admin, target);

    const caller = appRouter.createCaller(ctxFor(admin));
    const res = await caller.admin.setUserAccess({ userId: 2, accessStatus: "approved" });
    expect(res.success).toBe(true);
    expect(setUserAccessStatus).toHaveBeenCalledWith(2, "approved");
  });

  it("admin 不能改自己的狀態：BAD_REQUEST", async () => {
    const admin = makeUser({ id: 1, openId: "owner", role: "admin", accessStatus: "approved" });
    mockUsers.push(admin);

    const caller = appRouter.createCaller(ctxFor(admin));
    await expect(
      caller.admin.setUserAccess({ userId: 1, accessStatus: "rejected" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("admin 不能改其他 admin：BAD_REQUEST", async () => {
    const admin = makeUser({ id: 1, openId: "owner", role: "admin", accessStatus: "approved" });
    const otherAdmin = makeUser({ id: 3, openId: "admin2", role: "admin", accessStatus: "approved" });
    mockUsers.push(admin, otherAdmin);

    const caller = appRouter.createCaller(ctxFor(admin));
    await expect(
      caller.admin.setUserAccess({ userId: 3, accessStatus: "rejected" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("admin.listUsers 標記 isSelf", async () => {
    const admin = makeUser({ id: 1, openId: "owner", role: "admin", accessStatus: "approved" });
    const target = makeUser({ id: 2, openId: "guest", accessStatus: "pending" });
    mockUsers.push(admin, target);

    const caller = appRouter.createCaller(ctxFor(admin));
    const list = await caller.admin.listUsers();
    expect(listAllUsers).toHaveBeenCalled();
    expect(list.find((u) => u.id === 1)?.isSelf).toBe(true);
    expect(list.find((u) => u.id === 2)?.isSelf).toBe(false);
  });
});
