import { PrismaClient } from "@prisma/client";

/**
 * Instância única do PrismaClient, preservada no hot-reload de
 * desenvolvimento para não esgotar conexões.
 */
const globalComPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalComPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalComPrisma.prisma = prisma;
}
