import type { PrismaClient, Prisma } from '@prisma/client';

const SOFT_DELETE_MODELS = ['Tenant', 'User'] as const;
type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number];

const isSoftDeleteModel = (model: string | undefined): model is SoftDeleteModel =>
  SOFT_DELETE_MODELS.includes(model as SoftDeleteModel);

export const createExtendedPrismaClient = (baseClient: PrismaClient): ReturnType<typeof baseClient.$extends> => {
  return baseClient.$extends({
    name: 'erp-extensions',
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            args.where = {
              ...args.where,
              deletedAt: (args.where as Record<string, unknown> | undefined)?.['deletedAt'] ?? null,
            };
          }
          return query(args);
        },
        async findFirst({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            args.where = {
              ...args.where,
              deletedAt: (args.where as Record<string, unknown> | undefined)?.['deletedAt'] ?? null,
            };
          }
          return query(args);
        },
        async findUnique({ args, query }) {
          return query(args);
        },
        async count({ model, args, query }) {
          if (isSoftDeleteModel(model)) {
            args.where = {
              ...args.where,
              deletedAt: (args.where as Record<string, unknown> | undefined)?.['deletedAt'] ?? null,
            };
          }
          return query(args);
        },
      },
    },
  });
};

export type ExtendedPrismaClient = ReturnType<typeof createExtendedPrismaClient>;

/**
 * Sets the PostgreSQL session variable for RLS before executing queries.
 * Must be called at the start of every request that touches the database.
 */
export const setTenantContext = async (
  client: PrismaClient,
  tenantId: string,
): Promise<void> => {
  await client.$executeRaw`SELECT set_tenant_context(${tenantId}::uuid)`;
};

/**
 * Wraps a database operation in a transaction with RLS context set.
 * Use this for any operation that needs guaranteed tenant isolation.
 */
export const withTenantContext = async <T>(
  client: PrismaClient,
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> => {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_tenant_context(${tenantId}::uuid)`;
    return fn(tx);
  });
};
