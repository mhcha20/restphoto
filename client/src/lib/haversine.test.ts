import { describe, it, expect } from "vitest";

// Inline the same haversineKm logic from RestaurantList.tsx for unit testing
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} 米`;
  return `${km.toFixed(1)} 公里`;
}

describe("haversineKm", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineKm(22.3, 114.1, 22.3, 114.1)).toBe(0);
  });

  it("calculates reasonable distance between two HK points (~2km)", () => {
    // Causeway Bay to Wan Chai approx
    const km = haversineKm(22.2808, 114.1844, 22.2769, 114.1730);
    expect(km).toBeGreaterThan(0.5);
    expect(km).toBeLessThan(3);
  });

  it("calculates distance between HK and Kowloon (~4km)", () => {
    const km = haversineKm(22.2783, 114.1747, 22.3193, 114.1694);
    expect(km).toBeGreaterThan(3);
    expect(km).toBeLessThan(7);
  });

  it("is symmetric (A→B == B→A)", () => {
    const d1 = haversineKm(22.3, 114.1, 22.35, 114.15);
    const d2 = haversineKm(22.35, 114.15, 22.3, 114.1);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.0001);
  });
});

describe("formatDistance", () => {
  it("shows meters for distances under 1km", () => {
    expect(formatDistance(0.3)).toBe("300 米");
    expect(formatDistance(0.999)).toBe("999 米");
  });

  it("shows km with 1 decimal for distances >= 1km", () => {
    expect(formatDistance(1.0)).toBe("1.0 公里");
    expect(formatDistance(2.567)).toBe("2.6 公里");
  });
});
