import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MapView } from "@/components/Map";
import { Link } from "wouter";
import {
  MapPin,
  Navigation,
  Search,
  RefreshCw,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Map as MapIcon,
  List,
  ExternalLink,
  Images,
  ShoppingBag,
  X,
  Trash2,
  Pencil,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// ─── Types ───────────────────────────────────────────────────────────────────

type RestaurantLocation = {
  id: number | null;
  nameZh: string;
  nameEn?: string | null;
  address?: string | null;
  lat?: string | null;
  lng?: string | null;
  region?: string | null;
  subRegion?: string | null;
  isVerified: number;
  aiNote?: string | null;
};

type UserCoords = { lat: number; lng: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Delivery List (localStorage) ───────────────────────────────────────────

const DELIVERY_LIST_KEY = "delivery-list-v1";

type DeliveryItem = {
  nameZh: string;
  address?: string | null;
  lat?: string | null;
  lng?: string | null;
  region?: string | null;
};

function loadDeliveryList(): DeliveryItem[] {
  try {
    const raw = localStorage.getItem(DELIVERY_LIST_KEY);
    return raw ? (JSON.parse(raw) as DeliveryItem[]) : [];
  } catch {
    return [];
  }
}

function saveDeliveryList(list: DeliveryItem[]) {
  localStorage.setItem(DELIVERY_LIST_KEY, JSON.stringify(list));
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RestaurantList() {
  const [view, setView] = useState<"list" | "map">("list");
  const [deliveryList, setDeliveryList] = useState<DeliveryItem[]>(() => loadDeliveryList());
  const [deliveryOpen, setDeliveryOpen] = useState(false);

  // 同步 deliveryList 到 localStorage
  useEffect(() => {
    saveDeliveryList(deliveryList);
  }, [deliveryList]);

  const addToDelivery = useCallback((r: RestaurantLocation) => {
    setDeliveryList((prev) => {
      if (prev.some((d) => d.nameZh === r.nameZh)) {
        toast.info(`「${r.nameZh}」已在待送清單`);
        return prev;
      }
      toast.success(`已加入「${r.nameZh}」`);
      return [...prev, { nameZh: r.nameZh, address: r.address, lat: r.lat, lng: r.lng, region: r.region }];
    });
  }, []);

  const removeFromDelivery = useCallback((nameZh: string) => {
    setDeliveryList((prev) => prev.filter((d) => d.nameZh !== nameZh));
  }, []);

  const clearDelivery = useCallback(() => {
    setDeliveryList([]);
    toast.success("已清空待送清單");
  }, []);
  const [search, setSearch] = useState("");
  const [userCoords, setUserCoords] = useState<UserCoords | null>(null);
  const [locating, setLocating] = useState(false);
  const [batchFetching, setBatchFetching] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  // ── Data ──────────────────────────────────────────────────────────────────
  const {
    data: locations = [],
    isLoading,
    refetch,
  } = trpc.restaurantLocations.listLocations.useQuery();

  const fetchAddressMutation =
    trpc.restaurantLocations.fetchAddress.useMutation();
  const batchFetchMutation =
    trpc.restaurantLocations.batchFetchAddresses.useMutation();
  const upsertMutation = trpc.restaurantLocations.upsertLocation.useMutation({
    onSuccess: () => {
      toast.success("已儲存更改");
      refetch();
      setEditTarget(null);
    },
    onError: (e) => toast.error("儲存失敗：" + e.message),
  });

  // 編輯地址 Dialog state
  const [editTarget, setEditTarget] = useState<RestaurantLocation | null>(null);
  const [editAddress, setEditAddress] = useState("");
  const [editLat, setEditLat] = useState("");
  const [editLng, setEditLng] = useState("");

  const openEdit = useCallback((r: RestaurantLocation) => {
    setEditTarget(r);
    setEditAddress(r.address ?? "");
    setEditLat(r.lat ?? "");
    setEditLng(r.lng ?? "");
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editTarget) return;
    upsertMutation.mutate({
      nameZh: editTarget.nameZh,
      nameEn: editTarget.nameEn ?? undefined,
      address: editAddress.trim() || undefined,
      lat: editLat.trim() || undefined,
      lng: editLng.trim() || undefined,
      region: editTarget.region ?? undefined,
      subRegion: editTarget.subRegion ?? undefined,
      isVerified: editTarget.isVerified,
    });
  }, [editTarget, editAddress, editLat, editLng, upsertMutation]);

  // ── GPS ───────────────────────────────────────────────────────────────────
  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("你的瀏覽器不支援 GPS 定位");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        toast.success("已取得你的位置，正在按距離排列…");
      },
      () => {
        setLocating(false);
        toast.error("無法取得位置，請允許瀏覽器存取 GPS");
      },
      { timeout: 10000 }
    );
  }, []);

  // ── Filtered + sorted list ────────────────────────────────────────────────
  const filteredLocations = useMemo(() => {
    let list = locations as RestaurantLocation[];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.nameZh.toLowerCase().includes(q) ||
          (r.nameEn ?? "").toLowerCase().includes(q) ||
          (r.address ?? "").toLowerCase().includes(q)
      );
    }

    if (userCoords) {
      list = [...list].sort((a, b) => {
        const aHasGps = a.lat && a.lng;
        const bHasGps = b.lat && b.lng;
        if (!aHasGps && !bHasGps) return 0;
        if (!aHasGps) return 1;
        if (!bHasGps) return -1;
        const da = haversineKm(
          userCoords.lat,
          userCoords.lng,
          parseFloat(a.lat!),
          parseFloat(a.lng!)
        );
        const db = haversineKm(
          userCoords.lat,
          userCoords.lng,
          parseFloat(b.lat!),
          parseFloat(b.lng!)
        );
        return da - db;
      });
    }

    return list;
  }, [locations, search, userCoords]);

  const withGps = useMemo(
    () => filteredLocations.filter((r) => r.lat && r.lng),
    [filteredLocations]
  );
  const withoutAddress = useMemo(
    () =>
      (locations as RestaurantLocation[]).filter((r) => !r.address),
    [locations]
  );

  // ── Map markers ───────────────────────────────────────────────────────────
  const updateMarkers = useCallback(
    (map: google.maps.Map) => {
      markersRef.current.forEach((m) => (m.map = null));
      markersRef.current = [];

      withGps.forEach((r) => {
        const lat = parseFloat(r.lat!);
        const lng = parseFloat(r.lng!);
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat, lng },
          title: r.nameZh,
        });

        const infoWindow = new google.maps.InfoWindow({
          content: `<div style="font-family:sans-serif;max-width:200px">
            <strong>${r.nameZh}</strong>
            ${r.nameEn ? `<br/><span style="color:#666;font-size:12px">${r.nameEn}</span>` : ""}
            ${r.address ? `<br/><span style="font-size:12px">${r.address}</span>` : ""}
            <br/><a href="https://maps.google.com/?q=${lat},${lng}" target="_blank" style="font-size:12px;color:#1a73e8">導航</a>
          </div>`,
        });

        marker.addListener("click", () => {
          infoWindow.open(map, marker);
        });

        markersRef.current.push(marker);
      });

      // 使用者位置標記
      if (userCoords) {
        new google.maps.marker.AdvancedMarkerElement({
          map,
          position: userCoords,
          title: "你的位置",
        });
      }
    },
    [withGps, userCoords]
  );

  useEffect(() => {
    if (mapRef.current) {
      updateMarkers(mapRef.current);
    }
  }, [updateMarkers]);

  // ── Batch fetch ───────────────────────────────────────────────────────────
  const handleBatchFetch = useCallback(async () => {
    if (withoutAddress.length === 0) {
      toast.info("所有餐廳已有地址");
      return;
    }
    setBatchFetching(true);
    setBatchProgress({ done: 0, total: withoutAddress.length });

    const CHUNK = 10;
    let done = 0;
    for (let i = 0; i < withoutAddress.length; i += CHUNK) {
      const chunk = withoutAddress.slice(i, i + CHUNK).map((r) => ({
        nameZh: r.nameZh,
        nameEn: r.nameEn ?? undefined,
        region: r.region ?? undefined,
        subRegion: r.subRegion ?? undefined,
      }));
      try {
        const res = await batchFetchMutation.mutateAsync({
          restaurants: chunk,
          skipExisting: true,
        });
        done += res.succeeded;
        setBatchProgress({ done, total: withoutAddress.length });
      } catch (e) {
        console.warn("batch chunk failed", e);
      }
    }

    setBatchFetching(false);
    setBatchProgress(null);
    await refetch();
    toast.success(`已完成 AI 搜尋，成功取得 ${done} 間餐廳地址`);
  }, [withoutAddress, batchFetchMutation, refetch]);

  // ── Single fetch ──────────────────────────────────────────────────────────
  const handleFetchSingle = useCallback(
    async (r: RestaurantLocation) => {
      try {
        await fetchAddressMutation.mutateAsync({
          nameZh: r.nameZh,
          nameEn: r.nameEn ?? undefined,
          region: r.region ?? undefined,
          subRegion: r.subRegion ?? undefined,
        });
        await refetch();
        toast.success(`已取得「${r.nameZh}」的地址`);
      } catch (e) {
        toast.error(`搜尋「${r.nameZh}」失敗`);
      }
    },
    [fetchAddressMutation, refetch]
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-stone-200 px-3 py-2.5 flex items-center gap-2">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="gap-1 text-stone-600 px-2">
            <ArrowLeft size={15} /> <span className="hidden sm:inline">返回</span>
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-stone-800 text-sm leading-tight">餐廳清單</h1>
          <p className="text-[11px] text-stone-400 whitespace-nowrap overflow-hidden text-ellipsis">
            {locations.length}間 · {withGps.length} GPS · {(locations as RestaurantLocation[]).filter((r) => r.address).length}地址
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* 待送清單按鈕 */}
          <Sheet open={deliveryOpen} onOpenChange={setDeliveryOpen}>
            <SheetTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5 relative">
                <ShoppingBag size={14} />
                待送
                {deliveryList.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                    {deliveryList.length}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:w-[380px] flex flex-col">
              <SheetHeader className="pb-2">
                <SheetTitle className="flex items-center gap-2">
                  <ShoppingBag size={16} /> 待送清單
                  <span className="text-sm font-normal text-stone-500">（{deliveryList.length} 間）</span>
                </SheetTitle>
              </SheetHeader>
              {deliveryList.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-stone-400 gap-2">
                  <ShoppingBag size={36} className="opacity-30" />
                  <p className="text-sm">清單為空，從餐廳清單加入</p>
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto space-y-2 py-2">
                    {deliveryList.map((d, i) => (
                      <div key={d.nameZh} className="bg-stone-50 rounded-lg border border-stone-200 px-3 py-2.5 flex items-start gap-2">
                        <span className="text-xs text-stone-400 font-mono mt-0.5 w-4 shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-stone-800 text-sm">{d.nameZh}</p>
                          {d.address && (
                            <p className="text-xs text-stone-500 mt-0.5 flex items-start gap-1">
                              <MapPin size={11} className="mt-0.5 shrink-0" />
                              <span>{d.address}</span>
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                            {/* 睇相片 */}
                            <Link
                              href={`/dashboard?restaurant=${encodeURIComponent(d.nameZh)}${d.region ? `&region=${encodeURIComponent(d.region)}` : ''}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900"
                              onClick={() => setDeliveryOpen(false)}
                            >
                              <Images size={11} /> 睇相片
                            </Link>
                            {/* 導航 */}
                            {(d.lat && d.lng) ? (
                              <a
                                href={`https://maps.google.com/?q=${d.lat},${d.lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                              >
                                <ExternalLink size={11} /> 導航
                              </a>
                            ) : d.address ? (
                              <a
                                href={`https://maps.google.com/?q=${encodeURIComponent(d.address)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                              >
                                <ExternalLink size={11} /> 導航
                              </a>
                            ) : null}
                          </div>
                        </div>
                        <button
                          onClick={() => removeFromDelivery(d.nameZh)}
                          className="text-stone-400 hover:text-red-500 transition-colors shrink-0 mt-0.5"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="pt-3 border-t border-stone-200">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
                      onClick={clearDelivery}
                    >
                      <Trash2 size={14} /> 清空全部
                    </Button>
                  </div>
                </>
              )}
            </SheetContent>
          </Sheet>
          {/* GPS 定位 */}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={handleLocate}
            disabled={locating}
          >
            {locating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Navigation size={14} className={userCoords ? "text-emerald-600" : ""} />
            )}
            {userCoords ? "已定位" : "GPS 定位"}
          </Button>
          {/* 切換視圖 */}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setView(view === "list" ? "map" : "list")}
          >
            {view === "list" ? (
              <><MapIcon size={14} /> 地圖</>
            ) : (
              <><List size={14} /> 清單</>
            )}
          </Button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="px-4 py-3 flex flex-wrap items-center gap-2 bg-white border-b border-stone-100">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="搜尋餐廳名、地址…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {withoutAddress.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100"
            onClick={handleBatchFetch}
            disabled={batchFetching}
          >
            {batchFetching ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {batchProgress
                  ? `${batchProgress.done}/${batchProgress.total}`
                  : "搜尋中…"}
              </>
            ) : (
              <>
                <RefreshCw size={14} />
                AI 批次搜尋 ({withoutAddress.length} 間缺地址)
              </>
            )}
          </Button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-stone-400" />
        </div>
      ) : view === "map" ? (
        /* Map View */
        <div className="h-[calc(100vh-120px)]">
          <MapView
            initialCenter={{ lat: 22.2735, lng: 114.1501 }}
            initialZoom={13}
            onMapReady={(map) => {
              mapRef.current = map;
              updateMarkers(map);
            }}
          />
        </div>
      ) : (
        /* List View */
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-2">
          {filteredLocations.length === 0 ? (
            <div className="text-center py-16 text-stone-400">
              <MapPin size={32} className="mx-auto mb-2 opacity-40" />
              <p>未找到符合條件的餐廳</p>
            </div>
          ) : (
            filteredLocations.map((r, idx) => {
              const hasGps = !!(r.lat && r.lng);
              // 使用 nameZh 作為穩定唯一 React key（id 可能為 null）
              const distance =
                userCoords && hasGps
                  ? haversineKm(
                      userCoords.lat,
                      userCoords.lng,
                      parseFloat(r.lat!),
                      parseFloat(r.lng!)
                    )
                  : null;

              const inList = deliveryList.some((d) => d.nameZh === r.nameZh);
              const navHref = hasGps
                ? `https://maps.google.com/?q=${r.lat},${r.lng}`
                : r.address
                  ? `https://maps.google.com/?q=${encodeURIComponent(r.address)}`
                  : null;

              return (
                <div
                  key={r.nameZh}
                  className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70 transition-shadow hover:shadow-md"
                >
                  {/* 店名 + 距離 */}
                  <div className="flex items-start gap-3">
                    {userCoords && (
                      <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-xs text-stone-400">
                        {idx + 1}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <h2 className="text-[15px] font-semibold text-stone-900">{r.nameZh}</h2>
                        {r.isVerified === 1 && (
                          <CheckCircle2 size={14} className="shrink-0 text-emerald-500" aria-label="已核實" />
                        )}
                      </div>
                      {r.nameEn && <p className="text-xs text-stone-400">{r.nameEn}</p>}
                    </div>
                    {distance !== null && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                        {formatDistance(distance)}
                      </span>
                    )}
                  </div>

                  {/* 地區 + 地址 */}
                  <div className="mt-2 space-y-1.5">
                    {r.region && (
                      <Badge variant="secondary" className="h-5 rounded-full px-2 text-[11px] font-normal">
                        {r.subRegion ?? r.region}
                      </Badge>
                    )}
                    {r.address ? (
                      <p className="flex items-start gap-1.5 text-sm text-stone-600">
                        <MapPin size={14} className="mt-0.5 shrink-0 text-primary/70" />
                        <span>{r.address}</span>
                      </p>
                    ) : (
                      <button
                        className="flex items-center gap-1 text-xs text-amber-600 hover:underline"
                        onClick={() => handleFetchSingle(r)}
                        disabled={fetchAddressMutation.isPending}
                      >
                        <AlertCircle size={12} />
                        未有地址，點此 AI 搜尋
                      </button>
                    )}
                  </div>

                  {/* 操作列：導航為主要動作 */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {navHref ? (
                      <a
                        href={navHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                      >
                        <Navigation size={14} /> 導航
                      </a>
                    ) : (
                      <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-stone-100 px-4 text-sm text-stone-400">
                        <Navigation size={14} /> 導航
                      </span>
                    )}
                    <Link
                      href={`/dashboard?restaurant=${encodeURIComponent(r.nameZh)}${r.region ? `&region=${encodeURIComponent(r.region)}` : ''}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3.5 text-sm font-medium text-stone-700 transition-colors hover:border-primary/50 hover:text-primary"
                    >
                      <Images size={14} /> 睇相片
                    </Link>
                    <button
                      onClick={() => addToDelivery(r)}
                      disabled={inList}
                      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors ${
                        inList
                          ? "cursor-default border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-stone-200 bg-white text-stone-700 hover:border-primary/50 hover:text-primary"
                      }`}
                    >
                      {inList ? (
                        <><CheckCircle2 size={14} /> 已加入</>
                      ) : (
                        <><ShoppingBag size={14} /> 待送</>
                      )}
                    </button>
                    <button
                      onClick={() => openEdit(r)}
                      aria-label="編輯地址"
                      className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
                    >
                      <Pencil size={15} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 編輯地址 Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              編輯地址：{editTarget?.nameZh}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="edit-address">地址</Label>
              <Input
                id="edit-address"
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
                placeholder="例如：香港仔大道 123 號"
                disabled={upsertMutation.isPending}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-lat">緯度（Lat）</Label>
                <Input
                  id="edit-lat"
                  value={editLat}
                  onChange={(e) => setEditLat(e.target.value)}
                  placeholder="22.2735"
                  disabled={upsertMutation.isPending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-lng">經度（Lng）</Label>
                <Input
                  id="edit-lng"
                  value={editLng}
                  onChange={(e) => setEditLng(e.target.value)}
                  placeholder="114.1501"
                  disabled={upsertMutation.isPending}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2 border-t border-stone-100">
              <Button
                variant="outline"
                onClick={() => setEditTarget(null)}
                disabled={upsertMutation.isPending}
              >
                取消
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={upsertMutation.isPending}
                className="bg-stone-900 hover:bg-stone-800 text-white"
              >
                {upsertMutation.isPending ? (
                  <><Loader2 size={14} className="animate-spin mr-1" /> 儲存中…</>
                ) : (
                  "儲存"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
