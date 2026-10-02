/**
 * 真實 Google Drive 集成測試
 *
 * 這個測試會發起真實的 HTTP 請求到 Google Drive 公開分享頁面，
 * 驗證爬蟲能正確抓取「地區 / 餐廳相片」結構。
 *
 * 注意：
 * - 需要網路連線
 * - 依賴目標資料夾 (1GXeVk67PUcsV8cyndCRAVg4hfGndtCsm) 仍為公開狀態
 * - 為避免被速率限制，整套測試只執行一次 crawl，並把結果共享給多個 assertion
 * - 若資料夾結構變動，期望數字（地區數、總相片數）可能需要更新
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  crawlDriveTree,
  getDriveTree,
  invalidateCache,
  listPhotos,
  listRegions,
  type CrawlResult,
} from "./googleDrive";

// 整個 suite 共用一次 crawl 結果，避免重複請求
let tree: CrawlResult;

const TIMEOUT = 60_000;

beforeAll(async () => {
  invalidateCache();
  tree = await crawlDriveTree();
}, TIMEOUT);

afterAll(() => {
  invalidateCache();
});

describe("Google Drive 真實集成測試", () => {
  it(
    "應該成功爬取根資料夾並返回多個地區",
    () => {
      expect(tree).toBeDefined();
      expect(Array.isArray(tree.regions)).toBe(true);
      // 預期至少有 3 個地區（目前實際 5 個）
      expect(tree.regions.length).toBeGreaterThanOrEqual(3);
    },
    TIMEOUT
  );

  it("每個地區都應該有 id 和 name", () => {
    for (const region of tree.regions) {
      expect(region.id).toBeTruthy();
      expect(region.id.length).toBeGreaterThanOrEqual(25);
      expect(region.name).toBeTruthy();
      expect(Array.isArray(region.photos)).toBe(true);
      expect(region.photoCount).toBe(region.photos.length);
    }
  });

  it("應該抓取到至少一張相片", () => {
    expect(tree.totalPhotos).toBeGreaterThan(0);
  });

  it("每張相片都有 thumbnailUrl 和 viewUrl", () => {
    const allPhotos = tree.regions.flatMap((r) => r.photos);
    for (const photo of allPhotos) {
      expect(photo.id).toBeTruthy();
      expect(photo.fileName).toBeTruthy();
      expect(photo.restaurantName).toBeTruthy();
      expect(photo.thumbnailUrl).toMatch(
        /^https:\/\/drive\.google\.com\/thumbnail\?id=/
      );
      expect(photo.viewUrl).toMatch(/^https:\/\/drive\.google\.com\/file\/d\//);
    }
  });

  it("餐廳名稱應該是文件名去掉副檔名", () => {
    const allPhotos = tree.regions.flatMap((r) => r.photos);
    for (const photo of allPhotos) {
      expect(photo.restaurantName).not.toMatch(/\.(jpg|jpeg|png|heic)$/i);
    }
  });

  it("listRegions 應該返回精簡後的地區資料", async () => {
    const regions = await listRegions();
    expect(regions.length).toBe(tree.regions.length);
    for (const r of regions) {
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("name");
      expect(r).toHaveProperty("photoCount");
    }
  });

  it("listPhotos 不帶任何條件時應該返回所有相片", async () => {
    const photos = await listPhotos({});
    expect(photos.length).toBe(tree.totalPhotos);
  });

  it("listPhotos 按地區篩選應該只返回該地區的相片", async () => {
    const regionWithPhotos = tree.regions.find((r) => r.photoCount > 0);
    if (!regionWithPhotos) return;

    const photos = await listPhotos({ regionId: regionWithPhotos.id });
    expect(photos.length).toBe(regionWithPhotos.photoCount);
    const ids = new Set(photos.map((p) => p.id));
    const expectedIds = new Set(regionWithPhotos.photos.map((p) => p.id));
    expect(ids).toEqual(expectedIds);
  });

  it("listPhotos 配合 search 關鍵字應做模糊匹配", async () => {
    const regionWithPhotos = tree.regions.find((r) => r.photoCount > 0);
    if (!regionWithPhotos) return;

    const samplePhoto = regionWithPhotos.photos[0];
    const keyword = samplePhoto.restaurantName.slice(0, 1);

    const photos = await listPhotos({ search: keyword });
    expect(photos.length).toBeGreaterThan(0);
    for (const p of photos) {
      expect(p.restaurantName.toLowerCase()).toContain(keyword.toLowerCase());
    }
  });

  it("getDriveTree 應使用快取，第二次呼叫不會重新發送 HTTP 請求", async () => {
    const t1 = tree;
    const t2 = await getDriveTree();
    // 快取生效時應該回傳同一個 reference 或 fetchedAt 不變
    expect(t2.fetchedAt).toBe(t1.fetchedAt);
  });

  it("forceRefresh=true 或 invalidateCache 後 fetchedAt 會更新", async () => {
    const before = tree.fetchedAt;
    // 等 5ms 確保 timestamp 一定不同
    await new Promise((r) => setTimeout(r, 5));
    invalidateCache();
    const fresh = await getDriveTree(true);
    expect(fresh.fetchedAt).toBeGreaterThan(before);
    // 重新指向最新結果，避免影響後續其他可能的呼叫
    tree = fresh;
  }, TIMEOUT);
});
