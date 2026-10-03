/**
 * Image generation / editing via OpenRouter (image-capable chat model).
 * Returns a data URL so no object storage is required; the original photo on
 * Google Drive is never modified.
 */
import { ENV } from "./env";

export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
};

export type GenerateImageResponse = {
  url?: string;
};

export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  if (!ENV.openRouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const content: Array<Record<string, unknown>> = [
    { type: "text", text: options.prompt },
  ];
  for (const img of options.originalImages ?? []) {
    const url =
      img.url ?? (img.b64Json ? `data:${img.mimeType ?? "image/jpeg"};base64,${img.b64Json}` : undefined);
    if (url) content.push({ type: "image_url", image_url: { url } });
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.openRouterApiKey}`,
    },
    body: JSON.stringify({
      model: ENV.openRouterImageModel,
      modalities: ["image", "text"],
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Image generation request failed (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
    );
  }

  const result = (await response.json()) as {
    choices?: Array<{
      message?: { images?: Array<{ image_url?: { url?: string } }> };
    }>;
  };
  const url = result.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  return { url };
}
