import { z } from "zod";
import { approvedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  createPhoto,
  deletePhoto,
  getPhotoById,
  getUserPhotos,
  updatePhoto,
  getOrCreateRestaurant,
} from "../db";
import { storagePut } from "../storage";
import { invokeLLM, type Message } from "../_core/llm";

/**
 * Schema for uploading photos
 */
const uploadPhotosSchema = z.object({
  files: z.array(
    z.object({
      data: z.string(), // base64 encoded image data
      name: z.string(),
      mimeType: z.string(),
    })
  ),
});

/**
 * Schema for updating photo metadata
 */
const updatePhotoSchema = z.object({
  photoId: z.number(),
  restaurantName: z.string().optional(),
  cuisineType: z.string().optional(),
});

/**
 * Schema for deleting a photo
 */
const deletePhotoSchema = z.object({
  photoId: z.number(),
});

/**
 * Schema for searching photos by restaurant name
 */
const searchPhotosSchema = z.object({
  restaurantName: z.string().optional(),
});

/**
 * LLM Vision analysis result
 */
interface AIAnalysisResult {
  restaurantName: string;
  cuisineType: string;
  description: string;
  confidence: number;
}

/**
 * Analyze image using LLM Vision to extract restaurant information
 */
async function analyzeImageWithVision(
  imageUrl: string
): Promise<AIAnalysisResult> {
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are an expert at analyzing restaurant photos. Extract the restaurant name, cuisine type, and provide a brief description. Return a JSON object with fields: restaurantName, cuisineType, description, and confidence (0-1).",
        } as Message,
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please analyze this restaurant photo and extract the restaurant information.",
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
                detail: "high",
              },
            },
          ],
        } as Message,
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "restaurant_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              restaurantName: {
                type: "string",
                description: "The name of the restaurant",
              },
              cuisineType: {
                type: "string",
                description: "The type of cuisine (e.g., Italian, Chinese, Japanese)",
              },
              description: {
                type: "string",
                description: "Brief description of the restaurant or dish",
              },
              confidence: {
                type: "number",
                description: "Confidence level of the analysis (0-1)",
              },
            },
            required: ["restaurantName", "cuisineType", "description", "confidence"],
            additionalProperties: false,
          },
        },
      } as any,
    });

    const content = response.choices[0]?.message.content;
    if (!content || typeof content !== "string") {
      throw new Error("No response from LLM");
    }

    const parsed = JSON.parse(content);
    return {
      restaurantName: parsed.restaurantName || "Unknown Restaurant",
      cuisineType: parsed.cuisineType || "Unknown",
      description: parsed.description || "",
      confidence: parsed.confidence || 0.5,
    };
  } catch (error) {
    console.error("[LLM Vision] Analysis failed:", error);
    // Return default values if analysis fails
    return {
      restaurantName: "Unknown Restaurant",
      cuisineType: "Unknown",
      description: "Unable to analyze image",
      confidence: 0,
    };
  }
}

export const photosRouter = router({
  /**
   * Upload multiple photos and analyze them with LLM Vision
   */
  upload: approvedProcedure
    .input(uploadPhotosSchema)
    .mutation(async ({ ctx, input }) => {
      const uploadedPhotos = [];

      for (const file of input.files) {
        try {
          // Convert base64 to buffer
          const buffer = Buffer.from(file.data, "base64");

          // Upload to S3
          const fileKey = `photos/${ctx.user.id}/${Date.now()}-${file.name}`;
          const { key, url } = await storagePut(fileKey, buffer, file.mimeType);

          // Analyze image with LLM Vision
          const analysis = await analyzeImageWithVision(url);

          // Get or create restaurant
          const restaurant = await getOrCreateRestaurant(
            ctx.user.id,
            analysis.restaurantName,
            analysis.cuisineType
          );

          // Create photo record
          await createPhoto({
            userId: ctx.user.id,
            restaurantId: restaurant?.id,
            restaurantName: analysis.restaurantName,
            cuisineType: analysis.cuisineType,
            storageKey: key,
            storageUrl: url,
            aiAnalysis: JSON.stringify(analysis),
          });

          uploadedPhotos.push({
            success: true,
            fileName: file.name,
            restaurantName: analysis.restaurantName,
            cuisineType: analysis.cuisineType,
            storageUrl: url,
          });
        } catch (error) {
          console.error(`[Upload] Failed to process ${file.name}:`, error);
          uploadedPhotos.push({
            success: false,
            fileName: file.name,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      return {
        total: input.files.length,
        successful: uploadedPhotos.filter((p) => p.success).length,
        results: uploadedPhotos,
      };
    }),

  /**
   * Get all photos for the current user, optionally filtered by restaurant name
   */
  list: approvedProcedure
    .input(searchPhotosSchema)
    .query(async ({ ctx, input }) => {
      const allPhotos = await getUserPhotos(ctx.user.id, input.restaurantName);
      return allPhotos;
    }),

  /**
   * Get a single photo by ID
   */
  getById: approvedProcedure
    .input(z.object({ photoId: z.number() }))
    .query(async ({ ctx, input }) => {
      const photo = await getPhotoById(input.photoId, ctx.user.id);
      if (!photo) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Photo not found",
        });
      }
      return photo;
    }),

  /**
   * Update photo metadata (restaurant name, cuisine type)
   */
  update: approvedProcedure
    .input(updatePhotoSchema)
    .mutation(async ({ ctx, input }) => {
      const photo = await getPhotoById(input.photoId, ctx.user.id);
      if (!photo) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Photo not found",
        });
      }

      const updates: Record<string, unknown> = {};

      if (input.restaurantName !== undefined) {
        updates.restaurantName = input.restaurantName;
      }

      if (input.cuisineType !== undefined) {
        updates.cuisineType = input.cuisineType;
      }

      if (Object.keys(updates).length === 0) {
        return photo;
      }

      await updatePhoto(input.photoId, ctx.user.id, updates);

      // Return updated photo
      const updated = await getPhotoById(input.photoId, ctx.user.id);
      return updated;
    }),

  /**
   * Delete a photo
   */
  delete: approvedProcedure
    .input(deletePhotoSchema)
    .mutation(async ({ ctx, input }) => {
      const photo = await getPhotoById(input.photoId, ctx.user.id);
      if (!photo) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Photo not found",
        });
      }

      await deletePhoto(input.photoId, ctx.user.id);

      return {
        success: true,
        deletedPhotoId: input.photoId,
      };
    }),
});
