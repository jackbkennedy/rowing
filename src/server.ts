import express, { Request, Response } from 'express';
import cron from 'node-cron';
import dotenv from 'dotenv';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { scrapeAndSaveData } from './scraper';
import { getTeamAnalytics, getTableAnalytics, getAvailableDates } from './analytics';
import { getMapData } from './map';
import prisma, { ensureConnection } from './database';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting configurations
// General API rate limit - 100 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip rate limiting for health check
  skip: (req) => req.path === '/health'
});

// Stricter rate limit for scraping endpoints - 10 requests per hour per IP
const scrapeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 scrape requests per hour
  message: {
    error: 'Too many scrape requests from this IP, please try again later.',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Very permissive rate limit for web views - 1000 requests per 15 minutes
const webViewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: {
    error: 'Too many requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Apply rate limiters
app.use('/analytics', apiLimiter);
app.use('/map/data', apiLimiter);
app.use('/scrape-now', scrapeLimiter);
app.use('/scrape-url', scrapeLimiter);

// Health check endpoint for Render
app.get('/health', async (req: Request, res: Response) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ 
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'error',
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Main info endpoint
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API info endpoint (JSON response for programmatic access)
app.get('/api', (req: Request, res: Response) => {
  res.json({ 
    status: 'Server is running',
    message: 'Data scraping runs every hour',
    endpoints: {
      health: '/health',
      scrapeDefault: '/scrape-now',
      scrapeCustomUrl: '/scrape-url?url=YOUR_URL_HERE',
      teamAnalytics: '/analytics/team?name=TEAM_NAME&sourceUrl=URL',
      tableAnalytics: '/analytics/table?sourceUrl=URL&date=YYYY-MM-DD',
      mapView: '/map',
      analyticsView: '/analytics-view',
      mapData: '/map/data?sourceUrl=URL',
      availableDates: '/analytics/dates?sourceUrl=URL'
    },
    nextRun: 'Check logs for next scheduled run',
    documentation: 'See README.md for full API documentation'
  });
});

// Web views
app.get('/map', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/map.html'));
});

app.get('/analytics-view', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/analytics.html'));
});

app.get('/docs', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/docs.html'));
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
const cronJob = cron.schedule('0 * * * *', async () => {
  const now = new Date();
  console.log(`[CRON] Running scheduled data scrape at ${now.toISOString()}`);
  try {
    await scrapeAndSaveData();
    console.log(`[CRON] Scheduled scrape completed successfully at ${new Date().toISOString()}`);
  } catch (error) {
    console.error('[CRON] Error during scheduled scrape:', error);
  }
});

// Calculate next cron run time
function getNextCronRun(): string {
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(now.getHours() + 1);
  nextRun.setMinutes(0);
  nextRun.setSeconds(0);
  nextRun.setMilliseconds(0);
  return nextRun.toISOString();
}

// Start the server
app.listen(PORT, async () => {
  console.log('='.repeat(60));
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log('='.repeat(60));
  
  // Test database connection with retry
  let retries = 3;
  while (retries > 0) {
    try {
      await ensureConnection();
      break;
    } catch (error) {
      retries--;
      console.error(`❌ Database connection failed. Retries left: ${retries}`);
      if (retries > 0) {
        console.log('⏳ Waiting 3 seconds before retry...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }
  
  // Cron job status
  console.log('⏰ Cron job status: ACTIVE');
  console.log(`📅 Cron schedule: Every hour (at minute 0)`);
  console.log(`⏭️  Next scheduled run: ${getNextCronRun()}`);
  console.log('='.repeat(60));
  
  // Run immediately on startup
  console.log('🔄 Running initial data scrape...');
  scrapeAndSaveData()
    .then(() => console.log('✅ Initial scrape completed successfully'))
    .catch(error => console.error('❌ Error during initial scrape:', error));
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

