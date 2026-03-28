import { beforeAll, afterAll } from 'vitest';

beforeAll(async () => {
  // Set test environment variables
  process.env['NODE_ENV'] = 'test';
  process.env['PORT'] = '3001';
  process.env['API_URL'] = 'http://localhost:3001';
  process.env['CLIENT_URL'] = 'http://localhost:5173';
  process.env['API_VERSION'] = 'v1';
  process.env['DATABASE_URL'] = 'postgresql://erp_user:erp_password@localhost:5432/erp_test?schema=public';
  process.env['REDIS_HOST'] = 'localhost';
  process.env['REDIS_PORT'] = '6379';
  process.env['REDIS_DB'] = '2';
  process.env['REDIS_QUEUE_DB'] = '3';
  process.env['JWT_ACCESS_SECRET'] = 'test-access-secret-key-that-is-at-least-32-characters-long-for-testing';
  process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-key-that-is-at-least-32-characters-long-for-testing';
  process.env['RATE_LIMIT_WINDOW_MS'] = '900000';
  process.env['RATE_LIMIT_MAX_REQUESTS'] = '1000';
  process.env['LOG_LEVEL'] = 'error';
  process.env['LOG_PRETTY'] = 'false';
  process.env['CORS_ORIGINS'] = 'http://localhost:3001,http://localhost:5173';
});

afterAll(async () => {
  // Cleanup if needed
});
