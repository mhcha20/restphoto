/**
 * GET /api/thumb/:fileId?w=480
 *
 * Serves resized WebP thumbnails of Google Drive photos from Cloudflare R2 (S3 API).
 * First request: fetch the photo from Drive, resize with sharp, store in R2.
 * Later requests: 302 to the public R2/CDN URL (cached by the browser and Cloudflare).
 * If R2 is not configured, or anything fails, fall back to Drive's own thumbnail URL
 * so the grid never breaks.
 */
import type { Express, Request, Response } from "express";
import sharp from "sharp";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import {
  storageConfigured,
  storageExists,
  storagePublicUrl,
  storagePutExact,
} from "./storage";

const ALLOWED_WIDTHS = new Set([320, 480, 800, 1280]);
const FILE_ID_RE = /^[A-Za-z0-9_-]{10,100}$/;
const MAX_CONCURRENT = 6;

let active = 0;
const waiters: Array<() => void> = [];
const inflight = new Map<string, Promise<void>>();

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}

function driveThumbUrl(fileId: string, width: number): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;
}

async function buildThumbnail(fileId: string, width: number, key: string): Promise<void> {
  // Ask Drive for a bit more than needed, then resize/encode ourselves.
  const res = await fetch(driveThumbUrl(fileId, Math.min(width * 2, 1600)), {
    redirect: "follow",
    headers: { "user-agent": "Mozilla/5.0 (restphoto thumbnail cache)" },
  });
  if (!res.ok) throw new Error(`Drive thumbnail ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) throw new Error(`Drive returned ${type || "non-image"}`);
  const input = Buffer.from(await res.arrayBuffer());
  const output = await sharp(input)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
  await storagePutExact(key, output, "image/webp");
}

export function registerThumbnailRoute(app: Express) {
  app.get("/api/thumb/:fileId", async (req: Request, res: Response) => {
    const fileId = req.params.fileId;
    const requested = Number(req.query.w ?? 480);
    const width = ALLOWED_WIDTHS.has(requested) ? requested : 480;
    if (!FILE_ID_RE.test(fileId)) {
      res.status(400).send("bad file id");
      return;
    }

    // Same access rule as the rest of the app: approved users or admins only.
    try {
      const user = await sdk.authenticateRequest(req);
      if (user.role !== "admin" && user.accessStatus !== "approved") {
        res.status(403).send("forbidden");
        return;
      }
    } catch {
      res.status(401).send("unauthorized");
      return;
    }

    const fallback = () => {
      res.setHeader("Cache-Control", "private, max-age=300");
      res.redirect(302, driveThumbUrl(fileId, Math.max(width, 480)));
    };

    if (!storageConfigured() || !ENV.s3PublicUrl) {
      fallback();
      return;
    }

    const key = `thumbs/w${width}/${fileId}.webp`;
    try {
      if (!(await storageExists(key))) {
        let job = inflight.get(key);
        if (!job) {
          job = withSlot(() => buildThumbnail(fileId, width, key)).finally(() =>
            inflight.delete(key)
          );
          inflight.set(key, job);
        }
        await job;
      }
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.redirect(302, storagePublicUrl(key));
    } catch (error) {
      console.warn(`[Thumb] ${fileId} w${width} failed:`, error instanceof Error ? error.message : error);
      fallback();
    }
  });
}
