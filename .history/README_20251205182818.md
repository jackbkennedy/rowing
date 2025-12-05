# Rowing Data Scraper

A TypeScript Express server that automatically scrapes World's Toughest Row race data every 2 hours and saves it as CSV files and to a PostgreSQL database.

## Features

- 🕐 Automatic data scraping every 2 hours using cron jobs
- 📊 Parses HTML table data from the race tracking website
- 💾 Saves data as CSV files with timestamps
- 🗄️ Stores data in PostgreSQL database with Prisma ORM
- 🚀 Includes manual trigger endpoint for on-demand scraping
- 📝 Maintains a `latest.csv` file with the most recent data
- 🔥 Hot code reloading in development mode
- 🌐 Converts coordinates to decimal format

## Prerequisites

- Node.js 18+ or compatible version
- PostgreSQL database

## Installation

1. Install dependencies:

```bash
npm install
# or
yarn install
```

2. Set up your database connection in `.env`:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
```

3. Generate Prisma client and push database schema:

```bash
npm run db:generate
npm run db:push
```

## Database Setup

### Using Docker (Recommended for Development)

```bash
docker run --name rowing-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=rowing -p 5432:5432 -d postgres:15
```

### Manual Setup

1. Create a PostgreSQL database named `rowing`
2. Update the `DATABASE_URL` in `.env` file
3. Run migrations:

```bash
npm run db:push
```

## Build

```bash
npm run build
```

## Usage

### Development Mode (with Hot Reloading)

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

## Available Scripts

- `npm run dev` - Start development server with hot reloading
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema changes to database
- `npm run db:migrate` - Create and run migrations
- `npm run db:studio` - Open Prisma Studio (database GUI)

## Endpoints

- `GET /` - Health check endpoint
- `GET /scrape-now` - Manually trigger a data scrape

## Data Storage

### CSV Files

All CSV files are stored in the `data/` directory:
- `rowing-data-[timestamp].csv` - Historical data files with timestamps
- `latest.csv` - Always contains the most recent scrape

### Database

Data is stored in the `rowing_data` table with the following fields:
- `id` (UUID) - Unique identifier
- `no` - Boat number
- `device` - Tracking device
- `name` - Team name
- `lastUpdate` - Last position update time
- `latitude` - Latitude in degrees/minutes format
- `longitude` - Longitude in degrees/minutes format
- `latitudeDecimal` - Latitude in decimal format
- `longitudeDecimal` - Longitude in decimal format
- `speed` - Current speed
- `course` - Current course/heading
- `nextWaypoint` - Next waypoint name
- `dtf` - Distance to finish (nautical miles)
- `vmg` - Velocity made good (knots)
- `scrapedAt` - Timestamp when data was scraped
- `createdAt` - Record creation timestamp
- `updatedAt` - Record last update timestamp

## CSV Columns

- No
- Device
- Name
- Last Update (UTC)
- Latitude
- Longitude
- Latitude (Decimal)
- Longitude (Decimal)
- Speed
- Course
- Next Waypoint
- DTF (NM)
- VMG (knots)
- Scraped At

## Cron Schedule

The server runs a scrape job every 2 hours (at :00 minutes of every even hour).

The server also performs an initial scrape when it starts up.

## Environment Variables

Create a `.env` file in the root directory:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rowing?schema=public"
PORT=3000
```

## Development

To view and manage your database data, use Prisma Studio:

```bash
npm run db:studio
```

This will open a web interface at `http://localhost:5555` where you can browse and edit your data.
