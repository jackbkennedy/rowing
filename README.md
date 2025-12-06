# Rowing Data Scraper & Analytics

A TypeScript Express server that automatically scrapes World's Toughest Row race data, saves it to a PostgreSQL database, and provides analytics endpoints and interactive visualizations for tracking boat positions and performance over time.

## 🌟 Features

- 🕐 **Automatic Data Scraping** - Runs every hour via cron jobs
- 📊 **HTML Parsing** - Extracts race tracking data from multiple sources
- 💾 **Dual Storage** - Saves to both CSV files and PostgreSQL database
- 📈 **Analytics API** - Comprehensive endpoints for team performance analysis
- 🗺️ **Interactive Map** - Real-time boat tracking with time-slider
- 🚀 **Manual Triggers** - On-demand scraping for any YB Tracking URL
- 🔥 **Hot Reloading** - Development mode with automatic restarts
- 🌐 **Coordinate Conversion** - Converts GPS coordinates to decimal format

## Prerequisites

- Node.js 18+ or compatible version
- PostgreSQL database
- Yarn package manager (recommended) or npm

## 🚀 Installation

1. **Install dependencies:**

```bash
yarn install
# or
npm install
```

2. **Set up environment variables:**

Create a `.env` file in the root directory:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
PORT=3000
```

3. **Set up the database:**

```bash
# Generate Prisma client
yarn db:generate

# Push schema to database
yarn db:push
```

## 🐳 Database Setup

### Using Docker (Recommended for Development)

```bash
docker run --name rowing-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=rowing \
  -p 5432:5432 \
  -d postgres:15
```

Then use this connection string in your `.env`:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rowing?schema=public"
```

### Manual Setup

1. Create a PostgreSQL database named `rowing`
2. Update the `DATABASE_URL` in `.env` file
3. Run migrations:

```bash
yarn db:push
```

## 🌍 Timezone Handling

The application intelligently handles timezones to ensure data is grouped correctly regardless of where you're viewing from:

### How It Works

1. **Data Storage**: All data is stored in the database with UTC timestamps
2. **Frontend Detection**: The web interface automatically detects your browser's timezone
3. **Backend Conversion**: API endpoints accept a `timezone` parameter (offset in hours from UTC)
4. **Data Grouping**: Days and time windows are calculated based on your local time

### Why This Matters

When you view the analytics at midnight in Ireland (UTC+0):
- ✅ **With timezone handling**: Data from 23:00-01:00 stays in the same day
- ❌ **Without timezone handling**: Data would be split across two different days

### Examples

**Ireland (UTC+0 in winter):**
```javascript
timezone = 0
```

**Ireland (UTC+1 in summer):**
```javascript
timezone = 1
```

**New York (EST, UTC-5):**
```javascript
timezone = -5
```

**New York (EDT, UTC-4):**
```javascript
timezone = -4
```

### Automatic Detection

The web views automatically handle this for you:
- Analytics view detects your timezone and sends it with every request
- "Today" option shows data for today in YOUR timezone
- Time windows (00:00-04:00, etc.) are in YOUR local time

### API Usage

For direct API calls, add the `timezone` parameter:

```bash
# View today's data in Ireland time (UTC+0)
curl "http://localhost:3000/analytics/table?sourceUrl=https://yb.tl/Simple/arc2025&timezone=0"

# View today's data in New York time (EST, UTC-5)
curl "http://localhost:3000/analytics/table?sourceUrl=https://yb.tl/Simple/arc2025&timezone=-5"

# View specific date in your timezone
curl "http://localhost:3000/analytics/table?sourceUrl=https://yb.tl/Simple/arc2025&date=2025-12-06&timezone=0"
```

## 📦 Build & Run

### Development Mode (with Hot Reloading)

```bash
yarn dev
```

### Production Mode

```bash
yarn build
yarn start
```

### View Database

Open Prisma Studio to view and manage database data:

```bash
yarn db:studio
```

