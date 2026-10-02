import { createConnection } from "mysql2/promise";
import { getDriveTree } from "../server/_core/googleDrive.ts";

// Get all unique restaurant names from Google Drive (with region, like Dashboard does)
const tree = await getDriveTree();
const driveEntries = [];
for (const region of tree.regions) {
  const names = new Set(region.photos.map((p) => p.restaurantName));
  for (const name of names) {
    driveEntries.push({ name, region: region.name });
  }
}
console.log(`Google Drive total entries (per region): ${driveEntries.length}`);

// Get all unique names (across regions, like listLocations does)
const driveUniqueNames = new Set(driveEntries.map((e) => e.name));
console.log(`Google Drive unique names: ${driveUniqueNames.size}`);

// Get DB names
const conn = await createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute("SELECT nameZh FROM restaurant_locations");
const dbNames = new Set(rows.map((r) => r.nameZh));
console.log(`DB names: ${dbNames.size}`);

// Find Drive names not in DB
const missing = [...driveUniqueNames].filter((n) => !dbNames.has(n));
console.log(`\nMissing from DB (${missing.length}):`);
missing.forEach((n) => console.log(" -", n));

// Find DB names not in Drive
const extra = [...dbNames].filter((n) => !driveUniqueNames.has(n));
console.log(`\nIn DB but not in Drive (${extra.length}):`);
extra.forEach((n) => console.log(" -", n));

await conn.end();
