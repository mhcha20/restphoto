/**
 * 伺服器端批次地址搜尋腳本
 * 直接呼叫 aiSearchRestaurantAddress 函數，為所有未入庫餐廳搜尋地址
 *
 * 執行方式：node scripts/batch_address_search.mjs
 */

import { createRequire } from "module";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// 使用 tsx 執行 TypeScript
console.log("請用 npx tsx scripts/batch_address_search.ts 執行");
