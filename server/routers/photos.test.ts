import { describe, it, expect, vi, beforeEach } from "vitest";
import { photosRouter } from "./photos";
import * as db from "../db";

// Mock database functions
vi.mock("../db", () => ({
  getUserPhotos: vi.fn(),
  getPhotoById: vi.fn(),
  createPhoto: vi.fn(),
  updatePhoto: vi.fn(),
  deletePhoto: vi.fn(),
  getOrCreateRestaurant: vi.fn(),
}));

// Mock storage
vi.mock("../storage", () => ({
  storagePut: vi.fn().mockResolvedValue({
    key: "test-key",
    url: "https://example.com/test.jpg",
  }),
}));

// Mock LLM
vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: JSON.stringify({
            restaurantName: "Test Restaurant",
            cuisineType: "Japanese",
            description: "A test restaurant",
            confidence: 0.95,
          }),
        },
      },
    ],
  }),
}));

describe("photosRouter", () => {
  const mockUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user" as const,
    accessStatus: "approved" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const mockCtx = {
    user: mockUser,
    req: { protocol: "https", headers: {} } as any,
    res: {} as any,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("list", () => {
    it("should return all photos for a user", async () => {
      const mockPhotos = [
        {
          id: 1,
          userId: 1,
          restaurantId: 1,
          restaurantName: "Test Restaurant",
          cuisineType: "Japanese",
          storageKey: "test-key",
          storageUrl: "https://example.com/test.jpg",
          aiAnalysis: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(db.getUserPhotos).mockResolvedValue(mockPhotos);

      const caller = photosRouter.createCaller(mockCtx);
      const result = await caller.list({});

      expect(result).toEqual(mockPhotos);
      expect(db.getUserPhotos).toHaveBeenCalledWith(1, undefined);
    });

    it("should filter photos by restaurant name", async () => {
      const mockPhotos = [
        {
          id: 1,
          userId: 1,
          restaurantId: 1,
          restaurantName: "Test Restaurant",
          cuisineType: "Japanese",
          storageKey: "test-key",
          storageUrl: "https://example.com/test.jpg",
          aiAnalysis: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(db.getUserPhotos).mockResolvedValue(mockPhotos);

      const caller = photosRouter.createCaller(mockCtx);
      const result = await caller.list({ restaurantName: "Test" });

      expect(result).toEqual(mockPhotos);
      expect(db.getUserPhotos).toHaveBeenCalledWith(1, "Test");
    });
  });

  describe("delete", () => {
    it("should delete a photo", async () => {
      const mockPhoto = {
        id: 1,
        userId: 1,
        restaurantId: 1,
        restaurantName: "Test Restaurant",
        cuisineType: "Japanese",
        storageKey: "test-key",
        storageUrl: "https://example.com/test.jpg",
        aiAnalysis: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.getPhotoById).mockResolvedValue(mockPhoto);
      vi.mocked(db.deletePhoto).mockResolvedValue({ affectedRows: 1 } as any);

      const caller = photosRouter.createCaller(mockCtx);
      const result = await caller.delete({ photoId: 1 });

      expect(result).toEqual({
        success: true,
        deletedPhotoId: 1,
      });
      expect(db.deletePhoto).toHaveBeenCalledWith(1, 1);
    });

    it("should throw error if photo not found", async () => {
      vi.mocked(db.getPhotoById).mockResolvedValue(undefined);

      const caller = photosRouter.createCaller(mockCtx);

      try {
        await caller.delete({ photoId: 999 });
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.code).toBe("NOT_FOUND");
        expect(error.message).toBe("Photo not found");
      }
    });
  });

  describe("update", () => {
    it("should update photo metadata", async () => {
      const mockPhoto = {
        id: 1,
        userId: 1,
        restaurantId: 1,
        restaurantName: "Test Restaurant",
        cuisineType: "Japanese",
        storageKey: "test-key",
        storageUrl: "https://example.com/test.jpg",
        aiAnalysis: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedPhoto = {
        ...mockPhoto,
        restaurantName: "Updated Restaurant",
        cuisineType: "Italian",
      };

      vi.mocked(db.getPhotoById).mockResolvedValueOnce(mockPhoto);
      vi.mocked(db.updatePhoto).mockResolvedValue({ affectedRows: 1 } as any);
      vi.mocked(db.getPhotoById).mockResolvedValueOnce(updatedPhoto);

      const caller = photosRouter.createCaller(mockCtx);
      const result = await caller.update({
        photoId: 1,
        restaurantName: "Updated Restaurant",
        cuisineType: "Italian",
      });

      expect(result).toEqual(updatedPhoto);
      expect(db.updatePhoto).toHaveBeenCalledWith(1, 1, {
        restaurantName: "Updated Restaurant",
        cuisineType: "Italian",
      });
    });
  });
});
