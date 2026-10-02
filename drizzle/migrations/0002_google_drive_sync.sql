-- Add Google Drive folder ID to users table
ALTER TABLE users ADD COLUMN googleDriveFolderId VARCHAR(255);

-- Modify restaurants table: remove cuisineType, add region
ALTER TABLE restaurants DROP COLUMN cuisineType;
ALTER TABLE restaurants ADD COLUMN region VARCHAR(100) NOT NULL DEFAULT 'Unknown';

-- Modify photos table: replace S3 fields with Google Drive fields
ALTER TABLE photos DROP COLUMN cuisineType;
ALTER TABLE photos DROP COLUMN storageKey;
ALTER TABLE photos DROP COLUMN storageUrl;
ALTER TABLE photos DROP COLUMN aiAnalysis;
ALTER TABLE photos ADD COLUMN googleDriveFileId VARCHAR(255) NOT NULL UNIQUE;
ALTER TABLE photos ADD COLUMN googleDriveUrl TEXT NOT NULL;
ALTER TABLE photos ADD COLUMN fileName VARCHAR(255) NOT NULL;
ALTER TABLE photos ADD COLUMN region VARCHAR(100) NOT NULL DEFAULT 'Unknown';

-- Create sync_logs table
CREATE TABLE sync_logs (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  syncType VARCHAR(50) NOT NULL,
  totalFiles INT NOT NULL,
  newPhotos INT NOT NULL,
  deletedPhotos INT NOT NULL,
  status VARCHAR(50) NOT NULL,
  errorMessage TEXT,
  syncedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
