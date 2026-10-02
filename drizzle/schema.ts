import { bigint, index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  /** 存取批准狀態：pending=待批准、approved=已批准、rejected=已拒絕。新登入者預設 pending。 */
  accessStatus: mysqlEnum("accessStatus", ["pending", "approved", "rejected"]).default("pending").notNull(),
  googleDriveFolderId: varchar("googleDriveFolderId", { length: 255 }), // Google Drive folder ID
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Restaurants table - stores restaurant information
 */
export const restaurants = mysqlTable("restaurants", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  cuisineType: varchar("cuisineType", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Restaurant = typeof restaurants.$inferSelect;
export type InsertRestaurant = typeof restaurants.$inferInsert;

/**
 * Photos table - stores restaurant photo metadata
 */
export const photos = mysqlTable("photos", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  restaurantId: int("restaurantId").references(() => restaurants.id, { onDelete: "set null" }),
  restaurantName: varchar("restaurantName", { length: 255 }).notNull(),
  cuisineType: varchar("cuisineType", { length: 255 }),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  storageUrl: varchar("storageUrl", { length: 1024 }).notNull(),
  aiAnalysis: text("aiAnalysis"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Photo = typeof photos.$inferSelect;
export type InsertPhoto = typeof photos.$inferInsert;

/**
 * Google Drive Sync table - stores Google Drive file metadata and sync information
 */
export const googleDriveSync = mysqlTable("google_drive_sync", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  googleDriveFileId: varchar("googleDriveFileId", { length: 255 }).notNull().unique(),
  googleDriveUrl: text("googleDriveUrl").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  restaurantName: varchar("restaurantName", { length: 255 }).notNull(),
  region: varchar("region", { length: 100 }).notNull(), // 地區分類
  mimeType: varchar("mimeType", { length: 100 }),
  fileSize: int("fileSize"),
  lastModified: timestamp("lastModified"),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GoogleDriveSync = typeof googleDriveSync.$inferSelect;
export type InsertGoogleDriveSync = typeof googleDriveSync.$inferInsert;

/**
 * Sync Logs table - tracks Google Drive synchronization history
 */
export const syncLogs = mysqlTable("sync_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  syncType: varchar("syncType", { length: 50 }).notNull(), // 'auto' or 'manual'
  totalFiles: int("totalFiles").notNull(),
  newPhotos: int("newPhotos").notNull(),
  deletedPhotos: int("deletedPhotos").notNull(),
  status: varchar("status", { length: 50 }).notNull(), // 'success' or 'failed'
  errorMessage: text("errorMessage"),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
});

export type SyncLog = typeof syncLogs.$inferSelect;
export type InsertSyncLog = typeof syncLogs.$inferInsert;

/**
 * Restaurant name translation cache.
 * Maps a Chinese restaurant name to its auto-generated English name (via LLM).
 * Not tied to a user; shared cache across syncs to avoid repeated LLM calls.
 */
export const restaurantTranslations = mysqlTable("restaurant_translations", {
  id: int("id").autoincrement().primaryKey(),
  nameZh: varchar("nameZh", { length: 255 }).notNull().unique(),
  nameEn: varchar("nameEn", { length: 255 }).notNull(),
  /** 是否為使用者手動覆寫（1）；手動覆寫不會被 AI 翻譯蓋過 */
  isManual: int("isManual").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RestaurantTranslation = typeof restaurantTranslations.$inferSelect;
export type InsertRestaurantTranslation =
  typeof restaurantTranslations.$inferInsert;

/**
 * Restaurant Locations table - stores address and GPS coordinates per restaurant.
 * Keyed by nameZh (Chinese name) to match Google Drive photo data.
 * Populated via AI address search + Geocoding.
 */
export const restaurantLocations = mysqlTable("restaurant_locations", {
  id: int("id").autoincrement().primaryKey(),
  /** Chinese restaurant name (matches Google Drive folder name) */
  nameZh: varchar("nameZh", { length: 255 }).notNull().unique(),
  /** English name (from restaurant_translations) */
  nameEn: varchar("nameEn", { length: 255 }),
  /** Full address in Chinese */
  address: text("address"),
  /** GPS latitude */
  lat: text("lat"),
  /** GPS longitude */
  lng: text("lng"),
  /** Region (e.g. 香港仔) */
  region: varchar("region", { length: 100 }),
  /** Sub-region (e.g. 利港中心) */
  subRegion: varchar("subRegion", { length: 100 }),
  /** Whether address was manually verified by user */
  isVerified: int("isVerified").default(0).notNull(),
  /** AI-generated address confidence note */
  aiNote: text("aiNote"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RestaurantLocation = typeof restaurantLocations.$inferSelect;
export type InsertRestaurantLocation = typeof restaurantLocations.$inferInsert;

/**
 * Photo cache table - stores Google Drive photo metadata for fast paginated queries.
 * Synced from Google Drive on demand (admin trigger) or scheduled.
 * Replaces direct Drive API calls for photo browsing.
 */
export const photoCache = mysqlTable(
  "photo_cache",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Google Drive file ID (unique per photo) */
    fileId: varchar("fileId", { length: 255 }).notNull().unique(),
    /** Display name (parsed from filename) */
    name: varchar("name", { length: 512 }).notNull(),
    /** Direct thumbnail URL from Google Drive */
    thumbnailUrl: text("thumbnailUrl"),
    /** Web view link (opens in Drive) */
    webViewLink: text("webViewLink"),
    /** Parsed restaurant name (after normalisation) */
    restaurantName: varchar("restaurantName", { length: 255 }).notNull(),
    /** Region folder ID */
    regionId: varchar("regionId", { length: 255 }).notNull(),
    /** Region display name */
    regionName: varchar("regionName", { length: 100 }).notNull(),
    /** Sub-region name (optional) */
    subRegionName: varchar("subRegionName", { length: 100 }),
    /** Environment tag parsed from filename (e.g. 室外, 夜晚) */
    environment: varchar("environment", { length: 100 }),
    /** MIME type */
    mimeType: varchar("mimeType", { length: 100 }),
    /** File creation time in Google Drive (ms epoch) */
    createdTime: bigint("createdTime", { mode: "number" }),
    /** When this row was last synced from Drive */
    syncedAt: timestamp("syncedAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ([
    index("idx_photo_cache_region").on(t.regionId),
    index("idx_photo_cache_restaurant").on(t.restaurantName),
    index("idx_photo_cache_region_restaurant").on(t.regionId, t.restaurantName),
  ])
);

export type PhotoCache = typeof photoCache.$inferSelect;
export type InsertPhotoCache = typeof photoCache.$inferInsert;

/**
 * Region cache table - stores Google Drive region list for instant loading.
 * Synced from Drive whenever syncPhotos runs or manual refresh is triggered.
 * Allows getRegions to return instantly from DB instead of waiting for Drive crawl.
 */
export const regionCache = mysqlTable("region_cache", {
  id: int("id").autoincrement().primaryKey(),
  /** Google Drive folder ID for this region */
  folderId: varchar("folderId", { length: 255 }).notNull().unique(),
  /** Region display name */
  name: varchar("name", { length: 100 }).notNull(),
  /** Number of photos in this region */
  photoCount: int("photoCount").default(0).notNull(),
  /** Number of unique restaurants in this region */
  restaurantCount: int("restaurantCount").default(0).notNull(),
  /** JSON array of sub-region names */
  subRegionsJson: text("subRegionsJson"),
  /** When this row was last synced */
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RegionCache = typeof regionCache.$inferSelect;
export type InsertRegionCache = typeof regionCache.$inferInsert;
