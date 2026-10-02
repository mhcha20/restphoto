import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Clock, ShieldX, LogOut, RefreshCw } from "lucide-react";

/**
 * 已登入但尚未獲批准（pending）或被拒絕（rejected）時顯示的畫面。
 * 不會載入任何受保護資料。
 */
export default function PendingApproval() {
  const { user, logout, refresh } = useAuth();
  const rejected = user?.accessStatus === "rejected";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white px-6">
      <div className="max-w-md w-full bg-slate-800/60 backdrop-blur border border-slate-700/50 rounded-2xl p-10 text-center space-y-6">
        <div className="flex justify-center">
          <div
            className={`flex items-center justify-center w-16 h-16 rounded-full ${
              rejected ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"
            }`}
          >
            {rejected ? <ShieldX size={32} /> : <Clock size={32} />}
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-light">
            {rejected ? "存取已被拒絕" : "等待管理員批准"}
          </h1>
          <p className="text-slate-400 leading-relaxed">
            {rejected
              ? "您的帳號未獲授權存取本平台。如有疑問，請聯絡管理員。"
              : "您已成功登入，但帳號仍需由管理員批准後方可瀏覽相片。獲批准後重新整理即可進入。"}
          </p>
        </div>

        {user?.name && (
          <p className="text-sm text-slate-500">
            目前以 <span className="text-slate-300">{user.name}</span> 登入
          </p>
        )}

        <div className="flex items-center justify-center gap-3 pt-2">
          {!rejected && (
            <Button
              variant="outline"
              className="border-slate-500 text-slate-200 hover:bg-slate-700"
              onClick={() => refresh()}
            >
              <RefreshCw size={16} className="mr-2" />
              重新檢查
            </Button>
          )}
          <Button
            className="bg-white text-slate-900 hover:bg-slate-100"
            onClick={() => logout()}
          >
            <LogOut size={16} className="mr-2" />
            登出
          </Button>
        </div>
      </div>
    </div>
  );
}
