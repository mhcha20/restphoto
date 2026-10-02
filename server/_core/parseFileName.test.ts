import { describe, it, expect } from "vitest";
import { parseFileName } from "./googleDrive";

describe("parseFileName", () => {
  it("拆出餐廳名與環境（單一底線）", () => {
    expect(parseFileName("流記艇仔粉_晴天.jpg")).toEqual({
      restaurantName: "流記艇仔粉",
      environment: "晴天",
    });
  });

  it("無底線視為室內（environment 為 null）", () => {
    expect(parseFileName("大囍.jpg")).toEqual({
      restaurantName: "大囍",
      environment: null,
    });
  });

  it("多個底線時只取最後一段為環境", () => {
    expect(parseFileName("大囍_麵家_夜晚.jpg")).toEqual({
      restaurantName: "大囍_麵家",
      environment: "夜晚",
    });
  });

  it("英文檔名同樣可解析", () => {
    expect(parseFileName("Bamboo Thai_rainy.png")).toEqual({
      restaurantName: "Bamboo Thai",
      environment: "rainy",
    });
  });

  it("底線後為空字串時退回整段當餐廳名", () => {
    expect(parseFileName("流記_.jpg")).toEqual({
      restaurantName: "流記_",
      environment: null,
    });
  });

  it("底線前為空字串時退回整段當餐廳名", () => {
    expect(parseFileName("_晴天.jpg")).toEqual({
      restaurantName: "_晴天",
      environment: null,
    });
  });

  it("不同大小寫副檔名都會被移除", () => {
    expect(parseFileName("和斗_夜晚.JPEG")).toEqual({
      restaurantName: "和斗",
      environment: "夜晚",
    });
  });

  it("「_室內」代表拍攝室內環境，保留為環境字串", () => {
    // 釋清：`_室內` 是一種環境狀態（餐廳內部環境），
    // 與「無後綴＝不受天氣影響」不同，不能視為 null。
    expect(parseFileName("牛奶冰室_室內.jpg")).toEqual({
      restaurantName: "牛奶冰室",
      environment: "室內",
    });
  });

  it("「室內環境」等完整後綴也保留原字", () => {
    expect(parseFileName("某餐廳_室內環境.jpg")).toEqual({
      restaurantName: "某餐廳",
      environment: "室內環境",
    });
  });
});
