import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertPhoto, InsertRestaurantLocation, InsertUser, photos, restaurantLocations, RestaurantLocation, restaurants, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    // 存取狀態：owner 永遠 approved；其餘新使用者預設 pending（不覆寫既有狀態）
    if (user.accessStatus !== undefined) {
      values.accessStatus = user.accessStatus;
      updateSet.accessStatus = user.accessStatus;
    } else if (user.openId === ENV.ownerOpenId) {
      values.accessStatus = 'approved';
      updateSet.accessStatus = 'approved';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get all photos for a user, optionally filtered by restaurant name
 */
export async function getUserPhotos(userId: number, restaurantName?: string) {
  const db = await getDb();
  if (!db) return [];

  if (restaurantName) {
    return db
      .select()
      .from(photos)
      .where(
        and(
          eq(photos.userId, userId),
          sql`LOWER(${photos.restaurantName}) LIKE LOWER(${`%${restaurantName}%`})`
        )
      )
      .orderBy(desc(photos.createdAt));
  }
  
  return db
    .select()
    .from(photos)
    .where(eq(photos.userId, userId))
    .orderBy(desc(photos.createdAt));
}

/**
 * Get a single photo by ID and user ID
 */
export async function getPhotoById(photoId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(photos)
    .where(and(eq(photos.id, photoId), eq(photos.userId, userId)))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Create a new photo record
 */
export async function createPhoto(photo: InsertPhoto) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(photos).values(photo);
  return result;
}

/**
 * Update a photo record
 */
export async function updatePhoto(
  photoId: number,
  userId: number,
  updates: Partial<InsertPhoto>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .update(photos)
    .set(updates)
    .where(and(eq(photos.id, photoId), eq(photos.userId, userId)));

  return result;
}

/**
 * Delete a photo record
 */
export async function deletePhoto(photoId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .delete(photos)
    .where(and(eq(photos.id, photoId), eq(photos.userId, userId)));

  return result;
}

/**
 * Get or create a restaurant
 */
export async function getOrCreateRestaurant(
  userId: number,
  name: string,
  cuisineType?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Try to find existing restaurant
  const existing = await db
    .select()
    .from(restaurants)
    .where(
      and(
        eq(restaurants.userId, userId),
        eq(restaurants.name, name)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  // Create new restaurant
  await db.insert(restaurants).values({
    userId,
    name,
    cuisineType,
  });

  const newRestaurant = await db
    .select()
    .from(restaurants)
    .where(
      and(
        eq(restaurants.userId, userId),
        eq(restaurants.name, name)
      )
    )
    .limit(1);

  return newRestaurant[0];
}



/**
 * Restaurant name translation cache helpers (Chinese -> English).
 */
import { restaurantTranslations } from "../drizzle/schema";
import { inArray } from "drizzle-orm";

/**
 * Fetch cached English names for the given Chinese names.
 * Returns a map of nameZh -> nameEn for entries found in cache.
 */
export async function getTranslations(
  names: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const db = await getDb();
  if (!db || names.length === 0) return map;

  try {
    const rows = await db
      .select()
      .from(restaurantTranslations)
      .where(inArray(restaurantTranslations.nameZh, names));
    for (const row of rows) {
      map.set(row.nameZh, row.nameEn);
    }
  } catch (error) {
    console.warn("[Database] getTranslations failed:", error);
  }
  return map;
}

/**
 * Persist newly generated translations. Uses upsert to be idempotent.
 */
export async function saveTranslations(
  entries: { nameZh: string; nameEn: string }[]
): Promise<void> {
  const db = await getDb();
  if (!db || entries.length === 0) return;

  try {
    for (const entry of entries) {
      // 手動覆寫（isManual=1）不會被 AI 翻譯蓋過：
      // 只在現有記錄為非手動時才更新 nameEn。
      await db
        .insert(restaurantTranslations)
        .values({ ...entry, isManual: 0 })
        .onDuplicateKeyUpdate({
          set: {
            nameEn: sql`IF(${restaurantTranslations.isManual} = 1, ${restaurantTranslations.nameEn}, ${entry.nameEn})`,
          },
        });
    }
  } catch (error) {
    console.warn("[Database] saveTranslations failed:", error);
  }
}

/**
 * 設定某間餐廳的手動英文名覆寫（isManual=1）。
 * 若 nameEn 為空字串，視為「清除覆寫」：刪除該記錄，下次查詢會重新交給 AI 翻譯。
 */
export async function setManualTranslation(
  nameZh: string,
  nameEn: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const zh = nameZh.trim();
  const en = nameEn.trim();
  if (!zh) return;
  try {
    if (!en) {
      await db
        .delete(restaurantTranslations)
        .where(eq(restaurantTranslations.nameZh, zh));
      return;
    }
    await db
      .insert(restaurantTranslations)
      .values({ nameZh: zh, nameEn: en, isManual: 1 })
      .onDuplicateKeyUpdate({ set: { nameEn: en, isManual: 1 } });
  } catch (error) {
    console.warn("[Database] setManualTranslation failed:", error);
  }
}

/**
 * 取得所有使用者（給管理員審批用），依建立時間倒序。
 */
export async function listAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

/**
 * 設定某使用者的存取狀態（approved / rejected / pending）。
 * 回傳是否成功。
 */
export async function setUserAccessStatus(
  userId: number,
  accessStatus: "pending" | "approved" | "rejected"
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    await db
      .update(users)
      .set({ accessStatus })
      .where(eq(users.id, userId));
    return true;
  } catch (error) {
    console.warn("[Database] setUserAccessStatus failed:", error);
    return false;
  }
}

// ─── Restaurant Locations ─────────────────────────────────────────────────────

/**
 * 取得所有餐廳位置記錄（依 nameZh 排序）。
 */
export async function listRestaurantLocations(): Promise<RestaurantLocation[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(restaurantLocations).orderBy(restaurantLocations.nameZh);
  } catch (error) {
    console.warn("[Database] listRestaurantLocations failed:", error);
    return [];
  }
}

/**
 * 以 nameZh 查詢單一餐廳位置。
 */
export async function getRestaurantLocationByName(nameZh: string): Promise<RestaurantLocation | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db.select().from(restaurantLocations).where(eq(restaurantLocations.nameZh, nameZh)).limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.warn("[Database] getRestaurantLocationByName failed:", error);
    return null;
  }
}

