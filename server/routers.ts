import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { photosRouter } from "./routers/photos";
import { googleDriveRouter } from "./routers/googleDrive";
import { adminRouter } from "./routers/admin";
import { restaurantLocationsRouter } from "./routers/restaurantLocations";

export const appRouter = router({
  system: systemRouter,
  googleDrive: googleDriveRouter,
  admin: adminRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  photos: photosRouter,
  restaurantLocations: restaurantLocationsRouter,
});

export type AppRouter = typeof appRouter;
