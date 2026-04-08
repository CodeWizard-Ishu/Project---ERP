declare global {
  namespace Express {
    interface Request {
      requestId: string;
      tenantId?: string;
      userId?: string;
      userRole?: string;
      permissions?: string[];
      accessTokenJti?: string;
      accessTokenExp?: number;
    }
  }
}

export {};