This opens a web interface at `http://localhost:5555`.

## 📝 Available Scripts

| Script | Description |
|--------|-------------|
| `yarn dev` | Start development server with hot reloading |
| `yarn build` | Build TypeScript to JavaScript |
| `yarn start` | Start production server |
| `yarn db:generate` | Generate Prisma client |
| `yarn db:push` | Push schema changes to database |
| `yarn db:migrate` | Create and run migrations |
| `yarn db:studio` | Open Prisma Studio (database GUI) |

## 🌐 API Endpoints

### System Endpoints

#### `GET /`
**Info endpoint** - Returns server status and available endpoints

**Response:**
```json
{
  "status": "Server is running",
  "message": "Data scraping runs every hour",
  "endpoints": {
    "health": "/health",
    "scrapeDefault": "/scrape-now",
    "scrapeCustomUrl": "/scrape-url?url=YOUR_URL_HERE",
    "teamAnalytics": "/analytics/team?name=TEAM_NAME&sourceUrl=URL",
    "tableAnalytics": "/analytics/table?sourceUrl=URL&date=YYYY-MM-DD",
    "mapView": "/map",
    "analyticsView": "/analytics-view",
    "mapData": "/map/data?sourceUrl=URL"
  },
  "nextRun": "Check logs for next scheduled run"
}
```

#### `GET /health`
**Health check** - Verifies server and database connectivity

**Response (healthy):**
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2025-12-06T10:00:00.000Z"
}
```

**Response (unhealthy):**
```json
{
  "status": "error",
  "database": "disconnected",
  "error": "Connection timeout",
  "timestamp": "2025-12-06T10:00:00.000Z"
}
```

### Scraping Endpoints

#### `GET /scrape-now`
**Manual trigger** - Scrapes data from default URLs immediately

**Default URLs:**
- `https://yb.tl/Simple/wtrsvghjkl23`
- `https://yb.tl/Simple/arc2025`

**What it does:**
- Fetches latest data from all configured sources
- Saves to both CSV files and database
- Uses upsert to prevent duplicates

**Response:**
```json
{
  "success": true,
  "message": "Data scraped and saved successfully"
}
```

#### `GET /scrape-url?url=<URL>`
**Custom URL scraper** - Scrapes data from any YB Tracking URL

**Query Parameters:**
- `url` (required) - Full YB Tracking URL to scrape

**Example:**
```
GET /scrape-url?url=https://yb.tl/Simple/arc2025
```

**What it does:**
- Validates the URL format
- Scrapes data from the specified page
- Saves to timestamped CSV and database
- Maintains a `latest-{urlSlug}.csv` file

**Response:**
```json
{
  "success": true,
  "message": "Data scraped from https://yb.tl/Simple/arc2025 and saved successfully"
}
```

### Analytics Endpoints

#### `GET /analytics/team`
**Team performance analytics** - Get detailed speed analytics for a specific team

**Query Parameters:**
- `name` (required) - Team name
- `sourceUrl` (optional) - Filter by source URL
- `startDate` (optional) - Start date (ISO format: YYYY-MM-DD)
- `endDate` (optional) - End date (ISO format: YYYY-MM-DD)
- `timezone` (optional) - Timezone offset in hours from UTC (e.g., 0 for UTC, 1 for Ireland in summer, -5 for EST)

**Example:**
```
GET /analytics/team?name=Team%20Atlantic&sourceUrl=https://yb.tl/Simple/arc2025&timezone=0
```

