-- CreateTable
CREATE TABLE "rowing_data" (
    "id" TEXT NOT NULL,
    "no" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastUpdate" TEXT NOT NULL,
    "latitude" TEXT NOT NULL,
    "longitude" TEXT NOT NULL,
    "latitudeDecimal" TEXT NOT NULL,
    "longitudeDecimal" TEXT NOT NULL,
    "speed" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "nextWaypoint" TEXT NOT NULL,
    "dtf" TEXT NOT NULL,
    "vmg" TEXT NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rowing_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rowing_data_scrapedAt_idx" ON "rowing_data"("scrapedAt");

-- CreateIndex
CREATE INDEX "rowing_data_name_idx" ON "rowing_data"("name");

