/**
 * Restaurant Locations Router
 * - listLocations: 取得所有餐廳位置（含地址、GPS）
 * - fetchAddress: AI 搜尋單一餐廳地址 + Geocoding
 * - batchFetchAddresses: 批次 AI 搜尋（一次最多 20 間）
 * - upsertLocation: 手動儲存／更新餐廳位置
 */

import { z } from "zod";
import { approvedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";
import { makeRequest, GeocodingResult, PlacesSearchResult } from "../_core/map";
import { listPhotos } from "../_core/googleDrive";
import { getTranslations } from "../db";
import {
  listRestaurantLocations,
  getRestaurantLocationByName,
  upsertRestaurantLocation,
} from "../db";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * 用 Google Places Text Search 搜尋餐廳，取得地址與 GPS。
 * 若搜尋無結果，回傳 null。
 */
async function geocodeByPlacesSearch(
  query: string
): Promise<{ address: string; lat: string; lng: string } | null> {
  try {
    const result = await makeRequest<PlacesSearchResult>(
      "/maps/api/place/textsearch/json",
      { query, region: "hk", language: "zh-TW" }
    );
    if (result.status === "OK" && result.results.length > 0) {
      const place = result.results[0];
      return {
        address: place.formatted_address,
        lat: String(place.geometry.location.lat),
        lng: String(place.geometry.location.lng),
      };
    }
  } catch (e) {
    console.warn("[Places] search failed:", e);
  }
  return null;
}

/**
 * 用 AI 推斷餐廳最可能嘅香港地址，再用 Geocoding API 轉成 GPS。
 * 回傳 { address, lat, lng, aiNote } 或 null。
 */
export async function aiSearchRestaurantAddress(
  nameZh: string,
  region?: string,
  subRegion?: string
): Promise<{
  address: string;
  lat: string;
  lng: string;
  aiNote: string;
} | null> {
  // Step 1: AI 推斷地址
  const locationHint = [subRegion, region].filter(Boolean).join("，");
  const prompt = `你係一個香港餐廳地址搜尋助手。
餐廳名稱：${nameZh}${locationHint ? `\n已知位置：${locationHint}` : ""}

請根據餐廳名稱（及已知位置）推斷最可能嘅香港地址，以 JSON 格式回答：
{
  "address": "完整香港地址（中文，例如：香港仔大道123號）",
  "confidence": "high|medium|low",
  "note": "簡短說明（例如：連鎖店，已知分店位置）"
}
只返回 JSON，唔好加其他文字。`;

  let aiAddress = "";
  let aiNote = "";

  try {
    const llmRes = await invokeLLM({
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "restaurant_address",
          strict: true,
          schema: {
            type: "object",
            properties: {
              address: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              note: { type: "string" },
            },
            required: ["address", "confidence", "note"],
            additionalProperties: false,
          },
        },
      },
    });
    const rawContent = llmRes.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : null;
    if (content) {
      const parsed = JSON.parse(content);
      aiAddress = parsed.address ?? "";
      aiNote = `[${parsed.confidence}] ${parsed.note}`;
    }
  } catch (e) {
    console.warn("[AI] address inference failed:", e);
    return null;
  }

  if (!aiAddress) return null;

  // Step 2: 先嘗試 Places Text Search（更準確）
  const placesQuery = `${nameZh} ${locationHint || "香港"}`;
  const placesResult = await geocodeByPlacesSearch(placesQuery);
  if (placesResult) {
    return { ...placesResult, aiNote };
  }

  // Step 3: Fallback 用 AI 地址做 Geocoding
  try {
    const geoResult = await makeRequest<GeocodingResult>(
      "/maps/api/geocode/json",
      { address: aiAddress, region: "hk", language: "zh-TW" }
    );
    if (geoResult.status === "OK" && geoResult.results.length > 0) {
      const geo = geoResult.results[0];
      return {
        address: geo.formatted_address,
        lat: String(geo.geometry.location.lat),
        lng: String(geo.geometry.location.lng),
        aiNote,
      };
    }
  } catch (e) {
    console.warn("[Geocoding] failed:", e);
  }

  // Step 4: 只有 AI 地址，無 GPS
  return { address: aiAddress, lat: "", lng: "", aiNote };
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const restaurantLocationsRouter = router({
  /** 取得所有餐廳位置（合併 Google Drive 餐廳名稱，無地址者亦顯示） */
  listLocations: approvedProcedure.query(async () => {
    // 1. 從資料庫取得已有地址的記錄（以 nameZh 為 key）
    const dbRows = await listRestaurantLocations();
    const dbMap = new Map(dbRows.map((r) => [r.nameZh, r]));

    // 2. 從 Google Drive 取得所有餐廳名稱（去重）
    let driveNames: { name: string; region: string | null; subRegion: string | null }[] = [];
    try {
      const photos = await listPhotos({});
      const seen = new Set<string>();
      for (const p of photos) {
        if (!seen.has(p.restaurantName)) {
          seen.add(p.restaurantName);
          driveNames.push({
            name: p.restaurantName,
            region: p.regionName ?? null,
            subRegion: p.subRegion ?? null,
          });
        }
      }
      driveNames.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
    } catch (e) {
      console.warn("[RestaurantLocations] Failed to fetch Drive names:", e);
    }

    // 3. 取得英文名快取
    const allNames = driveNames.map((d) => d.name);
    let enMap = new Map<string, string>();
    try {
      enMap = await getTranslations(allNames);
    } catch (e) {
      console.warn("[RestaurantLocations] Failed to fetch translations:", e);
    }

    // 4. 合併：Drive 名稱為主，資料庫地址資料補充
    // 使用 nameZh 作為前端的穩定唯一 key（未入庫的餐廳 id = null）
    const merged = driveNames.map((d) => {
      const db = dbMap.get(d.name);
      return {
        id: db?.id ?? null,
        nameZh: d.name,
        nameEn: db?.nameEn ?? enMap.get(d.name) ?? null,
        address: db?.address ?? null,
        lat: db?.lat ?? null,
        lng: db?.lng ?? null,
        region: db?.region ?? d.region,
        subRegion: db?.subRegion ?? d.subRegion,
        isVerified: db?.isVerified ?? 0,
        aiNote: db?.aiNote ?? null,
      };
    });

    // 5. 若資料庫有 Drive 沒有的記錄（罕見），也一起回傳
    for (const row of dbRows) {
      if (!driveNames.find((d) => d.name === row.nameZh)) {
        merged.push({ ...row, id: row.id });
      }
    }

    return merged;
  }),

  /** AI 搜尋單一餐廳地址 + Geocoding，並存入資料庫 */
  fetchAddress: approvedProcedure
    .input(
      z.object({
        nameZh: z.string().min(1),
        nameEn: z.string().optional(),
        region: z.string().optional(),
        subRegion: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await aiSearchRestaurantAddress(
        input.nameZh,
        input.region,
        input.subRegion
      );
      if (!result) {
        return { success: false, message: "AI 搜尋失敗，請稍後再試" };
      }
      await upsertRestaurantLocation({
        nameZh: input.nameZh,
        nameEn: input.nameEn,
        address: result.address,
        lat: result.lat,
        lng: result.lng,
        region: input.region,
        subRegion: input.subRegion,
        aiNote: result.aiNote,
        isVerified: 0,
      });
      return { success: true, ...result };
    }),

  /** 批次 AI 搜尋（最多 20 間），跳過已有地址嘅餐廳 */
  batchFetchAddresses: approvedProcedure
    .input(
      z.object({
        restaurants: z
          .array(
            z.object({
              nameZh: z.string(),
              nameEn: z.string().optional(),
              region: z.string().optional(),
              subRegion: z.string().optional(),
            })
          )
          .max(20),
        skipExisting: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const results: Array<{
        nameZh: string;
        success: boolean;
        address?: string;
        lat?: string;
        lng?: string;
        skipped?: boolean;
      }> = [];

      for (const r of input.restaurants) {
        // 跳過已有地址的餐廳
        if (input.skipExisting) {
          const existing = await getRestaurantLocationByName(r.nameZh);
          if (existing?.address) {
            results.push({ nameZh: r.nameZh, success: true, skipped: true, address: existing.address, lat: existing.lat ?? "", lng: existing.lng ?? "" });
            continue;
          }
        }

        const res = await aiSearchRestaurantAddress(r.nameZh, r.region, r.subRegion);
        if (res) {
          await upsertRestaurantLocation({
            nameZh: r.nameZh,
            nameEn: r.nameEn,
            address: res.address,
            lat: res.lat,
            lng: res.lng,
            region: r.region,
            subRegion: r.subRegion,
            aiNote: res.aiNote,
            isVerified: 0,
          });
          results.push({ nameZh: r.nameZh, success: true, address: res.address, lat: res.lat, lng: res.lng });
        } else {
          results.push({ nameZh: r.nameZh, success: false });
        }

        // 避免 API rate limit，每間間隔 300ms
        await new Promise((r) => setTimeout(r, 300));
      }

      return { results, total: input.restaurants.length, succeeded: results.filter((r) => r.success).length };
    }),

  /** 手動儲存或更新餐廳位置（管理員或已批准使用者） */
  upsertLocation: approvedProcedure
    .input(
      z.object({
        nameZh: z.string().min(1),
        nameEn: z.string().optional(),
        address: z.string().optional(),
        lat: z.string().optional(),
        lng: z.string().optional(),
        region: z.string().optional(),
        subRegion: z.string().optional(),
        isVerified: z.number().int().min(0).max(1).optional(),
      })
    )
    .mutation(async ({ input }) => {
      await upsertRestaurantLocation({
        nameZh: input.nameZh,
        nameEn: input.nameEn,
        address: input.address,
        lat: input.lat,
        lng: input.lng,
        region: input.region,
        subRegion: input.subRegion,
        isVerified: input.isVerified ?? 0,
      });
      return { success: true };
    }),
});
