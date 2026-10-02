// 環境（日間／夜晚／室內）顯示用的顏色與圖示對應
// 目的：讓「日間」與「夜晚」標籤、按鈕在視覺上以不同顏色明確區分。
//
// 純資料邏輯，不依賴 React，方便單元測試。

export type EnvKind = "day" | "night" | "rain" | "indoor" | "other";

// 依環境字串判斷其類別。
// - 日間類：日間 / 日 / 白天 / day / daytime
// - 夜晚類：夜晚 / 夜間 / 夜 / night / nighttime
// - 室內類：室內 / indoor（含特殊值 __indoor__）
// - 其餘：other
export function getEnvKind(env: string | null | undefined): EnvKind {
  if (!env) return "other";
  const v = env.trim().toLowerCase();
  // 室內（含後端特殊值 __indoor__）
  if (v === "__indoor__" || v.includes("室內") || v.includes("indoor")) {
    return "indoor";
  }
  // 雨天類
  if (v.includes("雨") || v.includes("rain")) {
    return "rain";
  }
  // 夜晚類（先判夜，避免「日」誤中）
  if (
    v.includes("夜") ||
    v.includes("晚") ||
    v.includes("night")
  ) {
    return "night";
  }
  // 日間類
  if (
    v.includes("日間") ||
    v.includes("白天") ||
    v.includes("day") ||
    v === "日"
  ) {
    return "day";
  }
  return "other";
}

export interface EnvStyle {
  // 圖示名稱（對應 lucide-react）
  icon: "Sun" | "Moon" | "CloudRain" | "Home" | "CloudSun";
  // 未選取（一般標籤）狀態的配色 class
  badge: string;
  // checkbox 被選取時的配色 class
  selected: string;
  // 圖示額外 class（顏色）
  iconClass: string;
}

const STYLES: Record<EnvKind, EnvStyle> = {
  // 日間：暖黃／琥珀，太陽圖示
  day: {
    icon: "Sun",
    badge: "bg-amber-50 border-amber-300 text-amber-800",
    selected: "bg-amber-100 border-amber-400 text-amber-900",
    iconClass: "text-amber-500",
  },
  // 夜晚：靛藍，月亮圖示
  night: {
    icon: "Moon",
    badge: "bg-indigo-50 border-indigo-300 text-indigo-800",
    selected: "bg-indigo-100 border-indigo-400 text-indigo-900",
    iconClass: "text-indigo-500",
  },
  // 雨天：青藍色，雨雲圖示
  rain: {
    icon: "CloudRain",
    badge: "bg-sky-50 border-sky-300 text-sky-800",
    selected: "bg-sky-100 border-sky-400 text-sky-900",
    iconClass: "text-sky-500",
  },
  // 室內：中性石色，房子圖示
  indoor: {
    icon: "Home",
    badge: "bg-stone-100 border-stone-300 text-stone-700",
    selected: "bg-stone-200 border-stone-400 text-stone-900",
    iconClass: "text-stone-500",
  },
  // 其他：沿用中性灰，雲＋太陽圖示
  other: {
    icon: "CloudSun",
    badge: "bg-slate-50 border-slate-300 text-slate-700",
    selected: "bg-slate-100 border-slate-400 text-slate-900",
    iconClass: "text-slate-500",
  },
};

export function getEnvStyle(env: string | null | undefined): EnvStyle {
  return STYLES[getEnvKind(env)];
}
