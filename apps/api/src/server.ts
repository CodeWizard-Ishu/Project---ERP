import app from './app.js';
import { config } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { connectRedis, disconnectRedis } from './config/redis.js';
import { logger } from './utils/logger.js';

let server: ReturnType<typeof app.listen> | undefined;
let isShuttingDown = false;

async function startServer(): Promise<void> {
  try {
    // 1. Connect to database
    logger.info('Connecting to database...');
    await connectDatabase();

    // 2. Connect to Redis
    logger.info('Connecting to Redis...');
    await connectRedis();

    // 3. Start HTTP server
    server = app.listen(config.PORT, () => {
      logger.info(`🚀 ERP API Server started`, {
        port: config.PORT,
        environment: config.NODE_ENV,
        apiVersion: config.API_VERSION,
        url: config.API_URL,
      });
    });

    // Set keep-alive timeout higher than load balancer (default ALB is 60s)
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to start server', { error: errorMessage });
    process.exit(1);
  }
}

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info(`${signal} received. Starting graceful shutdown...`);

  // Set a hard timeout for shutdown (30 seconds)
  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 30000);

  try {
    // 1. Stop accepting new connections
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => {
          if (err) {
            reject(err);
          } else {
            logger.info('HTTP server closed — no longer accepting connections');
            resolve();
          }
        });
      });
    }

    // 2. Disconnect database
    await disconnectDatabase();

    // 3. Disconnect Redis
    await disconnectRedis();

    // 4. Clear timeout and exit
    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error during graceful shutdown', { error: errorMessage });
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

// Signal handlers
process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});

// Unhandled rejection handler
process.on('unhandledRejection', (reason: unknown) => {
  const errorMessage = reason instanceof Error ? reason.message : 'Unknown rejection';
  logger.error('Unhandled Promise Rejection', {
    error: errorMessage,
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  void gracefulShutdown('UNHANDLED_REJECTION');
});

// Uncaught exception handler — always crash
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception — crashing', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// Start the server
void startServer();
