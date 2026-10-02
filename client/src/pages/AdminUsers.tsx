import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check, X, Clock, ArrowLeft, Users } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

type AccessStatus = "pending" | "approved" | "rejected";

function StatusBadge({ status }: { status: AccessStatus }) {
  if (status === "approved") {
    return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">已批准</Badge>;
  }
  if (status === "rejected") {
    return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">已拒絕</Badge>;
  }
  return (
    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
      <Clock size={12} className="mr-1" />
      待批准
    </Badge>
  );
}

export default function AdminUsers() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const usersQuery = trpc.admin.listUsers.useQuery();

  const setAccess = trpc.admin.setUserAccess.useMutation({
    onSuccess: () => {
      utils.admin.listUsers.invalidate();
    },
    onError: (e) => {
      toast.error(e.message || "更新失敗");
    },
  });

  // 僅 admin 可見（路由已守，雙重保險）
  if (user?.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center text-stone-600">
        無權限存取
      </div>
    );
  }

  const update = (userId: number, accessStatus: AccessStatus) => {
    setAccess.mutate({ userId, accessStatus });
  };

  const list = usersQuery.data ?? [];
  const pendingCount = list.filter((u) => u.accessStatus === "pending").length;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Users size={26} className="text-stone-700" />
            <div>
              <h1 className="text-2xl font-semibold">使用者審批</h1>
              <p className="text-sm text-stone-500">
                批准或拒絕帳號存取本平台
                {pendingCount > 0 && (
                  <span className="ml-2 text-amber-600">
                    （{pendingCount} 個待批准）
                  </span>
                )}
              </p>
            </div>
          </div>
          <Link href="/dashboard">
            <Button variant="outline" className="bg-white">
              <ArrowLeft size={16} className="mr-2" />
              回相片牆
            </Button>
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          {usersQuery.isLoading ? (
            <div className="p-10 text-center text-stone-400">載入中…</div>
          ) : list.length === 0 ? (
            <div className="p-10 text-center text-stone-400">尚無使用者</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>使用者</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>最後登入</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((u) => {
                  const locked = u.isSelf || u.role === "admin";
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="font-medium">{u.name || "（未命名）"}</div>
                        <div className="text-xs text-stone-400">{u.email || u.openId}</div>
                      </TableCell>
                      <TableCell>
                        {u.role === "admin" ? (
                          <Badge variant="secondary">管理員</Badge>
                        ) : (
                          <span className="text-stone-500">一般</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={u.accessStatus as AccessStatus} />
                      </TableCell>
                      <TableCell className="text-stone-500 text-sm">
                        {u.lastSignedIn
                          ? new Date(u.lastSignedIn).toLocaleString()
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {locked ? (
                          <div className="text-right text-xs text-stone-400">
                            {u.isSelf ? "（你自己）" : "（管理員）"}
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            {u.accessStatus !== "approved" && (
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={setAccess.isPending}
                                onClick={() => update(u.id, "approved")}
                              >
                                <Check size={14} className="mr-1" />
                                批准
                              </Button>
                            )}
                            {u.accessStatus !== "rejected" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="bg-white text-red-600 border-red-200 hover:bg-red-50"
                                disabled={setAccess.isPending}
                                onClick={() => update(u.id, "rejected")}
                              >
                                <X size={14} className="mr-1" />
                                拒絕
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
