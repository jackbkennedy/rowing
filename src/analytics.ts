import { Request, Response } from 'express';
import prisma, { ensureConnection } from './database';

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
 * - startDate: start date for analytics (optional, ISO format YYYY-MM-DD)
 * - endDate: end date for analytics (optional, ISO format YYYY-MM-DD)
 * - timezone: timezone offset in hours (optional, defaults to 0 for UTC)
 */
export async function getTeamAnalytics(req: Request, res: Response) {
  try {
    const { name, sourceUrl, startDate, endDate, timezone } = req.query;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Team name is required. Example: /analytics/team?name=TeamName&sourceUrl=https://yb.tl/Simple/arc2025'
      });
    }

    // Parse timezone offset (default to 0 for UTC)
    const timezoneOffset = timezone && typeof timezone === 'string' ? parseInt(timezone, 10) : 0;

    // Build query filter
    const where: any = { name };
    
    if (sourceUrl && typeof sourceUrl === 'string') {
      where.sourceUrl = sourceUrl;
    }

    if (startDate || endDate) {
      where.scrapedAt = {};
      if (startDate && typeof startDate === 'string') {
        const start = new Date(startDate + 'T00:00:00Z');
        start.setHours(start.getHours() - timezoneOffset);
        where.scrapedAt.gte = start;
      }
      if (endDate && typeof endDate === 'string') {
        const end = new Date(endDate + 'T23:59:59.999Z');
        end.setHours(end.getHours() - timezoneOffset);
        where.scrapedAt.lte = end;
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

    // Calculate statistics with timezone adjustment
    const analytics = calculateAnalytics(data, timezoneOffset);

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
 * with 7-day average comparisons (OPTIMIZED)
 * Query params:
 * - sourceUrl: source URL to filter by (required)
 * - date: date to analyze (optional, defaults to today UTC, format: YYYY-MM-DD)
 * - timezone: timezone offset in hours (optional, defaults to 0 for UTC)
 */
export async function getTableAnalytics(req: Request, res: Response) {
  try {
    const { sourceUrl, date, timezone } = req.query;

    if (!sourceUrl || typeof sourceUrl !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Source URL is required. Example: /analytics/table?sourceUrl=https://yb.tl/Simple/arc2025&date=2025-12-05'
      });
    }

    // Ensure database connection
    await ensureConnection();

    // Parse timezone offset (default to 0 for UTC)
    const timezoneOffset = timezone && typeof timezone === 'string' ? parseInt(timezone, 10) : 0;
    
    // Parse date or use today in the specified timezone
    let targetDate: string;
    if (date && typeof date === 'string') {
      targetDate = date;
    } else {
      // Get current date in the user's timezone
      const now = new Date();
      const userDate = new Date(now.getTime() + timezoneOffset * 60 * 60 * 1000);
      targetDate = userDate.toISOString().split('T')[0];
    }
    
    // Calculate the UTC time range that corresponds to the target date in user's timezone
    // For example, if user is in EST (UTC-5) and wants Dec 5:
    // - Dec 5 00:00 EST = Dec 5 05:00 UTC (start)
    // - Dec 5 23:59 EST = Dec 6 04:59 UTC (end)
    const startOfDay = new Date(targetDate + 'T00:00:00.000Z');
    const endOfDay = new Date(targetDate + 'T23:59:59.999Z');
    
    // Adjust for timezone: subtract offset to get the UTC time when it's midnight in user's timezone
    // If user is UTC+1, midnight for them is 23:00 UTC the previous day
    // If user is UTC-5, midnight for them is 05:00 UTC the same day
    startOfDay.setMinutes(startOfDay.getMinutes() - timezoneOffset * 60);
    endOfDay.setMinutes(endOfDay.getMinutes() - timezoneOffset * 60);
    
    // Calculate date range for 7-day average (7 days before target date)
    const sevenDaysAgo = new Date(startOfDay);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // OPTIMIZED: Fetch ALL data in just 2 queries instead of 2*N queries
    const [todayData, historicalData] = await Promise.all([
      // Query 1: All teams' data for today
      prisma.rowingData.findMany({
        where: {
          sourceUrl,
          scrapedAt: {
            gte: startOfDay,
            lte: endOfDay
          }
        },
        orderBy: { name: 'asc' }
      }),
      // Query 2: All teams' data for last 7 days
      prisma.rowingData.findMany({
        where: {
          sourceUrl,
          scrapedAt: {
            gte: sevenDaysAgo,
            lt: startOfDay
          }
        },
        orderBy: { name: 'asc' }
      })
    ]);

    // Group data by team name
    const teamDataMap: { [key: string]: any[] } = {};
    const teamHistoricalMap: { [key: string]: any[] } = {};

    todayData.forEach(record => {
      if (!teamDataMap[record.name]) teamDataMap[record.name] = [];
      teamDataMap[record.name].push(record);
    });

    historicalData.forEach(record => {
      if (!teamHistoricalMap[record.name]) teamHistoricalMap[record.name] = [];
      teamHistoricalMap[record.name].push(record);
    });

    // Get unique team names
    const teamNames = Array.from(new Set([...Object.keys(teamDataMap), ...Object.keys(teamHistoricalMap)])).sort();

    // Calculate analytics for each team (now in memory, no more DB queries)
    const windows = [
      { name: '00:00-04:00', start: 0, end: 4 },
      { name: '04:00-08:00', start: 4, end: 8 },
      { name: '08:00-12:00', start: 8, end: 12 },
      { name: '12:00-16:00', start: 12, end: 16 },
      { name: '16:00-20:00', start: 16, end: 20 },
      { name: '20:00-24:00', start: 20, end: 24 }
    ];

    const tableData = teamNames.map(teamName => {
      const teamData = teamDataMap[teamName] || [];
      const sevenDayData = teamHistoricalMap[teamName] || [];

      const timeWindowData: { [key: string]: any } = {};

      windows.forEach(window => {
        // Current day data for this window
        // Convert UTC timestamp to user's timezone and check which hour window it falls into
        const windowData = teamData.filter(d => {
          const utcDate = new Date(d.scrapedAt);
          // Get the hour in user's timezone
          const localHour = (utcDate.getUTCHours() + timezoneOffset + 24) % 24;
          return localHour >= window.start && localHour < window.end;
        });

        // 7-day historical data for this window
        const historicalWindowData = sevenDayData.filter(d => {
          const utcDate = new Date(d.scrapedAt);
          // Get the hour in user's timezone
          const localHour = (utcDate.getUTCHours() + timezoneOffset + 24) % 24;
          return localHour >= window.start && localHour < window.end;
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

      return {
        teamName: teamName,
        dailyAverage: dailyAvg,
        sevenDayAverage: sevenDayOverallAvg,
        dataPoints: teamData.length,
        historicalDataPoints: sevenDayData.length,
        ...timeWindowData
      };
    });

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
 * Query params:
 * - sourceUrl: source URL (required)
 * - timezone: timezone offset in hours (optional, defaults to 0 for UTC)
 */
export async function getAvailableDates(req: Request, res: Response) {
  try {
    const { sourceUrl, timezone } = req.query;

    if (!sourceUrl || typeof sourceUrl !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Source URL is required'
      });
    }

    // Parse timezone offset (default to 0 for UTC)
    const timezoneOffset = timezone && typeof timezone === 'string' ? parseInt(timezone, 10) : 0;
    
    // Get all scraped dates and convert to user's timezone
    const data = await prisma.rowingData.findMany({
      where: { sourceUrl },
      select: { scrapedAt: true },
      orderBy: { scrapedAt: 'desc' }
    });

    // Group by date in user's timezone
    const dateSet = new Set<string>();
    data.forEach(record => {
      const userDate = new Date(record.scrapedAt.getTime() + timezoneOffset * 60 * 60 * 1000);
      const dateStr = userDate.toISOString().split('T')[0];
      dateSet.add(dateStr);
    });

    // Convert to sorted array
    const dates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));

    res.json({
      success: true,
      dates: dates
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

function calculateAnalytics(data: any[], timezoneOffset: number = 0): TeamAnalytics {
  const teamName = data[0].name;
  const sourceUrl = data[0].sourceUrl;

  // Group data by date in user's timezone
  const dataByDate: { [key: string]: any[] } = {};

  data.forEach(record => {
    const utcDate = new Date(record.scrapedAt);
    // Calculate the date in user's timezone by adding the offset and extracting the date
    const localTimestamp = utcDate.getTime() + timezoneOffset * 60 * 60 * 1000;
    const localDate = new Date(localTimestamp);
    const dateKey = localDate.toISOString().split('T')[0]; // YYYY-MM-DD in user's timezone

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
        const utcDate = new Date(d.scrapedAt);
        // Get the hour in user's timezone
        const localHour = (utcDate.getUTCHours() + timezoneOffset + 24) % 24;
        return localHour >= window.start && localHour < window.end;
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

