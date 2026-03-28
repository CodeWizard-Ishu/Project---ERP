import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from './helpers/testApp.js';

describe('Health Endpoints', () => {
  describe('GET /api/v1/health/live', () => {
    it('should return 200 with liveness status', async () => {
      const res = await request(app).get('/api/v1/health/live');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('live');
    });

    it('should include X-Request-ID header', async () => {
      const res = await request(app).get('/api/v1/health/live');
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('should include timestamp', async () => {
      const res = await request(app).get('/api/v1/health/live');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('GET /api/v1/health', () => {
    it('should return health status with all checks', async () => {
      const res = await request(app).get('/api/v1/health');
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('checks');
      expect(res.body.checks).toHaveProperty('database');
      expect(res.body.checks).toHaveProperty('redis');
      expect(res.body.checks).toHaveProperty('memory');
    });

    it('should include version and environment', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('environment');
      expect(res.body).toHaveProperty('uptime');
    });
  });

  describe('GET /api/v1/health/ready', () => {
    it('should return readiness status', async () => {
      const res = await request(app).get('/api/v1/health/ready');
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('ready');
      expect(res.body).toHaveProperty('checks');
    });
  });

  describe('Error handling', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app).get('/api/v1/does-not-exist');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should propagate X-Request-ID when provided', async () => {
      const customId = 'test-request-id-123';
      const res = await request(app)
        .get('/api/v1/health/live')
        .set('X-Request-ID', customId);
      expect(res.headers['x-request-id']).toBe(customId);
    });

    it('should generate X-Request-ID when not provided', async () => {
      const res = await request(app).get('/api/v1/health/live');
      const requestId = res.headers['x-request-id'];
      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');
      expect(requestId.length).toBeGreaterThan(0);
    });
  });
});
