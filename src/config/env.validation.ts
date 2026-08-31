import { plainToInstance } from 'class-transformer';
import { IsInt, IsOptional, IsString, validateSync } from 'class-validator';

/**
 * The shape every environment variable this app reads must satisfy.
 *
 * "env" here means environment VARIABLES (the process.env bag), not deployment
 * environments — the same rules apply in dev, test, and prod. Every key is
 * optional because absence is legal (e.g. no Observe credentials means the
 * Observe module simply does not register); what is NOT legal is a value with
 * the wrong shape, like PORT=abc, which would otherwise surface as a cryptic
 * failure far from its cause instead of a boot-time message naming the key.
 *
 * Same class-validator/class-transformer pair the global ValidationPipe uses
 * on request DTOs — this is the same pattern applied to configuration input.
 */
export class EnvironmentVariables {
  @IsOptional()
  @IsInt()
  PORT?: number;

  @IsOptional()
  @IsString()
  STORIES_ROOT?: string;

  @IsOptional()
  @IsString()
  OBSERVE_APP_KEY?: string;

  @IsOptional()
  @IsString()
  OBSERVE_APP_SECRET?: string;

  @IsOptional()
  @IsString()
  OBSERVE_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  OBSERVE_SERVICE_ID?: string;
}

/**
 * ConfigModule `validate` hook: throws at boot on any malformed value.
 *
 * Returns `raw`, NOT the class instance — @nestjs/config writes the returned
 * object back into process.env, and the instance only carries the declared
 * keys, so returning it would silently delete every undeclared variable for
 * the rest of the process. The class exists only to run the checks.
 */
export function validateEnv(raw: Record<string, unknown>) {
  const parsed = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: true, // "3000" (string) -> 3000 so @IsInt can pass
  });
  const errors = validateSync(parsed, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Environment validation failed: ${errors.join(', ')}`);
  }
  return raw;
}