**What it provides:**
- Daily average speed statistics (in user's timezone)
- 4-hour time window breakdown (00:00-04:00, 04:00-08:00, etc.)
- Data point counts for reliability assessment
- Historical performance tracking

**Response:**
```json
{
  "success": true,
  "data": {
    "teamName": "Team Atlantic",
    "sourceUrl": "https://yb.tl/Simple/arc2025",
    "dailyStats": [
      {
        "date": "2025-12-06",
        "avgSpeed": 3.45,
        "dataPoints": 24,
        "timeWindows": [
          {
            "window": "00:00-04:00",
            "startHour": 0,
            "endHour": 4,
            "avgSpeed": 3.21,
            "dataPoints": 4
          }
        ]
      }
    ]
  }
}
```

#### `GET /analytics/table`
**Comparative table analytics** - Get performance comparison for all teams on a specific day

**Query Parameters:**
- `sourceUrl` (required) - Source URL to filter by
- `date` (optional) - Date to analyze (YYYY-MM-DD), defaults to today in user's timezone
- `timezone` (optional) - Timezone offset in hours from UTC (e.g., 0 for UTC, 1 for Ireland in summer, -5 for EST)

**Example:**
```
GET /analytics/table?sourceUrl=https://yb.tl/Simple/arc2025&date=2025-12-06&timezone=0
```

**What it provides:**
- All teams' performance for the specified day (in user's timezone)
- 4-hour time window breakdowns
- 7-day historical average comparison
- Percentage change calculations
- Speed difference indicators

**Response:**
```json
{
  "success": true,
  "date": "2025-12-06",
  "sourceUrl": "https://yb.tl/Simple/arc2025",
  "comparisonPeriod": "7 days",
  "count": 15,
  "data": [
    {
      "teamName": "Team Atlantic",
      "dailyAverage": 3.45,
      "sevenDayAverage": 3.21,
      "dataPoints": 24,
      "historicalDataPoints": 168,
      "00:00-04:00": {
        "current": 3.21,
        "sevenDayAvg": 3.15,
        "diff": 0.06,
        "percentChange": 1.9
      },
      "04:00-08:00": {
        "current": 3.67,
        "sevenDayAvg": 3.25,
        "diff": 0.42,
        "percentChange": 12.9
      }
    }
  ]
}
```

**Use Cases:**
- Compare team performance across different time windows
- Identify teams improving or declining in performance
- Analyze optimal rowing periods (when teams perform best)
- Track race position changes over time

**Timezone Handling:**
The frontend automatically detects and sends the user's timezone. When viewing at midnight in Ireland (UTC+0), data is correctly grouped by Irish time rather than mixing days.

#### `GET /analytics/dates`
**Available dates** - Get list of dates with available data for a source

**Query Parameters:**
- `sourceUrl` (required) - Source URL to check
- `timezone` (optional) - Timezone offset in hours from UTC

**Example:**
```
GET /analytics/dates?sourceUrl=https://yb.tl/Simple/arc2025&timezone=0
```

