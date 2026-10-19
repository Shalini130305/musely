import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

declare global {
  var prismaInstance: PrismaClient | undefined;
}

export const prisma = globalThis.prismaInstance || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaInstance = prisma;
}

prisma.$use(async (params, next) => {
  const before = Date.now();
  const result = await next(params);
  const after = Date.now();
  if (process.env.NODE_ENV === 'development') {
    logger.debug(`Query ${params.model}.${params.action} took ${after - before}ms`);
  }
  return result;
});

export default prisma;
