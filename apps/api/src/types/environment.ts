import { type Config } from '../config/env.js';

export type Environment = Config['NODE_ENV'];

export interface AppConfig extends Config {
  readonly isDevelopment: boolean;
  readonly isProduction: boolean;
  readonly isTest: boolean;
}
