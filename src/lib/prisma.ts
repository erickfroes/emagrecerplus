import 'dotenv/config';
import { PrismaClient } from '../../generated/prisma/client/client';
import { PrismaPg } from '@prisma/adapter-pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definida no ambiente.');
}

const adapter = new PrismaPg(process.env.DATABASE_URL);

declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

export const prisma =
  global.__prisma__ ??
  new PrismaClient({
    adapter,
    log: ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma__ = prisma;
}