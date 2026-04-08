import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { prisma } from '../src/config/database.js';
import { cacheClient } from '../src/config/redis.js';

// ─── Test fixtures ────────────────────────────────────────────────
const TEST_SLUG = `test-company-${Date.now()}`;
const TEST_EMAIL = `admin@${TEST_SLUG}.com`;
const TEST_PASSWORD = 'TestPass@123!';

describe('Authentication System — Phase 3 Integration Tests', () => {
  let accessToken: string;
  let refreshToken: string;

  // ─── Cleanup ────────────────────────────────────────────────────
  afterAll(async () => {
    // Clean up test tenant (cascades to users, tokens, audit logs)
    await prisma.tenant.deleteMany({ where: { slug: TEST_SLUG } });
    await cacheClient.quit();
    await prisma.$disconnect();
  });

  // ─── Registration ───────────────────────────────────────────────

  describe('POST /api/v1/auth/register', () => {
    it('should register a new tenant and admin user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          tenantName: 'Test Company Ltd.',
          tenantSlug: TEST_SLUG,
          firstName: 'Test',
          lastName: 'Admin',
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          timezone: 'Asia/Kolkata',
          currency: 'INR',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.user.email).toBe(TEST_EMAIL);
      expect(res.body.data.user.permissions).toContain('hr:read');
      expect(res.body.data.user.roles).toContain('ADMIN');
      expect(res.body.data.tokenType).toBe('Bearer');
      expect(res.body.data.expiresIn).toBeGreaterThan(0);

      accessToken = res.body.data.accessToken as string;
      refreshToken = res.body.data.refreshToken as string;
    });

    it('should reject duplicate slug', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          tenantName: 'Another Company',
          tenantSlug: TEST_SLUG,
          firstName: 'Another',
          lastName: 'User',
          email: 'another@test.com',
          password: TEST_PASSWORD,
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('should reject weak passwords (no uppercase)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          tenantName: 'Weak Password Co',
          tenantSlug: 'weak-password-co-xyz',
          firstName: 'Test',
          lastName: 'User',
          email: 'user@weak.com',
          password: 'password123!',  // no uppercase letter
        });

      expect(res.status).toBe(422);
    });

    it('should reject passwords that are too short', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          tenantName: 'Short Pass Co',
          tenantSlug: 'short-pass-co-xyz',
          firstName: 'Test',
          lastName: 'User',
          email: 'user@short.com',
          password: 'S1!',  // too short
        });

      expect(res.status).toBe(422);
    });
  });

  // ─── Login ──────────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('should login with correct credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Tenant-Slug', TEST_SLUG)
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.tokenType).toBe('Bearer');

      // Update tokens for subsequent tests
      accessToken = res.body.data.accessToken as string;
      refreshToken = res.body.data.refreshToken as string;
    });

    it('should return identical error message for wrong password AND unknown email (prevents user enumeration)', async () => {
      const [wrongPasswordRes, unknownEmailRes] = await Promise.all([
        request(app)
          .post('/api/v1/auth/login')
          .set('X-Tenant-Slug', TEST_SLUG)
          .send({ email: TEST_EMAIL, password: 'WrongPass@999!' }),
        request(app)
          .post('/api/v1/auth/login')
          .set('X-Tenant-Slug', TEST_SLUG)
          .send({ email: 'nobody@nowhere.com', password: TEST_PASSWORD }),
      ]);

      expect(wrongPasswordRes.status).toBe(401);
      expect(unknownEmailRes.status).toBe(401);
      // The error messages MUST be identical to prevent user enumeration
      expect(wrongPasswordRes.body.error.message).toBe(unknownEmailRes.body.error.message);
    });

    it('should reject login without tenant header', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

      expect(res.status).toBe(401);
    });

    it('should reject login with invalid email format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Tenant-Slug', TEST_SLUG)
        .send({ email: 'not-an-email', password: TEST_PASSWORD });

      expect(res.status).toBe(422);
    });
  });

  // ─── Protected Route ─────────────────────────────────────────────

  describe('GET /api/v1/auth/me', () => {
    it('should return user identity and permissions with valid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-Slug', TEST_SLUG);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('userId');
      expect(res.body.data).toHaveProperty('tenantId');
      expect(res.body.data.permissions).toBeInstanceOf(Array);
      expect(res.body.data.permissions.length).toBeGreaterThan(0);
    });

    it('should reject invalid/malformed JWT with 401', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .set('X-Tenant-Slug', TEST_SLUG);

      expect(res.status).toBe(401);
    });

    it('should reject requests with no Authorization header', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('X-Tenant-Slug', TEST_SLUG);

      expect(res.status).toBe(401);
    });
  });

  // ─── Token Refresh ───────────────────────────────────────────────

  describe('POST /api/v1/auth/refresh', () => {
    it('should return a new token pair and invalidate the old refresh token', async () => {
      const oldRefreshToken = refreshToken;

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefreshToken });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      // New tokens must be different from the old ones
      expect(res.body.data.refreshToken).not.toBe(oldRefreshToken);

      // Update tokens for subsequent tests
      refreshToken = res.body.data.refreshToken as string;
      accessToken = res.body.data.accessToken as string;
    });

    it('should reject a previously used refresh token (rotation prevents replay)', async () => {
      // 1. Get a fresh token pair via login
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Tenant-Slug', TEST_SLUG)
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
      const originalToken = loginRes.body.data.refreshToken as string;

      // 2. Use it once (valid — should succeed)
      const firstRefresh = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: originalToken });
      expect(firstRefresh.status).toBe(200);

      // 3. Use the same token again (replay attack — should fail and revoke family)
      const secondRefresh = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: originalToken });
      expect(secondRefresh.status).toBe(401);

      // Clean up — re-login to get fresh tokens
      const newLogin = await request(app)
        .post('/api/v1/auth/login')
        .set('X-Tenant-Slug', TEST_SLUG)
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD });
      accessToken = newLogin.body.data.accessToken as string;
      refreshToken = newLogin.body.data.refreshToken as string;
    });

    it('should reject an invalid refresh token with 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'a'.repeat(128) }); // valid length but not in DB

      expect(res.status).toBe(401);
    });
  });

  // ─── Logout ─────────────────────────────────────────────────────

  describe('POST /api/v1/auth/logout', () => {
    it('should blacklist the access token JTI — /me returns 401 after logout', async () => {
      // Verify token is valid before logout
      const beforeRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-Slug', TEST_SLUG);
      expect(beforeRes.status).toBe(200);

      // Logout
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-Slug', TEST_SLUG)
        .send({ refreshToken });
      expect(logoutRes.status).toBe(204);

      // The same access token should now be blacklisted
      const afterRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-Slug', TEST_SLUG);
      expect(afterRes.status).toBe(401);
    });
  });

  // ─── Forgot Password ─────────────────────────────────────────────

  describe('POST /api/v1/auth/forgot-password', () => {
    it('should return the same success message for registered and unregistered emails', async () => {
      const [knownEmail, unknownEmail] = await Promise.all([
        request(app)
          .post('/api/v1/auth/forgot-password')
          .set('X-Tenant-Slug', TEST_SLUG)
          .send({ email: TEST_EMAIL }),
        request(app)
          .post('/api/v1/auth/forgot-password')
          .set('X-Tenant-Slug', TEST_SLUG)
          .send({ email: 'nobody-at-all@nowhere.com' }),
      ]);

      expect(knownEmail.status).toBe(200);
      expect(unknownEmail.status).toBe(200);
      // Messages must be identical to prevent user enumeration
      expect(knownEmail.body.message).toBe(unknownEmail.body.message);
    });
  });
});
