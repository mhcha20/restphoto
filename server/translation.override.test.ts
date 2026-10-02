import { describe, expect, it } from "vitest";
import { sortEnvironments } from "./routers/googleDrive";

describe("sortEnvironments", () => {
  it("orders by time-of-day: 日間 → 黃昏 → 夜晚, indoor after", () => {
    const input = ["夜晚", "室內", "黃昏（夏）", "日間"];
    expect(sortEnvironments(input)).toEqual([
      "日間",
      "黃昏（夏）",
      "夜晚",
      "室內",
    ]);
  });

  it("keeps 黃昏 between 日間 and 夜晚 even with extra variants", () => {
    const input = ["夜晚", "日", "黃昏"];
    const sorted = sortEnvironments(input);
    expect(sorted.indexOf("黃昏")).toBeGreaterThan(sorted.indexOf("日"));
    expect(sorted.indexOf("黃昏")).toBeLessThan(sorted.indexOf("夜晚"));
  });

  it("places unknown environments at the end", () => {
    const input = ["未知狀態", "日間", "夜晚"];
    const sorted = sortEnvironments(input);
    expect(sorted[sorted.length - 1]).toBe("未知狀態");
  });

  it("does not mutate the original array", () => {
    const input = ["夜晚", "日間"];
    const copy = [...input];
    sortEnvironments(input);
    expect(input).toEqual(copy);
  });
});

import { normalizeEnvironment, parseFileName } from "./_core/googleDrive";

describe("normalizeEnvironment", () => {
  it("strips trailing parenthesized digits (full-width)", () => {
    expect(normalizeEnvironment("夏（1）")).toBe("夏");
    expect(normalizeEnvironment("夏（2）")).toBe("夏");
  });

  it("strips trailing parenthesized digits (half-width)", () => {
    expect(normalizeEnvironment("夜晚(2)")).toBe("夜晚");
    expect(normalizeEnvironment("日間 (3)")).toBe("日間");
  });

  it("keeps non-numeric parenthesized text untouched (e.g. 黃昏（夏）)", () => {
    expect(normalizeEnvironment("黃昏（夏）")).toBe("黃昏（夏）");
  });

  it("removes repeated trailing numeric parens", () => {
    expect(normalizeEnvironment("夏（1）(2)")).toBe("夏");
  });

  it("leaves plain environment names unchanged", () => {
    expect(normalizeEnvironment("夜晚")).toBe("夜晚");
  });
});

describe("parseFileName environment merging", () => {
  it("merges numbered variants of the same environment", () => {
    expect(parseFileName("某餐廳_夏（1）.jpg").environment).toBe("夏");
    expect(parseFileName("某餐廳_夏（2）.jpg").environment).toBe("夏");
    expect(parseFileName("某餐廳_夏.jpg").environment).toBe("夏");
  });

  it("does not merge 黃昏（夏） with 黃昏", () => {
    expect(parseFileName("某餐廳_黃昏（夏）.jpg").environment).toBe("黃昏（夏）");
  });
});

describe("normalizeEnvironment - bare trailing digits & synonyms", () => {
  it("strips bare trailing digits without parentheses", () => {
    expect(normalizeEnvironment("夜間1")).toBe("夜晚");
    expect(normalizeEnvironment("日間2")).toBe("日間");
  });

  it("merges 夜間 / 夜間1 / 夜晚 into a single 夜晚", () => {
    expect(normalizeEnvironment("夜間")).toBe("夜晚");
    expect(normalizeEnvironment("夜間1")).toBe("夜晚");
    expect(normalizeEnvironment("夜晚")).toBe("夜晚");
    expect(normalizeEnvironment("夜晚2")).toBe("夜晚");
  });

  it("keeps 黃昏（夏） untouched even with new rules", () => {
    expect(normalizeEnvironment("黃昏（夏）")).toBe("黃昏（夏）");
  });
});

describe("parseFileName - night synonyms merge", () => {
  it("normalizes 夜間1 in filename to 夜晚", () => {
    expect(parseFileName("某餐廳_夜間1.jpg").environment).toBe("夜晚");
    expect(parseFileName("某餐廳_夜間.jpg").environment).toBe("夜晚");
    expect(parseFileName("某餐廳_夜晚.jpg").environment).toBe("夜晚");
  });
});

import { sortSubRegions } from "./_core/googleDrive";

describe("sortSubRegions", () => {
  it("places 其他 last and sorts the rest", () => {
    const input = ["舊大街", "其他", "利港中心"];
    const sorted = sortSubRegions(input);
    expect(sorted[sorted.length - 1]).toBe("其他");
    expect(sorted.indexOf("利港中心")).toBeGreaterThanOrEqual(0);
  });

  it("does not mutate the original array", () => {
    const input = ["其他", "舊大街"];
    const copy = [...input];
    sortSubRegions(input);
    expect(input).toEqual(copy);
  });
});

import { normalizeRestaurantName } from "./_core/googleDrive";

describe("normalizeRestaurantName（方案 A：合併餐廳名數字後綴）", () => {
  it("移除結尾括號純數字（全形／半形）並合併", () => {
    expect(normalizeRestaurantName("大快活（1）")).toBe("大快活");
    expect(normalizeRestaurantName("大快活(2)")).toBe("大快活");
    expect(normalizeRestaurantName("大快活 （3）")).toBe("大快活");
  });

  it("移除結尾『空格＋數字』（含全形空格）並合併", () => {
    expect(normalizeRestaurantName("大快活 1")).toBe("大快活");
    expect(normalizeRestaurantName("大快活　2")).toBe("大快活");
    expect(normalizeRestaurantName("茶餐廳 10")).toBe("茶餐廳");
  });

  it("反覆移除多重後綴", () => {
    expect(normalizeRestaurantName("大快活（1） 2")).toBe("大快活");
    expect(normalizeRestaurantName("大快活(1)(2)")).toBe("大快活");
  });

  it("不動無空格也無括號的尾數字（保護以數字結尾的店名）", () => {
    expect(normalizeRestaurantName("7-11")).toBe("7-11");
    expect(normalizeRestaurantName("大家樂2026")).toBe("大家樂2026");
    expect(normalizeRestaurantName("譚仔3哥")).toBe("譚仔3哥");
  });

  it("括號內為文字者不受影響", () => {
    expect(normalizeRestaurantName("譚仔（米線）")).toBe("譚仔（米線）");
    expect(normalizeRestaurantName("大快活（分店）")).toBe("大快活（分店）");
  });

  it("無數字後綴者原樣返回", () => {
    expect(normalizeRestaurantName("流記艇仔粉")).toBe("流記艇仔粉");
    expect(normalizeRestaurantName("On Lok Fast Food")).toBe("On Lok Fast Food");
  });

  it("parseFileName 會將帶數字後綴的餐廳名合併", () => {
    expect(parseFileName("大快活（1）_夜晚.jpg").restaurantName).toBe("大快活");
    expect(parseFileName("大快活 2_日間.jpg").restaurantName).toBe("大快活");
    expect(parseFileName("大快活（3）.jpg").restaurantName).toBe("大快活");
    // 環境部分仍照常解析與正規化
    expect(parseFileName("大快活（1）_夜間1.jpg")).toEqual({
      restaurantName: "大快活",
      environment: "夜晚",
    });
  });
});
