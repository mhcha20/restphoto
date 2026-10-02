import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2, Edit2, X } from "lucide-react";
import { Photo } from "@/types";

interface PhotoPreviewProps {
  photo: Photo;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
}

export default function PhotoPreview({
  photo,
  onClose,
  onDelete,
  onEdit,
}: PhotoPreviewProps) {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0 border-0 bg-white overflow-hidden">
        <div className="relative">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
          >
            <X size={20} />
          </button>

          {/* Image */}
          <img
            src={photo.storageUrl}
            alt={photo.restaurantName}
            className="w-full h-auto max-h-[60vh] object-cover"
          />
        </div>

        {/* Info Section */}
        <div className="p-6 space-y-4">
          <div>
            <h2 className="text-2xl font-light text-slate-900 mb-2">
              {photo.restaurantName}
            </h2>
            {photo.cuisineType && (
              <p className="text-slate-600">{photo.cuisineType}</p>
            )}
          </div>

          <p className="text-sm text-slate-500">
            上載於 {new Date(photo.createdAt).toLocaleDateString("zh-HK", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <Button
              onClick={onEdit}
              className="flex-1 bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-2"
            >
              <Edit2 size={18} />
              編輯資訊
            </Button>
            <Button
              onClick={onDelete}
              variant="destructive"
              className="flex-1 bg-red-500 hover:bg-red-600 text-white flex items-center justify-center gap-2"
            >
              <Trash2 size={18} />
              刪除
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
