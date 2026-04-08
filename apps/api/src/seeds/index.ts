/**
 * Re-exports functions from prisma/seeds/ for use within src/.
 * Because tsconfig now includes prisma/seeds files, this import resolves correctly.
 * @see apps/api/prisma/seeds/02-roles.seed.ts
 */
export { seedRoles } from '../../prisma/seeds/02-roles.seed.js';
