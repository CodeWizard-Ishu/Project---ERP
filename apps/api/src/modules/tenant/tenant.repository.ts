import { BaseRepository } from '../../repositories/base.repository.js';
import type { PrismaClient, Tenant, Prisma } from '@prisma/client';

export class TenantRepository extends BaseRepository<
  Tenant,
  Prisma.TenantCreateInput,
  Prisma.TenantUpdateInput,
  Prisma.TenantWhereInput,
  Prisma.TenantOrderByWithRelationInput
> {
  constructor(prisma: PrismaClient) {
    super(prisma, 'Tenant');
  }

  /**
   * findBySlug — used for tenant resolution.
   * Does NOT filter by tenantId (Tenant table is global).
   */
  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.prisma.tenant.findFirst({
      where: { slug, deletedAt: null },
    });
  }

  /**
   * slugExists — check before creating a new tenant.
   */
  async slugExists(slug: string): Promise<boolean> {
    const count = await this.prisma.tenant.count({ where: { slug } });
    return count > 0;
  }

  /**
   * findAllActive — for superadmin panel.
   * Bypasses base class tenant scoping intentionally (superadmin sees all).
   */
  async findAllActive(params: {
    skip?: number;
    take?: number;
  }): Promise<{ data: Tenant[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where: { deletedAt: null, status: { not: 'DELETED' } },
        orderBy: { createdAt: 'desc' },
        ...(params.skip !== undefined && { skip: params.skip }),
        ...(params.take !== undefined && { take: params.take }),
      }),
      this.prisma.tenant.count({
        where: { deletedAt: null, status: { not: 'DELETED' } },
      }),
    ]);
    return { data, total };
  }
}
