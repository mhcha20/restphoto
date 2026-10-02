import { useState, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Search, Upload, Trash2, Edit2, X, AlertCircle } from "lucide-react";
import PhotoGrid from "@/components/PhotoGrid";
import PhotoPreview from "@/components/PhotoPreview";
import UploadModal from "@/components/UploadModal";
import EditPhotoModal from "@/components/EditPhotoModal";

export default function Dashboard() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<any>(null);
  const [previewPhoto, setPreviewPhoto] = useState<any>(null);

  // Query photos
  const { data: photos = [], isLoading, error, refetch } = trpc.photos.list.useQuery({
    restaurantName: searchQuery || undefined,
  });

  // Mutations
  const deletePhotoMutation = trpc.photos.delete.useMutation({
    onSuccess: () => {
      toast.success("相片已刪除");
      refetch();
      setSelectedPhoto(null);
    },
    onError: (error) => {
      toast.error(error.message || "刪除失敗");
    },
  });

  const updatePhotoMutation = trpc.photos.update.useMutation({
    onSuccess: () => {
      toast.success("相片已更新");
      refetch();
      setIsEditModalOpen(false);
      setSelectedPhoto(null);
    },
    onError: (error) => {
      toast.error(error.message || "更新失敗");
    },
  });

  const handleDeletePhoto = (photoId: number) => {
    if (confirm("確認要刪除此相片嗎？")) {
      deletePhotoMutation.mutate({ photoId });
    }
  };

  const handleEditPhoto = (photo: any) => {
    setSelectedPhoto(photo);
    setIsEditModalOpen(true);
  };

  const handleUpdatePhoto = (restaurantName: string, cuisineType: string) => {
    if (selectedPhoto) {
      updatePhotoMutation.mutate({
        photoId: selectedPhoto.id,
        restaurantName,
        cuisineType,
      });
    }
  };

  const handleUploadSuccess = () => {
    setIsUploadModalOpen(false);
    refetch();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200/50 bg-white/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-light tracking-tight text-slate-900">
                餐廳相片 Dashboard
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                優雅地管理和探索您的餐廳相片集合
              </p>
            </div>
            <Button
              onClick={() => setIsUploadModalOpen(true)}
              className="bg-slate-900 hover:bg-slate-800 text-white rounded-lg px-6 py-2 flex items-center gap-2"
            >
              <Upload size={18} />
              上載相片
            </Button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <Input
              placeholder="搜尋餐廳名稱..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-slate-100 border-0 rounded-lg text-slate-900 placeholder:text-slate-500 focus:bg-white focus:ring-2 focus:ring-slate-300 transition-all"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {error ? (
          <div className="text-center py-24">
            <div className="text-red-400 mb-4">
              <X size={48} className="mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              載入相片失敗
            </h3>
            <p className="text-slate-500 mb-6">
              {error.message || "發生錯誤，請稍後重試"}
            </p>
            <Button
              onClick={() => refetch()}
              className="bg-slate-900 hover:bg-slate-800 text-white"
            >
              重試
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Spinner />
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-24">
            <div className="text-slate-400 mb-4">
              <Upload size={48} className="mx-auto opacity-50" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              {searchQuery ? "未找到相符的相片" : "還沒有相片"}
            </h3>
            <p className="text-slate-500 mb-6">
              {searchQuery
                ? "嘗試調整搜尋條件"
                : "上載您的第一張餐廳相片以開始"}
            </p>
            {!searchQuery && (
              <Button
                onClick={() => setIsUploadModalOpen(true)}
                className="bg-slate-900 hover:bg-slate-800 text-white"
              >
                上載相片
              </Button>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-600 mb-6">
              共 <span className="font-semibold text-slate-900">{photos.length}</span> 張相片
            </p>
            <PhotoGrid
              photos={photos}
              onPhotoClick={setPreviewPhoto}
              onDeleteClick={handleDeletePhoto}
              onEditClick={handleEditPhoto}
            />
          </div>
        )}
      </main>

      {/* Photo Preview Modal */}
      {previewPhoto && (
        <PhotoPreview
          photo={previewPhoto}
          onClose={() => setPreviewPhoto(null)}
          onDelete={() => {
            handleDeletePhoto(previewPhoto.id);
            setPreviewPhoto(null);
          }}
          onEdit={() => {
            handleEditPhoto(previewPhoto);
            setPreviewPhoto(null);
          }}
        />
      )}

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={handleUploadSuccess}
      />

      {/* Edit Photo Modal */}
      {selectedPhoto && (
        <EditPhotoModal
          isOpen={isEditModalOpen}
          photo={selectedPhoto}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedPhoto(null);
          }}
          onSave={handleUpdatePhoto}
          isLoading={updatePhotoMutation.isPending}
        />
      )}
    </div>
  );
}
