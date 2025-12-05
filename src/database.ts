import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['warn', 'error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

// Connection retry logic
let isConnected = false;

export async function ensureConnection() {
  if (!isConnected) {
    try {
      await prisma.$connect();
      isConnected = true;
      console.log('✅ Database connection established');
    } catch (error) {
      console.error('❌ Failed to connect to database:', error);
      isConnected = false;
      throw error;
    }
  }
}

export default prisma;

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
  isConnected = false;
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  isConnected = false;
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  isConnected = false;
});

