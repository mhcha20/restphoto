CREATE TABLE `photo_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileId` varchar(255) NOT NULL,
	`name` varchar(512) NOT NULL,
	`thumbnailUrl` text,
	`webViewLink` text,
	`restaurantName` varchar(255) NOT NULL,
	`regionId` varchar(255) NOT NULL,
	`regionName` varchar(100) NOT NULL,
	`subRegionName` varchar(100),
	`environment` varchar(100),
	`mimeType` varchar(100),
	`createdTime` bigint,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `photo_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `photo_cache_fileId_unique` UNIQUE(`fileId`)
);
--> statement-breakpoint
CREATE INDEX `idx_photo_cache_region` ON `photo_cache` (`regionId`);--> statement-breakpoint
CREATE INDEX `idx_photo_cache_restaurant` ON `photo_cache` (`restaurantName`);--> statement-breakpoint
CREATE INDEX `idx_photo_cache_region_restaurant` ON `photo_cache` (`regionId`,`restaurantName`);