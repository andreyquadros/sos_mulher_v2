import { resolve } from 'node:path';

export interface AppConfig {
  environment: string;
  databasePath: string;
  panelOrigin: string;
  demoMode: boolean;
  secureCookies: boolean;
  sessionHours: number;
  heartbeatMs: number;
  adminEmail?: string;
  adminPassword?: string;
  adminName?: string;
  agencyId?: string;
}

export function readConfig(overrides: Partial<AppConfig> = {}, env = process.env): AppConfig {
  const environment = overrides.environment ?? env.NODE_ENV ?? 'development';
  const config: AppConfig = {
    environment,
    databasePath: env.DATABASE_PATH || resolve('data/mulher-lume.sqlite'),
    panelOrigin: env.PANEL_ORIGIN || 'http://127.0.0.1:5173',
    demoMode: env.DEMO_MODE === 'true',
    secureCookies: environment === 'production',
    sessionHours: 8,
    heartbeatMs: 15_000,
    adminEmail: env.ADMIN_EMAIL,
    adminPassword: env.ADMIN_PASSWORD,
    adminName: env.ADMIN_NAME,
    agencyId: env.AGENCY_ID,
    ...overrides,
  };
  const origin = new URL(config.panelOrigin);
  if (origin.origin !== config.panelOrigin || !['http:', 'https:'].includes(origin.protocol)) {
    throw new Error('PANEL_ORIGIN deve conter somente a origem, sem caminho ou barra final.');
  }
  if (environment === 'production' && (config.demoMode || !config.secureCookies || origin.protocol !== 'https:')) {
    throw new Error('Produção exige DEMO_MODE=false, cookie Secure e PANEL_ORIGIN HTTPS.');
  }
  if (!Number.isFinite(config.sessionHours) || config.sessionHours < 0.01 || config.sessionHours > 24) {
    throw new Error('Duração de sessão inválida.');
  }
  return config;
}
