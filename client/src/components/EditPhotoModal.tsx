import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Photo } from "@/types";

interface EditPhotoModalProps {
  isOpen: boolean;
  photo: Photo;
  onClose: () => void;
  onSave: (restaurantName: string, cuisineType: string) => void;
  isLoading: boolean;
}

export default function EditPhotoModal({
  isOpen,
  photo,
  onClose,
  onSave,
  isLoading,
}: EditPhotoModalProps) {
  const [restaurantName, setRestaurantName] = useState(photo.restaurantName);
  const [cuisineType, setCuisineType] = useState(photo.cuisineType || "");

  useEffect(() => {
    setRestaurantName(photo.restaurantName);
    setCuisineType(photo.cuisineType || "");
  }, [photo]);

  const handleSave = () => {
    if (!restaurantName.trim()) {
      alert("請輸入餐廳名稱");
      return;
    }
    onSave(restaurantName, cuisineType);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>編輯相片資訊</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview */}
          <div className="w-full h-40 bg-slate-100 rounded-lg overflow-hidden">
            <img
              src={photo.storageUrl}
              alt={photo.restaurantName}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Restaurant Name */}
          <div className="space-y-2">
            <Label htmlFor="restaurantName" className="text-slate-900">
              餐廳名稱
            </Label>
            <Input
              id="restaurantName"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              placeholder="輸入餐廳名稱"
              className="border-slate-300"
              disabled={isLoading}
            />
          </div>

          {/* Cuisine Type */}
          <div className="space-y-2">
            <Label htmlFor="cuisineType" className="text-slate-900">
              菜式類型
            </Label>
            <Input
              id="cuisineType"
              value={cuisineType}
              onChange={(e) => setCuisineType(e.target.value)}
              placeholder="例如：日本料理、中式、意大利"
              className="border-slate-300"
              disabled={isLoading}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
            <Button
              onClick={onClose}
              variant="outline"
              disabled={isLoading}
            >
              取消
            </Button>
            <Button
              onClick={handleSave}
              className="bg-slate-900 hover:bg-slate-800 text-white"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Spinner className="mr-2" />
                  保存中...
                </>
              ) : (
                "保存變更"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
