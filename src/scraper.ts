import axios from 'axios';
import * as cheerio from 'cheerio';
import { createObjectCsvWriter } from 'csv-writer';
import * as path from 'path';
import * as fs from 'fs';
import prisma, { ensureConnection } from './database';

const DEFAULT_URLS = [
  'https://yb.tl/Simple/wtrsvghjkl23',
  'https://yb.tl/Simple/arc2025'
];
const DATA_DIR = path.join(__dirname, '../data');

interface RowingData {
  no: string;
  device: string;
  name: string;
  lastUpdate: string;
  latitude: string;
  longitude: string;
  latitudeDecimal: string;
  longitudeDecimal: string;
  speed: string;
  course: string;
  nextWaypoint: string;
  dtf: string;
  vmg: string;
  sourceUrl: string;
  scrapedAt: string;
}

/**
 * Converts coordinates from degrees/minutes format to decimal degrees
 * Example: "017° 00.462N" -> 17.0077
 * Example: "061° 45.873W" -> -61.76455
 */
function convertToDecimalDegrees(coordinate: string): string {
  if (!coordinate || coordinate.trim() === '') {
    return '';
  }

  // Match pattern like "017° 00.462N" or "061° 45.873W"
  const match = coordinate.match(/(\d+)°\s*(\d+\.\d+)([NSEW])/);
  
  if (!match) {
    return '';
  }

  const degrees = parseInt(match[1], 10);
  const minutes = parseFloat(match[2]);
  const direction = match[3];

  // Convert to decimal degrees
  let decimal = degrees + (minutes / 60);

  // Make negative for South and West
  if (direction === 'S' || direction === 'W') {
    decimal = -decimal;
  }

  return decimal.toFixed(6);
}

export async function scrapeAndSaveData(url?: string): Promise<void> {
  // If no URL provided, scrape all default URLs
  if (!url) {
    console.log(`Scraping ${DEFAULT_URLS.length} URLs...`);
    for (const defaultUrl of DEFAULT_URLS) {
      try {
        await scrapeSingleUrl(defaultUrl);
      } catch (error) {
        console.error(`Error scraping ${defaultUrl}:`, error);
        // Continue with next URL even if one fails
      }
    }
    return;
  }
  
  // If URL provided, scrape that specific URL
  await scrapeSingleUrl(url);
}

async function scrapeSingleUrl(url: string): Promise<void> {
  try {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    console.log(`Fetching data from ${url}...`);
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const rowData: RowingData[] = [];
    const scrapedAt = new Date().toISOString();

    // Parse the table rows
    $('table.table tbody tr').each((index, element) => {
      const $row = $(element);
      const cells = $row.find('td');

      if (cells.length >= 11) {
        const latitude = $(cells[4]).text().trim();
        const longitude = $(cells[5]).text().trim();

        const data: RowingData = {
          no: $(cells[0]).text().trim(),
          device: $(cells[1]).text().trim().replace(/\s+/g, ' '),
          name: $(cells[2]).text().trim(),
          lastUpdate: $(cells[3]).text().trim(),
          latitude: latitude,
          longitude: longitude,
          latitudeDecimal: convertToDecimalDegrees(latitude),
          longitudeDecimal: convertToDecimalDegrees(longitude),
          speed: $(cells[6]).text().trim(),
          course: $(cells[7]).text().trim(),
          nextWaypoint: $(cells[8]).text().trim(),
          dtf: $(cells[9]).text().trim(),
          vmg: $(cells[10]).text().trim(),
          sourceUrl: url,
          scrapedAt: scrapedAt
        };

        rowData.push(data);
      }
    });

    console.log(`Parsed ${rowData.length} rows of data`);

    if (rowData.length === 0) {
      console.warn('No data found in the table');
      return;
    }

    // Generate filename with timestamp and URL identifier
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const urlSlug = url.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '_') || 'data';
    const filename = `rowing-data-${urlSlug}-${timestamp}.csv`;
    const filepath = path.join(DATA_DIR, filename);

    // Also save to a "latest-{urlSlug}.csv" file
    const latestFilepath = path.join(DATA_DIR, `latest-${urlSlug}.csv`);

    // Create CSV writer
    const csvWriter = createObjectCsvWriter({
      path: filepath,
      header: [
        { id: 'no', title: 'No' },
        { id: 'device', title: 'Device' },
        { id: 'name', title: 'Name' },
        { id: 'lastUpdate', title: 'Last Update (UTC)' },
        { id: 'latitude', title: 'Latitude' },
        { id: 'longitude', title: 'Longitude' },
        { id: 'latitudeDecimal', title: 'Latitude (Decimal)' },
        { id: 'longitudeDecimal', title: 'Longitude (Decimal)' },
        { id: 'speed', title: 'Speed' },
        { id: 'course', title: 'Course' },
        { id: 'nextWaypoint', title: 'Next Waypoint' },
        { id: 'dtf', title: 'DTF (NM)' },
        { id: 'vmg', title: 'VMG (knots)' },
        { id: 'sourceUrl', title: 'Source URL' },
        { id: 'scrapedAt', title: 'Scraped At' }
      ]
    });

    // Write the timestamped file
    await csvWriter.writeRecords(rowData);
    console.log(`Data saved to ${filepath}`);

    // Copy to latest.csv
    fs.copyFileSync(filepath, latestFilepath);
    console.log(`Data also saved to ${latestFilepath}`);

    // Save to database with upsert to handle duplicates
    try {
      console.log('Saving data to database...');
      
      // Ensure database connection
      await ensureConnection();
      
      // Use individual upsert operations to handle duplicates
      let upsertedCount = 0;
      for (const row of rowData) {
        await prisma.rowingData.upsert({
          where: {
            name_sourceUrl_lastUpdate: {
              name: row.name,
              sourceUrl: row.sourceUrl,
              lastUpdate: row.lastUpdate
            }
          },
          update: {
            no: row.no,
            device: row.device,
            latitude: row.latitude,
            longitude: row.longitude,
            latitudeDecimal: row.latitudeDecimal,
            longitudeDecimal: row.longitudeDecimal,
            speed: row.speed,
            course: row.course,
            nextWaypoint: row.nextWaypoint,
            dtf: row.dtf,
            vmg: row.vmg,
            scrapedAt: new Date(scrapedAt)
          },
          create: {
            no: row.no,
            device: row.device,
            name: row.name,
            lastUpdate: row.lastUpdate,
            latitude: row.latitude,
            longitude: row.longitude,
            latitudeDecimal: row.latitudeDecimal,
            longitudeDecimal: row.longitudeDecimal,
            speed: row.speed,
            course: row.course,
            nextWaypoint: row.nextWaypoint,
            dtf: row.dtf,
            vmg: row.vmg,
            sourceUrl: row.sourceUrl,
            scrapedAt: new Date(scrapedAt)
          }
        });
        upsertedCount++;
      }

      console.log(`Successfully upserted ${upsertedCount} records to database (duplicates ignored)`);
    } catch (dbError) {
      console.error('Error saving to database:', dbError);
      // Don't throw - we still want the CSV to be saved even if DB fails
    }

  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Error fetching data:', error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
      }
    } else {
      console.error('Error during scraping:', error);
    }
    throw error;
  }
}

