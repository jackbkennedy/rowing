import { Request, Response } from 'express';
import prisma from './database';

interface TimeWindow {
  window: string;
  startHour: number;
  endHour: number;
  avgSpeed: number;
  dataPoints: number;
}

interface DailyStats {
  date: string;
  avgSpeed: number;
  dataPoints: number;
  timeWindows: TimeWindow[];
}

interface TeamAnalytics {
  teamName: string;
  sourceUrl: string;
  dailyStats: DailyStats[];
}

/**
 * Get analytics for a specific team
 * Query params:
 * - name: team name (required)
 * - sourceUrl: source URL to filter by (optional)
 * - startDate: start date for analytics (optional, ISO format)
 * - endDate: end date for analytics (optional, ISO format)
 */
export async function getTeamAnalytics(req: Request, res: Response) {
  try {
    const { name, sourceUrl, startDate, endDate } = req.query;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Team name is required. Example: /analytics/team?name=TeamName&sourceUrl=https://yb.tl/Simple/arc2025'
      });
    }

    // Build query filter
    const where: any = { name };
    
    if (sourceUrl && typeof sourceUrl === 'string') {
      where.sourceUrl = sourceUrl;
    }

    if (startDate || endDate) {
      where.scrapedAt = {};
      if (startDate && typeof startDate === 'string') {
        where.scrapedAt.gte = new Date(startDate);
      }
      if (endDate && typeof endDate === 'string') {
        where.scrapedAt.lte = new Date(endDate);
      }
    }

    // Fetch all data for the team
    const data = await prisma.rowingData.findMany({
      where,
      orderBy: { scrapedAt: 'asc' }
    });

    if (data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No data found for the specified team'
      });
    }

    // Calculate statistics
    const analytics = calculateAnalytics(data);

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error getting team analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error calculating analytics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get analytics in table format for all teams on a specific day
 * with 7-day average comparisons
 * Query params:
 * - sourceUrl: source URL to filter by (required)
 * - date: date to analyze (optional, defaults to today, format: YYYY-MM-DD)
 */
