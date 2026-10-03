import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Search,
  Loader2,
  MapPin,
  X,
  ExternalLink,
  ChevronsUpDown,
  Check,
  Utensils,
  CloudSun,
  Home,
  Pencil,
  FilterX,
  Users,
  LogOut,
  Sun,
  Moon,
  CloudRain,
  Sparkles,
  Download,
  UserX,
  ArrowLeft,
  Database,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Menu,
} from "lucide-react";
import { Link, useSearch } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import DrivePhotoGrid, {
  type DrivePhoto,
} from "@/components/DrivePhotoGrid";
import { OptimizedImage } from "@/components/OptimizedImage";
import { createDebouncer } from "@/lib/debounce";
import { computeScopeLabel } from "@/lib/scopeLabel";
import { getEnvStyle } from "@/lib/envStyle";
import { useAuth } from "@/_core/hooks/useAuth";

const ENV_ICONS = { Sun, Moon, CloudRain, Home, CloudSun } as const;

// 「全部」按鈕的特殊標記，用來與「尚未選擇」區分
const ALL_REGIONS = "__ALL__";
// 「室內（不受環境影響）」的特殊環境值，與後端對齊
const INDOOR_ENV = "__indoor__";

// 環境字串的顯示用映射（不動底層資料）：
// 檔名的「室內」指餐廳內部環境，顯示為更清楚的「餐廳室內環境」。
const ENV_LABELS: Record<string, string> = {
  室內: "餐廳室內環境",
};
function formatEnvironment(env: string): string {
  return ENV_LABELS[env] ?? env;
}

const PAGE_SIZE = 30;

