CREATE TABLE `google_drive_sync` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`googleDriveFileId` varchar(255) NOT NULL,
	`googleDriveUrl` text NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`restaurantName` varchar(255) NOT NULL,
	`region` varchar(100) NOT NULL,
	`mimeType` varchar(100),
	`fileSize` int,
	`lastModified` timestamp,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `google_drive_sync_id` PRIMARY KEY(`id`),
	CONSTRAINT `google_drive_sync_googleDriveFileId_unique` UNIQUE(`googleDriveFileId`)
);
--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`syncType` varchar(50) NOT NULL,
	`totalFiles` int NOT NULL,
	`newPhotos` int NOT NULL,
	`deletedPhotos` int NOT NULL,
	`status` varchar(50) NOT NULL,
	`errorMessage` text,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sync_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `googleDriveFolderId` varchar(255);--> statement-breakpoint
ALTER TABLE `google_drive_sync` ADD CONSTRAINT `google_drive_sync_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sync_logs` ADD CONSTRAINT `sync_logs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;