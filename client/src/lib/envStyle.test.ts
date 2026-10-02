import { describe, it, expect } from "vitest";
import { getEnvKind, getEnvStyle } from "./envStyle";

describe("getEnvKind", () => {
  it("日間相關字串判為 day", () => {
    expect(getEnvKind("日間")).toBe("day");
    expect(getEnvKind("日")).toBe("day");
    expect(getEnvKind("白天")).toBe("day");
    expect(getEnvKind("Day")).toBe("day");
    expect(getEnvKind("daytime")).toBe("day");
  });

  it("夜晚相關字串判為 night", () => {
    expect(getEnvKind("夜晚")).toBe("night");
    expect(getEnvKind("夜間")).toBe("night");
    expect(getEnvKind("夜")).toBe("night");
    expect(getEnvKind("Night")).toBe("night");
  });

  it("雨天相關字串判為 rain", () => {
    expect(getEnvKind("雨天")).toBe("rain");
    expect(getEnvKind("落雨")).toBe("rain");
    expect(getEnvKind("rain")).toBe("rain");
    expect(getEnvKind("Rainy")).toBe("rain");
  });

  it("室內相關字串判為 indoor", () => {
    expect(getEnvKind("室內")).toBe("indoor");
    expect(getEnvKind("__indoor__")).toBe("indoor");
    expect(getEnvKind("indoor")).toBe("indoor");
  });

  it("空值或未知判為 other", () => {
    expect(getEnvKind(null)).toBe("other");
    expect(getEnvKind(undefined)).toBe("other");
    expect(getEnvKind("")).toBe("other");
    expect(getEnvKind("陰天")).toBe("other");
  });
});

describe("getEnvStyle", () => {
  it("日間用太陽圖示與琥珀色", () => {
    const s = getEnvStyle("日間");
    expect(s.icon).toBe("Sun");
    expect(s.badge).toContain("amber");
  });

  it("夜晚用月亮圖示與靛藍色", () => {
    const s = getEnvStyle("夜晚");
    expect(s.icon).toBe("Moon");
    expect(s.badge).toContain("indigo");
  });

  it("日間與夜晚配色不同", () => {
    expect(getEnvStyle("日間").badge).not.toBe(getEnvStyle("夜晚").badge);
  });

  it("雨天用雨雲圖示與青藍色", () => {
    const s = getEnvStyle("雨天");
    expect(s.icon).toBe("CloudRain");
    expect(s.badge).toContain("sky");
  });

  it("室內用房子圖示", () => {
    expect(getEnvStyle("室內").icon).toBe("Home");
  });
});
