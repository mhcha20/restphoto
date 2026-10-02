import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../_core/trpc";
import { listAllUsers, setUserAccessStatus } from "../db";

/**
 * 管理員專用路由：使用者審批。
 * 全部以 adminProcedure 保護，只有 role=admin（owner）可呼叫。
 */
export const adminRouter = router({
  // 列出所有使用者（含存取狀態），供審批介面使用
  listUsers: adminProcedure.query(async ({ ctx }) => {
    const all = await listAllUsers();
    return all.map((u) => ({
      id: u.id,
      openId: u.openId,
      name: u.name,
      email: u.email,
      role: u.role,
      accessStatus: u.accessStatus,
      createdAt: u.createdAt,
      lastSignedIn: u.lastSignedIn,
      // 標記自己，前端避免改到自己的狀態
      isSelf: u.openId === ctx.user.openId,
    }));
  }),

  // 設定某使用者的存取狀態（approved / rejected / pending）
  setUserAccess: adminProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        accessStatus: z.enum(["pending", "approved", "rejected"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // 不允許改自己的狀態，避免 owner 把自己鎖出去
      const all = await listAllUsers();
      const target = all.find((u) => u.id === input.userId);
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "找不到該使用者" });
      }
      if (target.openId === ctx.user.openId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "無法變更自己的存取狀態",
        });
      }
      if (target.role === "admin") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "無法變更其他管理員的存取狀態",
        });
      }
      const ok = await setUserAccessStatus(input.userId, input.accessStatus);
      if (!ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "更新失敗",
        });
      }
      return { success: true as const };
    }),
});
