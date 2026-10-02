import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Eye, MapPin, CloudSun, Navigation, Sun, Moon, Home, CloudRain } from "lucide-react";
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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
      {photos.map((photo) => (
        <Card
          key={photo.id}
          className="group overflow-hidden border border-slate-200/80 shadow-sm hover:shadow-xl hover:border-slate-300 transition-all duration-300 bg-white cursor-pointer"
          onClick={() => onPhotoClick(photo)}
        >
          {/* Image Container */}
          <div className="relative aspect-square bg-slate-100 overflow-hidden">
            <OptimizedImage
              src={`/api/thumb/${photo.id}?w=480`}
              alt={photo.restaurantName}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-3">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/95 rounded-full text-xs font-medium text-slate-900 shadow-sm">
                <Eye size={14} />
                預覽
              </div>
            </div>
          </div>

          {/* Restaurant Name */}
          <div className="p-3 sm:p-4">
            <h3 className="font-medium text-slate-900 truncate text-sm tracking-tight">
              {photo.restaurantName}
            </h3>
            {photo.restaurantNameEn && (
              <p className="text-xs text-slate-400 truncate mt-0.5">
                {photo.restaurantNameEn}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {photo.regionName && (
                <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                  <MapPin size={11} className="shrink-0" />
                  <span className="truncate">{photo.regionName}</span>
                </div>
              )}
              {photo.subRegion && (
                <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                  <Navigation size={11} className="shrink-0" />
                  <span className="truncate">{photo.subRegion}</span>
                </div>
              )}
              {photo.environment &&
                (() => {
                  const style = getEnvStyle(photo.environment);
                  const Icon = ENV_ICONS[style.icon];
                  return (
                    <div
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${style.badge}`}
                    >
                      <Icon size={11} className={`shrink-0 ${style.iconClass}`} />
                      <span className="truncate">
                        {formatEnvironment(photo.environment)}
                      </span>
                    </div>
                  );
                })()}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

const DrivePhotoGrid = memo(DrivePhotoGridBase);
export default DrivePhotoGrid;
