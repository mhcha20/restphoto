import { invokeLLM } from "./llm";
import { getTranslations, saveTranslations } from "../db";

/**
 * 餐廳名稱自動英文化（中文 -> 英文）
 *
 * 流程：
 * 1. 先查資料庫快取
 * 2. 沒有的名稱用 LLM 批次翻譯（一次呼叫多間，音譯為主、意譯為輔）
 * 3. 把新結果寫回快取，避免重複呼叫
 *
 * 回傳 Map<中文名, 英文名>。若無 DB 或 LLM 失敗，缺失者不會出現在 Map。
 */

// 程序內記憶體快取，減少同次啟動的重複查詢
const memoryCache = new Map<string, string>();

/** 清除記憶體快取（手動覆寫英文名後呼叫，讓下次查詢拿到最新值） */
export function clearTranslationMemoryCache(): void {
  memoryCache.clear();
}

export async function translateRestaurantNames(
  names: string[],
  opts: { wait?: boolean } = {}
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const cleaned = Array.from(
    new Set(names.map((n) => n.trim()).filter((n) => n.length > 0))
  );
  if (cleaned.length === 0) return result;

  // 1. 記憶體快取
  const missingAfterMemory: string[] = [];
  for (const name of cleaned) {
    const cached = memoryCache.get(name);
    if (cached) {
      result.set(name, cached);
    } else {
      missingAfterMemory.push(name);
    }
  }
  if (missingAfterMemory.length === 0) return result;

  // 2. DB 快取
  const dbCached = await getTranslations(missingAfterMemory);
  const missing: string[] = [];
  for (const name of missingAfterMemory) {
    const en = dbCached.get(name);
    if (en) {
      result.set(name, en);
      memoryCache.set(name, en);
    } else {
      missing.push(name);
    }
  }
  if (missing.length === 0) return result;

  // 讀取路徑唔等 LLM：先回傳已有快取，缺失者喺背景翻譯，下次載入就有
  if (opts.wait === false) {
    scheduleBackgroundTranslation(missing);
    return result;
  }

  // 3. LLM 批次翻譯
  try {
    const translated = await llmTranslateBatch(missing);
    const toSave: { nameZh: string; nameEn: string }[] = [];
    for (const name of missing) {
      const en = translated.get(name);
      if (en) {
        result.set(name, en);
        memoryCache.set(name, en);
        toSave.push({ nameZh: name, nameEn: en });
      }
    }
    if (toSave.length > 0) {
      await saveTranslations(toSave);
    }
  } catch (error) {
    console.warn("[Translation] LLM translate failed:", error);
  }

  return result;
}

/**
 * 用 LLM 一次翻譯多個餐廳名稱，回傳 Map<中文名, 英文名>。
 */
async function llmTranslateBatch(
  names: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "你是香港餐廳名稱的英文化助手。將每個中文餐廳名稱轉成自然、慣用的英文名稱：" +
          "以粵語拼音/香港常見英文寫法為主（如『流記』-> 'Lau Kee'），" +
          "通用詞彙意譯（如『艇仔粉』-> 'Sampan Noodles'、『茶餐廳』-> 'Cafe'、『燒臘』-> 'BBQ'）。" +
          "保持簡潔、首字母大寫。只輸出 JSON。",
      },
      {
        role: "user",
        content:
          "請翻譯以下餐廳名稱：\n" +
          names.map((n, i) => `${i + 1}. ${n}`).join("\n"),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "restaurant_translations",
        strict: true,
        schema: {
          type: "object",
          properties: {
            translations: {
              type: "array",
              description: "每個餐廳名稱的中英對照",
              items: {
                type: "object",
                properties: {
                  zh: { type: "string", description: "原中文名稱" },
                  en: { type: "string", description: "英文名稱" },
                },
                required: ["zh", "en"],
                additionalProperties: false,
              },
            },
          },
          required: ["translations"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== "string") return map;

  try {
    const parsed = JSON.parse(content) as {
      translations?: { zh: string; en: string }[];
    };
    const list = parsed.translations ?? [];
    // 以原始名稱為準對齊（避免 LLM 改寫中文）
    const byZh = new Map(list.map((t) => [t.zh.trim(), t.en.trim()]));
    for (const name of names) {
      const en = byZh.get(name.trim());
      if (en) map.set(name, en);
    }
  } catch (error) {
    console.warn("[Translation] Failed to parse LLM JSON:", error);
  }

  return map;
}

// ---------------------------------------------------------------------------
// 背景翻譯：單一隊列、分批、失敗後冷卻，避免讀取請求被 LLM 拖慢或重複轟炸
// ---------------------------------------------------------------------------
const BG_CHUNK = 30;
const FAIL_COOLDOWN_MS = 10 * 60 * 1000;
const pendingNames = new Set<string>();
const failedUntil = new Map<string, number>();
let bgChain: Promise<void> = Promise.resolve();

function scheduleBackgroundTranslation(names: string[]): void {
  const now = Date.now();
  const fresh = names.filter(
    (n) => !pendingNames.has(n) && (failedUntil.get(n) ?? 0) <= now
  );
  if (fresh.length === 0) return;
  fresh.forEach((n) => pendingNames.add(n));

  for (let i = 0; i < fresh.length; i += BG_CHUNK) {
    const chunk = fresh.slice(i, i + BG_CHUNK);
    bgChain = bgChain.then(async () => {
      try {
        const translated = await llmTranslateBatch(chunk);
        const toSave: { nameZh: string; nameEn: string }[] = [];
        for (const name of chunk) {
          const en = translated.get(name);
          if (en) {
            memoryCache.set(name, en);
            toSave.push({ nameZh: name, nameEn: en });
          } else {
            failedUntil.set(name, Date.now() + FAIL_COOLDOWN_MS);
          }
        }
        if (toSave.length > 0) await saveTranslations(toSave);
      } catch (error) {
        console.warn("[Translation] background translate failed:", error);
        chunk.forEach((n) => failedUntil.set(n, Date.now() + FAIL_COOLDOWN_MS));
      } finally {
        chunk.forEach((n) => pendingNames.delete(n));
      }
    });
  }
}
