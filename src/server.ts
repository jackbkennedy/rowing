import express, { Request, Response } from 'express';
import cron from 'node-cron';
import dotenv from 'dotenv';
import path from 'path';
import { scrapeAndSaveData } from './scraper';
import { getTeamAnalytics, getTableAnalytics, getAvailableDates } from './analytics';
import { getMapData } from './map';
import prisma from './database';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({ 
    status: 'Server is running',
    message: 'Data scraping runs every hour',
    endpoints: {
      scrapeDefault: '/scrape-now',
      scrapeCustomUrl: '/scrape-url?url=YOUR_URL_HERE',
      teamAnalytics: '/analytics/team?name=TEAM_NAME&sourceUrl=URL',
      tableAnalytics: '/analytics/table?sourceUrl=URL&date=YYYY-MM-DD',
      mapView: '/map',
      analyticsView: '/analytics-view',
      mapData: '/map/data?sourceUrl=URL'
    },
    nextRun: 'Check logs for next scheduled run'
  });
});

// Web views
app.get('/map', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/map.html'));
});

app.get('/analytics-view', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/analytics.html'));
});

// Manual trigger endpoint
app.get('/scrape-now', async (req: Request, res: Response) => {
  try {
    console.log('Manual scrape triggered...');
    await scrapeAndSaveData();
    res.json({ 
      success: true, 
      message: 'Data scraped and saved successfully' 
    });
  } catch (error) {
    console.error('Error during manual scrape:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error scraping data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Custom URL scrape endpoint
app.get('/scrape-url', async (req: Request, res: Response) => {
  try {
    const { url } = req.query;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'URL parameter is required. Example: /scrape-url?url=https://yb.tl/Simple/arc2025'
      });
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        message: 'Invalid URL format'
      });
    }

    console.log(`Custom URL scrape triggered for: ${url}`);
    await scrapeAndSaveData(url);
    res.json({ 
      success: true, 
      message: `Data scraped from ${url} and saved successfully` 
    });
  } catch (error) {
    console.error('Error during custom URL scrape:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error scraping data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Analytics endpoints
app.get('/analytics/team', getTeamAnalytics);
app.get('/analytics/table', getTableAnalytics);
app.get('/analytics/dates', getAvailableDates);

// Map endpoints
app.get('/map/data', getMapData);

// Schedule cron job to run every hour
// Format: minute hour day month day-of-week
cron.schedule('0 * * * *', async () => {
  console.log('Running scheduled data scrape...');
  try {
    await scrapeAndSaveData();
    console.log('Scheduled scrape completed successfully');
  } catch (error) {
    console.error('Error during scheduled scrape:', error);
  }
});

// Start the server
app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Cron job scheduled to run every hour`);
  console.log(`Visit http://localhost:${PORT}/scrape-now to manually trigger a scrape`);
  
  // Test database connection
  try {
    await prisma.$connect();
    console.log('Database connected successfully');
  } catch (error) {
    console.error('Failed to connect to database:', error);
  }
  
  // Run immediately on startup
  console.log('Running initial data scrape...');
  scrapeAndSaveData()
    .then(() => console.log('Initial scrape completed successfully'))
    .catch(error => console.error('Error during initial scrape:', error));
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

