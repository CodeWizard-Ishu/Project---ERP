import app from '../../src/app.js';

/**
 * Creates a test Express app instance.
 * The app is fully configured with all middleware but does NOT
 * start listening on any port — supertest handles that.
 */
export function createTestApp(): typeof app {
  return app;
}

export default app;
