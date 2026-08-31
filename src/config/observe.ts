import { DynamicModule } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

/** Set by observeModules() when credentials are present; read by main.ts. */
export let observeEnabled = false;

/**
 * Returns ObserveModule only when credentials exist, so dev/CI/test runs get
 * no agent worker and no outbound telemetry. Credentials come from the
 * environment (or a gitignored .env loaded by ConfigModule) — never source.
 *
 * Called from AppModule's imports array, AFTER ConfigModule.forRoot():
 * evaluation is left-to-right, and forRoot() populates process.env from .env
 * synchronously before its first await, so the values are visible here.
 */
export function observeModules(): DynamicModule[] {
  const appKey = process.env.OBSERVE_APP_KEY;
  const appSecret = process.env.OBSERVE_APP_SECRET;

  if (!appKey || !appSecret) {
    // Log presence only, never the values. Unconditional: always telling you
    // why telemetry is off is more useful than a quieter dev console.
    console.warn('Observe disabled: OBSERVE_APP_KEY / OBSERVE_APP_SECRET not set.');
    return [];
  }

  observeEnabled = true;
  return [
    ObserveModule.forRoot({
      appKey,
      appSecret,
      endpoint: process.env.OBSERVE_ENDPOINT, // undefined -> SDK default
      serviceId: process.env.OBSERVE_SERVICE_ID ?? 'destiny1',
    }),
  ];
}