export async function getTableAnalytics(req: Request, res: Response) {
  try {
    const { sourceUrl, date } = req.query;

    if (!sourceUrl || typeof sourceUrl !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Source URL is required. Example: /analytics/table?sourceUrl=https://yb.tl/Simple/arc2025&date=2025-12-05'
      });
    }

    // Parse date or use today
    const targetDate = date && typeof date === 'string' ? date : new Date().toISOString().split('T')[0];
    const startOfDay = new Date(targetDate + 'T00:00:00Z');
    const endOfDay = new Date(targetDate + 'T23:59:59Z');
    
    // Calculate date range for 7-day average (7 days before target date)
    const sevenDaysAgo = new Date(startOfDay);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get all unique team names for this source URL
    const teams = await prisma.rowingData.findMany({
      where: { sourceUrl },
      select: { name: true },
      distinct: ['name'],
      orderBy: { name: 'asc' }
    });

    // Calculate analytics for each team
    const tableData = [];

    for (const team of teams) {
      // Get data for the target day
      const teamData = await prisma.rowingData.findMany({
        where: {
          sourceUrl,
          name: team.name,
          scrapedAt: {
            gte: startOfDay,
            lte: endOfDay
          }
        },
        orderBy: { scrapedAt: 'asc' }
      });

      // Get data for the last 7 days (for comparison)
      const sevenDayData = await prisma.rowingData.findMany({
        where: {
          sourceUrl,
          name: team.name,
          scrapedAt: {
            gte: sevenDaysAgo,
            lt: startOfDay // Don't include today
          }
        },
        orderBy: { scrapedAt: 'asc' }
      });

      // Calculate time window averages
      const windows = [
        { name: '00:00-04:00', start: 0, end: 4 },
        { name: '04:00-08:00', start: 4, end: 8 },
        { name: '08:00-12:00', start: 8, end: 12 },
        { name: '12:00-16:00', start: 12, end: 16 },
        { name: '16:00-20:00', start: 16, end: 20 },
        { name: '20:00-24:00', start: 20, end: 24 }
      ];

      const timeWindowData: { [key: string]: any } = {};

      windows.forEach(window => {
        // Current day data for this window
        const windowData = teamData.filter(d => {
          const hour = new Date(d.scrapedAt).getUTCHours();
          return hour >= window.start && hour < window.end;
        });

        // 7-day historical data for this window
        const historicalWindowData = sevenDayData.filter(d => {
          const hour = new Date(d.scrapedAt).getUTCHours();
          return hour >= window.start && hour < window.end;
        });

        let currentSpeed = null;
        let sevenDayAvg = null;
        let diff = null;
        let percentChange = null;

        if (windowData.length > 0) {
          const speeds = windowData.map(d => parseFloat(d.speed) || 0);
          currentSpeed = parseFloat((speeds.reduce((a, b) => a + b, 0) / speeds.length).toFixed(2));
        }

        if (historicalWindowData.length > 0) {
          const historicalSpeeds = historicalWindowData.map(d => parseFloat(d.speed) || 0);
          sevenDayAvg = parseFloat((historicalSpeeds.reduce((a, b) => a + b, 0) / historicalSpeeds.length).toFixed(2));
        }

        // Calculate difference and percent change
        if (currentSpeed !== null && sevenDayAvg !== null) {
          diff = parseFloat((currentSpeed - sevenDayAvg).toFixed(2));
          percentChange = parseFloat(((diff / sevenDayAvg) * 100).toFixed(1));
        }

        timeWindowData[window.name] = {
          current: currentSpeed,
          sevenDayAvg: sevenDayAvg,
          diff: diff,
          percentChange: percentChange
        };
      });

      // Calculate daily average (only from available data)
      const allSpeeds = teamData.map(d => parseFloat(d.speed) || 0);
      const dailyAvg = allSpeeds.length > 0 
        ? parseFloat((allSpeeds.reduce((a, b) => a + b, 0) / allSpeeds.length).toFixed(2))
        : null;

      // Calculate 7-day overall average
      const allHistoricalSpeeds = sevenDayData.map(d => parseFloat(d.speed) || 0);
      const sevenDayOverallAvg = allHistoricalSpeeds.length > 0
        ? parseFloat((allHistoricalSpeeds.reduce((a, b) => a + b, 0) / allHistoricalSpeeds.length).toFixed(2))
        : null;

      tableData.push({
        teamName: team.name,
        dailyAverage: dailyAvg,
        sevenDayAverage: sevenDayOverallAvg,
        dataPoints: teamData.length,
        historicalDataPoints: sevenDayData.length,
        ...timeWindowData
      });
    }

    res.json({
      success: true,
      date: targetDate,
      sourceUrl,
      comparisonPeriod: '7 days',
      count: tableData.length,
      data: tableData
    });
  } catch (error) {
    console.error('Error getting table analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error calculating table analytics',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get available dates for a source URL
 */
export async function getAvailableDates(req: Request, res: Response) {
  try {
    const { sourceUrl } = req.query;

    if (!sourceUrl || typeof sourceUrl !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Source URL is required'
      });
    }

    const dates = await prisma.$queryRaw<any[]>`
      SELECT DISTINCT DATE("scrapedAt") as date
      FROM rowing_data
      WHERE "sourceUrl" = ${sourceUrl}
      ORDER BY date DESC
    `;

    res.json({
      success: true,
      dates: dates.map(d => d.date.toISOString().split('T')[0])
    });
  } catch (error) {
    console.error('Error getting available dates:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dates',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

function calculateAnalytics(data: any[]): TeamAnalytics {
  const teamName = data[0].name;
  const sourceUrl = data[0].sourceUrl;

  // Group data by date
  const dataByDate: { [key: string]: any[] } = {};

  data.forEach(record => {
    const date = new Date(record.scrapedAt);
    const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

    if (!dataByDate[dateKey]) {
      dataByDate[dateKey] = [];
    }
    dataByDate[dateKey].push(record);
  });

  // Calculate daily stats with time windows
  const dailyStats: DailyStats[] = Object.keys(dataByDate).sort().map(date => {
    const dayData = dataByDate[date];

    // Calculate overall daily average
    const speeds = dayData.map(d => parseFloat(d.speed) || 0);
    const avgSpeed = speeds.length > 0 
      ? speeds.reduce((a, b) => a + b, 0) / speeds.length 
      : 0;

    // Calculate time window averages (4-hour windows)
    const timeWindows: TimeWindow[] = [];
    const windows = [
      { name: '00:00-04:00', start: 0, end: 4 },
      { name: '04:00-08:00', start: 4, end: 8 },
      { name: '08:00-12:00', start: 8, end: 12 },
      { name: '12:00-16:00', start: 12, end: 16 },
      { name: '16:00-20:00', start: 16, end: 20 },
      { name: '20:00-24:00', start: 20, end: 24 }
    ];

    windows.forEach(window => {
      const windowData = dayData.filter(d => {
        const hour = new Date(d.scrapedAt).getUTCHours();
        return hour >= window.start && hour < window.end;
      });

      if (windowData.length > 0) {
        const windowSpeeds = windowData.map(d => parseFloat(d.speed) || 0);
        const windowAvg = windowSpeeds.reduce((a, b) => a + b, 0) / windowSpeeds.length;

        timeWindows.push({
          window: window.name,
          startHour: window.start,
          endHour: window.end,
          avgSpeed: parseFloat(windowAvg.toFixed(2)),
          dataPoints: windowData.length
        });
      }
    });

    return {
      date,
      avgSpeed: parseFloat(avgSpeed.toFixed(2)),
      dataPoints: dayData.length,
      timeWindows
    };
  });

  return {
    teamName,
    sourceUrl,
    dailyStats
  };
}

