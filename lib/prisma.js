import { PrismaClient } from '@prisma/client';

// Standard Next.js dev-mode singleton so hot-reload doesn't exhaust Postgres connections.
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}
