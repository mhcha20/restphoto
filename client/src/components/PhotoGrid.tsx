import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, Edit2, Eye } from "lucide-react";
import { Photo } from "@/types";
import { OptimizedImage } from "@/components/OptimizedImage";

interface PhotoGridProps {
  photos: Photo[];
  onPhotoClick: (photo: Photo) => void;
  onDeleteClick: (photoId: number) => void;
  onEditClick: (photo: Photo) => void;
}

function PhotoGridBase({
  photos,
  onPhotoClick,
  onDeleteClick,
  onEditClick,
}: PhotoGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {photos.map((photo) => (
        <Card
          key={photo.id}
          className="group overflow-hidden border-0 shadow-sm hover:shadow-lg transition-all duration-300 bg-white"
        >
          {/* Image Container */}
          <div className="relative h-64 bg-slate-100 overflow-hidden">
            <OptimizedImage
              src={photo.storageUrl}
              alt={photo.restaurantName}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
              <Button
                onClick={() => onPhotoClick(photo)}
                variant="secondary"
                size="sm"
                className="bg-white/90 hover:bg-white text-slate-900 flex items-center gap-2"
              >
                <Eye size={16} />
                預覽
              </Button>
            </div>
          </div>

          {/* Info Section */}
          <div className="p-4 space-y-3">
            {/* Restaurant Name */}
            <div>
              <h3 className="font-medium text-slate-900 truncate text-sm">
                {photo.restaurantName}
              </h3>
              {photo.cuisineType && (
                <p className="text-xs text-slate-500 truncate mt-1">
                  {photo.cuisineType}
                </p>
              )}
            </div>

            {/* Date */}
            <p className="text-xs text-slate-400">
              {new Date(photo.createdAt).toLocaleDateString("zh-HK", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <Button
                onClick={() => onEditClick(photo)}
                variant="ghost"
                size="sm"
                className="flex-1 text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              >
                <Edit2 size={16} />
              </Button>
              <Button
                onClick={() => onDeleteClick(photo.id)}
                variant="ghost"
                size="sm"
                className="flex-1 text-red-500 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 size={16} />
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

const PhotoGrid = memo(PhotoGridBase);
export default PhotoGrid;
