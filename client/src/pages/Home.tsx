import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { Image, Search, MapPin, RefreshCw } from "lucide-react";

export default function Home() {
  const { isAuthenticated } = useAuth();
  const loginUrl = getLoginUrl();

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Navigation */}
      <header className="border-b border-slate-700/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image size={28} className="text-slate-300" />
            <h1 className="text-2xl font-light tracking-tight">餐廳相片 Dashboard</h1>
          </div>
          <a href={loginUrl}>
            <Button className="bg-white text-slate-900 hover:bg-slate-100">
              登入
            </Button>
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6 py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left Content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-5xl font-light leading-tight">
                優雅地瀏覽您的
                <br />
                <span className="text-slate-300">餐廳相片</span>
              </h2>
              <p className="text-xl text-slate-400 leading-relaxed">
                直接從 Google Drive 讀取以「地區/餐廳」分類的相片，按地區
                按鈕一鍵切換、輸入餐廳名稱即時搜尋。精緻的 Dashboard 介面，
                讓每一張相片都閃耀光彩。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <a href={loginUrl}>
                <Button className="bg-white text-slate-900 hover:bg-slate-100 text-lg px-8 py-6 h-auto">
                  登入以瀏覽
                </Button>
              </a>
            </div>
            <p className="text-sm text-slate-500">
              本平台為私人使用，需登入並經管理員批准後方可瀏覽相片。
            </p>
          </div>

          {/* Right Features */}
          <div className="space-y-6">
            {[
              {
                icon: <MapPin size={24} />,
                title: "地區分類瀏覽",
                description: "頂部正方形地區按鈕，一鍵切換不同地區的餐廳",
              },
              {
                icon: <Search size={24} />,
                title: "餐廳名稱搜尋",
                description: "輸入餐廳名稱即時模糊匹配，支援同一餐廳多張相片",
              },
              {
                icon: <RefreshCw size={24} />,
                title: "Google Drive 同步",
                description: "每日自動同步 + 手動刷新按鈕，無需重複上載",
              },
            ].map((feature, index) => (
              <div
                key={index}
                className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-lg p-6 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="text-slate-400 mt-1">{feature.icon}</div>
                  <div>
                    <h3 className="text-lg font-medium mb-2">{feature.title}</h3>
                    <p className="text-slate-400">{feature.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700/50 mt-24 py-8">
        <div className="max-w-7xl mx-auto px-6 text-center text-slate-500 text-sm">
          <p>© 2026 餐廳相片 Dashboard. 精緻的相片管理平台。</p>
        </div>
      </footer>
    </div>
  );
}
