CREATE TABLE `restaurant_locations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nameZh` varchar(255) NOT NULL,
	`nameEn` varchar(255),
	`address` text,
	`lat` text,
	`lng` text,
	`region` varchar(100),
	`subRegion` varchar(100),
	`isVerified` int NOT NULL DEFAULT 0,
	`aiNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `restaurant_locations_id` PRIMARY KEY(`id`),
	CONSTRAINT `restaurant_locations_nameZh_unique` UNIQUE(`nameZh`)
);