/**
 * 新增或更新餐廳位置（以 nameZh 為唯一鍵）。
 */
export async function upsertRestaurantLocation(data: InsertRestaurantLocation): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db
      .insert(restaurantLocations)
      .values(data)
      .onDuplicateKeyUpdate({
        set: {
          nameEn: data.nameEn,
          address: data.address,
          lat: data.lat,
          lng: data.lng,
          region: data.region,
          subRegion: data.subRegion,
          isVerified: data.isVerified,
          aiNote: data.aiNote,
        },
      });
  } catch (error) {
    console.warn("[Database] upsertRestaurantLocation failed:", error);
  }
}

// ─── Photo Cache ──────────────────────────────────────────────────────────────

import { InsertPhotoCache, photoCache, PhotoCache } from "../drizzle/schema";
import { like, or, isNull, isNotNull, count } from "drizzle-orm";

/**
 * 批次 upsert 相片快取記錄（以 fileId 為唯一鍵）。
 * 每次同步時呼叫，已存在的記錄會更新，新記錄會新增。
 */
export async function upsertPhotoCacheBatch(
  rows: InsertPhotoCache[]
): Promise<void> {
  const db = await getDb();
  if (!db || rows.length === 0) return;
  // MySQL 不支援單次 INSERT ... ON DUPLICATE KEY UPDATE 多行時更新所有欄位，
  // 但可以用 VALUES() 函式。分批處理避免 packet 過大。
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await db
      .insert(photoCache)
      .values(batch)
      .onDuplicateKeyUpdate({
        set: {
          name: sql`VALUES(${photoCache.name})`,
          thumbnailUrl: sql`VALUES(${photoCache.thumbnailUrl})`,
          webViewLink: sql`VALUES(${photoCache.webViewLink})`,
          restaurantName: sql`VALUES(${photoCache.restaurantName})`,
          regionId: sql`VALUES(${photoCache.regionId})`,
          regionName: sql`VALUES(${photoCache.regionName})`,
          subRegionName: sql`VALUES(${photoCache.subRegionName})`,
          environment: sql`VALUES(${photoCache.environment})`,
          mimeType: sql`VALUES(${photoCache.mimeType})`,
          createdTime: sql`VALUES(${photoCache.createdTime})`,
          syncedAt: sql`NOW()`,
        },
      });
  }
}

