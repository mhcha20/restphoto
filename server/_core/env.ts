export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  // Auth (Google OAuth)
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  adminEmail: (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase(),
  // Public base URL of the site, e.g. https://example.up.railway.app (used for the OAuth redirect URI)
  appUrl: (process.env.APP_URL ?? "").replace(/\/+$/, ""),
  // Google Drive
  googleDriveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID ?? "",
  googleDriveApiKey: process.env.GOOGLE_DRIVE_API_KEY ?? "",
  // OpenRouter (LLM + image generation)
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  openRouterModel: process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash",
  openRouterImageModel:
    process.env.OPENROUTER_IMAGE_MODEL ?? "google/gemini-2.5-flash-image",
  // Google Maps (server-side Geocoding/Places)
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
  // Scheduler
  cronSecret: process.env.CRON_SECRET ?? "",
  dailySyncEnabled: (process.env.DAILY_SYNC_ENABLED ?? "true") !== "false",
  // Optional S3-compatible storage (only needed for the legacy photo upload module)
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  s3Region: process.env.S3_REGION ?? "auto",
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  s3PublicUrl: (process.env.S3_PUBLIC_URL ?? "").replace(/\/+$/, ""),
};
