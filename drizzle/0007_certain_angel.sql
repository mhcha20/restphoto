CREATE TABLE `region_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`folderId` varchar(255) NOT NULL,
	`name` varchar(100) NOT NULL,
	`photoCount` int NOT NULL DEFAULT 0,
	`restaurantCount` int NOT NULL DEFAULT 0,
	`subRegionsJson` text,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `region_cache_id` PRIMARY KEY(`id`),
	CONSTRAINT `region_cache_folderId_unique` UNIQUE(`folderId`)
);
