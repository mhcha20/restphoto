CREATE TABLE `restaurant_translations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nameZh` varchar(255) NOT NULL,
	`nameEn` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `restaurant_translations_id` PRIMARY KEY(`id`),
	CONSTRAINT `restaurant_translations_nameZh_unique` UNIQUE(`nameZh`)
);
