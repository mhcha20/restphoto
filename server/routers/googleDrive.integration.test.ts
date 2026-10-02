/**
 * Dashboard 真實資料端到端整合測試
 *
 * 透過真實的 tRPC caller（不 mock）呼叫 `googleDrive.getRegions` 和
 * `googleDrive.getPhotos`，驗證 Dashboard 從前端呼叫到後端拿到的，
 * 是真實爬到的 Google Drive 資料。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "./../routers";
import { invalidateCache } from "../_core/googleDrive";
import type { TrpcContext } from "../_core/context";

const TIMEOUT = 60_000;

function createPublicContext(): TrpcContext {
  // googleDrive 資料現需「已批准」使用者才可讀，故提供一個 approved 使用者 context
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      accessStatus: "approved",
      googleDriveFolderId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => undefined,
    } as unknown as TrpcContext["res"],
  };
}

describe("Dashboard 真實 Google Drive 整合 (tRPC caller)", () => {
  beforeAll(() => {
    invalidateCache();
  });

  it(
    "getRegions 應該返回真實爬到的地區（含相片計數）",
    async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const regions = await caller.googleDrive.getRegions();

      expect(Array.isArray(regions)).toBe(true);
      // 應該不是 Mock fallback 的格式（mock id 以 "mock-" 開頭）
      expect(regions.length).toBeGreaterThanOrEqual(3);
      for (const r of regions) {
        expect(r.id).toBeTruthy();
        expect(r.id.startsWith("mock-")).toBe(false);
        expect(r.name).toBeTruthy();
        expect(typeof r.photoCount).toBe("number");
      }
    },
    TIMEOUT
  );

  it(
    "getPhotos 不帶條件時應返回所有真實相片",
    async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const photos = await caller.googleDrive.getPhotos({});

      expect(Array.isArray(photos)).toBe(true);
      expect(photos.length).toBeGreaterThan(0);
      for (const p of photos) {
        expect(p.thumbnailUrl).toMatch(
          /^https:\/\/drive\.google\.com\/thumbnail\?id=/
        );
        expect(p.viewUrl).toMatch(/^https:\/\/drive\.google\.com\/file\/d\//);
        expect(p.restaurantName).not.toMatch(/\.(jpg|jpeg|png|heic)$/i);
        // 每張相片都應帶所屬地區名稱
        expect(typeof p.regionName).toBe("string");
        expect((p.regionName ?? "").length).toBeGreaterThan(0);
      }
    },
    TIMEOUT
  );

  it(
    "getPhotos 按 regionId 篩選應只返回該地區的相片",
    async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const regions = await caller.googleDrive.getRegions();
      const target = regions.find((r) => r.photoCount > 0);
      if (!target) return;

      const photos = await caller.googleDrive.getPhotos({
        regionId: target.id,
      });
      expect(photos.length).toBe(target.photoCount);
    },
    TIMEOUT
  );

  it(
    "getPhotos 搜尋關鍵字時應做模糊匹配",
    async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const allPhotos = await caller.googleDrive.getPhotos({});
      if (allPhotos.length === 0) return;

      const keyword = allPhotos[0].restaurantName.slice(0, 1);
      const filtered = await caller.googleDrive.getPhotos({ search: keyword });
      expect(filtered.length).toBeGreaterThan(0);
      for (const p of filtered) {
        expect(p.restaurantName.toLowerCase()).toContain(
          keyword.toLowerCase()
        );
      }
    },
    TIMEOUT
  );

  it(
    "getRestaurants 應返回去重且排序的餐廳名稱清單",
    async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const restaurants = await caller.googleDrive.getRestaurants();

      expect(Array.isArray(restaurants)).toBe(true);
      expect(restaurants.length).toBeGreaterThan(0);

      for (const r of restaurants) {
        expect(typeof r.name).toBe("string");
        expect(r.name.length).toBeGreaterThan(0);
      }

      // 名稱去重（無重複）
      const names = restaurants.map((r) => r.name);
      expect(new Set(names).size).toBe(names.length);

      // 去重後數量不超過全部相片數
      const allPhotos = await caller.googleDrive.getPhotos({});
      expect(restaurants.length).toBeLessThanOrEqual(allPhotos.length);
    },
    TIMEOUT
  );

  it(
    "getRestaurants 清單中的餐廳可用於 getPhotos 精準定位",
    async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const restaurants = await caller.googleDrive.getRestaurants();
      if (restaurants.length === 0) return;

      const target = restaurants[0].name;
      const photos = await caller.googleDrive.getPhotos({ search: target });
      expect(photos.length).toBeGreaterThan(0);
      expect(photos.some((p) => p.restaurantName === target)).toBe(true);
    },
    TIMEOUT
  );

  it(
    "getRestaurants 帶 regionId 時只返回該地區的餐廳",
    async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const regions = await caller.googleDrive.getRegions();
      const target = regions.find((r) => r.photoCount > 0);
      if (!target) return;

      // 該地區的餐廳清單
      const regionRestaurants = await caller.googleDrive.getRestaurants({
        regionId: target.id,
      });
      expect(regionRestaurants.length).toBeGreaterThan(0);

      // 該地區的所有相片（用於驗證餐廳名稱集合）
      const regionPhotos = await caller.googleDrive.getPhotos({
        regionId: target.id,
      });
      const namesInRegion = new Set(
        regionPhotos.map((p) => p.restaurantName.trim())
      );

      // 地區餐廳清單的每一項都必須屬於該地區
      for (const r of regionRestaurants) {
        expect(namesInRegion.has(r.name)).toBe(true);
      }

      // 地區餐廳數不多於全部餐廳數
      const allRestaurants = await caller.googleDrive.getRestaurants();
      expect(regionRestaurants.length).toBeLessThanOrEqual(
        allRestaurants.length
      );
    },
    TIMEOUT
  );

  it(
    "getPhotos 可用英文名搜尋餐廳",
    async () => {
      const caller = appRouter.createCaller(createPublicContext());
      // 先取得任一張帶英文名的相片
      const all = await caller.googleDrive.getPhotos({});
      const withEn = all.find(
        (p) => p.restaurantNameEn && p.restaurantNameEn.trim().length > 0
      );
      if (!withEn || !withEn.restaurantNameEn) return;

      // 用英文名的第一個字詞搜尋
      const token = withEn.restaurantNameEn.split(/\s+/)[0];
      const results = await caller.googleDrive.getPhotos({ search: token });
      expect(results.length).toBeGreaterThan(0);

      // 結果中每一項的中文名或英文名都應包含該 token
      const q = token.toLowerCase();
      for (const p of results) {
        const hit =
          p.restaurantName.toLowerCase().includes(q) ||
          (p.restaurantNameEn ?? "").toLowerCase().includes(q);
        expect(hit).toBe(true);
      }
    },
    TIMEOUT
  );

  it(
    "getEnvironments 回傳去重環境清單，且皆存在於相片中",
    async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const { environments: envs } = await caller.googleDrive.getEnvironments(
        {}
      );
      // 去重：無重複項
      expect(new Set(envs).size).toBe(envs.length);
      // 每個環境都應實際出現於某張相片
      const all = await caller.googleDrive.getPhotos({});
      const envsInPhotos = new Set(
        all.map((p) => p.environment).filter((e): e is string => !!e)
      );
      for (const e of envs) {
        expect(envsInPhotos.has(e)).toBe(true);
      }
      // 釋清後：`_室內` 是一種環境狀態（拍攝室內環境），
      // 可以以環境字串出現；與「無後綴＝不受環境影響」的 hasIndoor 是兩回事。
      // 若環境字串中出現「室內」，它必須也實際存在於某張相片（上面已驗）。
    },
    TIMEOUT
  );

  it(
    "getPhotos 依 environments 過濾，只回傳符合環境的相片",
    async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const { environments: envs } = await caller.googleDrive.getEnvironments(
        {}
      );
      const target = envs[0];
      if (!target) return;
      const results = await caller.googleDrive.getPhotos({
        environments: [target],
      });
      expect(results.length).toBeGreaterThan(0);
      for (const p of results) {
        expect(p.environment).toBe(target);
      }
    },
    TIMEOUT
  );

  it(
    "getPhotos environments 含 __indoor__ 時，只回傳無環境（室內）相片",
    async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const results = await caller.googleDrive.getPhotos({
        environments: ["__indoor__"],
      });
      // 若有室內相片，每張都必須 environment 為 null/空
      for (const p of results) {
        expect(p.environment == null || p.environment === "").toBe(true);
      }
    },
    TIMEOUT
  );

  it(
    "getSubRegions 回傳的子地區張數加總應等於該地區總相片數",
    async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const regions = await caller.googleDrive.getRegions();
      // 找一個有子地區的地區（如香港仔）
      const target = regions.find((r) => (r.subRegions?.length ?? 0) > 0);
      if (!target) return; // 若目前無子地區結構，跳過

      const subs = await caller.googleDrive.getSubRegions({
        regionId: target.id,
      });
      expect(Array.isArray(subs)).toBe(true);
      expect(subs.length).toBeGreaterThan(0);

      // 每個子地區都有合理的張數與餐廳數
      for (const s of subs) {
        expect(typeof s.name).toBe("string");
        expect(s.name.length).toBeGreaterThan(0);
        expect(s.photoCount).toBeGreaterThan(0);
        expect(s.restaurantCount).toBeGreaterThan(0);
        expect(s.restaurantCount).toBeLessThanOrEqual(s.photoCount);
      }

      // 各子地區張數加總應等於該地區總相片數
      const sumPhotos = subs.reduce((acc, s) => acc + s.photoCount, 0);
      expect(sumPhotos).toBe(target.photoCount);

      // 「其他」若存在，應排在最後
      const otherIdx = subs.findIndex((s) => s.name === "其他");
      if (otherIdx >= 0) {
        expect(otherIdx).toBe(subs.length - 1);
      }
    },
    TIMEOUT
  );

  it(
    "getPhotos 按 subRegion 篩選只回傳該子地區的相片",
    async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const regions = await caller.googleDrive.getRegions();
      const target = regions.find((r) => (r.subRegions?.length ?? 0) > 0);
      if (!target) return;

      const subs = await caller.googleDrive.getSubRegions({
        regionId: target.id,
      });
      const sub = subs[0];
      if (!sub) return;

      const photos = await caller.googleDrive.getPhotos({
        regionId: target.id,
        subRegion: sub.name,
      });
      expect(photos.length).toBe(sub.photoCount);
      for (const p of photos) {
        expect(p.subRegion).toBe(sub.name);
        expect(p.regionName).toBe(target.name);
      }
    },
    TIMEOUT
  );

  it(
    "getRestaurants 帶 subRegion 只返回該子地區的餐廳（且為該地區餐廳的子集）",
    async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const regions = await caller.googleDrive.getRegions();
      const target = regions.find((r) => (r.subRegions?.length ?? 0) > 0);
      if (!target) return;

      const subs = await caller.googleDrive.getSubRegions({
        regionId: target.id,
      });
      const sub = subs[0];
      if (!sub) return;

      // 子地區餐廳清單
      const subRestaurants = await caller.googleDrive.getRestaurants({
        regionId: target.id,
        subRegion: sub.name,
      });
      // 數目應等於該子地區的餐廳間數
      expect(subRestaurants.length).toBe(sub.restaurantCount);

      // 整個地區的餐廳清單
      const regionRestaurants = await caller.googleDrive.getRestaurants({
        regionId: target.id,
      });
      const regionNames = new Set(regionRestaurants.map((r) => r.name));
      // 子地區餐廳須為地區餐廳的子集
      for (const r of subRestaurants) {
        expect(regionNames.has(r.name)).toBe(true);
      }
      // 子地區餐廳數不應超過整個地區
      expect(subRestaurants.length).toBeLessThanOrEqual(
        regionRestaurants.length
      );

      // 子地區餐廳須與該子地區相片中的餐廳一致
      const subPhotos = await caller.googleDrive.getPhotos({
        regionId: target.id,
        subRegion: sub.name,
      });
      const photoNames = new Set(subPhotos.map((p) => p.restaurantName));
      expect(subRestaurants.length).toBe(photoNames.size);
      for (const r of subRestaurants) {
        expect(photoNames.has(r.name)).toBe(true);
      }
    },
    TIMEOUT
  );

  it(
    "無子地區的地區維持相容：getSubRegions 為空且相片 subRegion 為 null",
    async () => {
      const caller = appRouter.createCaller(createPublicContext());
      const regions = await caller.googleDrive.getRegions();
      const flat = regions.find(
        (r) => r.photoCount > 0 && (r.subRegions?.length ?? 0) === 0
      );
      if (!flat) return;

      const subs = await caller.googleDrive.getSubRegions({
        regionId: flat.id,
      });
      expect(subs.length).toBe(0);

      const photos = await caller.googleDrive.getPhotos({
        regionId: flat.id,
      });
      expect(photos.length).toBe(flat.photoCount);
      for (const p of photos) {
        expect(p.subRegion == null || p.subRegion === "").toBe(true);
      }
    },
    TIMEOUT
  );
});
