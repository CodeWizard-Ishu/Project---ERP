export type UserStatus = 'INVITED' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface User {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export type PublicUser = Omit<User, 'deletedAt'>;

export type UserWithRoles = User & {
  userRoles: Array<{
    role: {
      id: string;
      name: string;
      rolePermissions: Array<{
        permission: { resource: string; action: string };
      }>;
    };
  }>;
};

export interface UserProfile extends PublicUser {
  fullName: string;
  roles: string[];
  permissions: string[];
}
