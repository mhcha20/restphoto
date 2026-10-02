import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB helpers：預設快取為空、寫入記錄被攔截
const getTranslationsMock = vi.fn();
const saveTranslationsMock = vi.fn();
vi.mock("../db", () => ({
  getTranslations: (...args: unknown[]) => getTranslationsMock(...args),
  saveTranslations: (...args: unknown[]) => saveTranslationsMock(...args),
}));

// Mock LLM：回傳固定 JSON 結構
const invokeLLMMock = vi.fn();
vi.mock("./llm", () => ({
  invokeLLM: (...args: unknown[]) => invokeLLMMock(...args),
}));

import { translateRestaurantNames } from "./translation";

function llmResponse(pairs: { zh: string; en: string }[]) {
  return {
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: JSON.stringify({ translations: pairs }),
        },
      },
    ],
  };
}

describe("translateRestaurantNames", () => {
  beforeEach(() => {
    getTranslationsMock.mockReset();
    saveTranslationsMock.mockReset();
    invokeLLMMock.mockReset();
  });

  it("空輸入回傳空 Map，且不呼叫 LLM", async () => {
    const result = await translateRestaurantNames([]);
    expect(result.size).toBe(0);
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });

  it("DB 快取命中時不呼叫 LLM", async () => {
    getTranslationsMock.mockResolvedValue(new Map([["大囍", "Tai Hei"]]));
    const result = await translateRestaurantNames(["大囍"]);
    expect(result.get("大囍")).toBe("Tai Hei");
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });

  it("快取未命中時呼叫 LLM 並寫回快取", async () => {
    // 用獨特名稱避免被先前測試的記憶體快取污染
    const zh = "獨特餐廳名_" + Math.random().toString(36).slice(2);
    getTranslationsMock.mockResolvedValue(new Map());
    invokeLLMMock.mockResolvedValue(
      llmResponse([{ zh, en: "Unique Restaurant" }])
    );

    const result = await translateRestaurantNames([zh]);
    expect(result.get(zh)).toBe("Unique Restaurant");
    expect(invokeLLMMock).toHaveBeenCalledTimes(1);
    expect(saveTranslationsMock).toHaveBeenCalledWith([
      { nameZh: zh, nameEn: "Unique Restaurant" },
    ]);
  });

  it("會去重相同名稱，只翻譯一次", async () => {
    const zh = "重複餐廳_" + Math.random().toString(36).slice(2);
    getTranslationsMock.mockResolvedValue(new Map());
    invokeLLMMock.mockResolvedValue(llmResponse([{ zh, en: "Dup Restaurant" }]));

    const result = await translateRestaurantNames([zh, zh, `  ${zh}  `]);
    expect(result.get(zh)).toBe("Dup Restaurant");
    // 去重後只剩一個名稱，LLM 只呼叫一次
    expect(invokeLLMMock).toHaveBeenCalledTimes(1);
  });

  it("LLM 失敗時不丟錯，缺失者不在 Map 中", async () => {
    const zh = "失敗餐廳_" + Math.random().toString(36).slice(2);
    getTranslationsMock.mockResolvedValue(new Map());
    invokeLLMMock.mockRejectedValue(new Error("LLM down"));

    const result = await translateRestaurantNames([zh]);
    expect(result.has(zh)).toBe(false);
  });
});
