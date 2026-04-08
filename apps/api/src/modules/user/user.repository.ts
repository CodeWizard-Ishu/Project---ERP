import { BaseRepository } from '../../repositories/base.repository.js';
import type { UserProfile } from '@erp/shared';
import type { PrismaClient, User, Prisma } from '@prisma/client';

// The full user object with roles and permissions preloaded
export type UserWithPermissions = User & {
  userRoles: Array<{
    role: {
      id: string;
      name: string;
      rolePermissions: Array<{
        permission: {
          resource: string;
          action: string;
        };
      }>;
    };
  }>;
};

/**
 * Prisma include object that eagerly loads the full role + permission tree.
 * Used by findByEmailWithPermissions and findByIdWithPermissions.
 * Declared as a constant so it can be referenced by the auth service without
 * instantiating a full UserRepository.
 */
export const USER_WITH_PERMISSIONS_INCLUDE = {
  userRoles: {
    include: {
      role: {
        include: {
          rolePermissions: {
            include: {
              permission: {
                select: { resource: true, action: true },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserInclude;

export class UserRepository extends BaseRepository<
  User,
  Prisma.UserCreateInput,
  Prisma.UserUpdateInput,
  Prisma.UserWhereInput,
  Prisma.UserOrderByWithRelationInput
> {
  constructor(prisma: PrismaClient) {
    super(prisma, 'User');
  }

  /**
   * findByEmail — scoped to the current tenant from AsyncLocalStorage context.
   * Fast path for login: uses a composite index on (tenant_id, email).
   * Does NOT load roles/permissions — use findByEmailWithPermissions for that.
   */
  async findByEmail(email: string): Promise<User | null> {
    const tenantId = this.getTenantId();
    return this.prisma.user.findFirst({
      where: { tenantId, email: email.toLowerCase(), deletedAt: null },
    });
  }

  /**
   * findByEmailWithPermissions — loads the full user + role + permission tree.
   * Used after login to build the UserProfile response and populate the Redis cache.
   */
  async findByEmailWithPermissions(email: string): Promise<UserWithPermissions | null> {
    const tenantId = this.getTenantId();
    return this.prisma.user.findFirst({
      where: { tenantId, email: email.toLowerCase(), deletedAt: null },
      include: USER_WITH_PERMISSIONS_INCLUDE,
    }) as Promise<UserWithPermissions | null>;
  }

  /**
   * findByIdWithPermissions — used by requireAuth middleware after JWT verification.
   * Called only on cache miss; result is immediately stored back in Redis.
   */
  async findByIdWithPermissions(id: string): Promise<UserWithPermissions | null> {
    const tenantId = this.getTenantId();
    return this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: USER_WITH_PERMISSIONS_INCLUDE,
    }) as Promise<UserWithPermissions | null>;
  }

  /**
   * updateLastLogin — called on successful login.
   * Fire-and-forget from the auth service (does not block the login response).
   */
  async updateLastLogin(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  /**
   * updatePassword — called on password change and password reset.
   * Caller is responsible for hashing the password before calling this method.
   */
  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash, updatedAt: new Date() },
    });
  }

  /**
   * buildUserProfile — static transformer.
   * Converts a UserWithPermissions DB record into the UserProfile shape
   * used in API responses and stored in Redis permission cache.
   *
   * Deduplicates permissions using a Set in case the same permission
   * appears in multiple roles assigned to the user.
   */
  static buildUserProfile(user: UserWithPermissions): UserProfile {
    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map(
            (rp) => `${rp.permission.resource}:${rp.permission.action}`,
          ),
        ),
      ),
    ];

    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      fullName: `${user.firstName} ${user.lastName}`,
      roles,
      permissions,
    };
  }
}
