export interface Photo {
  id: number;
  userId: number;
  restaurantId: number | null;
  restaurantName: string;
  cuisineType: string | null;
  storageKey: string;
  storageUrl: string;
  aiAnalysis: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Restaurant {
  id: number;
  userId: number;
  name: string;
  cuisineType: string | null;
  createdAt: Date;
  updatedAt: Date;
}