**What it provides:**
- List of all dates with scraped data (in user's timezone)
- Sorted in descending order (most recent first)

**Response:**
```json
{
  "success": true,
  "dates": [
    "2025-12-06",
    "2025-12-05",
    "2025-12-04"
  ]
}
```

### Map Endpoints

#### `GET /map/data`
**Historical positions** - Get all boat positions over time for map visualization

**Query Parameters:**
- `sourceUrl` (required) - Source URL to filter by

**Example:**
```
GET /map/data?sourceUrl=https://yb.tl/Simple/arc2025
```

**What it provides:**
- Complete position history for all boats
- Organized by timestamp for time-slider functionality
- **Intelligently filtered** to only include meaningful timestamps (where 50%+ of boats have data)
- Speed comparisons between timestamps
- Filtered to valid coordinates only

**Smart Filtering:**
The endpoint automatically filters out redundant scrapes. Since the scraper runs hourly but the YB Tracking website only updates every ~4 hours, many scrapes are duplicates. The filtering ensures the map time-slider only shows timestamps with meaningful data changes, not every hourly scrape.

**Response:**
```json
{
  "success": true,
  "timestamps": [
    "2025-12-06T11:00:00.000Z",
    "2025-12-06T10:00:00.000Z"
  ],
  "data": [
    {
      "timestamp": "2025-12-06T10:00:00.000Z",
      "boats": [
        {
          "name": "Team Atlantic",
          "lat": 28.12345,
          "lng": -16.78901,
          "latOriginal": "028° 07.407N",
          "lngOriginal": "016° 47.341W",
          "speed": 3.45,
          "course": 245,
          "lastUpdate": "06/12 09:55",
          "scrapedAt": "2025-12-06T10:00:00.000Z",
          "avgSpeed": 3.45,
          "prevAvgSpeed": 3.21,
          "speedDiff": 0.24,
          "percentChange": 7.5
        }
      ]
    }
  ],
  "boatCount": 15,
  "totalTimestamps": 48,
  "filteredTimestamps": 12
}
```

## 🖥️ Web Views

### Map View
**URL:** `GET /map` or `http://localhost:3000/map`

**Interactive features:**
- Real-time boat positions on a map
- Time slider to view historical positions
- Boat trails showing path taken
- Speed indicators and team information
- Pan and zoom navigation

**What you can do:**
- Track race progress over time
- Compare boat routes and strategies
- Identify weather patterns affecting routes
- Analyze position changes during specific time periods

### Analytics View
**URL:** `GET /analytics-view` or `http://localhost:3000/analytics-view`

**Interactive features:**
- Filterable table of team performance
- Date selector for historical analysis
- Source URL switcher for different races
- 7-day comparison metrics
- Time window breakdowns (4-hour intervals)

**What you can do:**
- Compare all teams' performance on a specific day
- See how teams perform during different times of day
- Track performance trends over the 7-day window
- Identify fastest/slowest teams and time periods
- Export or analyze speed differentials

## ⏰ Automated Cron Jobs

### Hourly Data Scraping
**Schedule:** `0 * * * *` (Every hour at :00 minutes)

**What it does:**
1. Scrapes all default URLs automatically
2. Saves data to CSV files with timestamps
3. Upserts data to PostgreSQL database
4. Logs success/failure to console

**Example log output:**
```
[CRON] Running scheduled data scrape at 2025-12-06T10:00:00.000Z
Fetching data from https://yb.tl/Simple/wtrsvghjkl23...
Parsed 15 rows of data
Data saved to rowing-data-wtrsvghjkl23-2025-12-06T10-00-00-000Z.csv
Successfully upserted 15 records to database
[CRON] Scheduled scrape completed successfully at 2025-12-06T10:00:15.234Z
```

**Initial scrape:**
- The server also runs a scrape immediately on startup
- Ensures fresh data is available when the server starts

**Monitoring:**
- Check `/health` endpoint to verify system status
- View logs for cron execution times and results
- Use Prisma Studio to verify data is being saved

## 💾 Data Storage

### CSV Files
All CSV files are stored in the `data/` directory:

**File naming:**
- `rowing-data-{urlSlug}-{timestamp}.csv` - Historical snapshots
- `latest-{urlSlug}.csv` - Most recent data for each source

**CSV Columns:**
| Column | Description | Example |
|--------|-------------|---------|
| No | Boat number | 1 |
| Device | Tracking device ID | YB3i-42 |
| Name | Team/boat name | Team Atlantic |
| Last Update (UTC) | Last position update | 06/12 09:55 |
| Latitude | Latitude (degrees/minutes) | 028° 07.407N |
| Longitude | Longitude (degrees/minutes) | 016° 47.341W |
| Latitude (Decimal) | Latitude in decimal format | 28.123450 |
| Longitude (Decimal) | Longitude in decimal format | -16.789017 |
| Speed | Current speed (knots) | 3.45 |
| Course | Heading in degrees | 245 |
| Next Waypoint | Next waypoint name | Antigua |
| DTF (NM) | Distance to finish | 2,456.78 |
| VMG (knots) | Velocity made good | 3.21 |
| Source URL | URL data was scraped from | https://yb.tl/Simple/arc2025 |
| Scraped At | Timestamp of scrape | 2025-12-06T10:00:00.000Z |

### Database Schema

**Table:** `rowing_data`

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| id | UUID | Unique identifier | Primary Key |
| no | String | Boat number | |
| device | String | Tracking device | |
| name | String | Team name | Part of unique constraint |
| lastUpdate | String | Last update time | Part of unique constraint |
| latitude | String | Latitude (DMS format) | |
| longitude | String | Longitude (DMS format) | |
| latitudeDecimal | String | Latitude (decimal) | |
| longitudeDecimal | String | Longitude (decimal) | |
| speed | String | Speed in knots | |
| course | String | Course/heading | |
| nextWaypoint | String | Next waypoint | |
| dtf | String | Distance to finish | |
| vmg | String | Velocity made good | |
| sourceUrl | String | Source URL | Part of unique constraint |
| scrapedAt | DateTime | Scrape timestamp | |
| createdAt | DateTime | Record creation | Auto-generated |
| updatedAt | DateTime | Last update | Auto-generated |

**Unique Constraint:** `name + sourceUrl + lastUpdate`
- Prevents duplicate entries for the same boat at the same update time
- Allows updates if coordinates/speed change for the same timestamp

## 🎯 Use Cases

### For Race Organizers
- Monitor all boats in real-time
- Verify tracking system functionality
- Generate performance reports
- Archive race data for historical records

### For Spectators
- Follow favorite teams on the map
- Compare team performance over time
- Understand race strategies by analyzing routes
- See when teams are performing best

### For Data Analysis
- CSV export for custom analysis
- API access for building custom dashboards
- Historical data for machine learning models
- Performance trend analysis

### For Developers
- REST API for integrating into other applications
- Real-time data feed for custom visualizations
- Extensible scraper for additional data sources
- Clean data structure for further processing

## 🔧 Configuration

### Default Scrape URLs
Edit in `src/scraper.ts`:

```typescript
const DEFAULT_URLS = [
  'https://yb.tl/Simple/wtrsvghjkl23',
  'https://yb.tl/Simple/arc2025'
];
```

### Cron Schedule
Edit in `src/server.ts`:

```typescript
// Current: Every hour at :00 minutes
const cronJob = cron.schedule('0 * * * *', async () => {
  // scraping logic
});

// Examples:
// Every 30 minutes: '*/30 * * * *'
// Every 2 hours: '0 */2 * * *'
// Every day at midnight: '0 0 * * *'
```

## 🐛 Troubleshooting

### Database Connection Issues
```bash
# Check if PostgreSQL is running
docker ps

# Restart the database
docker restart rowing-postgres

# Verify connection string in .env
# Ensure host, port, username, password are correct
```

### Cron Not Running
- Check server logs for cron execution messages
- Verify server is running (`yarn dev` or `yarn start`)
- Test manual scrape: `GET /scrape-now`

### No Data Appearing
- Check if URLs are accessible
- Verify HTML structure hasn't changed on source site
- Check database for errors in logs
- Use Prisma Studio to inspect data

### Port Already in Use
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or change PORT in .env file
PORT=3001
```

## 📊 Performance Notes

- **Table Analytics Endpoint:** Optimized to use only 2 database queries regardless of team count
- **Map Data:** Returns all historical data; consider pagination for very large datasets
- **Database Indexing:** Unique constraint on `name + sourceUrl + lastUpdate` improves query performance
- **CSV Files:** Stored indefinitely; consider implementing cleanup for old files

## 🚀 Deployment

This project includes a `render.yaml` configuration for deployment to Render.com or similar platforms.

**Key considerations:**
- Set `DATABASE_URL` environment variable
- Ensure database is accessible from deployment platform
- Cron jobs will run automatically once deployed
- Set `PORT` environment variable if required by platform

## 📄 License

ISC

## 🤝 Contributing

Feel free to submit issues, fork the repository, and create pull requests for any improvements.

---

**Built with:** TypeScript, Express, Prisma, Cheerio, Node-Cron, PostgreSQL
