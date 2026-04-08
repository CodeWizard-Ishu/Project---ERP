import type { Tenant } from '@prisma/client';

export type { Tenant };

export interface CreateTenantDto {
  name: string;
  slug: string;
  plan?: 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  settings?: {
    timezone?: string;
    currency?: string;
    dateFormat?: string;
    fiscalYearStartMonth?: number;
  };
}

export interface UpdateTenantDto {
  name?: string;
  settings?: Partial<{
    timezone: string;
    currency: string;
    dateFormat: string;
    fiscalYearStartMonth: number;
    logoUrl: string;
    primaryColor: string;
  }>;
}

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;
