import { NotFoundError, InternalServerError } from '../errors/HttpError.js';
import { requestContext } from '../utils/logger.js';
import { getPaginationOffset, getPaginationMeta } from '../utils/pagination.js';
import type { PaginationParams, PaginationMeta } from '../utils/pagination.js';
import type { PrismaClient } from '@prisma/client';

export interface FindManyResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Abstract base repository.
 * All concrete repositories extend this and call super(prisma, 'ModelName').
 *
 * The tenantId is pulled from AsyncLocalStorage on every operation —
 * it is never passed as a parameter, ensuring it cannot be accidentally omitted.
 *
 * Note: The `delegate` accessor returns `any` because Prisma does not expose
 * a generic delegate type. All delegate method calls are intentionally unsafe.
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
export abstract class BaseRepository<
  TModel,
  TCreateInput,
  TUpdateInput,
  TWhereInput,
  TOrderByInput,
> {
  protected readonly prisma: PrismaClient;
  protected readonly modelName: string;

  constructor(prisma: PrismaClient, modelName: string) {
    this.prisma = prisma;
    this.modelName = modelName;
  }

  /**
   * Gets the current tenant ID from request context.
   * Throws if called outside of a request context.
   */
  protected getTenantId(): string {
    const context = requestContext.getStore();
    if (!context?.tenantId) {
      throw new InternalServerError(
        `[${this.modelName}Repository] Operation called without tenant context. ` +
          `Ensure tenant middleware runs before any repository operation.`,
      );
    }
    return context.tenantId;
  }

  /**
   * Returns the Prisma delegate for this model.
   * Subclasses use this to avoid repeating (this.prisma as any)[modelName].
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected get delegate(): any {
    return (this.prisma as unknown as Record<string, unknown>)[
      this.modelName.charAt(0).toLowerCase() + this.modelName.slice(1)
    ];
  }

  async findById(id: string, include?: object): Promise<TModel | null> {
    const tenantId = this.getTenantId();
    return await this.delegate.findFirst({
      where: { id, tenantId, deletedAt: null } as TWhereInput,
      include,
    });
  }

  async findByIdOrThrow(id: string, include?: object): Promise<TModel> {
    const result = await this.findById(id, include);
    if (!result) {
      throw new NotFoundError(`${this.modelName} with id '${id}' not found`);
    }
    return result;
  }

  async findMany(params: {
    where?: TWhereInput;
    orderBy?: TOrderByInput | TOrderByInput[];
    include?: object;
    pagination?: PaginationParams;
  }): Promise<FindManyResult<TModel>> {
    const tenantId = this.getTenantId();
    const { where, orderBy, include, pagination } = params;

    const baseWhere = {
      ...where,
      tenantId,
      deletedAt: null,
    } as TWhereInput;

    const [data, total] = await Promise.all([
      this.delegate.findMany({
        where: baseWhere,
        orderBy,
        include,
        ...(pagination && {
          skip: getPaginationOffset(pagination.page, pagination.limit),
          take: pagination.limit,
        }),
      }),
      this.delegate.count({ where: baseWhere }),
    ]) as [TModel[], number];

    return {
      data,
      pagination: pagination
        ? getPaginationMeta(total, pagination.page, pagination.limit)
        : getPaginationMeta(total, 1, total || 1),
    };
  }

  async findOne(where: TWhereInput, include?: object): Promise<TModel | null> {
    const tenantId = this.getTenantId();
    return await this.delegate.findFirst({
      where: { ...where, tenantId, deletedAt: null } as TWhereInput,
      include,
    });
  }

  async create(data: TCreateInput, include?: object): Promise<TModel> {
    const tenantId = this.getTenantId();
    return await this.delegate.create({
      data: { ...data, tenantId } as TCreateInput,
      include,
    });
  }

  async update(id: string, data: TUpdateInput, include?: object): Promise<TModel> {
    // First verify the record belongs to this tenant
    await this.findByIdOrThrow(id);
    return await this.delegate.update({
      where: { id } as { id: string },
      data: { ...data, updatedAt: new Date() } as TUpdateInput,
      include,
    });
  }

  async softDelete(id: string): Promise<TModel> {
    await this.findByIdOrThrow(id);
    return await this.delegate.update({
      where: { id } as { id: string },
      data: { deletedAt: new Date() },
    });
  }

  async softDeleteMany(where: TWhereInput): Promise<{ count: number }> {
    const tenantId = this.getTenantId();
    return await this.delegate.updateMany({
      where: { ...where, tenantId, deletedAt: null } as TWhereInput,
      data: { deletedAt: new Date() },
    });
  }

  async count(where?: TWhereInput): Promise<number> {
    const tenantId = this.getTenantId();
    return await this.delegate.count({
      where: { ...where, tenantId, deletedAt: null } as TWhereInput,
    });
  }

  async exists(where: TWhereInput): Promise<boolean> {
    const count = await this.count(where);
    return count > 0;
  }
}
/* eslint-enable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
