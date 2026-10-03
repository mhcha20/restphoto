import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Eye, MapPin, CloudSun, Sun, Moon, Home, CloudRain } from "lucide-react";
import { OptimizedImage } from "@/components/OptimizedImage";
import { getEnvStyle } from "@/lib/envStyle";

const ENV_ICONS = { Sun, Moon, CloudRain, Home, CloudSun } as const;

// 環境字串顯示用映射（與 Dashboard 一致）：檔名「室內」＝餐廳內部環境
const ENV_LABELS: Record<string, string> = {
  室內: "餐廳室內環境",
};
function formatEnvironment(env: string): string {
  return ENV_LABELS[env] ?? env;
}

export interface DrivePhoto {
  id: string;
  fileName: string;
  restaurantName: string;
  restaurantNameEn?: string | null;
  environment?: string | null;
  thumbnailUrl: string;
  viewUrl: string;
  regionName?: string;
  subRegion?: string | null;
}

interface DrivePhotoGridProps {
  photos: DrivePhoto[];
  onPhotoClick: (photo: DrivePhoto) => void;
}

function DrivePhotoGridBase({ photos, onPhotoClick }: DrivePhotoGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
      {photos.map((photo) => {
        const envStyle = photo.environment ? getEnvStyle(photo.environment) : null;
        const EnvIcon = envStyle ? ENV_ICONS[envStyle.icon] : null;
        return (
          <Card
            key={photo.id}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPhotoClick(photo);
              }
            }}
            onClick={() => onPhotoClick(photo)}
            className="group gap-0 overflow-hidden rounded-2xl border-0 p-0 bg-white shadow-sm ring-1 ring-stone-200/70 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:ring-primary/40 active:scale-[0.99] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {/* 相片 */}
            <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
              <OptimizedImage
                src={`/api/thumb/${photo.id}?w=480`}
                alt={photo.restaurantName}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
              />
              {/* 環境標籤（疊喺相片左上） */}
              {photo.environment && envStyle && EnvIcon && (
                <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-stone-700 shadow-sm backdrop-blur">
                  <EnvIcon size={11} className={`shrink-0 ${envStyle.iconClass}`} />
                  <span className="truncate max-w-[7rem]">
                    {formatEnvironment(photo.environment)}
                  </span>
                </div>
              )}
              {/* 桌面 hover 提示 */}
              <div className="pointer-events-none absolute inset-0 hidden items-end justify-center bg-gradient-to-t from-black/50 via-transparent to-transparent pb-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100 sm:flex">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-stone-900 shadow">
                  <Eye size={14} /> 預覽
                </span>
              </div>
            </div>

            {/* 餐廳資料 */}
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <h3 className="truncate text-sm font-semibold tracking-tight text-stone-900 sm:text-[15px]">
                {photo.restaurantName}
              </h3>
              {photo.restaurantNameEn && (
                <p className="mt-0.5 truncate text-xs text-stone-400">
                  {photo.restaurantNameEn}
                </p>
              )}
              {(photo.regionName || photo.subRegion) && (
                <p className="mt-1.5 flex items-center gap-1 truncate text-[11px] text-stone-500">
                  <MapPin size={11} className="shrink-0 text-primary/70" />
                  <span className="truncate">
                    {[photo.regionName, photo.subRegion].filter(Boolean).join(" · ")}
                  </span>
                </p>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

const DrivePhotoGrid = memo(DrivePhotoGridBase);
export default DrivePhotoGrid;
