import { Request, Response } from 'express';
import prisma from './database';

/**
 * Get current positions of all boats for map display
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

    // Get the latest position for each boat
    const boats = await prisma.$queryRaw<any[]>`
      SELECT DISTINCT ON (name) 
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
      ORDER BY name, "scrapedAt" DESC
    `;

    // Convert to map-friendly format
    const mapData = boats.map(boat => ({
      name: boat.name,
      lat: parseFloat(boat.latitudeDecimal),
      lng: parseFloat(boat.longitudeDecimal),
      latOriginal: boat.latitude,
      lngOriginal: boat.longitude,
      speed: parseFloat(boat.speed) || 0,
      course: parseInt(boat.course) || 0,
      lastUpdate: boat.lastUpdate,
      scrapedAt: boat.scrapedAt
    })).filter(boat => !isNaN(boat.lat) && !isNaN(boat.lng));

    res.json({
      success: true,
      count: mapData.length,
      data: mapData
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