/**
 * 刪除不在最新同步清單中的舊相片快取記錄（孤兒清理）。
 * @param activeFileIds 本次同步到的所有 fileId 集合
 */
export async function prunePhotoCache(
  activeFileIds: Set<string>
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  try {
    // 取得所有現有 fileId，找出不在 activeFileIds 的記錄並刪除
    const allRows = await db
      .select({ fileId: photoCache.fileId, id: photoCache.id })
      .from(photoCache);
    const toDelete = allRows
      .filter((r) => !activeFileIds.has(r.fileId))
      .map((r) => r.id);
    if (toDelete.length === 0) return 0;
    const BATCH = 200;
    let deleted = 0;
    for (let i = 0; i < toDelete.length; i += BATCH) {
      const ids = toDelete.slice(i, i + BATCH);
      await db.delete(photoCache).where(inArray(photoCache.id, ids));
      deleted += ids.length;
    }
    return deleted;
  } catch (error) {
    console.warn("[Database] prunePhotoCache failed:", error);
    return 0;
  }
}

/**
 * 從 photo_cache 分頁查詢相片，支援地區/子地區/餐廳名稱/搜尋/環境篩選。
 * 回傳 { items, total, hasMore }。
 */
export async function getPhotosCached(opts: {
  regionId?: string | null;
  subRegionName?: string | null;
  restaurantName?: string | null;
  search?: string | null;
  environments?: string[] | null;
  limit: number;
  offset: number;
}): Promise<{ items: PhotoCache[]; total: number; hasMore: boolean }> {
  const db = await getDb();
  if (!db) return { items: [], total: 0, hasMore: false };

  const conditions: ReturnType<typeof eq>[] = [];

  if (opts.regionId) {
    conditions.push(eq(photoCache.regionId, opts.regionId));
  }
  if (opts.subRegionName) {
    conditions.push(eq(photoCache.subRegionName, opts.subRegionName));
  }
  if (opts.restaurantName) {
    conditions.push(eq(photoCache.restaurantName, opts.restaurantName));
  }

  // 搜尋：同時比對 restaurantName（中文）
  if (opts.search && opts.search.trim()) {
    const q = `%${opts.search.trim()}%`;
    conditions.push(
      or(
        like(photoCache.restaurantName, q)
      ) as ReturnType<typeof eq>
    );
  }

  // 環境篩選
  if (opts.environments && opts.environments.length > 0) {
    const envSet = new Set(opts.environments);
    const hasIndoor = envSet.has("__indoor__");
    const realEnvs = Array.from(envSet).filter((e) => e !== "__indoor__");

    if (hasIndoor && realEnvs.length > 0) {
      conditions.push(
        or(
          isNull(photoCache.environment),
          inArray(photoCache.environment, realEnvs)
        ) as ReturnType<typeof eq>
      );
    } else if (hasIndoor) {
      conditions.push(isNull(photoCache.environment) as ReturnType<typeof eq>);
    } else if (realEnvs.length > 0) {
      conditions.push(inArray(photoCache.environment, realEnvs) as ReturnType<typeof eq>);
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  try {
    const [items, countResult] = await Promise.all([
      db
        .select()
        .from(photoCache)
        .where(where)
        .orderBy(photoCache.regionName, photoCache.restaurantName, photoCache.id)
        .limit(opts.limit)
        .offset(opts.offset),
      db
        .select({ total: count() })
        .from(photoCache)
        .where(where),
    ]);

    const total = countResult[0]?.total ?? 0;
    return {
      items,
      total,
      hasMore: opts.offset + items.length < total,
    };
  } catch (error) {
    console.warn("[Database] getPhotosCached failed:", error);
    return { items: [], total: 0, hasMore: false };
  }
}

/**
 * 取得 photo_cache 的統計資訊（總相片數、地區數、餐廳數、最後同步時間）。
 */
export async function getPhotoCacheStats(): Promise<{
  totalPhotos: number;
  totalRegions: number;
  totalRestaurants: number;
  lastSyncedAt: Date | null;
}> {
  const db = await getDb();
  if (!db) return { totalPhotos: 0, totalRegions: 0, totalRestaurants: 0, lastSyncedAt: null };
  try {
    const [statsRow] = await db
      .select({
        totalPhotos: count(),
        lastSyncedAt: sql<Date>`MAX(${photoCache.syncedAt})`,
      })
      .from(photoCache);

    const regionRows = await db
      .selectDistinct({ regionId: photoCache.regionId })
      .from(photoCache);

    const restaurantRows = await db
      .selectDistinct({ restaurantName: photoCache.restaurantName })
      .from(photoCache);

    return {
      totalPhotos: statsRow?.totalPhotos ?? 0,
      totalRegions: regionRows.length,
      totalRestaurants: restaurantRows.length,
      lastSyncedAt: statsRow?.lastSyncedAt ?? null,
    };
  } catch (error) {
    console.warn("[Database] getPhotoCacheStats failed:", error);
    return { totalPhotos: 0, totalRegions: 0, totalRestaurants: 0, lastSyncedAt: null };
  }
}

// ─── Region Cache ─────────────────────────────────────────────────────────────
import { InsertRegionCache, regionCache } from "../drizzle/schema";

/**
 * 批次 upsert 地區快取記錄（以 folderId 為唯一鍵）。
 * 同步完成後呼叫，將最新地區列表寫入 DB。
 */
export async function upsertRegionCacheBatch(
  rows: InsertRegionCache[]
): Promise<void> {
  const db = await getDb();
  if (!db || rows.length === 0) return;
  try {
    for (const row of rows) {
      await db
        .insert(regionCache)
        .values(row)
        .onDuplicateKeyUpdate({
          set: {
            name: row.name,
            photoCount: row.photoCount,
            restaurantCount: row.restaurantCount,
            subRegionsJson: row.subRegionsJson,
            syncedAt: new Date(),
          },
        });
    }
  } catch (error) {
    console.warn("[Database] upsertRegionCacheBatch failed:", error);
  }
}

/**
 * 從 region_cache 讀取地區列表（毫秒級，無需爬取 Drive）。
 * 若快取為空，回傳 null（呼叫方應 fallback 到 Drive 爬取）。
 */
export async function getRegionsCached(): Promise<Array<{
  id: string;
  name: string;
  photoCount: number;
  restaurantCount: number;
  subRegions: string[];
}> | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db
      .select()
      .from(regionCache)
      .orderBy(regionCache.name);
    if (rows.length === 0) return null;
    return rows.map((r) => ({
      id: r.folderId,
      name: r.name,
      photoCount: r.photoCount,
      restaurantCount: r.restaurantCount,
      subRegions: r.subRegionsJson ? (JSON.parse(r.subRegionsJson) as string[]) : [],
    }));
  } catch (error) {
    console.warn("[Database] getRegionsCached failed:", error);
    return null;
  }
}

