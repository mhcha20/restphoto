/**
 * 後台批次地址搜尋腳本
 * 從 Google Drive 取得所有餐廳名稱，找出未入庫的，然後呼叫 AI 搜尋地址
 *
 * 執行方式：cd /home/ubuntu/restaurant-photo-dashboard && npx tsx scripts/batch_address_search.ts
 */

import { listPhotos } from "../server/_core/googleDrive";
import { listRestaurantLocations, upsertRestaurantLocation } from "../server/db";
import { aiSearchRestaurantAddress } from "../server/routers/restaurantLocations";

async function main() {
  console.log("=== 後台批次地址搜尋 ===\n");

  // 1. 從 Google Drive 取得所有餐廳名稱（去重）
  console.log("正在從 Google Drive 讀取餐廳清單...");
  const photos = await listPhotos({});
  const driveMap = new Map<string, { region: string | null; subRegion: string | null }>();
  for (const p of photos) {
    if (!driveMap.has(p.restaurantName)) {
      driveMap.set(p.restaurantName, {
        region: p.regionName ?? null,
        subRegion: p.subRegion ?? null,
      });
    }
  }
  console.log(`Google Drive 共有 ${driveMap.size} 間不重複餐廳\n`);

  // 2. 從資料庫取得已有地址的餐廳
  const dbRows = await listRestaurantLocations();
  const dbWithAddress = new Set(
    dbRows.filter((r) => r.address && r.address.trim() !== "").map((r) => r.nameZh)
  );
  console.log(`資料庫已有地址：${dbWithAddress.size} 間\n`);

  // 3. 找出未有地址的餐廳
  const missing: Array<{ nameZh: string; region: string | null; subRegion: string | null }> = [];
  for (const [nameZh, info] of driveMap) {
    if (!dbWithAddress.has(nameZh)) {
      missing.push({ nameZh, ...info });
    }
  }

  if (missing.length === 0) {
    console.log("所有餐廳都已有地址！無需搜尋。");
    return;
  }

  console.log(`需要搜尋地址的餐廳：${missing.length} 間`);
  console.log("開始批次搜尋...\n");

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < missing.length; i++) {
    const r = missing[i];
    const progress = `[${i + 1}/${missing.length}]`;
    process.stdout.write(`${progress} 搜尋「${r.nameZh}」（${r.region ?? "未知地區"}）... `);

    try {
      const result = await aiSearchRestaurantAddress(
        r.nameZh,
        r.region ?? undefined,
        r.subRegion ?? undefined
      );

      if (result) {
        await upsertRestaurantLocation({
          nameZh: r.nameZh,
          address: result.address,
          lat: result.lat,
          lng: result.lng,
          region: r.region ?? undefined,
          subRegion: r.subRegion ?? undefined,
          aiNote: result.aiNote,
          isVerified: 0,
        });
        console.log(`✓ ${result.address}`);
        succeeded++;
      } else {
        console.log("✗ 搜尋失敗（無結果）");
        failed++;
      }
    } catch (e) {
      console.log(`✗ 錯誤：${e instanceof Error ? e.message : String(e)}`);
      failed++;
    }

    // 避免 rate limit
    if (i < missing.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log(`\n=== 完成 ===`);
  console.log(`成功：${succeeded} 間`);
  console.log(`失敗：${failed} 間`);
}

main().catch((e) => {
  console.error("腳本執行失敗：", e);
  process.exit(1);
});
