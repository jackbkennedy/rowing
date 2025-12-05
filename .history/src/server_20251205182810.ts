import express, { Request, Response } from 'express';
import cron from 'node-cron';
import dotenv from 'dotenv';
import { scrapeAndSaveData } from './scraper';
import prisma from './database';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({ 
    status: 'Server is running',
    message: 'Data scraping runs every 2 hours',
    nextRun: 'Check logs for next scheduled run'
  });
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

// Schedule cron job to run every 2 hours
// Format: minute hour day month day-of-week
cron.schedule('0 */2 * * *', async () => {
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
  console.log(`Cron job scheduled to run every 2 hours`);
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