/**
 * 從 photo_cache 聚合計算指定地區的子地區列表（毫秒級，無需爬取 Drive）。
 * 若快取為空，回傳 null（呼叫方應 fallback 到 Drive 爬取）。
 */
export async function getSubRegionsCached(regionId: string): Promise<Array<{
  name: string;
  photoCount: number;
  restaurantCount: number;
}> | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db
      .select({
        subRegionName: photoCache.subRegionName,
        restaurantName: photoCache.restaurantName,
      })
      .from(photoCache)
      .where(
        and(
          eq(photoCache.regionId, regionId),
          isNotNull(photoCache.subRegionName)
        )
      );
    if (rows.length === 0) return null;
    // 聚合計算每個子地區的相片數和餐廳數
    const subRegionMap = new Map<string, { photos: number; restaurants: Set<string> }>();
    for (const row of rows) {
      if (!row.subRegionName) continue;
      const existing = subRegionMap.get(row.subRegionName);
      if (existing) {
        existing.photos++;
        existing.restaurants.add(row.restaurantName);
      } else {
        subRegionMap.set(row.subRegionName, {
          photos: 1,
          restaurants: new Set([row.restaurantName]),
        });
      }
    }
    return Array.from(subRegionMap.entries())
      .map(([name, data]) => ({
        name,
        photoCount: data.photos,
        restaurantCount: data.restaurants.size,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-HK"));
  } catch (error) {
    console.warn("[Database] getSubRegionsCached failed:", error);
    return null;
  }
}
