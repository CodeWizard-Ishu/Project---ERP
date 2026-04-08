import { prisma } from '../config/database.js';
import { setTenantContext } from '../config/prisma.extensions.js';
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../errors/HttpError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requestContext } from '../utils/logger.js';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Resolves tenant identifier from the request using this priority order:
 * 1. X-Tenant-ID header (UUID) — used by API clients, mobile apps
 * 2. X-Tenant-Slug header — human-readable alternative
 * 3. Subdomain — e.g. acme.erp.yourdomain.com → slug = 'acme'
 *
 * Returns null if no tenant signal found.
 */
const resolveTenantIdentifier = (
  req: Request,
): { type: 'id' | 'slug'; value: string } | null => {
  const tenantId = req.headers['x-tenant-id'] as string | undefined;
  if (tenantId) {return { type: 'id', value: tenantId };}

  const tenantSlug = req.headers['x-tenant-slug'] as string | undefined;
  if (tenantSlug) {return { type: 'slug', value: tenantSlug };}

  // Subdomain extraction (requires trust proxy to be set)
  const host = req.hostname;
  const parts = host.split('.');
  if (parts.length >= 3 && parts[0] !== 'www' && parts[0] !== 'api') {
    return { type: 'slug', value: parts[0] as string };
  }

  return null;
};

/**
 * requireTenant — resolves and validates the tenant.
 * Mount this AFTER the requestId middleware and AFTER auth middleware.
 *
 * Sets:
 *   req.tenantId
 *   requestContext.tenantId
 *   PostgreSQL session variable app.current_tenant_id
 */
export const requireTenant: RequestHandler = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const identifier = resolveTenantIdentifier(req);

    if (!identifier) {
      throw new UnauthorizedError(
        'Tenant context is required. Provide X-Tenant-ID or X-Tenant-Slug header.',
      );
    }

    const where =
      identifier.type === 'id'
        ? { id: identifier.value }
        : { slug: identifier.value };

    const tenant = await prisma.tenant.findFirst({
      where: { ...where, deletedAt: null },
    });

    if (!tenant) {
      throw new NotFoundError(`Tenant '${identifier.value}' not found.`);
    }

    if (tenant.status === 'SUSPENDED') {
      throw new ForbiddenError(
        'This account has been suspended. Please contact support.',
      );
    }

    if (tenant.status === 'DELETED') {
      throw new NotFoundError(`Tenant '${identifier.value}' not found.`);
    }

    // Attach to request
    req.tenantId = tenant.id;

    // Update async context so logger and all downstream services have tenantId
    const currentContext = requestContext.getStore();
    if (currentContext) {
      currentContext.tenantId = tenant.id;
    }

    // Set PostgreSQL RLS session variable
    await setTenantContext(prisma, tenant.id);

    next();
  },
);

/**
 * optionalTenant — resolves tenant if present but does not throw if absent.
 * Use on public endpoints that work with or without tenant context.
 */
export const optionalTenant: RequestHandler = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const identifier = resolveTenantIdentifier(req);
    if (!identifier) {
      next();
      return;
    }

    try {
      const where =
        identifier.type === 'id'
          ? { id: identifier.value }
          : { slug: identifier.value };

      const tenant = await prisma.tenant.findFirst({
        where: { ...where, deletedAt: null },
      });

      if (tenant && tenant.status === 'ACTIVE') {
        req.tenantId = tenant.id;
        const currentContext = requestContext.getStore();
        if (currentContext) {
          currentContext.tenantId = tenant.id;
        }
        await setTenantContext(prisma, tenant.id);
      }
    } catch {
      // Silent — optional resolution failure is not an error
    }

    next();
  },
);
