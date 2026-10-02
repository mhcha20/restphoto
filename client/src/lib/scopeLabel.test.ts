import { describe, it, expect } from "vitest";
import { computeScopeLabel } from "./scopeLabel";

describe("computeScopeLabel", () => {
  it("揀咗子地區時優先顯示子地區名", () => {
    expect(computeScopeLabel("利港中心", "香港仔")).toBe("利港中心");
  });

  it("未揀子地區時顯示地區名", () => {
    expect(computeScopeLabel(null, "香港仔")).toBe("香港仔");
  });

  it("選「全部地區」時顯示全部地區名", () => {
    expect(computeScopeLabel(null, "全部地區")).toBe("全部地區");
  });

  it("尚未選擇任何地區時回傳 undefined", () => {
    expect(computeScopeLabel(null, undefined)).toBeUndefined();
  });

  it("子地區存在時即使地區名為 undefined 仍顯示子地區", () => {
    expect(computeScopeLabel("東勝道", undefined)).toBe("東勝道");
  });
});
