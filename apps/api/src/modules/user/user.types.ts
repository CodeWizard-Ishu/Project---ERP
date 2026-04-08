export interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

export interface InviteUserDto {
  email: string;
  firstName: string;
  lastName: string;
  roleIds: string[];
}