export default function GoogleDriveDashboard() {
  // null = 尚未選擇；ALL_REGIONS = 已選「全部」；其餘字串 = 指定地區 ID
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [previewPhoto, setPreviewPhoto] = useState<DrivePhoto | null>(null);
  // 頂部餐廳下拉選單
  const [restaurantPickerOpen, setRestaurantPickerOpen] = useState(false);
  const [selectedRestaurant, setSelectedRestaurant] = useState<string | null>(
    null
  );
  // 從 URL query string 讀取 ?restaurant= 並自動套用篩選
  const searchString = useSearch();
  // 從 URL 讀取初始參數（僅首次掛載時執行）
  const initParamsRef = useRef<{ restaurant?: string; regionName?: string } | null>(null);
  if (initParamsRef.current === null) {
    const params = new URLSearchParams(searchString);
    const r = params.get("restaurant");
    const rn = params.get("region");
    initParamsRef.current = {
      restaurant: r ? decodeURIComponent(r) : undefined,
      regionName: rn ? decodeURIComponent(rn) : undefined,
    };
  }
  // 環境多選篩選（值為環境名稱；室內以 INDOOR_ENV 表示）。空 = 全部不過濾
  const [selectedEnvironments, setSelectedEnvironments] = useState<string[]>(
    []
  );
  // 子地區篩選；null = 全部（不過濾），其餘為子地區名稱
  const [selectedSubRegion, setSelectedSubRegion] = useState<string | null>(
    null
  );
  // 分頁：目前已載入的頁數（offset = page * PAGE_SIZE）
  const [loadedPages, setLoadedPages] = useState(1);
  // 同步進度狀態（SSE 串流版本）
  const [syncProgress, setSyncProgress] = useState<{
    regionProgress: Array<{ name: string; photoCount: number }>;
    totalRegions: number;
    totalPhotos: number;
    completedRegions: number;
    isStreaming: boolean;
  } | null>(null);
  const [isSyncingPhotosSSE, setIsSyncingPhotosSSE] = useState(false);
  // 英文名編輯（僅登入者可用）；user / logout 供 admin 入口與登出使用
  const { isAuthenticated, user, logout } = useAuth();
  const [editingNameEn, setEditingNameEn] = useState(false);
  const [nameEnDraft, setNameEnDraft] = useState("");
  // 圖片特效：目前生成出的效果圖 url 與正在處理中的效果類型
  const [effectUrl, setEffectUrl] = useState<string | null>(null);
  const [pendingEffect, setPendingEffect] = useState<
    "rain" | "night" | "declutter" | null
  >(null);
  // 已套用（生成成功）的效果類型，用於按鈕高亮與下載檔名
  const [lastEffect, setLastEffect] = useState<
    "rain" | "night" | "declutter" | null
  >(null);

  const debouncer = useMemo(
    () =>
      createDebouncer((value: string) => setDebouncedSearchQuery(value), 300),
    []
  );

  // 取得地區列表
  const {
    data: regions = [],
    isLoading: regionsLoading,
  } = trpc.googleDrive.getRegions.useQuery();

  // 當 regions 載入後，如果 URL 有 region 參數，自動設定對應的 regionId
    const regionAppliedRef = useRef(false);
  const photosRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (regionAppliedRef.current) return;
    if (regions.length === 0) return;
    const { restaurant, regionName } = initParamsRef.current ?? {};
    if (restaurant) setSelectedRestaurant(restaurant);
    if (regionName) {
      const match = regions.find((r) => r.name === regionName);
      if (match) setSelectedRegionId(match.id);
    }
    regionAppliedRef.current = true;
    // 如果是從餐廳清單跳轉，稍後自動滾動到相片區域
    if (restaurant || regionName) {
      setTimeout(() => {
        photosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 600);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions]);

  // 總餐廳間數：各地區 restaurantCount 加總（同一間餐廳若跨地區會重複計數，
  // 但依資料以地區/餐廳分資料夾，同名跨區的情況極少，故直接加總）
  const totalRestaurantCount = regions.reduce(
    (s, r) => s + (r.restaurantCount ?? 0),
    0
  );

  // 取得餐廳名稱清單（給頂部下拉選單）
  // 若已選某個地區，只顯示該地區的餐廳；選「全部」或未選時顯示所有餐廳
  const restaurantRegionId =
    selectedRegionId && selectedRegionId !== ALL_REGIONS
      ? selectedRegionId
      : null;
  const { data: restaurants = [] } = trpc.googleDrive.getRestaurants.useQuery({
    regionId: restaurantRegionId,
    subRegion: selectedSubRegion ?? undefined,
  });

  // 全域唯一餐廳數（不受地區篩選影響，用於 header 統計）
  // 只用於統計數字，延後少少先載入，令相片同篩選器優先出現
  const [secondaryReady, setSecondaryReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSecondaryReady(true), 800);
    return () => clearTimeout(t);
  }, []);
  const { data: allRestaurants = [] } = trpc.googleDrive.getRestaurants.useQuery(
    { regionId: null },
    { enabled: secondaryReady }
  );

  // 取得目前（依地區）可選的環境清單，用來建環境多選 checkbox
  const { data: envData } = trpc.googleDrive.getEnvironments.useQuery({
    regionId: restaurantRegionId,
  });

  // 取得目前地區的子地區清單（含張數、餐廳間數）；僅在選定具體地區時查詢
  const { data: subRegions = [] } = trpc.googleDrive.getSubRegions.useQuery(
    { regionId: restaurantRegionId ?? "" },
    { enabled: !!restaurantRegionId }
  );

  // 取得 photo_cache 統計資訊（最後同步時間等）
  const { data: cacheStats } = trpc.googleDrive.getPhotoCacheStats.useQuery();

  // 分頁查詢：從 photo_cache 讀取（快速）
  // 每次 filters 改變時重置到第 1 頁
  const pagedQueryInput = useMemo(() => ({
    regionId: selectedRegionId === ALL_REGIONS ? null : selectedRegionId,
    subRegionName: selectedSubRegion ?? null,
    restaurantName: selectedRestaurant ?? null,
    search: selectedRestaurant ? null : (debouncedSearchQuery || null),
    environments: selectedEnvironments.length > 0 ? selectedEnvironments : undefined,
    limit: PAGE_SIZE,
    offset: 0,
  }), [selectedRegionId, selectedSubRegion, selectedRestaurant, debouncedSearchQuery, selectedEnvironments]);

  // 當篩選條件改變時，重置分頁
  useEffect(() => {
    setLoadedPages(1);
  }, [pagedQueryInput]);

  const showResults = selectedRegionId !== null || !!debouncedSearchQuery || selectedRestaurant !== null;

  // 分頁查詢：第一頁
  const {
    data: pagedData,
    isLoading: pagedLoading,
    isFetching: pagedFetching,
  } = trpc.googleDrive.getPhotosPaged.useQuery(
    pagedQueryInput,
    {
      enabled: showResults && (cacheStats?.totalPhotos ?? 0) > 0,
      placeholderData: (prev) => prev,
    }
  );

  // 額外頁面：逐頁查詢（最多 9 頁額外 = 10 頁共 300 張）
  const extraPage1 = trpc.googleDrive.getPhotosPaged.useQuery(
    { ...pagedQueryInput, offset: PAGE_SIZE },
    { enabled: showResults && loadedPages > 1 && (cacheStats?.totalPhotos ?? 0) > 0, placeholderData: (prev) => prev }
  );
  const extraPage2 = trpc.googleDrive.getPhotosPaged.useQuery(
    { ...pagedQueryInput, offset: 2 * PAGE_SIZE },
    { enabled: showResults && loadedPages > 2 && (cacheStats?.totalPhotos ?? 0) > 0, placeholderData: (prev) => prev }
  );
  const extraPage3 = trpc.googleDrive.getPhotosPaged.useQuery(
    { ...pagedQueryInput, offset: 3 * PAGE_SIZE },
    { enabled: showResults && loadedPages > 3 && (cacheStats?.totalPhotos ?? 0) > 0, placeholderData: (prev) => prev }
  );
  const extraPage4 = trpc.googleDrive.getPhotosPaged.useQuery(
    { ...pagedQueryInput, offset: 4 * PAGE_SIZE },
    { enabled: showResults && loadedPages > 4 && (cacheStats?.totalPhotos ?? 0) > 0, placeholderData: (prev) => prev }
  );
  const extraPage5 = trpc.googleDrive.getPhotosPaged.useQuery(
    { ...pagedQueryInput, offset: 5 * PAGE_SIZE },
    { enabled: showResults && loadedPages > 5 && (cacheStats?.totalPhotos ?? 0) > 0, placeholderData: (prev) => prev }
  );

  // 合併所有已載入頁面的相片
  const allLoadedPhotos = useMemo((): DrivePhoto[] => {
    const pages = [
      pagedData?.items,
      loadedPages > 1 ? extraPage1.data?.items : undefined,
      loadedPages > 2 ? extraPage2.data?.items : undefined,
      loadedPages > 3 ? extraPage3.data?.items : undefined,
      loadedPages > 4 ? extraPage4.data?.items : undefined,
      loadedPages > 5 ? extraPage5.data?.items : undefined,
    ];
    return pages
      .filter((p): p is NonNullable<typeof p> => p !== undefined)
      .flat()
      .map((p) => ({
        id: p.id,
        fileName: p.fileName,
        restaurantName: p.restaurantName,
        restaurantNameEn: p.restaurantNameEn ?? null,
        environment: p.environment ?? null,
        thumbnailUrl: p.thumbnailUrl,
        viewUrl: p.viewUrl,
        regionName: p.regionName,
        subRegion: p.subRegion ?? null,
      }));
  }, [pagedData, extraPage1.data, extraPage2.data, extraPage3.data, extraPage4.data, extraPage5.data, loadedPages]);

  const totalPhotos = pagedData?.total ?? 0;
  const hasMore = allLoadedPhotos.length < totalPhotos && loadedPages <= 5;
  const isLoadingMore = (loadedPages > 1 && (
    (loadedPages > 1 && extraPage1.isFetching) ||
    (loadedPages > 2 && extraPage2.isFetching) ||
    (loadedPages > 3 && extraPage3.isFetching) ||
    (loadedPages > 4 && extraPage4.isFetching) ||
    (loadedPages > 5 && extraPage5.isFetching)
  ));

  // 快取未同步時，降級使用直接 Drive 查詢
  const useFallbackDrive = showResults && (cacheStats?.totalPhotos ?? 0) === 0;
  const {
    data: fallbackPhotos = [],
    isLoading: fallbackLoading,
  } = trpc.googleDrive.getPhotos.useQuery(
    {
      regionId: selectedRegionId === ALL_REGIONS ? null : selectedRegionId,
      subRegion: selectedSubRegion ?? undefined,
      search: selectedRestaurant || debouncedSearchQuery || undefined,
      environments: selectedEnvironments.length > 0 ? selectedEnvironments : undefined,
    },
    {
      enabled: useFallbackDrive,
      placeholderData: (prev) => prev,
    }
  );

  // 決定顯示哪些相片
  const photos: DrivePhoto[] = useFallbackDrive ? fallbackPhotos : allLoadedPhotos;
  const previewIndex = previewPhoto ? photos.findIndex((p) => p.id === previewPhoto.id) : -1;
  const goPreview = (delta: number) => {
    const next = photos[previewIndex + delta];
    if (next) setPreviewPhoto(next);
  };
  const touchStartX = useRef<number | null>(null);
  const photosLoading = useFallbackDrive ? fallbackLoading : pagedLoading;

  const utils = trpc.useUtils();

  // SSE 同步：使用 EventSource 訂閱進度事件，每個地區完成即時更新
  const handleSyncPhotosSSE = useCallback(() => {
    if (isSyncingPhotosSSE) return;
    setIsSyncingPhotosSSE(true);
    setSyncProgress({ regionProgress: [], totalRegions: 0, totalPhotos: 0, completedRegions: 0, isStreaming: true });

    const es = new EventSource("/api/sync-photos-stream");

    es.addEventListener("start", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setSyncProgress((prev) => prev ? { ...prev, totalRegions: data.totalRegions } : prev);
    });

    es.addEventListener("region-done", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setSyncProgress((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          completedRegions: data.regionIndex,
          totalRegions: data.totalRegions,
          totalPhotos: data.totalPhotos,
          regionProgress: [
            ...prev.regionProgress,
            { name: data.regionName, photoCount: data.regionPhotoCount },
          ],
        };
      });
    });

    es.addEventListener("complete", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      es.close();
      setIsSyncingPhotosSSE(false);
      setSyncProgress((prev) => prev ? { ...prev, isStreaming: false } : prev);
      toast.success(`同步完成：${data.totalPhotos} 張相片，${data.totalRegions} 個地區`);
      utils.googleDrive.getPhotoCacheStats.invalidate();
      utils.googleDrive.getPhotosPaged.invalidate();
      utils.googleDrive.getRegions.invalidate();
      utils.googleDrive.getEnvironments.invalidate();
      utils.googleDrive.getRestaurants.invalidate();
      utils.googleDrive.getPhotos.invalidate();
      setLoadedPages(1);
    });

    es.addEventListener("error", (e) => {
      es.close();
      setIsSyncingPhotosSSE(false);
      setSyncProgress(null);
      const msg = (e as MessageEvent).data ? (JSON.parse((e as MessageEvent).data) as { error?: string })?.error : null;
      toast.error(msg || "同步失敗，請稍後再試");
    });
  }, [isSyncingPhotosSSE, utils]);

  // 保留 tRPC mutation 作為 fallback（測試用）
  const syncPhotosMutation = trpc.googleDrive.syncPhotos.useMutation({
    onMutate: () => { setSyncProgress(null); },
    onSuccess: (result) => {
      setSyncProgress({
        regionProgress: result.regionProgress,
        totalRegions: result.totalRegions,
        totalPhotos: result.totalPhotos,
        completedRegions: result.totalRegions,
        isStreaming: false,
      });
      if (result.success) {
        toast.success(`同步完成：${result.totalPhotos} 張相片，${result.totalRegions} 個地區`);
      } else {
        toast.error(`同步失敗：${result.error ?? "未知錯誤"}`);
      }
      utils.googleDrive.getPhotoCacheStats.invalidate();
      utils.googleDrive.getPhotosPaged.invalidate();
      utils.googleDrive.getRegions.invalidate();
      utils.googleDrive.getEnvironments.invalidate();
      utils.googleDrive.getRestaurants.invalidate();
      utils.googleDrive.getPhotos.invalidate();
      setLoadedPages(1);
    },
    onError: (error) => {
      setSyncProgress(null);
      toast.error(error.message || "同步失敗");
    },
  });

  // 手動覆寫餐廳英文名
  const setNameEnMutation = trpc.googleDrive.setRestaurantNameEn.useMutation({
    onSuccess: (_data, variables) => {
      const trimmed = variables.nameEn.trim();
      // 同步更新目前預覽中的英文名，免等重拓
      setPreviewPhoto((prev) =>
        prev ? { ...prev, restaurantNameEn: trimmed || null } : prev
      );
      setEditingNameEn(false);
      toast.success(trimmed ? "已更新英文名" : "已清除英文名（恢復自動翻譯）");
      // 讓相關查詢失效重拿，使清單與其他相片同步
      utils.googleDrive.getPhotos.invalidate();
      utils.googleDrive.getPhotosPaged.invalidate();
      utils.googleDrive.getRestaurants.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "更新失敗");
    },
  });

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      debouncer.call(value);
    },
    [debouncer]
  );

  useEffect(() => {
    return () => {
      debouncer.cancel();
    };
  }, [debouncer]);

  const handleSyncPhotos = useCallback(() => {
    handleSyncPhotosSSE();
  }, [handleSyncPhotosSSE]);

  // 預覽開啟時：Esc 關閉、←/→ 切換相片，並預載前後兩張
  useEffect(() => {
    if (!previewPhoto) return;
    const idx = photos.findIndex((p) => p.id === previewPhoto.id);
    for (const n of [photos[idx - 1], photos[idx + 1]]) {
      if (n) new Image().src = `/api/thumb/${n.id}?w=1280`;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewPhoto(null);
        setEditingNameEn(false);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
        const next = photos[idx + (e.key === "ArrowRight" ? 1 : -1)];
        if (next) setPreviewPhoto(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewPhoto, photos]);

  // 切換相片或關閉預覽時，重設特效狀態（避免殘留上一張的效果圖）
  useEffect(() => {
    setEffectUrl(null);
    setPendingEffect(null);
    setLastEffect(null);
  }, [previewPhoto?.id]);

  const EFFECT_LABELS: Record<"rain" | "night" | "declutter", string> = {
    rain: "落雨特效",
    night: "夜晚特效",
    declutter: "移除人物",
  };
  const pendingEffectLabel = lastEffect ? EFFECT_LABELS[lastEffect] : null;

  // 圖片特效：以原圖 AI 重繪成落雨／夜晚
  const applyEffectMutation = trpc.googleDrive.applyEffect.useMutation({
    onSuccess: (data) => {
      setEffectUrl(data.url);
      setLastEffect(data.effect);
      setPendingEffect(null);
    },
    onError: (error) => {
      setPendingEffect(null);
      toast.error(error.message || "特效生成失敗，請稍後再試");
    },
  });

  const handleApplyEffect = useCallback(
    (effect: "rain" | "night" | "declutter") => {
      if (!previewPhoto || applyEffectMutation.isPending) return;
      setPendingEffect(effect);
      // 用較高解析度的原圖作為重繪基礎
      applyEffectMutation.mutate({
        imageUrl: previewPhoto.thumbnailUrl.replace("w800", "w1600"),
        effect,
      });
    },
    [previewPhoto, applyEffectMutation]
  );

  // 選取餐廳：以正確名稱當作搜尋字並切到「全部」，立即定位該餐廳
  const handleSelectRestaurant = useCallback(
    (name: string) => {
      setSelectedRestaurant(name);
      setRestaurantPickerOpen(false);
      // 保留目前地區；若尚未選任何地區（null）才切到「全部」
      setSelectedRegionId((prev) => prev ?? ALL_REGIONS);
      setSearchQuery(name);
      setDebouncedSearchQuery(name);
      debouncer.cancel();
    },
    [debouncer]
  );

  // 清除餐廳選取
  const handleClearRestaurant = useCallback(() => {
    setSelectedRestaurant(null);
    setSearchQuery("");
    setDebouncedSearchQuery("");
    debouncer.cancel();
  }, [debouncer]);

  // 切換地區：同時清掉餐廳選取與搜尋，以免下拉清單與現有選取不一致
  const handleSelectRegion = useCallback(
    (regionId: string) => {
      setSelectedRegionId(regionId);
      setSelectedRestaurant(null);
      setSearchQuery("");
      setDebouncedSearchQuery("");
      setSelectedEnvironments([]);
      setSelectedSubRegion(null);
      debouncer.cancel();
    },
    [debouncer]
  );

  // 切換子地區：同時清掉餐廳選取、搜尋與環境勾選，令篩選回到乾淨狀態
  const handleSelectSubRegion = useCallback(
    (subRegion: string | null) => {
      setSelectedSubRegion(subRegion);
      setSelectedRestaurant(null);
      setSearchQuery("");
      setDebouncedSearchQuery("");
      setSelectedEnvironments([]);
      debouncer.cancel();
    },
    [debouncer]
  );

  // 勾選／取消勾選某個環境
  const toggleEnvironment = useCallback((env: string) => {
    setSelectedEnvironments((prev) =>
      prev.includes(env) ? prev.filter((e) => e !== env) : [...prev, env]
    );
  }, []);

  const selectedRegionName =
    selectedRegionId === ALL_REGIONS
      ? "全部地區"
      : regions.find((r) => r.id === selectedRegionId)?.name;

  // 下拉選單顯示的範圍名稱：揀咗子地區時用子地區名，否則用地區名
  const scopeLabel = computeScopeLabel(selectedSubRegion, selectedRegionName);

  // 是否有任何篩選條件（地區／子地區／環境／搜尋／餐廳選取）
  const hasActiveFilters =
    selectedRegionId !== null ||
    selectedSubRegion !== null ||
    selectedEnvironments.length > 0 ||
    !!debouncedSearchQuery ||
    !!searchQuery ||
    selectedRestaurant !== null;

  // 一鍵清除所有篩選，回到初始狀態
  const handleClearFilters = useCallback(() => {
    setSelectedRegionId(null);
    setSelectedSubRegion(null);
    setSelectedEnvironments([]);
    setSelectedRestaurant(null);
    setSearchQuery("");
    setDebouncedSearchQuery("");
    debouncer.cancel();
  }, [debouncer]);

  const isSyncingPhotos = isSyncingPhotosSSE || syncPhotosMutation.isPending;

  // 最後同步時間格式化
  const lastSyncedText = useMemo(() => {
    if (!cacheStats?.lastSyncedAt) return null;
    const d = new Date(cacheStats.lastSyncedAt);
    return d.toLocaleString("zh-HK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }, [cacheStats?.lastSyncedAt]);

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      {/* Elegant Header */}
      <header className="lg:sticky top-0 z-40 border-b border-stone-200/80 bg-[#FAF8F5]/95 backdrop-blur-md">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-6 space-y-3 sm:space-y-5">
          {/* Title row */}
          <div className="flex items-start justify-between gap-4">
            <div>
              {/* 從餐廳清單跳轉時顯示返回按鈕 */}
              {initParamsRef.current?.restaurant && (
                <Link href="/restaurants">
                  <button className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800 mb-2 transition-colors">
                    <ArrowLeft size={13} />
                    <span>返回餐廳清單</span>
                  </button>
                </Link>
              )}
              <h1 className="font-display text-xl sm:text-3xl font-bold text-stone-900 tracking-tight">
                餐廳相片 <span className="text-primary">Dashboard</span>
              </h1>
              <p className="text-[11px] sm:text-sm text-stone-500 mt-0.5 sm:mt-1 tracking-wide">
                {cacheStats && cacheStats.totalPhotos > 0 ? (
                  <>
                    快取 {cacheStats.totalPhotos} 張 · {cacheStats.totalRegions} 個地區 · {cacheStats.totalRestaurants} 間餐廳
                    {lastSyncedText && <span className="ml-2 opacity-60">（{lastSyncedText} 同步）</span>}
                  </>
                ) : (
                  <>
                    由 Google Drive 同步 · {regions.reduce((s, r) => s + r.photoCount, 0)} 張相片 · {totalRestaurantCount} 個地點 · {allRestaurants.length > 0 ? allRestaurants.length : "..."}  間餐廳
                  </>
                )}
              </p>
            </div>
            <div className="sm:hidden shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-10 w-10 rounded-full border-stone-300" aria-label="選單">
                    {isSyncingPhotos ? <Loader2 size={18} className="animate-spin" /> : <Menu size={18} />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link href="/restaurants"><MapPin size={15} className="mr-2" />餐廳清單</Link>
                  </DropdownMenuItem>
                  {user?.role === "admin" && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin/users"><Users size={15} className="mr-2" />使用者審批</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => handleSyncPhotos()} disabled={isSyncingPhotos}>
                    <Database size={15} className="mr-2" />{isSyncingPhotos ? "同步中…" : "同步快取"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => handleClearFilters()} disabled={!hasActiveFilters}>
                    <FilterX size={15} className="mr-2" />清除篩選
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => logout()}>
                    <LogOut size={15} className="mr-2" />登出
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="hidden sm:flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <Link href="/restaurants">
                <Button
                  variant="outline"
                  className="border-stone-300 text-stone-700 hover:bg-stone-100 hover:border-stone-400 transition-all"
                  aria-label="餐廳清單"
                >
                  <MapPin size={16} className="mr-2" />
                  餐廳清單
                </Button>
              </Link>
              {user?.role === "admin" && (
                <Link href="/admin/users">
                  <Button
                    variant="outline"
                    className="border-stone-300 text-stone-700 hover:bg-stone-100 hover:border-stone-400 transition-all"
                    aria-label="使用者審批"
                  >
                    <Users size={16} className="mr-2" />
                    使用者審批
                  </Button>
                </Link>
              )}
              <Button
                onClick={() => logout()}
                variant="outline"
                className="border-stone-300 text-stone-700 hover:bg-stone-100 hover:border-stone-400 transition-all"
                aria-label="登出"
              >
                <LogOut size={16} className="mr-2" />
                登出
              </Button>
              <Button
                onClick={handleClearFilters}
                disabled={!hasActiveFilters}
                variant="outline"
                className="border-stone-300 text-stone-700 hover:bg-stone-100 hover:border-stone-400 transition-all disabled:opacity-40"
                aria-label="清除所有篩選"
              >
                <FilterX size={16} className="mr-2" />
                清除篩選
              </Button>
              {/* 同步快取（所有已批准用戶可用）*/}
              <Button
                onClick={handleSyncPhotos}
                disabled={isSyncingPhotos}
                variant="outline"
                className="border-orange-300 text-orange-700 hover:bg-orange-50 hover:border-orange-400 transition-all"
                title={cacheStats?.lastSyncedAt ? `上次同步：${lastSyncedText}` : "同步 Google Drive 相片到資料庫"}
              >
                {isSyncingPhotos ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" />
                    同步中…
                  </>
                ) : (
                  <>
                    <Database size={16} className="mr-2" />
                    同步快取
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* 同步進度顯示（SSE 即時更新） */}
          {syncProgress && (
            <div className="mt-3 px-1">
              {/* 進度列 */}
              <div className="flex items-center gap-2 text-xs mb-1.5">
                {syncProgress.isStreaming ? (
                  <Loader2 size={12} className="animate-spin text-orange-500 shrink-0" />
                ) : (
                  <Database size={12} className="text-orange-600 shrink-0" />
                )}
                <span className={syncProgress.isStreaming ? "text-stone-500" : "text-orange-700"}>
                  {syncProgress.isStreaming
                    ? syncProgress.totalRegions > 0
                      ? `已處理 ${syncProgress.completedRegions} / ${syncProgress.totalRegions} 個地區，${syncProgress.totalPhotos} 張相片…`
                      : "正在連線 Google Drive…"
                    : `同步完成 — ${syncProgress.totalRegions} 個地區，${syncProgress.totalPhotos} 張相片`
                  }
                </span>
                {!syncProgress.isStreaming && (
                  <button
                    onClick={() => setSyncProgress(null)}
                    className="ml-auto text-stone-400 hover:text-stone-600 transition-colors"
                    aria-label="關閉進度"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              {/* 進度條 */}
              <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-orange-400 rounded-full transition-all duration-500"
                  style={{
                    width: syncProgress.isStreaming && syncProgress.totalRegions > 0
                      ? `${Math.round((syncProgress.completedRegions / syncProgress.totalRegions) * 100)}%`
                      : syncProgress.isStreaming ? "5%" : "100%",
                  }}
                />
              </div>
              {/* 地區 tag（逐個出現） */}
              {syncProgress.regionProgress.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {syncProgress.regionProgress.map((r) => (
                    <span
                      key={r.name}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 border border-orange-200 rounded-full text-xs text-orange-700 animate-in fade-in duration-300"
                    >
                      {r.name}
                      <span className="text-orange-500 font-medium">{r.photoCount}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Search bar + 餐廳下拉選單 */}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="relative flex-1 max-w-xl">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"
                size={18}
              />
              <Input
                placeholder="輸入餐廳名稱進行搜尋..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-11 pr-4 h-11 bg-white border border-stone-200 rounded-full text-stone-900 placeholder:text-stone-400 focus:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/20 shadow-sm transition-all"
                aria-label="搜尋餐廳名稱"
              />
            </div>

            {/* 餐廳快速選取下拉選單（combobox）*/}
            <Popover
              open={restaurantPickerOpen}
              onOpenChange={setRestaurantPickerOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={restaurantPickerOpen}
                  className="h-11 w-full sm:w-64 justify-between bg-white border-stone-200 rounded-full text-stone-700 hover:bg-stone-50 hover:border-stone-400 shadow-sm font-normal"
                >
                  <span className="flex items-center gap-2 truncate">
                    <Utensils size={16} className="text-stone-400 shrink-0" />
                    <span className="truncate">
                      {selectedRestaurant ??
                        (restaurantRegionId
                          ? `${scopeLabel} 的餐廳...`
                          : "快速選取餐廳...")}
                    </span>
                  </span>
                  <ChevronsUpDown size={16} className="text-stone-400 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0"
                align="start"
              >
                <Command>
                  <CommandInput
                    placeholder={
                      restaurantRegionId
                        ? `搜尋 ${scopeLabel} 的餐廳...`
                        : "輸入餐廳名稱..."
                    }
                    className="h-10"
                  />
                  <CommandList>
                    <CommandEmpty>找不到餐廳</CommandEmpty>
                    <CommandGroup>
                      {restaurants.map((r) => (
                        <CommandItem
                          key={r.name}
                          value={`${r.name} ${r.nameEn ?? ""}`}
                          onSelect={() => handleSelectRestaurant(r.name)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4 shrink-0",
                              selectedRestaurant === r.name
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          />
                          <span className="flex flex-col min-w-0">
                            <span className="truncate">{r.name}</span>
                            {r.nameEn && (
                              <span className="text-xs text-stone-400 truncate">
                                {r.nameEn}
                              </span>
                            )}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {selectedRestaurant && (
              <Button
                variant="ghost"
                onClick={handleClearRestaurant}
                className="h-11 px-3 text-stone-500 hover:text-stone-800 hover:bg-stone-100 rounded-full"
                aria-label="清除餐廳選取"
              >
                <X size={16} className="mr-1" />
                清除
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main content — 左侧為相片区，右侧為地區欄 */}
      <main className="container mx-auto px-4 sm:px-6 py-5 sm:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4 lg:gap-10">
          {/* 主要內容區（左）*/}
          <div className="min-w-0 lg:order-1 order-2" ref={photosRef}>
        {!showResults ? (
          <div className="text-center py-20 sm:py-32">
            {/* 快取未同步提示 */}
            {cacheStats?.totalPhotos === 0 && (
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 max-w-sm mx-auto">
                <p className="font-medium mb-1">相片快取尚未同步</p>
                <p className="text-xs opacity-80 mb-3">按「同步快取」按鈕將 Google Drive 相片同步到資料庫，以啟用快速分頁載入。</p>
                <Button
                  size="sm"
                  onClick={handleSyncPhotos}
                  disabled={isSyncingPhotos}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {isSyncingPhotos ? <Loader2 size={14} className="animate-spin mr-1" /> : <Database size={14} className="mr-1" />}
                  立即同步快取
                </Button>
              </div>
            )}
            <p className="text-stone-500 text-base sm:text-lg font-serif italic">
              請選擇一個地區，或輸入餐廳名稱開始瀏覽
            </p>
          </div>
        ) : photosLoading && photos.length === 0 ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="animate-spin text-stone-400" size={28} />
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-20 sm:py-32">
            <p className="text-stone-500 text-base sm:text-lg font-serif italic">
              {debouncedSearchQuery
                ? `未找到包含「${debouncedSearchQuery}」的餐廳`
                : "此地區暫無相片（快取尚未同步，請先按「同步快取」）"}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between mb-6">
              <p className="text-sm text-stone-500">
                {selectedRegionName && (
                  <span className="text-stone-900 font-medium">
                    {selectedRegionName}
                  </span>
                )}
                {selectedRegionName && debouncedSearchQuery && " · "}
                {debouncedSearchQuery && (
                  <span className="text-stone-700">
                    含「{debouncedSearchQuery}」
                  </span>
                )}
                {(selectedRegionName || debouncedSearchQuery) && " · "}
                <span>
                  {useFallbackDrive
                    ? `${photos.length} 張相片`
                    : `${allLoadedPhotos.length} / ${totalPhotos} 張相片`
                  }
                </span>
                {pagedFetching && !pagedLoading && (
                  <Loader2 size={12} className="inline-block animate-spin ml-2 text-stone-400" />
                )}
              </p>
            </div>
            <DrivePhotoGrid photos={photos} onPhotoClick={setPreviewPhoto} />

            {/* 載入更多按鈕 */}
            {!useFallbackDrive && hasMore && (
              <div className="flex justify-center mt-8">
                <Button
                  variant="outline"
                  onClick={() => setLoadedPages((p) => p + 1)}
                  disabled={isLoadingMore}
                  className="border-stone-300 text-stone-700 hover:bg-stone-100 hover:border-primary/50 px-8 rounded-full h-11"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 size={16} className="animate-spin mr-2" />
                      載入中…
                    </>
                  ) : (
                    <>
                      <ChevronDown size={16} className="mr-2" />
                      載入更多（還有 {totalPhotos - allLoadedPhotos.length} 張）
                    </>
                  )}
                </Button>
              </div>
            )}
            {/* 已載入全部 */}
            {!useFallbackDrive && !hasMore && totalPhotos > PAGE_SIZE && (
              <p className="text-center text-xs text-stone-400 mt-6">
                已顯示全部 {totalPhotos} 張相片
              </p>
            )}
          </>
        )}
          </div>

          {/* 地區欄（右）*/}
          <aside className="lg:order-2 order-1">
            <div className="lg:sticky lg:top-8 space-y-2 lg:space-y-3 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:pr-1 lg:pb-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-stone-500">
                <span className="h-px w-6 bg-stone-300" />
                地區
                <span className="h-px flex-1 bg-stone-200" />
              </div>
              {regionsLoading ? (
                <div className="flex items-center gap-2 text-sm text-stone-500">
                  <Loader2 size={14} className="animate-spin" />
                  載入地區中...
                </div>
              ) : regions.length === 0 ? (
                <div className="text-sm text-stone-500">
                  尚無資料，請按「手動刷新」載入 Google Drive 內容
                </div>
              ) : (
                <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1 lg:mx-0 lg:px-0 lg:pb-0 lg:grid lg:grid-cols-2 lg:gap-3 lg:overflow-visible">
                  {/* "All" button */}
                  <button
                    onClick={() => handleSelectRegion(ALL_REGIONS)}
                    className={`shrink-0 min-w-[5.5rem] px-3 py-2 lg:px-0 lg:py-0 lg:aspect-square flex flex-col items-center justify-center rounded-xl border transition-all duration-200 active:scale-[0.97] ${
                      selectedRegionId === ALL_REGIONS
                        ? "bg-primary text-primary-foreground border-primary shadow-md"
                        : "bg-white text-stone-700 border-stone-200 hover:border-stone-400 hover:shadow-sm"
                    }`}
                    style={{ transform: "translateZ(0)" }}
                  >
                    <span className="text-base sm:text-lg font-display font-bold">全部</span>
                    <span className="text-[10px] mt-1 opacity-70">
                      {regions.reduce((s, r) => s + r.photoCount, 0)} 張 ·{" "}
                      {totalRestaurantCount} 間
                    </span>
                  </button>
                  {regions.map((region) => {
                    const isActive = selectedRegionId === region.id;
                    return (
                      <button
                        key={region.id}
                        onClick={() => handleSelectRegion(region.id)}
                        className={`shrink-0 min-w-[5.5rem] px-3 py-2 lg:px-0 lg:py-0 lg:aspect-square flex flex-col items-center justify-center rounded-xl border transition-all duration-200 active:scale-[0.97] ${
                          isActive
                            ? "bg-primary text-primary-foreground border-primary shadow-md"
                            : "bg-white text-stone-700 border-stone-200 hover:border-stone-400 hover:shadow-sm"
                        }`}
                      >
                        <MapPin
                          size={16}
                          className={isActive ? "text-white" : "text-primary/60"}
                        />
                        <span className="text-xs sm:text-sm font-medium mt-1.5 tracking-tight">
                          {region.name}
                        </span>
                        <span className="text-[10px] mt-0.5 opacity-70">
                          {region.photoCount} 張 · {region.restaurantCount} 間
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 子地區篩選（僅當前地區有子地區時顯示） */}
              {restaurantRegionId && subRegions.length > 0 && (
                <div className="pt-2 space-y-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-stone-500">
                    <span className="h-px w-6 bg-stone-300" />
                    子地區
                    <span className="h-px flex-1 bg-stone-200" />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {/* 全部子地區 */}
                    <button
                      onClick={() => handleSelectSubRegion(null)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md border transition-all duration-200 active:scale-[0.97] ${
                        selectedSubRegion === null
                          ? "bg-stone-900 text-white border-stone-900"
                          : "bg-white text-stone-600 border-stone-200 hover:border-stone-300"
                      }`}
                    >
                      <span className="text-xs font-medium">全部</span>
                    </button>
                    {subRegions.map((sub: { name: string; photoCount: number; restaurantCount: number }) => {
                      const active = selectedSubRegion === sub.name;
                      return (
                        <button
                          key={sub.name}
                          onClick={() =>
                            handleSelectSubRegion(active ? null : sub.name)
                          }
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all duration-200 active:scale-[0.97] ${
                            active
                              ? "bg-stone-900 text-white border-stone-900"
                              : "bg-white text-stone-600 border-stone-200 hover:border-stone-300"
                          }`}
                        >
                          <span className="text-xs font-medium">
                            {sub.name}
                          </span>
                          <span className="text-[10px] opacity-70">
                            {sub.photoCount}·{sub.restaurantCount}間
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 環境多選篩選 */}
              {((envData?.environments?.length ?? 0) > 0 ||
                envData?.hasIndoor) && (
                <div className="pt-2 space-y-3">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-stone-500">
                    <span className="h-px w-6 bg-stone-300" />
                    環境
                    <span className="h-px flex-1 bg-stone-200" />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(envData?.environments ?? []).map((env) => {
                      const checked = selectedEnvironments.includes(env);
                      const style = getEnvStyle(env);
                      const Icon = ENV_ICONS[style.icon];
                      return (
                        <label
                          key={env}
                          className={`flex items-center gap-2 px-2 py-1 rounded-md border cursor-pointer transition-all duration-200 select-none ${
                            checked
                              ? style.selected
                              : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleEnvironment(env)}
                            className="h-3.5 w-3.5"
                          />
                          <span className="text-xs flex items-center gap-1">
                            <Icon size={12} className={style.iconClass} />
                            {formatEnvironment(env)}
                          </span>
                        </label>
                      );
                    })}
                    {envData?.hasIndoor && (
                      <label
                        className={`flex items-center gap-2 px-2 py-1 rounded-md border cursor-pointer transition-all duration-200 select-none ${
                          selectedEnvironments.includes(INDOOR_ENV)
                            ? "bg-amber-50 border-amber-300 text-amber-900"
                            : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
                        }`}
                      >
                        <Checkbox
                          checked={selectedEnvironments.includes(INDOOR_ENV)}
                          onCheckedChange={() => toggleEnvironment(INDOOR_ENV)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="text-xs flex items-center gap-1">
                          <Home size={12} className="opacity-70" />
                          置於室內之餐廳
                        </span>
                      </label>
                    )}
                  </div>
                  {selectedEnvironments.length > 0 && (
                    <button
                      onClick={() => setSelectedEnvironments([])}
                      className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
                    >
                      清除環境篩選
                    </button>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>

      {/* Photo Preview Modal */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-0 sm:p-8 animate-in fade-in duration-200"
          onClick={() => {
            setPreviewPhoto(null);
            setEditingNameEn(false);
          }}
        >
          <button
            onClick={() => {
              setPreviewPhoto(null);
              setEditingNameEn(false);
            }}
            className="fixed top-3 right-3 z-[60] p-2.5 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-sm transition-colors"
            aria-label="關閉預覽"
          >
            <X size={18} />
          </button>
          <div
            className="relative max-w-4xl w-full h-full sm:h-auto max-h-full sm:max-h-[92vh] bg-white sm:rounded-2xl overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="relative bg-neutral-950 flex items-center justify-center min-h-[45vh] max-h-[62vh] sm:max-h-[72vh] touch-pan-y"
              onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                if (touchStartX.current === null) return;
                const dx = e.changedTouches[0].clientX - touchStartX.current;
                touchStartX.current = null;
                if (Math.abs(dx) > 50) goPreview(dx < 0 ? 1 : -1);
              }}
            >
              <OptimizedImage
                key={`${previewPhoto.id}-${effectUrl ?? "orig"}`}
                src={effectUrl ?? `/api/thumb/${previewPhoto.id}?w=1280`}
                alt={previewPhoto.restaurantName}
                center
                className="max-w-full max-h-[62vh] sm:max-h-[72vh] object-contain mx-auto"
              />
              {previewIndex > 0 && (
                <button
                  aria-label="上一張"
                  onClick={(e) => { e.stopPropagation(); goPreview(-1); }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/40 p-2.5 text-white backdrop-blur transition-colors hover:bg-black/65"
                >
                  <ChevronLeft size={22} />
                </button>
              )}
              {previewIndex >= 0 && previewIndex < photos.length - 1 && (
                <button
                  aria-label="下一張"
                  onClick={(e) => { e.stopPropagation(); goPreview(1); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/40 p-2.5 text-white backdrop-blur transition-colors hover:bg-black/65"
                >
                  <ChevronRight size={22} />
                </button>
              )}
              {previewIndex >= 0 && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 rounded-full bg-black/55 px-3 py-1 text-xs text-white backdrop-blur">
                  {previewIndex + 1} / {photos.length}
                </div>
              )}
              {applyEffectMutation.isPending && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 backdrop-blur-sm text-white">
                  <Loader2 size={28} className="animate-spin" />
                  <p className="text-sm font-medium">正在{pendingEffect === "declutter" ? "移除人物" : `生成${pendingEffect === "rain" ? "落雨" : "夜晚"}效果`}…</p>
                  <p className="text-xs text-white/70">約需 5–20 秒，請稍候</p>
                </div>
              )}
            </div>
            {/* 圖片特效 section */}
            <div className="px-4 sm:px-6 pt-3 border-t border-stone-100">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-stone-500">
                  <Sparkles size={13} /> 特效：
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-8 gap-1.5 bg-white ${effectUrl && lastEffect === "rain" ? "border-cyan-400 text-cyan-700" : ""}`}
                  disabled={applyEffectMutation.isPending}
                  onClick={() => handleApplyEffect("rain")}
                >
                  <CloudRain size={14} className="text-cyan-600" /> 落雨
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-8 gap-1.5 bg-white ${effectUrl && lastEffect === "night" ? "border-indigo-400 text-indigo-700" : ""}`}
                  disabled={applyEffectMutation.isPending}
                  onClick={() => handleApplyEffect("night")}
                >
                  <Moon size={14} className="text-indigo-500" /> 夜晚
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-8 gap-1.5 bg-white ${effectUrl && lastEffect === "declutter" ? "border-emerald-400 text-emerald-700" : ""}`}
                  disabled={applyEffectMutation.isPending}
                  onClick={() => handleApplyEffect("declutter")}
                >
                  <UserX size={14} className="text-emerald-600" /> 移除人物
                </Button>
                {effectUrl && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-stone-500"
                      onClick={() => {
                        setEffectUrl(null);
                        setLastEffect(null);
                      }}
                    >
                      還原
                    </Button>
                    <a
                      href={effectUrl}
                      download={`${previewPhoto.restaurantName}-${lastEffect}.png`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-stone-600 hover:text-stone-900 transition-colors"
                    >
                      <Download size={14} /> 下載
                    </a>
                  </>
                )}
              </div>
            </div>
            <div className="p-4 sm:p-6 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
                  {previewPhoto.restaurantName}
                </h2>
                {editingNameEn ? (
                  <div className="mt-1 flex items-center gap-1.5">
                    <Input
                      autoFocus
                      value={nameEnDraft}
                      onChange={(e) => setNameEnDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setNameEnMutation.mutate({
                            nameZh: previewPhoto.restaurantName,
                            nameEn: nameEnDraft,
                          });
                        } else if (e.key === "Escape") {
                          setEditingNameEn(false);
                        }
                      }}
                      placeholder="輸入英文名（留空可恢復自動翻譯）"
                      className="h-8 text-sm max-w-[16rem]"
                    />
                    <Button
                      size="sm"
                      className="h-8 px-2"
                      disabled={setNameEnMutation.isPending}
                      onClick={() =>
                        setNameEnMutation.mutate({
                          nameZh: previewPhoto.restaurantName,
                          nameEn: nameEnDraft,
                        })
                      }
                    >
                      {setNameEnMutation.isPending ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        "儲存"
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-stone-500"
                      onClick={() => setEditingNameEn(false)}
                    >
                      取消
                    </Button>
                  </div>
                ) : (
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <p className="text-sm text-stone-400">
                      {previewPhoto.restaurantNameEn || (
                        <span className="italic text-stone-300">尚未設定英文名</span>
                      )}
                    </p>
                    {isAuthenticated && (
                      <button
                        type="button"
                        onClick={() => {
                          setNameEnDraft(previewPhoto.restaurantNameEn ?? "");
                          setEditingNameEn(true);
                        }}
                        className="text-stone-400 hover:text-stone-700 transition-colors"
                        title="編輯英文名"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {previewPhoto.regionName && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                      <MapPin size={12} className="shrink-0" />
                      {previewPhoto.regionName}
                    </span>
                  )}
                  {previewPhoto.environment && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${getEnvStyle(previewPhoto.environment).badge}`}
                    >
                      {(() => {
                        const Icon =
                          ENV_ICONS[getEnvStyle(previewPhoto.environment).icon];
                        return (
                          <Icon
                            size={12}
                            className={`shrink-0 ${getEnvStyle(previewPhoto.environment).iconClass}`}
                          />
                        );
                      })()}
                      {formatEnvironment(previewPhoto.environment)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-500 mt-1">
                  {previewPhoto.fileName}
                </p>
              </div>
              <a
                href={previewPhoto.viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900 transition-colors"
              >
                <ExternalLink size={14} />
                在 Drive 開啟
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
