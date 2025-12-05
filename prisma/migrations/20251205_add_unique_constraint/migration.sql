-- First, delete duplicate rows, keeping only the oldest record for each unique combination
DELETE FROM "rowing_data" a USING (
  SELECT MIN("createdAt") as min_created, "name", "sourceUrl", "lastUpdate"
  FROM "rowing_data"
  GROUP BY "name", "sourceUrl", "lastUpdate"
  HAVING COUNT(*) > 1
) b
WHERE a."name" = b."name" 
  AND a."sourceUrl" = b."sourceUrl" 
  AND a."lastUpdate" = b."lastUpdate"
  AND a."createdAt" > b.min_created;

-- CreateIndex
CREATE INDEX "rowing_data_sourceUrl_idx" ON "rowing_data"("sourceUrl");

-- CreateIndex
CREATE UNIQUE INDEX "rowing_data_name_sourceUrl_lastUpdate_key" ON "rowing_data"("name", "sourceUrl", "lastUpdate");
