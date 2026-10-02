/**
 * Tests for restaurantLocations router
 * - approvedProcedure guards (pending blocked, approved/admin allowed)
 * - aiSearchRestaurantAddress: Places → Geocoding fallback → AI-only fallback
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";
import type { User } from "../../drizzle/schema";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            address: "香港仔大道123號",
            confidence: "high",
            note: "已知分店位置",
          }),
        },
      },
    ],
  }),
}));

const mockMakeRequest = vi.fn();
vi.mock("../_core/map", () => ({
  makeRequest: (...args: unknown[]) => mockMakeRequest(...args),
}));

vi.mock("../db", () => ({
  listRestaurantLocations: vi.fn().mockResolvedValue([
    { id: 1, nameZh: "大快活", address: "香港仔大道1號", lat: "22.248", lng: "114.155", isVerified: 0 },
    { id: 2, nameZh: "麥當勞", address: null, lat: null, lng: null, isVerified: 0 },
  ]),
  getRestaurantLocationByName: vi.fn().mockResolvedValue(null),
  upsertRestaurantLocation: vi.fn().mockResolvedValue(undefined),
  // Other db helpers used by other routers (imported via appRouter)
  listAllUsers: vi.fn().mockResolvedValue([]),
  setUserAccessStatus: vi.fn().mockResolvedValue(true),
  setManualTranslation: vi.fn().mockResolvedValue(undefined),
  getUserPhotos: vi.fn().mockResolvedValue([]),
  getPhotoById: vi.fn().mockResolvedValue(null),
  createPhoto: vi.fn().mockResolvedValue({ id: 1 }),
  deletePhoto: vi.fn().mockResolvedValue(undefined),
  updatePhoto: vi.fn().mockResolvedValue(undefined),
  getOrCreateRestaurant: vi.fn().mockResolvedValue({ id: 1 }),
  // googleDrive router helpers
  getRegionsCached: vi.fn().mockResolvedValue(null),
  getSubRegionsCached: vi.fn().mockResolvedValue(null),
  upsertPhotoCacheBatch: vi.fn().mockResolvedValue(undefined),
  prunePhotoCache: vi.fn().mockResolvedValue(0),
  getPhotosCached: vi.fn().mockResolvedValue({ items: [], total: 0, hasMore: false }),
  getPhotoCacheStats: vi.fn().mockResolvedValue({ totalPhotos: 0, totalRegions: 0, totalRestaurants: 0, lastSyncedAt: null }),
  upsertRegionCacheBatch: vi.fn().mockResolvedValue(undefined),
  getTranslations: vi.fn().mockResolvedValue(new Map()),
  saveTranslations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../_core/googleDrive", () => ({
  listRegions: vi.fn(async () => []),
  listSubRegions: vi.fn(async () => []),
  listPhotos: vi.fn(async () => []),
  getDriveTree: vi.fn(async () => ({ fetchedAt: Date.now(), totalPhotos: 0, regions: [] })),
  invalidateCache: vi.fn(),
  getMockGoogleDriveFolderStructure: vi.fn(() => ({ regions: [] })),
}));

vi.mock("../_core/imageGeneration", () => ({
  generateImage: vi.fn(async () => ({ url: "/manus-storage/generated/mock.png" })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { appRouter } from "../routers";
import { aiSearchRestaurantAddress } from "./restaurantLocations";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const placesOK = {
  status: "OK",
  results: [
    {
      formatted_address: "香港仔大道123號，香港",
      geometry: { location: { lat: 22.2488, lng: 114.1551 } },
    },
  ],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("restaurantLocations – approvedProcedure access control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMakeRequest.mockResolvedValue(placesOK);
  });

  it("listLocations: blocks pending user", async () => {
    const caller = appRouter.createCaller(ctxFor(makeUser({ accessStatus: "pending" })));
    await expect(caller.restaurantLocations.listLocations()).rejects.toThrow();
  });

  it("listLocations: blocks rejected user", async () => {
    const caller = appRouter.createCaller(ctxFor(makeUser({ accessStatus: "rejected" })));
    await expect(caller.restaurantLocations.listLocations()).rejects.toThrow();
  });

  it("listLocations: allows approved user", async () => {
    const caller = appRouter.createCaller(ctxFor(makeUser({ accessStatus: "approved" })));
    const result = await caller.restaurantLocations.listLocations();
    expect(Array.isArray(result)).toBe(true);
  });

  it("listLocations: allows admin (even if pending)", async () => {
    const caller = appRouter.createCaller(ctxFor(makeUser({ role: "admin", accessStatus: "pending" })));
    const result = await caller.restaurantLocations.listLocations();
    expect(Array.isArray(result)).toBe(true);
  });

  it("fetchAddress: blocks pending user", async () => {
    const caller = appRouter.createCaller(ctxFor(makeUser({ accessStatus: "pending" })));
    await expect(
      caller.restaurantLocations.fetchAddress({ nameZh: "大快活" })
    ).rejects.toThrow();
  });

  it("fetchAddress: approved user can trigger AI search", async () => {
    const caller = appRouter.createCaller(ctxFor(makeUser({ accessStatus: "approved" })));
    const result = await caller.restaurantLocations.fetchAddress({ nameZh: "大快活", region: "香港仔" });
    expect(result.success).toBe(true);
  });

  it("batchFetchAddresses: blocks pending user", async () => {
    const caller = appRouter.createCaller(ctxFor(makeUser({ accessStatus: "pending" })));
    await expect(
      caller.restaurantLocations.batchFetchAddresses({
        restaurants: [{ nameZh: "大快活" }],
        skipExisting: false,
      })
    ).rejects.toThrow();
  });

  it("upsertLocation: approved user can upsert", async () => {
    const caller = appRouter.createCaller(ctxFor(makeUser({ accessStatus: "approved" })));
    const result = await caller.restaurantLocations.upsertLocation({ nameZh: "大快活" });
    expect(result.success).toBe(true);
  });
});

describe("aiSearchRestaurantAddress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns address and GPS when Places API succeeds", async () => {
    mockMakeRequest.mockResolvedValue(placesOK);
    const result = await aiSearchRestaurantAddress("大快活", "香港仔");
    expect(result).not.toBeNull();
    expect(result!.address).toContain("香港");
    expect(result!.lat).toBeTruthy();
    expect(result!.lng).toBeTruthy();
  });

  it("falls back to Geocoding when Places returns ZERO_RESULTS", async () => {
    mockMakeRequest
      .mockResolvedValueOnce({ status: "ZERO_RESULTS", results: [] }) // Places fails
      .mockResolvedValueOnce(placesOK); // Geocoding succeeds
    const result = await aiSearchRestaurantAddress("大快活", "香港仔");
    expect(result).not.toBeNull();
    expect(result!.address).toContain("香港");
  });

  it("returns AI address with empty GPS when both APIs fail", async () => {
    mockMakeRequest.mockResolvedValue({ status: "ZERO_RESULTS", results: [] });
    const result = await aiSearchRestaurantAddress("大快活", "香港仔");
    expect(result).not.toBeNull();
    expect(result!.address).toBeTruthy();
    expect(result!.lat).toBe("");
    expect(result!.lng).toBe("");
  });

  it("includes region hint in AI note", async () => {
    mockMakeRequest.mockResolvedValue(placesOK);
    const result = await aiSearchRestaurantAddress("大快活", "香港仔", "利港中心");
    expect(result).not.toBeNull();
    expect(result!.aiNote).toBeTruthy();
  });
});
