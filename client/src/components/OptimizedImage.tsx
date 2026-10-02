import { memo, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";

interface OptimizedImageProps {
  src: string;
  alt: string;
  className?: string;
  // 是否讓 <img> 在容器內水平/垂直置中（用於放大預覽）
  center?: boolean;
}

/**
 * OptimizedImage - lazy-loaded image with loading state and error fallback.
 * Uses native browser lazy loading and React.memo to skip unnecessary re-renders.
 */
function OptimizedImageBase({ src, alt, className = "", center = false }: OptimizedImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div className={`relative w-full h-full bg-slate-100${center ? " flex items-center justify-center" : ""}`}>
      {/* Loading state */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
          <Loader2 className="animate-spin text-slate-400" size={24} />
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 text-slate-400">
          <ImageOff size={32} />
          <p className="text-xs mt-2">圖片無法載入</p>
        </div>
      )}

      {/* Image with lazy loading */}
      {!hasError && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={`${className} transition-opacity duration-300 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
          data-testid="optimized-image"
        />
      )}
    </div>
  );
}

export const OptimizedImage = memo(OptimizedImageBase);
