import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

vi.mock("./_core/env", () => ({ ENV: { s3PublicUrl: "https://cdn.example.com" } }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));
vi.mock("./storage", () => ({
  storageConfigured: vi.fn(() => true),
  storageExists: vi.fn(),
  storagePutExact: vi.fn(async () => undefined),
  storagePublicUrl: (k: string) => `https://cdn.example.com/${k}`,
}));

import { registerThumbnailRoute } from "./thumbnails";
import { sdk } from "./_core/sdk";
import { storageExists, storagePutExact } from "./storage";

function setup() {
  let handler: any;
  registerThumbnailRoute({ get: (_p: string, h: any) => (handler = h) } as any);
  return handler;
}
function mkRes() {
  const res: any = { headers: {} };
  res.setHeader = vi.fn((k: string, v: string) => (res.headers[k] = v));
  res.status = vi.fn(() => res);
  res.send = vi.fn(() => res);
  res.redirect = vi.fn(() => res);
  return res;
}
const req = (id = "abcdefghij1234", w?: string): any => ({ params: { fileId: id }, query: w ? { w } : {} });

describe("/api/thumb/:fileId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated and unapproved users", async () => {
    const h = setup();
    (sdk.authenticateRequest as any).mockRejectedValueOnce(new Error("no"));
    const r1 = mkRes();
    await h(req(), r1);
    expect(r1.status).toHaveBeenCalledWith(401);

    (sdk.authenticateRequest as any).mockResolvedValueOnce({ role: "user", accessStatus: "pending" });
    const r2 = mkRes();
    await h(req(), r2);
    expect(r2.status).toHaveBeenCalledWith(403);
  });

  it("rejects malformed file ids", async () => {
    const r = mkRes();
    await setup()(req("../etc/passwd"), r);
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it("redirects to the CDN when the thumbnail already exists", async () => {
    (sdk.authenticateRequest as any).mockResolvedValue({ role: "admin" });
    (storageExists as any).mockResolvedValue(true);
    const r = mkRes();
    await setup()(req("abcdefghij1234", "480"), r);
    expect(r.redirect).toHaveBeenCalledWith(302, "https://cdn.example.com/thumbs/w480/abcdefghij1234.webp");
    expect(storagePutExact).not.toHaveBeenCalled();
  });

  it("builds, stores and redirects on a cache miss", async () => {
    (sdk.authenticateRequest as any).mockResolvedValue({ role: "user", accessStatus: "approved" });
    (storageExists as any).mockResolvedValue(false);
    const png = await sharp({ create: { width: 1000, height: 800, channels: 3, background: "#c33" } }).png().toBuffer();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(png, { headers: { "content-type": "image/png" } })));
    const r = mkRes();
    await setup()(req("abcdefghij1234", "320"), r);
    const [key, data, type] = (storagePutExact as any).mock.calls[0];
    expect(key).toBe("thumbs/w320/abcdefghij1234.webp");
    expect(type).toBe("image/webp");
    expect((await sharp(data).metadata()).width).toBe(320);
    expect(r.redirect).toHaveBeenCalledWith(302, "https://cdn.example.com/thumbs/w320/abcdefghij1234.webp");
    vi.unstubAllGlobals();
  });

  it("falls back to the Drive thumbnail when Drive fails", async () => {
    (sdk.authenticateRequest as any).mockResolvedValue({ role: "admin" });
    (storageExists as any).mockResolvedValue(false);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 403 })));
    const r = mkRes();
    await setup()(req(), r);
    expect(r.redirect.mock.calls[0][1]).toContain("drive.google.com/thumbnail?id=abcdefghij1234");
    vi.unstubAllGlobals();
  });
});
