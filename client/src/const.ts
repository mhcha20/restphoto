export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Google sign-in is handled server-side: /api/auth/google redirects to Google
// and /api/oauth/callback sets the session cookie.
export const getLoginUrl = () => "/api/auth/google";
