import { Request, Response } from 'express';
import prisma, { ensureConnection } from './database';

/**
 * Get historical positions of all boats for map display with time slider
 * Query params:
 * - sourceUrl: source URL to filter by (required)
 */
export async function getMapData(req: Request, res: Response) {
  try {
    const { sourceUrl } = req.query;

    if (!sourceUrl || typeof sourceUrl !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Source URL is required. Example: /map/data?sourceUrl=https://yb.tl/Simple/arc2025'
      });
    }

    // Ensure database connection
    await ensureConnection();

    // Get all positions for each boat, ordered by time
    const allData = await prisma.$queryRaw<any[]>`
      SELECT 
        name,
        "latitudeDecimal",
        "longitudeDecimal",
        latitude,
        longitude,
        speed,
        course,
        "lastUpdate",
        "sourceUrl",
        "scrapedAt"
      FROM rowing_data
      WHERE "sourceUrl" = ${sourceUrl}
      ORDER BY "scrapedAt" DESC, name
    `;

    // Group by boat name and organize by timestamp
    const boatsByName = new Map<string, any[]>();
    const timestamps = new Set<string>();

    allData.forEach(record => {
      if (!boatsByName.has(record.name)) {
        boatsByName.set(record.name, []);
      }
      boatsByName.get(record.name)!.push({
        name: record.name,
        lat: parseFloat(record.latitudeDecimal),
        lng: parseFloat(record.longitudeDecimal),
        latOriginal: record.latitude,
        lngOriginal: record.longitude,
        speed: parseFloat(record.speed) || 0,
        course: parseInt(record.course) || 0,
        lastUpdate: record.lastUpdate,
        scrapedAt: record.scrapedAt.toISOString()
      });
      timestamps.add(record.scrapedAt.toISOString());
    });

    // Sort timestamps
    const sortedTimestamps = Array.from(timestamps).sort((a, b) => 
      new Date(b).getTime() - new Date(a).getTime()
    );

    // Organize data by timestamp
    const dataByTimestamp = sortedTimestamps.map(timestamp => {
      const boats: any[] = [];
      
      boatsByName.forEach((positions, boatName) => {
        // Find the latest position at or before this timestamp
        const position = positions.find(p => p.scrapedAt === timestamp);
        if (position) {
          // Calculate average speed comparison (current vs previous)
          const boatPositions = boatsByName.get(boatName)!;
          const currentIndex = boatPositions.findIndex(p => p.scrapedAt === timestamp);
          
          let avgSpeed = position.speed;
          let prevAvgSpeed = null;
          let speedDiff = null;
          let percentChange = null;

          // Get previous position if available
          if (currentIndex < boatPositions.length - 1) {
            prevAvgSpeed = boatPositions[currentIndex + 1].speed;
            speedDiff = position.speed - prevAvgSpeed;
            percentChange = prevAvgSpeed !== 0 ? ((speedDiff / prevAvgSpeed) * 100) : 0;
          }

          boats.push({
            ...position,
            avgSpeed,
            prevAvgSpeed,
            speedDiff,
            percentChange: percentChange !== null ? parseFloat(percentChange.toFixed(1)) : null
          });
        }
      });

      return {
        timestamp,
        boats: boats.filter(boat => !isNaN(boat.lat) && !isNaN(boat.lng))
      };
    });

    res.json({
      success: true,
      timestamps: sortedTimestamps,
      data: dataByTimestamp,
      boatCount: boatsByName.size
    });
  } catch (error) {
    console.error('Error getting map data:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching map data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

