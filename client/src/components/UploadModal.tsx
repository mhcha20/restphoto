import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Upload, X } from "lucide-react";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UploadModal({ isOpen, onClose, onSuccess }: UploadModalProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.photos.upload.useMutation({
    onSuccess: (result) => {
      const successful = result.results.filter((r) => r.success).length;
      toast.success(`成功上載 ${successful}/${result.total} 張相片`);
      setSelectedFiles([]);
      onSuccess();
      onClose();
    },
    onError: (error) => {
      toast.error(error.message || "上載失敗");
    },
  });

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const newFiles = Array.from(files).filter((file) =>
      file.type.startsWith("image/")
    );

    if (newFiles.length === 0) {
      toast.error("請選擇圖片檔案");
      return;
    }

    setSelectedFiles((prev) => [...prev, ...newFiles]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast.error("請選擇至少一張相片");
      return;
    }

    // Convert files to base64
    const filesData = await Promise.all(
      selectedFiles.map(
        (file) =>
          new Promise<{ data: string; name: string; mimeType: string }>(
            (resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const base64 = (reader.result as string).split(",")[1];
                resolve({
                  data: base64,
                  name: file.name,
                  mimeType: file.type,
                });
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            }
          )
      )
    );

    uploadMutation.mutate({ files: filesData });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>上載餐廳相片</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragging
                ? "border-slate-900 bg-slate-50"
                : "border-slate-300 hover:border-slate-400"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
            />

            <Upload className="mx-auto mb-3 text-slate-400" size={32} />
            <p className="text-slate-900 font-medium mb-1">
              拖放相片到此或點擊選擇
            </p>
            <p className="text-sm text-slate-500">
              支援 JPG、PNG、WebP 等格式
            </p>
          </div>

          {/* Selected Files */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-900">
                已選擇 {selectedFiles.length} 張相片
              </p>
              <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                {selectedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="relative bg-slate-100 rounded-lg overflow-hidden group"
                  >
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-full h-24 object-cover"
                    />
                    <button
                      onClick={() => handleRemoveFile(index)}
                      className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={16} />
                    </button>
                    <p className="text-xs text-slate-600 p-1 truncate">
                      {file.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
            <Button
              onClick={onClose}
              variant="outline"
              disabled={uploadMutation.isPending}
            >
              取消
            </Button>
            <Button
              onClick={handleUpload}
              className="bg-slate-900 hover:bg-slate-800 text-white"
              disabled={selectedFiles.length === 0 || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? (
                <>
                  <Spinner className="mr-2" />
                  上載中...
                </>
              ) : (
                "上載相片"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
