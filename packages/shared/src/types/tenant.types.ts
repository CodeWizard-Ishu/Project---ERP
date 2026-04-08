export type TenantPlan = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

export interface TenantSettings {
  timezone: string;
  currency: string;
  dateFormat: string;
  fiscalYearStartMonth: number;
  logoUrl?: string;
  primaryColor?: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  status: TenantStatus;
  settings: TenantSettings;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type TenantPublicProfile = Pick<Tenant, 'id' | 'name' | 'slug' | 'plan' | 'settings'>;
