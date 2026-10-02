// 計算下拉選單／placeholder 顯示的「範圍名稱」純邏輯。
// 抽出成獨立函式，方便在 node 環境下做單元測試。
//
// 規則：
// - 揀咗子地區（subRegion 非 null）→ 顯示子地區名（最具體）
// - 否則顯示地區名（regionName）
// - 兩者皆無（尚未選擇任何地區）→ 回傳 undefined
export function computeScopeLabel(
  subRegion: string | null,
  regionName: string | undefined
): string | undefined {
  return subRegion ?? regionName;
}
